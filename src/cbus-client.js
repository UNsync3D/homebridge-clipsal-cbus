'use strict';

const http = require('http');

/**
 * WebSocket client for Clipsal 5500SHAC.
 * Uses exact same protocol as the Clipsal web UI (reverse engineered from core.js).
 *
 * Address encoding (reverse engineered from object IDs in HTML):
 *   App 56  (Lighting):        0x38000000 | (group << 8)
 *   App 48  (Coolmaster/AC):   0x30000000 | (group << 8)
 *   App 202 (Trigger/Scenes):  0xCA000000 | (group << 8)
 *   App 250 (User Param):      0xFA000000 | (group << 8)
 *
 * Command format (from core.js reverse engineering):
 * {
 *   "address": 939524352,
 *   "datatype": 5,
 *   "value": 255,
 *   "type": "text",
 *   "update": false,
 *   "action": "write"
 * }
 */
class CBusClient {
  constructor(host, port, network, log) {
    this.host    = host || '127.0.0.1';
    this.port    = port || 8087;
    this.network = network;
    this.log     = log;
    this.ws      = null;
    this.auth    = null;
    this._lastCmd = Promise.resolve();
    this._connect();
  }

  // Encode group address to integer
  // Formula from cbuslib.js encodeObjectAddress:
  // res = vals[1] << 24 | vals[0] << 16 | vals[2] << 8
  // where vals[0]=network, vals[1]=app, vals[2]=group
  _encodeAddress(app, group, network = 0) {
    return ((app << 24) | (network << 16) | (group << 8)) >>> 0;
  }

  // ------------------------------------------------------------------
  // Connection management
  // ------------------------------------------------------------------

  async _connect() {
    try {
      const data = await this._httpPost(
        `/scada-vis/objects/ws`,
        { updatetime: Math.floor(Date.now() / 1000) }
      );

      if (data && data.auth) {
        this.auth = data.auth;
        this.log.info('CBus: Got auth token');
      }

      this._openWebSocket();
    } catch (e) {
      this.log.warn(`CBus: Init failed: ${e.message}, retrying in 5s`);
      setTimeout(() => this._connect(), 5000);
    }
  }

  _openWebSocket() {
    const WebSocket = require('ws');
    const param = this.auth ? `?auth=${this.auth}` : '';
    const url = `ws://${this.host}:${this.port}/scada-vis/objects/ws${param}`;

    this.log.info(`CBus: Connecting WebSocket to ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.log.info('CBus: WebSocket connected to Clipsal unit');
      this._pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        }
      }, 10000);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = raw.toString();
        if (msg === 'pong') return;
        const evt = JSON.parse(msg);
        if ((evt.type === 'groupwrite' || evt.type === 'groupresponse') && evt.dstraw && evt.datahex) {
          this.log.info(`CBus WS << app:${(evt.dstraw>>24)&0xFF} group:${(evt.dstraw>>8)&0xFF} hex:${evt.datahex} dst:${evt.dst} dstraw:${evt.dstraw}`);
          // Notify listeners
          if (this._messageListeners) {
            this._messageListeners.forEach(cb => cb(evt));
          }
        }
      } catch(e) {}
    });

    this.ws.on('error', (e) => {
      this.log.warn(`CBus: WebSocket error: ${e.message}`);
    });

    this.ws.on('close', () => {
      this.log.warn('CBus: WebSocket closed, reconnecting in 5s');
      clearInterval(this._pingInterval);
      this.ws = null;
      setTimeout(() => this._connect(), 5000);
    });
  }

  _isConnected() {
    const WebSocket = require('ws');
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  async setLevel(app, group, level, ramp = 0) {
    const address = this._encodeAddress(app, group);
    const cmd = JSON.stringify({
      address: address,
      datatype: 5,
      value: level,
      type: 'text',
      update: false,
      action: 'write',
    });
    this.log.info(`CBus: setLevel app=${app} group=${group} level=${level} address=0x${address.toString(16)}`);
    return this._send(cmd);
  }

  async triggerScene(group) {
    return this.setLevel(202, group, 255, 0);
  }

  async getLevel(app, group) {
    return null;
  }

  async getUserParam(group) {
    return null;
  }

  async setUserParam(group, value) {
    return this.setLevel(250, group, value, 0);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  _send(cmd) {
    this._lastCmd = this._lastCmd.then(async () => {
      if (!this._isConnected()) {
        this.log.warn('CBus: Not connected, skipping command');
        return;
      }
      this.log.debug(`CBus WS >> ${cmd}`);
      this.ws.send(cmd);
      await new Promise(r => setTimeout(r, 100));
    }).catch(e => this.log.warn(`CBus send error: ${e.message}`));
    return this._lastCmd;
  }

  _httpPost(path, formData) {
    return new Promise((resolve, reject) => {
      const body = Object.entries(formData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      const options = {
        host: this.host,
        port: this.port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(null); }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('HTTP timeout')));
      req.write(body);
      req.end();
    });
  }
}

CBusClient.prototype.onMessage = function(cb) {
  if (!this._messageListeners) this._messageListeners = [];
  this._messageListeners.push(cb);
};

module.exports = CBusClient;
