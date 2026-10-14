// -----------------------------------------------------------------------------
// Client of the local HTTP API of the Orange TV decoder (UHD 86, TV 4, TV 5,
// TV 6): `GET http://<decoder>:8080/remoteControl/cmd?operation=...`.
// Unofficial but stable for years, documented by the open source projects
// that use it (see the README credits):
//   - operation=10                 state: standby or on, what is played;
//   - operation=01&key=K&mode=0    a key of the remote, pressed once.
// Every answer is `{ result: { responseCode: "0", message: "ok", data } }`.
//
// No authentication: anyone on the local network can drive the decoder,
// which is why the integration only sends keys of the remote.
// -----------------------------------------------------------------------------

import { httpGet } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: deep standby, unplugged, wrong address
  PROTOCOL: 'protocol', // an answer, but not the decoder API
  REFUSED: 'refused', // the decoder answered with an error code
});

// Key codes of the remote (the `key` parameter of operation 01). The names
// are the keys of the "Send a key" scene action: permanent once published.
export const KEYS = Object.freeze({
  power: 116,
  ok: 352,
  back: 158,
  menu: 139,
  guide: 365,
  up: 103,
  down: 108,
  left: 105,
  right: 106,
  channel_up: 402,
  channel_down: 403,
  volume_up: 115,
  volume_down: 114,
  mute: 113,
  play_pause: 164,
  rewind: 168,
  forward: 159,
  record: 167,
  vod: 393,
});

// Digits 0 to 9: codes 512 to 521.
export const digitKey = (digit) => 512 + digit;

export class DecoderError extends Error {
  constructor(kind, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DecoderError';
    this.kind = kind;
  }
}

export class DecoderClient {
  /**
   * @param {object} options
   * @param {string} options.url `http://host:port`
   * @param {Function} [options.request] HTTP seam (src/decoder/http.js)
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, request = httpGet, timeoutMs = 4000 }) {
    this.url = url;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  /** One API call; resolves with `result.data` (an object, maybe empty). */
  async call(params) {
    const target = `${this.url}/remoteControl/cmd?${new URLSearchParams(params)}`;
    let answer;
    try {
      answer = await this.request(target, { timeoutMs: this.timeoutMs });
    } catch (err) {
      throw new DecoderError(
        ERROR_KINDS.UNREACHABLE,
        `no answer (${err.code ?? err.message})`,
        err,
      );
    }
    if (answer.status !== 200) {
      throw new DecoderError(ERROR_KINDS.PROTOCOL, `HTTP ${answer.status}`);
    }
    let body;
    try {
      body = JSON.parse(answer.body);
    } catch {
      throw new DecoderError(ERROR_KINDS.PROTOCOL, 'the answer is not JSON');
    }
    const result = body?.result;
    if (!result || typeof result !== 'object') {
      throw new DecoderError(ERROR_KINDS.PROTOCOL, 'the answer has no result');
    }
    if (String(result.responseCode) !== '0') {
      throw new DecoderError(
        ERROR_KINDS.REFUSED,
        `refused (code ${result.responseCode}${result.message ? `, ${result.message}` : ''})`,
      );
    }
    return result.data && typeof result.data === 'object' ? result.data : {};
  }

  /** What the decoder is doing (operation 10). */
  getStatus() {
    return this.call({ operation: '10' });
  }

  /** Press one key of the remote (operation 01, mode 0: a short press). */
  pressKey(code) {
    return this.call({ operation: '01', key: String(code), mode: '0' });
  }
}
