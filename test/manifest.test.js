// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_CHANNEL_NUMBER } from '../src/channels.js';
import { DEFAULT_CONFIG, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { KEYS } from '../src/decoder/client.js';
import { OFF_REASONS, TRIGGERS, WIDGET_KEYS } from '../src/hub.js';
import { POWER_VALUES, SCENE_ACTIONS } from '../src/scenes.js';
import { BUTTON_SETS, DEFAULT_FAVORITES, FAVORITE_ACTIONS, WIDGETS } from '../src/widgets.js';
import { FakeDecoder, URL_1, createWorld, decoderOf, deviceId } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cover, local transport, multimedia category', () => {
  assert.equal(manifest.name, 'Orange TV');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-orange-tv:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-orange-tv/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['multimedia']);
  assert.equal(manifest.network_discovery, undefined);
  assert.equal(manifest.network_wake, undefined);
});

test('every manifest action has a handler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const action of manifest.actions) {
    const ack = await world.fake.action(action.key, {});
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('declaring scene triggers, scene actions or widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.deepEqual(declared, CAPABILITY_FIELDS);
  assert.ok(isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION));
});

test('every scene_actions key has a handler, and returns the declared outputs', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const action of manifest.scene_actions) {
    // The fields as Gladys sends them: the declared defaults applied.
    const fields = { device: deviceId(world.gladys) };
    for (const field of action.fields) {
      if (field.default !== undefined) {
        fields[field.key] = field.default;
      }
    }
    const ack = await world.fake.sceneAction(action.key, fields);
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(
      Object.keys(ack.data.outputs).sort(),
      keysOf(action.outputs).sort(),
      `${action.key} outputs`,
    );
  }
});

test('the scene action fields match the code', async (t) => {
  const field = (action, key) =>
    manifest.scene_actions.find((a) => a.key === action).fields.find((f) => f.key === key);
  assert.deepEqual(optionsOf(field('set_power', 'state')), Object.values(POWER_VALUES));
  assert.deepEqual(optionsOf(field('send_key', 'key')), Object.keys(KEYS));
  assert.equal(field('set_channel', 'channel').max, MAX_CHANNEL_NUMBER);
  assert.equal(field('send_key', 'repeat').max, 10);

  // "Turn off" never turns on, and a channel is typed after waking the decoder.
  const world = await createWorld({ decoders: { [URL_1]: new FakeDecoder({ on: false }) } });
  t.after(() => world.app.stop());
  const off = await world.fake.sceneAction('set_power', { state: 'off' });
  assert.deepEqual(off.data.outputs, { changed: false });
  const channel = await world.fake.sceneAction('set_channel', { channel: 6 });
  assert.deepEqual(channel.data.outputs, { channel: 6, channel_name: 'M6' });
  assert.deepEqual(decoderOf(world).keys, [116, 518]);
});

test('the scene triggers are the ones the hub fires, with their filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  const decoder = new FakeDecoder({ on: false });
  const world = await createWorld({ decoders: { [URL_1]: decoder } });
  t.after(() => world.app.stop());
  // Every trigger once: on, channel changed, off.
  decoder.on = true;
  await world.hub.pollAll();
  decoder.epgId = '4';
  await world.hub.pollAll();
  decoder.on = false;
  await world.hub.pollAll();
  const fired = new Map(world.fake.sceneEvents.map((event) => [event.key, event.data]));
  for (const trigger of manifest.scene_triggers) {
    const data = fired.get(trigger.key);
    assert.ok(data, `${trigger.key} was fired`);
    // Filters match keys of `data`, variables read keys of `data`.
    for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
      assert.ok(key in data, `${trigger.key}: "${key}" is in the event data`);
    }
    for (const key of Object.keys(data)) {
      assert.ok(
        keysOf(trigger.variables).includes(key) || keysOf(trigger.fields).includes(key),
        `${trigger.key}: "${key}" is declared`,
      );
    }
  }
  const reason = manifest.scene_triggers
    .find((trigger) => trigger.key === TRIGGERS.TURNED_OFF)
    .fields.find((field) => field.key === 'reason');
  assert.deepEqual(optionsOf(reason), Object.values(OFF_REASONS));
});

test('every widgets key has a handler, and the settings match the code', async (t) => {
  assert.deepEqual(keysOf(manifest.widgets), Object.values(WIDGET_KEYS));
  assert.deepEqual(Object.keys(WIDGETS), Object.values(WIDGET_KEYS));
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const key of Object.values(WIDGET_KEYS)) {
    const ack = await world.fake.widgetGet(key, { settings: {} });
    assert.equal(ack.success, true, ack.error);
  }
  const settings = (key) => manifest.widgets.find((widget) => widget.key === key).settings;
  const buttons = settings(WIDGET_KEYS.REMOTE).find((field) => field.key === 'buttons');
  assert.deepEqual(optionsOf(buttons), Object.values(BUTTON_SETS));
  assert.equal(buttons.default, BUTTON_SETS.CHANNELS);
  const favorites = settings(WIDGET_KEYS.FAVORITES).filter((field) => field.type === 'number');
  assert.deepEqual(keysOf(favorites), FAVORITE_ACTIONS);
  assert.deepEqual(
    favorites.map((field) => field.default),
    DEFAULT_FAVORITES,
  );
});

test('config_schema defaults and options stay consistent with the code', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
  const options = (key) => optionsOf(manifest.config_schema.find((f) => f.key === key));
  assert.deepEqual(options('language'), LANGUAGES);
  assert.deepEqual(options('poll_interval'), POLL_INTERVALS);
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((f) => f.type !== 'section')
      .map((f) => f.key)
      .sort(),
  );
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('number fields have integer bounds and defaults (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (field[key] !== undefined) {
        assert.ok(Number.isInteger(field[key]), `field "${field.key}".${key} must be an integer`);
      }
    }
  }
});

test('actions declare no secret field, no required field (no default is applied)', () => {
  // Gladys#3154/#3155: a secret in an action form cannot be filled, and an
  // action applies no default while enforcing `required`.
  for (const action of manifest.actions ?? []) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret');
      assert.notEqual(field.required, true);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});
