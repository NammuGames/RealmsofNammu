/**
 * @fileoverview cells/Network_MQTT_Transport_1.1.js - Stateful WSS Client, Failover & Outbound Queue (Part 2/2)
 * @description Implements NetworkMQTTTransportClass on top of NetworkMQTTCodec: broker failover
 * (EMQX -> HiveMQ), optional custom WSS relay hook, outbound buffering, ping keepalive, and sticky reconnect.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const codec = global.NetworkMQTTCodec;
  if (!codec) {
    console.error('[Network_MQTT_Transport_1.1] Load Network_MQTT_Transport_1.0.js first.');
    return;
  }

  const {
    DEFAULT_BROKERS, ENC, DEC,
    deriveRoomCrypto, sealPacket, openPacket,
    concatBytes, buildConnectPacket, buildSubscribePacket, buildPublishPacket, makeClientId
  } = codec;

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
      this._outQueue = [];
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
        const timer = setTimeout(() => fail(new Error('Relay connect timeout')), 7500);

        ws.onopen = () => {
          if (this.ws !== ws || this.closedByUser) return;
          ws.send(buildConnectPacket(makeClientId(), 45));
        };

        ws.onmessage = (ev) => {
          if (this.ws !== ws) return;
          const chunk = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : ENC.encode(String(ev.data || ''));
          this._feedMqttBytes(chunk, (pktType, payload) => {
            if (pktType === 2) {
              if (payload.rc !== 0) { fail(new Error(`MQTT refused (${payload.rc})`)); return; }
              const pid = (this._packetId = (this._packetId % 65000) + 1);
              ws.send(buildSubscribePacket(pid, this.cryptoCtx.topic));
            } else if (pktType === 9) {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                this.connected = true;
                this._startPing(ws);
                this._flushOutQueue();
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
        const timer = setTimeout(() => fail(new Error('Custom relay timeout')), 7500);

        ws.onopen = () => {
          if (this.ws !== ws || this.closedByUser) return;
          settled = true;
          clearTimeout(timer);
          this.connected = true;
          this._flushOutQueue();
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

    _enqueueOutbound(payloadObj) {
      if (this.closedByUser || !payloadObj || payloadObj.type === 'HEARTBEAT') return;
      if (payloadObj.type === 'STATE_SYNC') {
        this._outQueue = this._outQueue.filter(m => m.type !== 'STATE_SYNC');
      }
      this._outQueue.push(payloadObj);
      if (this._outQueue.length > 8) this._outQueue.shift();
    }

    _flushOutQueue() {
      if (!this._outQueue.length || !this.connected) return;
      const pending = this._outQueue.splice(0, this._outQueue.length);
      pending.forEach(item => this.publish(item));
    }

    async publish(payloadObj) {
      if (!this.cryptoCtx) return false;
      if (!this.connected || !this.ws || this.ws.readyState !== 1) {
        this._enqueueOutbound(payloadObj);
        if (!this.closedByUser && this.roomCode) this._scheduleReconnect();
        return false;
      }
      try {
        const sealed = await sealPacket(this.cryptoCtx, payloadObj);
        if (!this.connected || !this.ws || this.ws.readyState !== 1) {
          this._enqueueOutbound(payloadObj);
          return false;
        }
        if (this.customRelayUrl) {
          this.ws.send(sealed);
        } else {
          this.ws.send(buildPublishPacket(this.cryptoCtx.topic, sealed));
        }
        return true;
      } catch (err) {
        console.warn('[NetworkMQTTTransport] publish failed:', err);
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
          else await this._openMqttWithFailover(this.brokerIndex, false);
          this._onStatus?.('');
          this._flushOutQueue();
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
      this._outQueue = [];
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
