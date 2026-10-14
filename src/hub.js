// -----------------------------------------------------------------------------
// The decoder hub: one record per configured decoder, read on a timer of the
// container (the interval chosen in the configuration), its states published
// to Gladys when they change, its scene events fired on transitions, and the
// commands of the device, the widgets and the scene actions.
//
// Gladys never polls these devices (should_poll: false): the scene events
// must fire even for a decoder whose device was not added, and a device
// created without should_poll is never polled by Gladys 5.2 anyway.
//
// The power key of the remote is a toggle: "turn on" and "turn off" read the
// decoder first and press it only when the state differs, so a scene that
// turns the TV off never turns it on.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { parseChannelNumber } from './channels.js';
import { DecoderClient, DecoderError, ERROR_KINDS, KEYS, digitKey } from './decoder/client.js';
import { describeChannel, parseStatus } from './decoder/model.js';
import {
  buildDevice,
  decoderName,
  describeScreen,
  deviceIds,
  featureOf,
  featureStates,
  FEATURE_KEYS,
  slotOf,
} from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  STATE_TEXT,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'orange-tv-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({ REMOTE: 'remote', FAVORITES: 'favorites' });

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  TURNED_ON: 'decoder_turned_on',
  TURNED_OFF: 'decoder_turned_off',
  CHANNEL_CHANGED: 'channel_changed',
});

// Why a decoder counts as turned off (`reason` filter of the trigger).
export const OFF_REASONS = Object.freeze({ STANDBY: 'standby', UNREACHABLE: 'unreachable' });

export const HUB_TIMINGS = {
  // Readings without answer in a row before a decoder counts as off.
  offAfterFailures: 2,
  // A command changes the screen a moment later: read the decoder again then.
  followUpMs: 2500,
  // Pause between the digits of a channel number, as fingers on the remote.
  digitDelayMs: 350,
  // Time a decoder takes to leave standby before it takes a channel number.
  wakeMs: 6000,
  // Re-publish unchanged values this often (Gladys flags values older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : null);

export class DecoderHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/decoder/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    /** @type {Map<number, object>} decoder records, by slot */
    this.records = new Map();
    this.transports = new Map();
    this.connection = null;
    this.pollTimer = null;
    this.stopped = false;
    /** Problems already logged, by key: their repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (decoders found, lost, back, user commands).
  // A problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  label(record) {
    return `Decoder ${record.decoder.slot} (${decoderName(record.decoder)})`;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates();
    this.transports.clear();
    this.connection = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const wanted = new Map(config.decoders.map((decoder) => [decoder.slot, decoder]));
    for (const [slot, record] of this.records) {
      const decoder = wanted.get(slot);
      if (!decoder || decoder.url !== record.decoder.url) {
        this.dropRecord(record);
        this.records.delete(slot);
      }
    }
    for (const decoder of config.decoders) {
      const record = this.records.get(decoder.slot);
      if (record) {
        record.decoder = decoder; // a new name only
      } else {
        this.records.set(decoder.slot, this.newRecord(decoder));
      }
    }
    // The feature names and the channel text follow the language.
    this.gladys.forgetPublishedStates();
    await this.publishDevices();
    await this.pollAll();
    this.schedulePoll();
  }

  newRecord(decoder) {
    return {
      decoder,
      client: new DecoderClient({ url: decoder.url, request: this.request }),
      // state: null (not read yet), 'on', 'standby', 'off' (no answer).
      snapshot: { state: null, epgId: null, context: null },
      lastEpgId: null,
      error: null,
      failures: 0,
      answered: false,
      polling: null,
      queue: Promise.resolve(),
      followUpTimer: null,
    };
  }

  dropRecord(record) {
    record.dropped = true;
    clearTimeout(record.followUpTimer);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    for (const record of this.records.values()) {
      clearTimeout(record.followUpTimer);
    }
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || this.records.size === 0) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /** Read a decoder again shortly after a command, to show its effect. */
  scheduleFollowUp(record) {
    clearTimeout(record.followUpTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    record.followUpTimer = setTimeout(() => {
      this.poll(record)
        .then((changed) => this.afterChanges(changed))
        .catch((err) => this.problem('follow-up', 'Reading after a command failed', err, 'error'));
    }, this.timings.followUpMs);
    record.followUpTimer.unref?.();
  }

  // --- Devices -----------------------------------------------------------------

  async publishDevices() {
    const devices = [...this.records.values()].map((record) =>
      buildDevice(this.gladys, record.decoder, this.config.language),
    );
    // Even an empty list: the Discovery tab then shows no stale decoder.
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** "Search" in the Discovery tab: publish the devices again, read the decoders. */
  async rediscover() {
    await this.publishDevices();
    await this.pollAll();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const slot = slotOf(this.gladys, device.external_id);
    const record = slot === null ? null : this.records.get(slot);
    if (!record) {
      return;
    }
    this.gladys.forgetPublishedStates(device.external_id);
    await this.publishStates(record);
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  // --- Reading the decoders ------------------------------------------------------

  async pollAll() {
    const records = [...this.records.values()];
    const changes = await Promise.all(records.map((record) => this.poll(record)));
    await this.afterChanges(changes.some(Boolean));
  }

  /** Gladys asks for a refresh (onPoll): read that decoder now. */
  async pollDevice(device) {
    const record = this.recordOf(device.external_id);
    if (record) {
      await this.afterChanges(await this.poll(record));
    }
  }

  /**
   * Read one decoder and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widgets show something new
   */
  poll(record) {
    record.polling ??= this.read(record).finally(() => {
      record.polling = null;
    });
    return record.polling;
  }

  async read(record) {
    let status;
    try {
      status = parseStatus(await record.client.getStatus());
    } catch (err) {
      if (!(err instanceof DecoderError)) {
        throw err;
      }
      return this.applyFailure(record, err);
    }
    return this.applyReading(record, status);
  }

  async applyReading(record, status) {
    if (record.dropped) {
      return false;
    }
    if (record.error) {
      logger.info(`${this.label(record)} answers again`);
    } else if (!record.answered) {
      logger.info(`${this.label(record)}: connected`);
    }
    record.error = null;
    record.failures = 0;
    record.answered = true;
    this.resolved(`decoder:${record.decoder.slot}`);

    const previous = record.snapshot;
    const next = {
      state: status.on ? 'on' : 'standby',
      epgId: status.on ? status.epgId : null,
      context: status.on ? status.context : null,
    };
    record.snapshot = next;
    await this.transitions(record, previous, next);
    await this.publishStates(record);
    return describeScreen(previous, 'en') !== describeScreen(next, 'en');
  }

  async applyFailure(record, err) {
    if (record.dropped) {
      return false;
    }
    const wasError = record.error?.kind;
    record.error = { kind: err.kind, message: err.message };
    record.failures += 1;
    // One warning when the problem starts (or changes), not one per reading.
    // A decoder in deep standby stops answering: that is not an error.
    if (wasError !== err.kind) {
      const level = err.kind === ERROR_KINDS.UNREACHABLE ? 'info' : 'warn';
      logger[level](`${this.label(record)}: ${err.message}`);
    } else {
      logger.debug(`${this.label(record)}: ${err.message} (again)`);
    }
    const previous = record.snapshot;
    if (record.failures < this.timings.offAfterFailures || previous.state === 'off') {
      return wasError !== err.kind;
    }
    const next = { state: 'off', epgId: null, context: null };
    record.snapshot = next;
    await this.transitions(record, previous, next);
    await this.publishStates(record);
    return true;
  }

  /** Scene events of a reading: turned on or off, channel changed. */
  async transitions(record, previous, next) {
    const isOn = next.state === 'on';
    const channel = describeChannel(next.epgId);
    if (previous.state === null) {
      // The first reading tells where we are, it is not an event.
      record.lastEpgId = next.epgId ?? record.lastEpgId;
      return;
    }
    const wasOn = previous.state === 'on';
    if (!wasOn && isOn) {
      await this.fire(TRIGGERS.TURNED_ON, record, {
        channel: channel?.number ?? null,
        channel_name: describeScreen(next, this.config.language),
      });
    } else if (wasOn && !isOn) {
      await this.fire(TRIGGERS.TURNED_OFF, record, {
        reason: next.state === 'off' ? OFF_REASONS.UNREACHABLE : OFF_REASONS.STANDBY,
      });
    }
    if (!isOn || !next.epgId || next.epgId === record.lastEpgId) {
      return;
    }
    const before = describeChannel(record.lastEpgId);
    record.lastEpgId = next.epgId;
    if (before) {
      await this.fire(TRIGGERS.CHANNEL_CHANGED, record, {
        channel: channel.number,
        channel_name: channel.name,
        previous_channel: before.number,
        previous_channel_name: before.name,
      });
    }
  }

  async fire(key, record, data) {
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceIds(this.gladys, record.decoder.slot).device,
        decoder: decoderName(record.decoder),
        ...data,
      });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates(record) {
    const states = featureStates(
      this.gladys,
      record.decoder.slot,
      record.snapshot,
      this.config.language,
    );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States of ${this.label(record)} refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      for (const key of Object.values(WIDGET_KEYS)) {
        this.gladys.requestWidgetRefresh(key);
      }
    }
  }

  async publishTransports() {
    const entries = [];
    for (const record of this.records.values()) {
      if (record.snapshot.state === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, record.decoder.slot).device;
      const transport =
        record.snapshot.state === 'off' ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /**
   * The status under the integration name. A decoder that stops answering is
   * most often in deep standby: the integration stays connected once it has
   * answered, and reports the decoders that never did (wrong address) or that
   * answer something else than the decoder API.
   */
  connectionStatus() {
    const { decoders, invalidSlots } = this.config;
    if (decoders.length === 0) {
      return {
        connected: false,
        message: invalidSlots.length ? CONNECTION_TEXT.invalidAddress : CONNECTION_TEXT.noDecoder,
      };
    }
    const failing = [...this.records.values()].filter(
      (record) =>
        record.error && (!record.answered || record.error.kind !== ERROR_KINDS.UNREACHABLE),
    );
    if (failing.length === 0 && invalidSlots.length === 0) {
      return { connected: true };
    }
    const message = {};
    for (const language of Object.keys(CONNECTION_TEXT.noDecoder)) {
      const parts = failing.map((record) =>
        labelled(
          decoderName(record.decoder),
          pick(ERROR_TEXT[record.error.kind], language),
          language,
        ),
      );
      if (invalidSlots.length) {
        parts.push(pick(CONNECTION_TEXT.invalidAddress, language));
      }
      message[language] = parts.join(' · ').slice(0, 200);
    }
    return { connected: failing.length < this.records.size, message };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  recordOf(deviceExternalId) {
    const slot = slotOf(this.gladys, deviceExternalId);
    return slot === null ? null : (this.records.get(slot) ?? null);
  }

  /**
   * The decoder a command targets: the device chosen, or the only decoder.
   * With several decoders and none chosen, the first one.
   * @param {string|null|undefined} deviceExternalId
   */
  target(deviceExternalId) {
    const language = this.config?.language;
    if (this.records.size === 0) {
      throw new Error(pick(ACTION_TEXT.noDecoder, language));
    }
    if (!deviceExternalId) {
      return [...this.records.values()][0];
    }
    const record = this.recordOf(deviceExternalId);
    if (!record) {
      throw new Error(pick(ACTION_TEXT.unknownDecoder, language));
    }
    return record;
  }

  /** Run a command alone on its decoder: two commands never mix their keys. */
  exclusive(record, task) {
    const run = record.queue.then(task, task);
    record.queue = run.catch(() => {});
    return run;
  }

  /** Read the decoder now; throws the "does not answer" message when it is silent. */
  async freshState(record) {
    const changed = await this.poll(record);
    await this.afterChanges(changed);
    if (record.error) {
      throw new Error(
        record.error.kind === ERROR_KINDS.UNREACHABLE
          ? pick(ACTION_TEXT.offline, this.config.language)
          : labelled(
              decoderName(record.decoder),
              pick(ERROR_TEXT[record.error.kind], this.config.language),
              this.config.language,
            ),
      );
    }
    return record.snapshot.state;
  }

  async press(record, code) {
    try {
      await record.client.pressKey(code);
    } catch (err) {
      if (err instanceof DecoderError && err.kind === ERROR_KINDS.UNREACHABLE) {
        throw new Error(pick(ACTION_TEXT.offline, this.config.language), { cause: err });
      }
      throw err;
    }
  }

  /**
   * Turn a decoder on or put it in standby. Resolves with whether the power
   * key was pressed (false: it already was in that state).
   */
  setPower(deviceExternalId, on) {
    const record = this.target(deviceExternalId);
    return this.exclusive(record, async () => {
      const state = await this.freshState(record);
      if ((state === 'on') === on) {
        return false;
      }
      await this.press(record, KEYS.power);
      logger.info(`${this.label(record)}: ${on ? 'turned on' : 'put in standby'}`);
      this.scheduleFollowUp(record);
      return true;
    });
  }

  /**
   * Type a channel number on the remote. `wake`: a decoder in standby is
   * turned on first (scenes and the favorites widget); else it is refused.
   * Resolves with the channel, as the embedded table knows it.
   */
  setChannel(deviceExternalId, rawNumber, { wake = false } = {}) {
    const language = this.config?.language;
    const number = parseChannelNumber(rawNumber);
    if (number === null) {
      return Promise.reject(new Error(pick(ACTION_TEXT.badChannel, language)));
    }
    const record = this.target(deviceExternalId);
    return this.exclusive(record, async () => {
      let state = await this.freshState(record);
      if (state !== 'on') {
        if (!wake) {
          throw new Error(pick(ACTION_TEXT.standby, language));
        }
        await this.press(record, KEYS.power);
        logger.info(`${this.label(record)}: turned on`);
        await sleep(this.timings.wakeMs);
        state = await this.freshState(record);
        if (state !== 'on') {
          throw new Error(pick(ACTION_TEXT.wakeFailed, language));
        }
      }
      const digits = String(number).split('').map(Number);
      for (const [index, digit] of digits.entries()) {
        if (index > 0) {
          await sleep(this.timings.digitDelayMs);
        }
        await this.press(record, digitKey(digit));
      }
      logger.info(`${this.label(record)}: channel ${number}`);
      this.scheduleFollowUp(record);
      return number;
    });
  }

  /** Press a key of the remote `repeat` times (volume steps…). */
  sendKey(deviceExternalId, keyName, repeat = 1) {
    const code = Object.hasOwn(KEYS, keyName) ? KEYS[keyName] : undefined;
    if (code === undefined) {
      return Promise.reject(new Error(pick(ACTION_TEXT.badKey, this.config?.language)));
    }
    const record = this.target(deviceExternalId);
    const times = Math.min(10, Math.max(1, Math.round(Number(repeat)) || 1));
    return this.exclusive(record, async () => {
      for (let i = 0; i < times; i += 1) {
        if (i > 0) {
          await sleep(this.timings.digitDelayMs);
        }
        await this.press(record, code);
      }
      logger.info(`${this.label(record)}: key ${keyName}${times > 1 ? ` × ${times}` : ''}`);
      this.scheduleFollowUp(record);
      return times;
    });
  }

  /** A command from a device feature (the power switch, the channel, a button). */
  async setValue(device, feature, value) {
    const record = this.recordOf(device.external_id);
    const definition = record && featureOf(this.gladys, record.decoder.slot, feature.external_id);
    if (!definition || definition.definition.read_only) {
      throw new Error(`Feature ${feature.external_id} cannot be controlled`);
    }
    if (definition.key === FEATURE_KEYS.POWER) {
      await this.setPower(device.external_id, Number(value) === 1);
    } else if (definition.key === FEATURE_KEYS.CHANNEL) {
      await this.setChannel(device.external_id, Number(value));
    } else {
      await this.sendKey(
        device.external_id,
        Object.keys(KEYS).find((name) => KEYS[name] === definition.remoteKey),
      );
    }
  }

  // --- Reports -------------------------------------------------------------------------------

  /** "Test the decoders": read every decoder now, one line each. */
  async testConnection() {
    await this.pollAll();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (this.records.size === 0) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const lines = [...this.records.values()].map((record) => {
        const name = decoderName(record.decoder);
        if (record.error) {
          return labelled(name, pick(ERROR_TEXT[record.error.kind], language), language);
        }
        const { state } = record.snapshot;
        const parts = [text.ok, pick(STATE_TEXT[state], language).toLowerCase()];
        if (state === 'on') {
          parts.push(describeScreen(record.snapshot, language));
        }
        return labelled(name, parts.join(', '), language);
      });
      if (this.config.invalidSlots.length) {
        lines.push(pick(CONNECTION_TEXT.invalidAddress, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }
}
