/**
 * @fileoverview cells/Network_MQTT_Transport_1.0.js - Room Crypto & MQTT 3.1.1 Binary Codec (Part 1/2)
 * @description Provides stateless SHA-256 topic derivation, AES-256-GCM payload encryption
 * (window.crypto.subtle), chunked Base64 encoding, and minimal MQTT 3.1.1 binary packet builders.
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
    const chunk = 0x1000;
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

  global.NetworkMQTTCodec = {
    DEFAULT_BROKERS, ENC, DEC,
    deriveRoomCrypto, sealPacket, openPacket,
    concatBytes, buildConnectPacket, buildSubscribePacket, buildPublishPacket, makeClientId
  };
})(typeof window !== 'undefined' ? window : this);
