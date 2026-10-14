// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// The core allows four buttons per widget, so the remote is split in two:
//   - `remote`: what the decoder shows, and four buttons: power, then either
//     channel down / up and mute (the default), or volume down / up and mute
//     (setting `buttons`): two widgets side by side make the whole remote;
//   - `favorites`: four channel buttons, numbers chosen in the settings; the
//     channel on screen carries a check mark (never the `primary` style,
//     invisible in dark mode). A tap on a decoder in standby turns it on
//     first.
//
// The decoder is the one chosen in the settings, else the first configured.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { channelByNumber, parseChannelNumber } from './channels.js';
import { describeChannel } from './decoder/model.js';
import { decoderName, describeScreen } from './devices.js';
import { WIDGET_KEYS } from './hub.js';
import { ERROR_TEXT, STATE_TEXT, pick } from './texts.js';

// Action keys of the buttons: permanent once published, unique per widget.
export const REMOTE_ACTIONS = Object.freeze({
  POWER: 'power',
  CHANNEL_DOWN: 'channel_down',
  CHANNEL_UP: 'channel_up',
  VOLUME_DOWN: 'volume_down',
  VOLUME_UP: 'volume_up',
  MUTE: 'mute',
});
export const FAVORITE_ACTIONS = Object.freeze(['channel_1', 'channel_2', 'channel_3', 'channel_4']);

// `buttons` setting of the remote widget.
export const BUTTON_SETS = Object.freeze({ CHANNELS: 'channels', VOLUME: 'volume' });

// Favorites when the settings say nothing: TF1, France 2, France 3, M6.
export const DEFAULT_FAVORITES = Object.freeze([1, 2, 3, 6]);

const ACTIVE_ICON = 'check-circle';

export const TEXT = {
  pick: {
    en: 'Enter the IP address of your decoder in the configuration of the integration.',
    fr: "Saisissez l'adresse IP de votre décodeur dans la configuration de l'intégration.",
    de: 'Gib die IP-Adresse deines Decoders in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección IP de su decodificador en la configuración de la integración.',
  },
  unknown: {
    en: 'This decoder is no longer in the configuration: choose another one in the widget settings.',
    fr: "Ce décodeur n'est plus dans la configuration : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Decoder ist nicht mehr in der Konfiguration: Wähle einen anderen in den Widget-Einstellungen.',
    es: 'Este decodificador ya no está en la configuración: elija otro en la configuración del widget.',
  },
  state: { en: 'Decoder', fr: 'Décodeur', de: 'Decoder', es: 'Decodificador' },
  channel: { en: 'Channel', fr: 'Chaîne', de: 'Sender', es: 'Canal' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Standby', fr: 'Mettre en veille', de: 'Standby', es: 'Poner en espera' },
  channelDown: { en: 'Channel −', fr: 'Chaîne −', de: 'Sender −', es: 'Canal −' },
  channelUp: { en: 'Channel +', fr: 'Chaîne +', de: 'Sender +', es: 'Canal +' },
  volumeDown: { en: 'Volume −', fr: 'Volume −', de: 'Leiser', es: 'Volumen −' },
  volumeUp: { en: 'Volume +', fr: 'Volume +', de: 'Lauter', es: 'Volumen +' },
  mute: { en: 'Mute', fr: 'Muet', de: 'Stumm', es: 'Silencio' },
  channelNumber: { en: 'Channel', fr: 'Chaîne', de: 'Sender', es: 'Canal' },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    on: 'Decoder turned on.',
    off: 'Decoder in standby.',
    already: 'Nothing to do: the decoder already is in that state.',
    key: 'Key sent.',
    channel: (name) => `Channel ${name}.`,
  },
  fr: {
    on: 'Décodeur allumé.',
    off: 'Décodeur mis en veille.',
    already: 'Rien à faire : le décodeur est déjà dans cet état.',
    key: 'Touche envoyée.',
    channel: (name) => `Chaîne ${name}.`,
  },
  de: {
    on: 'Decoder eingeschaltet.',
    off: 'Decoder im Standby.',
    already: 'Nichts zu tun: Der Decoder ist bereits in diesem Zustand.',
    key: 'Taste gesendet.',
    channel: (name) => `Sender ${name}.`,
  },
  es: {
    on: 'Decodificador encendido.',
    off: 'Decodificador en espera.',
    already: 'Nada que hacer: el decodificador ya está en ese estado.',
    key: 'Tecla enviada.',
    channel: (name) => `Canal ${name}.`,
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const toast = (render) =>
  Object.fromEntries(Object.entries(DONE_TEXT).map(([lang, text]) => [lang, render(text)]));

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The decoder of a widget instance, or a message content explaining why none. */
function recordFor(hub, settings, language) {
  if (hub.records.size === 0) {
    return { content: message(TEXT.pick, language) };
  }
  if (!settings?.device) {
    return { record: [...hub.records.values()][0] };
  }
  const record = hub.recordOf(settings.device);
  return record ? { record } : { content: message(TEXT.unknown, language) };
}

/** "2 · France 2", the channel name alone, or what the decoder shows. */
export function channelLabel(snapshot, language) {
  const channel = describeChannel(snapshot.epgId);
  if (snapshot.state === 'on' && channel?.number) {
    return `${channel.number} · ${channel.name}`;
  }
  return describeScreen(snapshot, language) ?? t(STATE_TEXT.unknown, language);
}

/** The status rows: the decoder state, the channel. */
function statusRows(record, language) {
  const { snapshot } = record;
  const state = snapshot.state ?? 'unknown';
  const stateRow = {
    label: fit(decoderName(record.decoder), 40),
    icon: state === 'on' ? 'tv' : 'power',
    value:
      record.error && !record.answered
        ? fit(t(ERROR_TEXT[record.error.kind], language), 40)
        : t(STATE_TEXT[state], language),
    color:
      state === 'on'
        ? WIDGET_COLORS.SUCCESS
        : state === 'standby' || state === 'off'
          ? WIDGET_COLORS.NEUTRAL
          : WIDGET_COLORS.WARNING,
  };
  if (state !== 'on') {
    return [stateRow];
  }
  return [
    stateRow,
    {
      label: t(TEXT.channel, language),
      icon: 'hash',
      value: fit(channelLabel(snapshot, language), 40),
      color: WIDGET_COLORS.INFO,
    },
  ];
}

const button = (label, icon, key, params) => ({
  type: 'button',
  label: fit(label, 24),
  icon,
  style: 'secondary',
  action: params ? { key, params } : { key },
});

// --- Remote ------------------------------------------------------------------

export function remoteButtons(record, buttons, language) {
  const on = record.snapshot.state === 'on';
  const power = button(
    t(on ? TEXT.turnOff : TEXT.turnOn, language),
    'power',
    REMOTE_ACTIONS.POWER,
    // What the tap asks for; the hub reads the decoder again before pressing.
    { on: !on },
  );
  if (buttons === BUTTON_SETS.VOLUME) {
    return [
      power,
      button(t(TEXT.volumeDown, language), 'volume-1', REMOTE_ACTIONS.VOLUME_DOWN),
      button(t(TEXT.volumeUp, language), 'volume-2', REMOTE_ACTIONS.VOLUME_UP),
      button(t(TEXT.mute, language), 'volume-x', REMOTE_ACTIONS.MUTE),
    ];
  }
  return [
    power,
    button(t(TEXT.channelDown, language), 'chevron-down', REMOTE_ACTIONS.CHANNEL_DOWN),
    button(t(TEXT.channelUp, language), 'chevron-up', REMOTE_ACTIONS.CHANNEL_UP),
    button(t(TEXT.mute, language), 'volume-x', REMOTE_ACTIONS.MUTE),
  ];
}

async function getRemote(hub, { settings, language = 'en' }) {
  const { record, content } = recordFor(hub, settings, language);
  if (content) {
    return content;
  }
  const buttons = Object.values(BUTTON_SETS).includes(settings?.buttons)
    ? settings.buttons
    : BUTTON_SETS.CHANNELS;
  return {
    ttl_seconds: 30,
    components: [
      { type: 'status', items: statusRows(record, language) },
      ...remoteButtons(record, buttons, language),
    ],
  };
}

const REMOTE_KEYS = {
  [REMOTE_ACTIONS.CHANNEL_DOWN]: 'channel_down',
  [REMOTE_ACTIONS.CHANNEL_UP]: 'channel_up',
  [REMOTE_ACTIONS.VOLUME_DOWN]: 'volume_down',
  [REMOTE_ACTIONS.VOLUME_UP]: 'volume_up',
  [REMOTE_ACTIONS.MUTE]: 'mute',
};

async function actRemote(hub, { actionKey, params = {}, settings }) {
  const device = settings?.device || null;
  if (actionKey === REMOTE_ACTIONS.POWER) {
    const on = params.on !== false;
    const pressed = await hub.setPower(device, on);
    return { message: toast((text) => (!pressed ? text.already : on ? text.on : text.off)) };
  }
  const keyName = REMOTE_KEYS[actionKey];
  if (!keyName) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.sendKey(device, keyName);
  return { message: toast((text) => text.key) };
}

// --- Favorites ---------------------------------------------------------------

/** The four favorite numbers of the settings, defaults where a slot is empty. */
export function favoriteNumbers(settings = {}) {
  return FAVORITE_ACTIONS.map(
    (key, index) => parseChannelNumber(settings?.[key]) ?? DEFAULT_FAVORITES[index],
  );
}

const favoriteLabel = (number, language) => {
  const channel = channelByNumber(number);
  return channel ? `${number} · ${channel.name}` : `${t(TEXT.channelNumber, language)} ${number}`;
};

async function getFavorites(hub, { settings, language = 'en' }) {
  const { record, content } = recordFor(hub, settings, language);
  if (content) {
    return content;
  }
  const current =
    record.snapshot.state === 'on' ? describeChannel(record.snapshot.epgId)?.number : null;
  return {
    ttl_seconds: 30,
    components: [
      { type: 'status', items: statusRows(record, language) },
      ...favoriteNumbers(settings).map((number, index) =>
        button(
          favoriteLabel(number, language),
          number === current ? ACTIVE_ICON : 'tv',
          FAVORITE_ACTIONS[index],
          { number },
        ),
      ),
    ],
  };
}

async function actFavorites(hub, { actionKey, params = {}, settings }) {
  const index = FAVORITE_ACTIONS.indexOf(actionKey);
  if (index === -1) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  // The number travels with the button: the settings may have changed since.
  const number = parseChannelNumber(params.number) ?? favoriteNumbers(settings)[index];
  await hub.setChannel(settings?.device || null, number, { wake: true });
  const channel = channelByNumber(number);
  return {
    message: toast((text) => text.channel(channel ? `${number} · ${channel.name}` : number)),
  };
}

export const WIDGETS = {
  [WIDGET_KEYS.REMOTE]: { get: getRemote, action: actRemote },
  [WIDGET_KEYS.FAVORITES]: { get: getFavorites, action: actFavorites },
};
