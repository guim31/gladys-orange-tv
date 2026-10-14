// -----------------------------------------------------------------------------
// One Gladys device per Orange TV decoder.
//
// Identity: the configuration slot (1 to 3), not the address: a decoder that
// gets a new IP address from the Livebox keeps its device and history.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - power: television/binary, writable: 1 on, 0 standby (or off: the
//     decoder no longer answers);
//   - channel: television/channel, writable: the number of the channel on
//     the remote (0 when none, or when the embedded table does not know it);
//     writing a number types it on the remote;
//   - channel name: text/text, the channel, or what the decoder shows;
//   - channel up/down, volume up/down, mute, play/pause: television push
//     buttons (Gladys 5.1+ draws them as buttons), one key each.
//
// Published with should_poll: false: the integration reads the decoders on
// its own timer (src/hub.js), every 5 to 60 seconds.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { MAX_CHANNEL_NUMBER } from './channels.js';
import { hostOf } from './config.js';
import { KEYS } from './decoder/client.js';
import { describeChannel } from './decoder/model.js';
import { CONTEXT_TEXT, STATE_TEXT, pick } from './texts.js';

export const DEVICE_TYPE = 'decoder';
export const URL_PARAM = 'DECODER_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  POWER: 'power',
  CHANNEL: 'channel',
  CHANNEL_NAME: 'channel_name',
  CHANNEL_UP: 'channel_up',
  CHANNEL_DOWN: 'channel_down',
  VOLUME_UP: 'volume_up',
  VOLUME_DOWN: 'volume_down',
  MUTE: 'volume_mute',
  PLAY_PAUSE: 'play_pause',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.POWER]: 'Power',
    [FEATURE_KEYS.CHANNEL]: 'Channel number',
    [FEATURE_KEYS.CHANNEL_NAME]: 'Channel',
    [FEATURE_KEYS.CHANNEL_UP]: 'Channel up',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Channel down',
    [FEATURE_KEYS.VOLUME_UP]: 'Volume up',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Volume down',
    [FEATURE_KEYS.MUTE]: 'Mute',
    [FEATURE_KEYS.PLAY_PAUSE]: 'Play / pause',
  },
  fr: {
    [FEATURE_KEYS.POWER]: 'Marche / veille',
    [FEATURE_KEYS.CHANNEL]: 'Numéro de chaîne',
    [FEATURE_KEYS.CHANNEL_NAME]: 'Chaîne',
    [FEATURE_KEYS.CHANNEL_UP]: 'Chaîne suivante',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Chaîne précédente',
    [FEATURE_KEYS.VOLUME_UP]: 'Monter le volume',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Baisser le volume',
    [FEATURE_KEYS.MUTE]: 'Muet',
    [FEATURE_KEYS.PLAY_PAUSE]: 'Lecture / pause',
  },
  de: {
    [FEATURE_KEYS.POWER]: 'Ein / Standby',
    [FEATURE_KEYS.CHANNEL]: 'Sendernummer',
    [FEATURE_KEYS.CHANNEL_NAME]: 'Sender',
    [FEATURE_KEYS.CHANNEL_UP]: 'Nächster Sender',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Vorheriger Sender',
    [FEATURE_KEYS.VOLUME_UP]: 'Lauter',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Leiser',
    [FEATURE_KEYS.MUTE]: 'Stumm',
    [FEATURE_KEYS.PLAY_PAUSE]: 'Wiedergabe / Pause',
  },
  es: {
    [FEATURE_KEYS.POWER]: 'Encendido / espera',
    [FEATURE_KEYS.CHANNEL]: 'Número de canal',
    [FEATURE_KEYS.CHANNEL_NAME]: 'Canal',
    [FEATURE_KEYS.CHANNEL_UP]: 'Canal siguiente',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Canal anterior',
    [FEATURE_KEYS.VOLUME_UP]: 'Subir volumen',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Bajar volumen',
    [FEATURE_KEYS.MUTE]: 'Silencio',
    [FEATURE_KEYS.PLAY_PAUSE]: 'Reproducir / pausa',
  },
};

const { TELEVISION } = DEVICE_FEATURE_TYPES;

const push = (key, type, keyName) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
    type,
    read_only: false,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: 1,
  },
  remoteKey: KEYS[keyName],
});

// Order = display order in Gladys.
export const FEATURES = [
  {
    key: FEATURE_KEYS.POWER,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: TELEVISION.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: (snapshot) => (snapshot.state === null ? null : snapshot.state === 'on' ? 1 : 0),
  },
  {
    key: FEATURE_KEYS.CHANNEL,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: TELEVISION.CHANNEL,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: MAX_CHANNEL_NUMBER,
    },
    value: (snapshot) =>
      snapshot.state === null
        ? null
        : snapshot.state === 'on'
          ? (describeChannel(snapshot.epgId)?.number ?? 0)
          : 0,
  },
  {
    key: FEATURE_KEYS.CHANNEL_NAME,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 0,
    },
    text: (snapshot, language) => describeScreen(snapshot, language),
  },
  push(FEATURE_KEYS.CHANNEL_UP, TELEVISION.CHANNEL_UP, 'channel_up'),
  push(FEATURE_KEYS.CHANNEL_DOWN, TELEVISION.CHANNEL_DOWN, 'channel_down'),
  push(FEATURE_KEYS.VOLUME_UP, TELEVISION.VOLUME_UP, 'volume_up'),
  push(FEATURE_KEYS.VOLUME_DOWN, TELEVISION.VOLUME_DOWN, 'volume_down'),
  push(FEATURE_KEYS.MUTE, TELEVISION.VOLUME_MUTE, 'mute'),
  push(FEATURE_KEYS.PLAY_PAUSE, TELEVISION.PLAY, 'play_pause'),
];

/**
 * What the decoder shows, in words: the channel, else the state or the
 * screen (home page, video on demand…). Null before the first reading.
 * @param {{ state: string|null, epgId: string|null, context: string|null }} snapshot
 */
export function describeScreen(snapshot, language) {
  if (snapshot.state === null) {
    return null;
  }
  if (snapshot.state !== 'on') {
    return pick(STATE_TEXT[snapshot.state], language);
  }
  const channel = describeChannel(snapshot.epgId);
  if (channel) {
    return channel.name;
  }
  const context = snapshot.context && CONTEXT_TEXT[snapshot.context];
  return context
    ? pick(context, language)
    : (snapshot.context ?? pick(CONTEXT_TEXT.none, language)).slice(0, 40);
}

/** External ids of a decoder's device and features. */
export const deviceIds = (gladys, slot) => gladys.externalIds(DEVICE_TYPE, String(slot));

/** The slot of a device external id, null when it is not one of ours. */
export function slotOf(gladys, externalId) {
  for (const slot of [1, 2, 3]) {
    if (deviceIds(gladys, slot).device === externalId) {
      return slot;
    }
  }
  return null;
}

/** The feature definition of a feature external id on a slot, or null. */
export function featureOf(gladys, slot, featureExternalId) {
  const ids = deviceIds(gladys, slot);
  return FEATURES.find(({ key }) => ids.feature(key) === featureExternalId) ?? null;
}

/** The name shown for a decoder: the one typed in the configuration, else its address. */
export const decoderName = (decoder) => decoder.name ?? `Orange TV ${hostOf(decoder.url)}`;

/**
 * The discovery payload of a decoder.
 * @param {object} gladys SDK client
 * @param {{ slot: number, url: string, name: string|null }} decoder
 * @param {string} language feature names language
 */
export function buildDevice(gladys, decoder, language = 'fr') {
  const ids = deviceIds(gladys, decoder.slot);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: decoderName(decoder),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: decoder.url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The states of a decoder snapshot, in the publishStates format (nothing for
 * the push buttons, nor before the first reading).
 */
export function featureStates(gladys, slot, snapshot, language) {
  const ids = deviceIds(gladys, slot);
  const states = [];
  for (const feature of FEATURES) {
    const externalId = ids.feature(feature.key);
    if (feature.value) {
      const value = feature.value(snapshot);
      if (value !== null) {
        states.push({ device_feature_external_id: externalId, state: value });
      }
    } else if (feature.text) {
      const text = feature.text(snapshot, language);
      if (text) {
        states.push({ device_feature_external_id: externalId, text });
      }
    }
  }
  return states;
}
