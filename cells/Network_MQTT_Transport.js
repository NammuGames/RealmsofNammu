/**
 * @fileoverview cells/Network_MQTT_Transport.js - Zero-Dependency Encrypted MQTT-over-WSS Relay
 * @description Implements a minimal MQTT 3.1.1 over Secure WebSocket (wss://) client with
 * SHA-256 hashed room topics, AES-256-GCM payload encryption (window.crypto.subtle),
 * public broker failover (EMQX -> HiveMQ), and optional custom WSS relay hook.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const DEFAULT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();

  function toBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function fromBase64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function hexFromBytes(bytes, maxChars = 24) {
    let s = '';
    for (let i = 0; i < bytes.length && s.length < maxChars; i++) {
      s += bytes[i].toString(16).padStart(2, '0');
    }
    return s.slice(0, maxChars);
  }

  function fallbackHashHex(str) {
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function deriveRoomCrypto(roomCode) {
    const clean = String(roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const subtle = global.crypto?.subtle;
    if (subtle) {
      const tHash = new Uint8Array(await subtle.digest('SHA-256', ENC.encode(`nammu-v1-topic::${clean}`)));
      const kHash = await subtle.digest('SHA-256', ENC.encode(`nammu-v1-aeskey::${clean}`));
      const key = await subtle.importKey('raw', kHash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      return { topic: `nammu/v1/${hexFromBytes(tHash, 24)}`, key, encrypted: true };
    }
    // Fallback only for non-secure local file:// previews where crypto.subtle is unavailable
    return { topic: `nammu/v1/${fallbackHashHex('nammu-v1-topic::' + clean)}`, key: null, encrypted: false };
  }

  async function sealPacket(cryptoCtx, payloadObj) {
    const jsonStr = JSON.stringify(payloadObj);
    if (!cryptoCtx?.key || !global.crypto?.subtle) {
      return JSON.stringify({ v: 0, p: jsonStr });
    }
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const ctBuf = await global.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoCtx.key, ENC.encode(jsonStr));
    return JSON.stringify({ v: 1, iv: toBase64(iv), d: toBase64(new Uint8Array(ctBuf)) });
  }

  async function openPacket(cryptoCtx, rawStr) {
    try {
      const env = JSON.parse(rawStr);
      if (!env || typeof env !== 'object') return null;
      if (env.v === 1 && cryptoCtx?.key && global.crypto?.subtle && env.iv && env.d) {
        const plainBuf = await global.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(env.iv) },
          cryptoCtx.key,
          fromBase64(env.d)
        );
        return JSON.parse(DEC.decode(plainBuf));
      }
      if (env.v === 0 && !cryptoCtx?.encrypted && typeof env.p === 'string') {
        return JSON.parse(env.p);
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── MINIMAL MQTT 3.1.1 BINARY CODEC ─────────────────────────────────────────
  function encodeVarLen(n) {
    const out = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  }

  function encodeUtf8Str(str) {
    const bytes = ENC.encode(str);
    const out = new Uint8Array(2 + bytes.length);
    out[0] = (bytes.length >> 8) & 0xff;
    out[1] = bytes.length & 0xff;
    out.set(bytes, 2);
    return out;
  }

  function concatBytes(parts) {
    let len = 0;
    for (let i = 0; i < parts.length; i++) len += parts[i].length;
    const out = new Uint8Array(len);
    let off = 0;
    for (let i = 0; i < parts.length; i++) {
      out.set(parts[i], off);
      off += parts[i].length;
    }
    return out;
  }

  function buildConnectPacket(clientId, keepAliveSec = 45) {
    const varHdr = new Uint8Array([
      0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
      0x04,                               // Protocol level 4 (3.1.1)
      0x02,                               // Clean Session
      (keepAliveSec >> 8) & 0xff, keepAliveSec & 0xff
    ]);
    const payload = encodeUtf8Str(clientId);
    const remLen = encodeVarLen(varHdr.length + payload.length);
    return concatBytes([new Uint8Array([0x10, ...remLen]), varHdr, payload]);
  }

  function buildSubscribePacket(packetId, topic) {
    const varHdr = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
    const tBytes = encodeUtf8Str(topic);
    const qos = new Uint8Array([0x00]);
    const remLen = encodeVarLen(varHdr.length + tBytes.length + 1);
    return concatBytes([new Uint8Array([0x82, ...remLen]), varHdr, tBytes, qos]);
  }

  function buildPublishPacket(topic, payloadStr) {
    const tBytes = encodeUtf8Str(topic);
    const pBytes = ENC.encode(payloadStr);
    const remLen = encodeVarLen(tBytes.length + pBytes.length);
    return concatBytes([new Uint8Array([0x30, ...remLen]), tBytes, pBytes]);
  }

  function makeClientId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = 'nm_';
    for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // ── TRANSPORT CLIENT ────────────────────────────────────────────────────────
  class NetworkMQTTTransportClass {
    constructor(opts = {}) {
      this.brokers = Array.isArray(opts.brokers) && opts.brokers.length ? opts.brokers.slice() : DEFAULT_BROKERS.slice();
      this.customRelayUrl = opts.customRelayUrl || global.NAMMU_RELAY_URL || '';
      this.ws = null;
      this.cryptoCtx = null;
      this.roomCode = '';
      this.brokerIndex = 0;
      this.connected = false;
      this.closedByUser = false;
      this._rxBuf = new Uint8Array(0);
      this._pingTimer = null;
      this._reconnectTimer = null;
      this._packetId = 1;
      this._onMessage = opts.onMessage || null;
      this._onStatus = opts.onStatus || null;
      this._onReconnect = opts.onReconnect || null;
      this._visHandler = null;
    }

    async connect(roomCode, opts = {}) {
      this.disconnect();
      this.closedByUser = false;
      this.roomCode = String(roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.brokerIndex = typeof opts.brokerIndex === 'number' ? (opts.brokerIndex % this.brokers.length) : 0;
      this.cryptoCtx = await deriveRoomCrypto(this.roomCode);
      this._bindVisibilityWake();

      if (this.customRelayUrl) {
        return this._openCustomRelay();
      }
      return this._openMqttWithFailover(this.brokerIndex, opts.allowFailover !== false);
    }

    async _openMqttWithFailover(startIdx, allowFailover) {
      const order = allowFailover
        ? this.brokers.map((_, i) => (startIdx + i) % this.brokers.length)
        : [startIdx % this.brokers.length];
      let lastErr = null;
      for (const idx of order) {
        if (this.closedByUser) throw new Error('Cancelled');
        try {
          this.brokerIndex = idx;
          await this._openSingleMqtt(this.brokers[idx]);
          return { ok: true, broker: this.brokers[idx], brokerIndex: idx, topic: this.cryptoCtx.topic };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('Could not connect to WSS relay');
    }

    _openSingleMqtt(url) {
      return new Promise((resolve, reject) => {
        let settled = false;
        this._clearSocketOnly();
        const ws = new WebSocket(url, 'mqtt');
        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        const fail = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          reject(err);
        };
        const timer = setTimeout(() => fail(new Error('Relay connect timeout')), 5500);

        ws.onopen = () => {
          if (this.ws !== ws || this.closedByUser) return;
          ws.send(buildConnectPacket(makeClientId(), 45));
        };

        ws.onmessage = (ev) => {
          if (this.ws !== ws) return;
          const chunk = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : ENC.encode(String(ev.data || ''));
          this._feedMqttBytes(chunk, (pktType, payload) => {
            if (pktType === 2) {
              // CONNACK
              if (payload.rc !== 0) { fail(new Error(`MQTT refused (${payload.rc})`)); return; }
              const pid = (this._packetId = (this._packetId % 65000) + 1);
              ws.send(buildSubscribePacket(pid, this.cryptoCtx.topic));
            } else if (pktType === 9) {
              // SUBACK
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                this.connected = true;
                this._startPing(ws);
                resolve(true);
              }
            } else if (pktType === 3 && payload.topic === this.cryptoCtx.topic) {
              this._handleIncomingRaw(payload.text);
            }
          });
        };

        ws.onerror = () => fail(new Error('Relay WebSocket error'));
        ws.onclose = () => {
          const wasConnected = this.connected && this.ws === ws;
          if (this.ws === ws) { this.connected = false; this._stopPing(); }
          if (!settled) { fail(new Error('Relay closed before ready')); return; }
          if (wasConnected && !this.closedByUser) this._scheduleReconnect();
        };
      });
    }

    _openCustomRelay() {
      return new Promise((resolve, reject) => {
        let settled = false;
        this._clearSocketOnly();
        const base = this.customRelayUrl.replace(/\/+$/, '');
        const url = `${base}/room/${encodeURIComponent(this.cryptoCtx.topic)}`;
        const ws = new WebSocket(url);
        this.ws = ws;

        const fail = (err) => { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch {} reject(err); };
        const timer = setTimeout(() => fail(new Error('Custom relay timeout')), 5500);

        ws.onopen = () => {
          if (this.ws !== ws || this.closedByUser) return;
          settled = true;
          clearTimeout(timer);
          this.connected = true;
          resolve({ ok: true, broker: url, brokerIndex: 0, topic: this.cryptoCtx.topic });
        };
        ws.onmessage = (ev) => {
          if (this.ws === ws && typeof ev.data === 'string') this._handleIncomingRaw(ev.data);
        };
        ws.onerror = () => fail(new Error('Custom relay error'));
        ws.onclose = () => {
          const wasConnected = this.connected && this.ws === ws;
          if (this.ws === ws) this.connected = false;
          if (!settled) { fail(new Error('Custom relay closed')); return; }
          if (wasConnected && !this.closedByUser) this._scheduleReconnect();
        };
      });
    }

    _feedMqttBytes(chunk, onPacket) {
      this._rxBuf = this._rxBuf.length ? concatBytes([this._rxBuf, chunk]) : chunk;
      while (this._rxBuf.length >= 2) {
        let mult = 1, remLen = 0, idx = 1, complete = false;
        while (idx < this._rxBuf.length && idx <= 4) {
          const b = this._rxBuf[idx++];
          remLen += (b & 0x7f) * mult;
          if ((b & 0x80) === 0) { complete = true; break; }
          mult *= 128;
        }
        if (!complete || this._rxBuf.length < idx + remLen) break;
        const pkt = this._rxBuf.subarray(0, idx + remLen);
        this._rxBuf = this._rxBuf.subarray(idx + remLen);

        const type = pkt[0] >> 4;
        const body = pkt.subarray(idx);
        if (type === 2 && body.length >= 2) {
          onPacket(2, { rc: body[1] });
        } else if (type === 9) {
          onPacket(9, {});
        } else if (type === 3 && body.length >= 2) {
          const qos = (pkt[0] >> 1) & 0x03;
          const tLen = (body[0] << 8) | body[1];
          const tEnd = 2 + tLen;
          const pStart = tEnd + (qos > 0 ? 2 : 0);
          if (pStart <= body.length) {
            onPacket(3, {
              topic: DEC.decode(body.subarray(2, tEnd)),
              text: DEC.decode(body.subarray(pStart))
            });
          }
        }
      }
    }

    async _handleIncomingRaw(rawStr) {
      const msg = await openPacket(this.cryptoCtx, rawStr);
      if (msg && typeof this._onMessage === 'function') this._onMessage(msg);
    }

    async publish(payloadObj) {
      if (!this.connected || !this.ws || this.ws.readyState !== 1 || !this.cryptoCtx) return false;
      try {
        const sealed = await sealPacket(this.cryptoCtx, payloadObj);
        if (!this.connected || !this.ws || this.ws.readyState !== 1) return false;
        if (this.customRelayUrl) {
          this.ws.send(sealed);
        } else {
          this.ws.send(buildPublishPacket(this.cryptoCtx.topic, sealed));
        }
        return true;
      } catch {
        return false;
      }
    }

    _startPing(ws) {
      this._stopPing();
      this._pingTimer = setInterval(() => {
        if (this.ws === ws && ws.readyState === 1) {
          try { ws.send(new Uint8Array([0xc0, 0x00])); } catch {}
        }
      }, 20000);
    }

    _stopPing() {
      if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    }

    _scheduleReconnect() {
      if (this.closedByUser || this._reconnectTimer) return;
      this._onStatus?.('Relay Dropped — Reconnecting...');
      this._reconnectTimer = setTimeout(async () => {
        this._reconnectTimer = null;
        if (this.closedByUser || !this.roomCode) return;
        try {
          if (this.customRelayUrl) await this._openCustomRelay();
          else await this._openMqttWithFailover(this.brokerIndex, true);
          this._onStatus?.('');
          this._onReconnect?.();
        } catch {
          this._scheduleReconnect();
        }
      }, 1800);
    }

    _bindVisibilityWake() {
      if (this._visHandler || typeof document === 'undefined') return;
      this._visHandler = () => {
        if (document.visibilityState === 'visible' && !this.closedByUser && this.roomCode) {
          if (!this.ws || this.ws.readyState > 1) this._scheduleReconnect();
        }
      };
      document.addEventListener('visibilitychange', this._visHandler);
    }

    _clearSocketOnly() {
      this._stopPing();
      this._rxBuf = new Uint8Array(0);
      this.connected = false;
      if (this.ws) {
        const old = this.ws;
        this.ws = null;
        try {
          if (old.readyState === 1 && !this.customRelayUrl) old.send(new Uint8Array([0xe0, 0x00]));
          old.close();
        } catch {}
      }
    }

    disconnect() {
      this.closedByUser = true;
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      this._clearSocketOnly();
      if (this._visHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._visHandler);
        this._visHandler = null;
      }
    }
  }

  global.NetworkMQTTTransportClass = NetworkMQTTTransportClass;
})(typeof window !== 'undefined' ? window : this);
