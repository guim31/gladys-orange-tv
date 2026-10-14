// -----------------------------------------------------------------------------
// The hub against fake decoders and the SDK's fake Gladys: discovery, states,
// scene events on transitions, commands (the power toggle read first, digits
// typed for a channel), connection status, and the container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS } from '../src/hub.js';
import {
  FakeDecoder,
  URL_1,
  URL_2,
  createAll,
  createWorld,
  decoderOf,
  deviceId,
  featureId,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return { ...w, decoder: decoderOf(w) };
}

const state = (w, key) => w.fake.lastState(featureId(w.gladys, key));
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('one device per configured decoder, polled by the container only', async (t) => {
  const w = await world(t, {
    decoders: { [URL_1]: new FakeDecoder(), [URL_2]: new FakeDecoder() },
    config: {
      decoder_1_address: '192.0.2.30',
      decoder_2_address: 'http://198.51.100.40:8080/',
      decoder_2_name: 'Chambre',
      language: 'fr',
    },
  });
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Orange TV 192.0.2.30', 'Chambre'],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  assert.equal(devices[0].features[0].name, 'Marche / veille');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a live channel: power on, its number and name', async (t) => {
  const w = await world(t);
  assert.equal(state(w, FEATURE_KEYS.POWER), 1);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL), 1);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'TF1');
  // The push buttons carry no state.
  assert.equal(state(w, FEATURE_KEYS.VOLUME_UP), undefined);
});

test('standby, the home page and an unknown channel are said in words', async (t) => {
  const w = await world(t);
  w.decoder.epgId = '-1';
  w.decoder.context = 'HOMEPAGE';
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.CHANNEL), 0);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'Home page');

  w.decoder.context = 'APP_STORE';
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'APP_STORE');

  w.decoder.epgId = '777777';
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.CHANNEL), 0);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'EPG 777777');

  w.decoder.on = false;
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.POWER), 0);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL), 0);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'Standby');
});

test('only the changes are published', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before);
  w.decoder.epgId = '4';
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before + 2); // number and name
});

test('turned on, channel changed, turned off: one event per transition', async (t) => {
  const w = await world(t, { decoders: { [URL_1]: new FakeDecoder({ on: false }) } });
  assert.equal(w.fake.sceneEvents.length, 0, 'the first reading is not an event');

  w.decoder.on = true;
  w.decoder.epgId = '118';
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.TURNED_ON)[0].data, {
    device: deviceId(w.gladys),
    decoder: 'Salon',
    channel: 6,
    channel_name: 'M6',
  });
  assert.equal(events(w, TRIGGERS.CHANNEL_CHANGED).length, 0);

  w.decoder.epgId = '111';
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.CHANNEL_CHANGED).map((event) => event.data),
    [
      {
        device: deviceId(w.gladys),
        decoder: 'Salon',
        channel: 7,
        channel_name: 'Arte',
        previous_channel: 6,
        previous_channel_name: 'M6',
      },
    ],
  );

  // Through the home page and back to the same channel: no change.
  w.decoder.epgId = '-1';
  await w.hub.pollAll();
  w.decoder.epgId = '111';
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.CHANNEL_CHANGED).length, 1);

  w.decoder.on = false;
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.TURNED_OFF)[0].data, {
    device: deviceId(w.gladys),
    decoder: 'Salon',
    reason: 'standby',
  });
});

test('a decoder that stops answering is off after two readings, once', async (t) => {
  const w = await world(t);
  w.decoder.online = false;
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.POWER), 1, 'one silent reading is a blip');
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.POWER), 0);
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'Off');
  assert.deepEqual(
    events(w, TRIGGERS.TURNED_OFF).map((event) => event.data.reason),
    ['unreachable'],
  );
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys),
    transport: 'unreachable',
  });
  // It answered before: deep standby is not a configuration problem.
  assert.deepEqual(w.fake.connectionStatus, { connected: true });

  w.decoder.online = true;
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.TURNED_ON).length, 1);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
});

test('a decoder that never answered is reported in the connection status', async (t) => {
  const w = await world(t, {
    decoders: {},
    config: {
      decoder_1_address: '192.0.2.99',
      decoder_2_address: 'not an address!',
      language: 'en',
    },
  });
  await w.hub.pollAll();
  const status = w.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.en, /^Orange TV 192\.0\.2\.99: does not answer/);
  assert.match(status.message.en, /Address not understood/);
  assert.match(status.message.fr, /Orange TV 192\.0\.2\.99 : ne répond pas/);
});

test('no decoder configured: the connection status says what to do', async (t) => {
  const w = await world(t, { config: {} });
  assert.equal(w.fake.discoveredDevices.length, 0);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /adresse IP de votre décodeur/);
});

test('turning on or off presses the power key only when the state differs', async (t) => {
  const w = await world(t);
  assert.equal(await w.hub.setPower(null, true), false);
  assert.deepEqual(w.decoder.keys, []);

  assert.equal(await w.hub.setPower(deviceId(w.gladys), false), true);
  assert.deepEqual(w.decoder.keys, [116]);
  assert.equal(w.decoder.on, false);
  assert.equal(await w.hub.setPower(null, false), false);
  assert.deepEqual(w.decoder.keys, [116]);
});

test('a decoder that does not answer cannot be turned on: the message says why', async (t) => {
  const w = await world(t);
  w.decoder.online = false;
  await assert.rejects(w.hub.setPower(null, true), /deep standby/);
});

test('a channel number is typed digit by digit', async (t) => {
  const w = await world(t);
  assert.equal(await w.hub.setChannel(null, '24'), 24);
  assert.deepEqual(w.decoder.keys, [514, 516]);
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'RMC Découverte');
  await assert.rejects(w.hub.setChannel(null, 0), /from 1 to 9999/);
  await assert.rejects(w.hub.setChannel(null, '2.5'), /from 1 to 9999/);
  await assert.rejects(w.hub.setChannel(null, 12345), /from 1 to 9999/);
});

test('a channel on a decoder in standby: refused, or turned on first', async (t) => {
  const w = await world(t, { decoders: { [URL_1]: new FakeDecoder({ on: false }) } });
  await assert.rejects(w.hub.setChannel(null, 2), /standby/);
  assert.deepEqual(w.decoder.keys, []);

  await w.hub.setChannel(null, 2, { wake: true });
  assert.deepEqual(w.decoder.keys, [116, 514]);

  w.decoder.on = false;
  w.decoder.powerWorks = false;
  await assert.rejects(w.hub.setChannel(null, 3, { wake: true }), /did not leave standby/);
});

test('a key pressed several times, and an unknown key refused', async (t) => {
  const w = await world(t);
  assert.equal(await w.hub.sendKey(null, 'volume_up', 3), 3);
  assert.deepEqual(w.decoder.keys, [115, 115, 115]);
  assert.equal(await w.hub.sendKey(null, 'mute', 50), 10, 'ten at most');
  await assert.rejects(w.hub.sendKey(null, 'toString'), /Unknown key/);
});

test('two commands never mix their keys', async (t) => {
  const w = await world(t);
  await Promise.all([w.hub.setChannel(null, 12), w.hub.setChannel(null, 34)]);
  assert.deepEqual(w.decoder.keys, [513, 514, 515, 516]);
});

test('the device features drive the decoder', async (t) => {
  const w = await world(t);
  await createAll(w);
  const [device] = w.fake.devices;
  const feature = (key) => ({ external_id: featureId(w.gladys, key) });

  assert.equal((await w.fake.setValue(device, feature(FEATURE_KEYS.CHANNEL_UP), 1)).success, true);
  assert.equal((await w.fake.setValue(device, feature(FEATURE_KEYS.MUTE), 1)).success, true);
  assert.equal((await w.fake.setValue(device, feature(FEATURE_KEYS.CHANNEL), 5)).success, true);
  assert.equal((await w.fake.setValue(device, feature(FEATURE_KEYS.POWER), 0)).success, true);
  assert.deepEqual(w.decoder.keys, [402, 113, 517, 116]);

  const ack = await w.fake.setValue(device, feature(FEATURE_KEYS.CHANNEL_NAME), 1);
  assert.equal(ack.success, false);
});

test('the states are sent again when the device is added', async (t) => {
  const w = await world(t);
  const name = featureId(w.gladys, FEATURE_KEYS.CHANNEL_NAME);
  const count = () => w.fake.states.filter((s) => s.device_feature_external_id === name).length;
  assert.equal(count(), 1);
  await createAll(w);
  assert.equal(count(), 2);
  assert.ok(w.fake.widgetRefreshes.includes('remote'));
});

test('a new language renames the features and the texts', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ decoder_1_address: '192.0.2.30', language: 'de' });
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Ein / Standby');
  w.decoder.on = false;
  await w.hub.pollAll();
  assert.equal(state(w, FEATURE_KEYS.CHANNEL_NAME), 'Standby');
});

test('the "Test the decoders" action reads every decoder', async (t) => {
  const w = await world(t, {
    decoders: { [URL_1]: new FakeDecoder() },
    config: { decoder_1_address: '192.0.2.30', decoder_2_address: '198.51.100.40', language: 'fr' },
  });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.fr,
    'Orange TV 192.0.2.30 : répond, allumé, TF1\nOrange TV 198.51.100.40 : ne répond pas (éteint, ou mauvaise adresse)',
  );
  assert.ok(ack.data.message.de.includes('antwortet, an, TF1'));
});

test('the container reads the decoders on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({
    timers: true,
    config: { decoder_1_address: '192.0.2.30', poll_interval: '5', language: 'en' },
  });
  t.after(() => w.app.stop());
  const decoder = decoderOf(w);
  const reads = () => decoder.requests.filter((url) => url.includes('operation=10')).length;
  assert.equal(reads(), 1);
  decoder.epgId = '4';
  t.mock.timers.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads(), 2);
  assert.equal(state({ ...w }, FEATURE_KEYS.CHANNEL_NAME), 'France 2');
});
