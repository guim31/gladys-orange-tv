// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys and fake decoders on a fake
// network, with the integration wired on top through registerHandlers. No
// timer runs unless `timers: true` (with node:test mock timers): the tests
// read the decoders with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakeDecoder, createNetwork } from './fakeDecoder.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.30:8080';
export const URL_2 = 'http://198.51.100.40:8080';

/** No waiting between digits nor for the wake-up in tests. */
export const FAST = { digitDelayMs: 0, wakeMs: 0 };

/**
 * @param {object} [options]
 * @param {Record<string, FakeDecoder>} [options.decoders] by base URL
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  decoders,
  config = { decoder_1_address: '192.0.2.30', decoder_1_name: 'Salon', language: 'en' },
  devices = [],
  connect = true,
  timings = FAST,
  timers = false,
  now,
} = {}) {
  const network = createNetwork(decoders ?? { [URL_1]: new FakeDecoder() });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, { request: network.request, timers, timings, now });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, app, hub: app.hub };
}

/** The first fake decoder of a world. */
export const decoderOf = (world, url = URL_1) => world.network.decoders.get(url);

/** External ids of the device of a configuration slot. */
export const deviceId = (gladys, slot = 1) => gladys.externalIds('decoder', String(slot)).device;
export const featureId = (gladys, key, slot = 1) =>
  gladys.externalIds('decoder', String(slot)).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeDecoder };
