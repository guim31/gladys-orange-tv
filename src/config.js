// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Up to three decoders, each in its own slot (address, name). The slot number
// is the device identity: a new IP address typed in a slot keeps the device
// and its history.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const SLOTS = [1, 2, 3];

// Reading intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['5', '10', '30', '60'];

// The local API of the decoder listens on this port.
export const DEFAULT_PORT = 8080;

export const DEFAULT_CONFIG = {
  decoder_1_address: '',
  decoder_1_name: '',
  decoder_2_address: '',
  decoder_2_name: '',
  decoder_3_address: '',
  decoder_3_name: '',
  poll_interval: '10',
  language: 'fr',
};

const MAX_NAME_LENGTH = 40;

/**
 * Parse the address typed by the user into a base URL: an IP or a host name,
 * with an optional port (`192.0.2.30`, `192.0.2.30:8080`, `http://tv.lan/`).
 * HTTP only (the decoder has no HTTPS), port 8080 by default, path dropped.
 * @param {unknown} raw
 * @returns {string|null} `http://host:port`, null when unusable
 */
export function parseDecoderUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !url.hostname || url.username || url.password) {
    return null;
  }
  return `http://${url.hostname}:${url.port || DEFAULT_PORT}`;
}

/** Host part shown to the user: no scheme, no default port. */
export const hostOf = (url) =>
  url.replace(/^http:\/\//, '').replace(new RegExp(`:${DEFAULT_PORT}$`), '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const decoders = [];
  const invalidSlots = [];
  for (const slot of SLOTS) {
    const typed = text(`decoder_${slot}_address`);
    if (!typed) {
      continue;
    }
    const url = parseDecoderUrl(typed);
    if (!url) {
      invalidSlots.push(slot);
      continue;
    }
    decoders.push({
      slot,
      url,
      name: text(`decoder_${slot}_name`).slice(0, MAX_NAME_LENGTH) || null,
    });
  }

  return {
    decoders,
    invalidSlots,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
