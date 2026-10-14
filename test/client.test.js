// -----------------------------------------------------------------------------
// The decoder client and the reading of its answers, on the fixtures: the
// request URLs, the error kinds, the status model, the channel table and the
// configuration parsing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, channelByEpg, parseChannelNumber } from '../src/channels.js';
import { hostOf, normalizeConfig, parseDecoderUrl } from '../src/config.js';
import { DecoderClient, ERROR_KINDS, KEYS, digitKey } from '../src/decoder/client.js';
import { describeChannel, parseStatus } from '../src/decoder/model.js';
import { fixture } from './helpers/fakeDecoder.js';

const answering = (body, status = 200) => {
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    return { status, body: typeof body === 'string' ? body : JSON.stringify(body) };
  };
  return { urls, client: new DecoderClient({ url: 'http://192.0.2.30:8080', request }) };
};

test('the status and key requests use the documented URLs', async () => {
  const { urls, client } = answering(fixture('key-ok'));
  await client.getStatus();
  await client.pressKey(KEYS.channel_up);
  await client.pressKey(digitKey(9));
  assert.deepEqual(urls, [
    'http://192.0.2.30:8080/remoteControl/cmd?operation=10',
    'http://192.0.2.30:8080/remoteControl/cmd?operation=01&key=402&mode=0',
    'http://192.0.2.30:8080/remoteControl/cmd?operation=01&key=521&mode=0',
  ]);
});

test('the status of a live channel, standby and the home page', async () => {
  const live = parseStatus(await answering(fixture('status-live')).client.getStatus());
  assert.deepEqual(live, { on: true, epgId: '192', context: 'LIVE', mediaType: 'LIVE' });
  const standby = parseStatus(fixture('status-standby').result.data);
  assert.equal(standby.on, false);
  assert.equal(standby.epgId, null, '"-1" is no channel');
  const home = parseStatus(fixture('status-homepage').result.data);
  assert.deepEqual([home.on, home.epgId, home.context], [true, null, 'HOMEPAGE']);
  assert.equal(parseStatus({}).on, false, 'an empty answer is not "on"');
});

test('each failure has its kind', async () => {
  const kinds = async (setup) => {
    try {
      await setup.client.getStatus();
      return null;
    } catch (err) {
      return err.kind;
    }
  };
  assert.equal(await kinds(answering(fixture('refused'))), ERROR_KINDS.REFUSED);
  assert.equal(await kinds(answering('<html>Livebox</html>')), ERROR_KINDS.PROTOCOL);
  assert.equal(await kinds(answering({ hello: 'world' })), ERROR_KINDS.PROTOCOL);
  assert.equal(await kinds(answering('', 404)), ERROR_KINDS.PROTOCOL);
  const silent = new DecoderClient({
    url: 'http://192.0.2.30:8080',
    request: async () => {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    },
  });
  assert.equal(await kinds({ client: silent }), ERROR_KINDS.UNREACHABLE);
});

test('the channel table: unique numbers and EPG ids, unknown ones by id', () => {
  assert.equal(new Set(CHANNELS.map((c) => c.number)).size, CHANNELS.length);
  assert.equal(new Set(CHANNELS.map((c) => c.epgId)).size, CHANNELS.length);
  assert.equal(channelByEpg('2111').name, 'franceinfo');
  assert.deepEqual(describeChannel('4'), { epgId: '4', number: 2, name: 'France 2' });
  assert.deepEqual(describeChannel('31337'), { epgId: '31337', number: null, name: 'EPG 31337' });
  assert.equal(describeChannel(null), null);
  assert.equal(parseChannelNumber(' 16 '), 16);
  for (const bad of [0, -1, 1.5, '1,5', '', null, 10000, 'abc']) {
    assert.equal(parseChannelNumber(bad), null, String(bad));
  }
});

test('the decoder address: an IP or a name, port 8080 by default', () => {
  assert.equal(parseDecoderUrl('192.0.2.30'), 'http://192.0.2.30:8080');
  assert.equal(parseDecoderUrl(' 192.0.2.30:8081 '), 'http://192.0.2.30:8081');
  assert.equal(parseDecoderUrl('http://tv.home/remote/'), 'http://tv.home:8080');
  for (const bad of ['', 'https://192.0.2.30', 'http://user:pw@192.0.2.30', 'a b', 42]) {
    assert.equal(parseDecoderUrl(bad), null, String(bad));
  }
  assert.equal(hostOf('http://192.0.2.30:8080'), '192.0.2.30');
  assert.equal(hostOf('http://192.0.2.30:8081'), '192.0.2.30:8081');
});

test('the configuration: slots, invalid addresses, defaults', () => {
  const config = normalizeConfig({
    decoder_1_address: '192.0.2.30',
    decoder_1_name: '  Salon  ',
    decoder_3_address: 'ftp://nope',
    poll_interval: 30,
    language: 'xx',
  });
  assert.deepEqual(config, {
    decoders: [{ slot: 1, url: 'http://192.0.2.30:8080', name: 'Salon' }],
    invalidSlots: [3],
    pollIntervalMs: 30_000,
    language: 'fr',
  });
  assert.equal(normalizeConfig(null).pollIntervalMs, 10_000);
});
