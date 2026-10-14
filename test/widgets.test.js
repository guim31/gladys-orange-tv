// -----------------------------------------------------------------------------
// The two widgets: contents within the core vocabulary and budget (the SDK's
// validateWidgetContent), the check mark on the channel on screen, and what a
// tap does.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FakeDecoder, URL_1, createWorld, decoderOf, deviceId } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return { ...w, decoder: decoderOf(w) };
}

async function content(w, key, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(key, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: data } = ack.data;
  assert.deepEqual(validateWidgetContent(data), [], JSON.stringify(data));
  return data;
}

const buttons = (data) => data.components.filter((c) => c.type === 'button');
const rows = (data) => data.components.find((c) => c.type === 'status').items;

test('remote: state, channel and four buttons, channels or volume', async (t) => {
  const w = await world(t);
  const data = await content(w, 'remote', {}, 'fr');
  assert.deepEqual(
    rows(data).map((row) => [row.label, row.value]),
    [
      ['Salon', 'Allumé'],
      ['Chaîne', '1 · TF1'],
    ],
  );
  assert.deepEqual(
    buttons(data).map((b) => [b.label, b.action.key]),
    [
      ['Mettre en veille', 'power'],
      ['Chaîne −', 'channel_down'],
      ['Chaîne +', 'channel_up'],
      ['Muet', 'mute'],
    ],
  );
  const volume = await content(w, 'remote', { buttons: 'volume' });
  assert.deepEqual(
    buttons(volume).map((b) => b.action.key),
    ['power', 'volume_down', 'volume_up', 'mute'],
  );
});

test('remote: a decoder in standby offers to turn it on', async (t) => {
  const w = await world(t, { decoders: { [URL_1]: new FakeDecoder({ on: false }) } });
  const data = await content(w, 'remote', { device: deviceId(w.gladys) });
  assert.deepEqual(
    rows(data).map((row) => row.value),
    ['Standby'],
  );
  const [power] = buttons(data);
  assert.equal(power.label, 'Turn on');
  assert.deepEqual(power.action.params, { on: true });

  const ack = await w.fake.widgetAction('remote', 'power', power.action.params, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.decoder.keys, [116]);
  assert.equal(ack.data.message.fr, 'Décodeur allumé.');

  // A second tap on the stale button: nothing to do, no toggle.
  const again = await w.fake.widgetAction('remote', 'power', { on: true }, { settings: {} });
  assert.equal(again.data.message.en, 'Nothing to do: the decoder already is in that state.');
  assert.deepEqual(w.decoder.keys, [116]);
});

test('remote: the buttons press their key', async (t) => {
  const w = await world(t);
  for (const key of ['channel_down', 'channel_up', 'volume_down', 'volume_up', 'mute']) {
    const ack = await w.fake.widgetAction('remote', key, undefined, { settings: {} });
    assert.equal(ack.success, true, ack.error);
  }
  assert.deepEqual(w.decoder.keys, [403, 402, 114, 115, 113]);
});

test('favorites: four channels, a check mark on the one on screen', async (t) => {
  const w = await world(t);
  const data = await content(w, 'favorites', { channel_2: 16, channel_4: 512 }, 'fr');
  assert.deepEqual(
    buttons(data).map((b) => [b.label, b.icon, b.action.key, b.action.params.number]),
    [
      ['1 · TF1', 'check-circle', 'channel_1', 1],
      ['16 · franceinfo', 'tv', 'channel_2', 16],
      ['3 · France 3', 'tv', 'channel_3', 3],
      ['Chaîne 512', 'tv', 'channel_4', 512],
    ],
  );
});

test('favorites: a tap types the channel, turning the decoder on first', async (t) => {
  const w = await world(t, { decoders: { [URL_1]: new FakeDecoder({ on: false }) } });
  const ack = await w.fake.widgetAction('favorites', 'channel_2', { number: 16 }, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.decoder.keys, [116, 513, 518]);
  assert.equal(ack.data.message.en, 'Channel 16 · franceinfo.');
});

test('no decoder, or a decoder removed from the configuration: a message', async (t) => {
  const empty = await world(t, { config: {} });
  const none = await content(empty, 'remote');
  assert.match(none.components[0].text, /IP address of your decoder/);

  const w = await world(t);
  const gone = await content(w, 'favorites', { device: deviceId(w.gladys, 3) }, 'de');
  assert.match(gone.components[0].text, /nicht mehr in der Konfiguration/);
});

test('a decoder that never answered shows why', async (t) => {
  const w = await world(t, { decoders: {} });
  const data = await content(w, 'remote', {}, 'es');
  assert.match(rows(data)[0].value, /^no responde/);
});
