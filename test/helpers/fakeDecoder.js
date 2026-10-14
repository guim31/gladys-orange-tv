// -----------------------------------------------------------------------------
// In-memory Orange TV decoders behind the `request` seam of the client
// (src/decoder/http.js). Answers are built from the fixtures
// (test/fixtures/decoder/), with the behaviors that matter: standby and on,
// the power key as a toggle, channel up/down along the line-up, digits typed
// on the remote, a decoder that stops answering (deep standby).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { CHANNELS, channelByNumber } from '../../src/channels.js';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/decoder/${name}.json`, import.meta.url), 'utf8'));

const json = (body, status = 200) => ({ status, body: JSON.stringify(body) });

export class FakeDecoder {
  /**
   * @param {object} [options]
   * @param {boolean} [options.on]
   * @param {string} [options.epgId] channel on screen ("-1": none)
   * @param {string} [options.context] osdContext when no channel is tuned
   */
  constructor({ on = true, epgId = '192', context = 'LIVE' } = {}) {
    this.on = on;
    this.epgId = epgId;
    this.context = context;
    this.online = true;
    this.typed = ''; // digits typed, tuned at the next reading
    this.keys = []; // key codes received, in order
    this.requests = [];
    this.failNext = null; // e.g. { status: 500 } or 'refused'
    this.powerWorks = true; // false: the power key is ignored (stuck decoder)
  }

  status() {
    if (this.typed) {
      const channel = channelByNumber(Number(this.typed));
      this.epgId = channel ? channel.epgId : `9${this.typed}`;
      this.typed = '';
    }
    const answer = fixture(this.on ? 'status-live' : 'status-standby');
    if (this.on) {
      answer.result.data.playedMediaId = this.epgId;
      answer.result.data.osdContext = this.epgId === '-1' ? this.context : 'LIVE';
    }
    return answer;
  }

  press(code) {
    this.keys.push(code);
    if (code === 116) {
      if (this.powerWorks) {
        this.on = !this.on;
      }
    } else if (code === 402 || code === 403) {
      const index = CHANNELS.findIndex((channel) => channel.epgId === this.epgId);
      const next = (index + (code === 402 ? 1 : -1) + CHANNELS.length) % CHANNELS.length;
      this.epgId = CHANNELS[next].epgId;
    } else if (code >= 512 && code <= 521) {
      this.typed += String(code - 512);
    }
  }

  handle(url) {
    this.requests.push(url);
    const failure = this.failNext;
    this.failNext = null;
    if (failure === 'refused') {
      return json(fixture('refused'));
    }
    if (failure?.status) {
      return { status: failure.status, body: failure.body ?? '' };
    }
    const query = new URL(url).searchParams;
    switch (query.get('operation')) {
      case '10':
        return json(this.status());
      case '01':
        this.press(Number(query.get('key')));
        return json(fixture('key-ok'));
      default:
        return json(fixture('refused'));
    }
  }
}

/** A fake network: decoders by base URL; any other address does not answer. */
export function createNetwork(decoders = {}) {
  const byOrigin = new Map(Object.entries(decoders));
  return {
    decoders: byOrigin,
    async request(url) {
      const decoder = byOrigin.get(new URL(url).origin);
      if (!decoder || !decoder.online) {
        const error = new Error('The operation was aborted due to timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return decoder.handle(url);
    },
  };
}
