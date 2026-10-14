// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the decoder answers of test/fixtures/decoder/): one to three
// decoders, on a channel, in standby, on the home page, not answering, in
// every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FakeDecoder, URL_1, URL_2, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const threeDecoders = {
  decoder_1_address: '192.0.2.30',
  decoder_1_name: 'Salon',
  decoder_2_address: '198.51.100.40',
  decoder_3_address: '192.0.2.31:8080',
};

const scenarios = [
  { label: 'one decoder', config: undefined },
  { label: 'three decoders', config: threeDecoders },
  { label: 'French names', config: { ...threeDecoders, language: 'fr' } },
  { label: 'German names', config: { ...threeDecoders, language: 'de' } },
  { label: 'Spanish names', config: { ...threeDecoders, language: 'es' } },
];

const decoders = () => ({
  [URL_1]: new FakeDecoder(),
  [URL_2]: new FakeDecoder({ on: false }),
  'http://192.0.2.31:8080': new FakeDecoder({ epgId: '-1', context: 'HOMEPAGE' }),
});

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { gladys, app, hub } = await createWorld({
      config: scenario.config,
      decoders: decoders(),
    });
    try {
      // A second reading: a decoder that does not answer is then "off".
      await hub.pollAll();
      const devices = gladys.fake.discoveredDevices;
      assert.ok(devices.length >= 1, 'no device discovered');
      assert.equal(devices.length, scenario.config ? 3 : 1);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the fixtures fits the declared bounds (the
          // push buttons carry no state; a text is never empty).
          const value = gladys.fake.lastState(feature.external_id);
          if (feature.category === 'text') {
            assert.equal(typeof value, 'string', `${at}: no text published`);
            assert.ok(value.length > 0, `${at}: empty text`);
          } else if (feature.has_feedback) {
            assert.equal(typeof value, 'number', `${at}: no state published`);
            assert.ok(
              value >= feature.min && value <= feature.max,
              `${at}: ${value} out of bounds`,
            );
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          } else {
            assert.equal(feature.read_only, false, `${at}: a push button is writable`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}
