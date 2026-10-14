// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a decoder that stops answering is
// logged once, and once when it is back; a user command writes one line.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, decoderOf } from './helpers/world.js';

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return { ...w, decoder: decoderOf(w) };
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('connected')),
    'the start is logged',
  );
  logs.clear();
  for (const epgId of ['4', '80', '-1', '118', '118']) {
    w.decoder.epgId = epgId;
    await w.hub.pollAll();
  }
  w.decoder.on = false;
  await w.hub.pollAll();
  assert.deepEqual(logs.texts(), []);
});

test('a decoder that stays silent is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.decoder.online = false;
  for (let i = 0; i < 6; i += 1) {
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /no answer/);
  logs.clear();
  w.decoder.online = true;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again/);
});

test('an answer that is not the decoder API is a warning, once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  for (let i = 0; i < 4; i += 1) {
    w.decoder.failNext = { status: 404 };
    await w.hub.pollAll();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines.length, 1);
});

test('a user command writes one line', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.hub.setChannel(null, 16);
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /channel 16/);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 500');
  };
  for (const epgId of ['4', '80', '118']) {
    w.decoder.epgId = epgId;
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States of .* refused/);
});

test('LOG_LEVEL=debug shows each silent reading', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  w.decoder.online = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.match(logs.texts().join('\n'), /\[DEBUG\].*again/);
});
