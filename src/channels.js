// -----------------------------------------------------------------------------
// The channels of the Orange TV offer in mainland France: number on the
// remote, EPG id (the `playedMediaId` the decoder reports), name. Embedded,
// never scraped: the decoder only gives the EPG id of what it plays.
//
// The numbers and EPG ids are the public line-up as listed by the Home
// Assistant custom component AkA57/liveboxtvuhd (const_france.py, July 2026,
// after the 2025 renumbering of the free channels). A channel missing here is
// shown by its EPG id, and the "channel" commands type its number on the
// remote, so they never depend on this table.
// -----------------------------------------------------------------------------

export const CHANNELS = Object.freeze([
  { number: 1, epgId: '192', name: 'TF1' },
  { number: 2, epgId: '4', name: 'France 2' },
  { number: 3, epgId: '80', name: 'France 3' },
  { number: 4, epgId: '78', name: 'France 4' },
  { number: 5, epgId: '47', name: 'France 5' },
  { number: 6, epgId: '118', name: 'M6' },
  { number: 7, epgId: '111', name: 'Arte' },
  { number: 8, epgId: '234', name: 'LCP / Public Sénat' },
  { number: 9, epgId: '119', name: 'W9' },
  { number: 10, epgId: '195', name: 'TMC' },
  { number: 11, epgId: '446', name: 'TFX' },
  { number: 12, epgId: '482', name: 'Gulli' },
  { number: 13, epgId: '481', name: 'BFM TV' },
  { number: 14, epgId: '226', name: 'CNews' },
  { number: 15, epgId: '112', name: 'LCI' },
  { number: 16, epgId: '2111', name: 'franceinfo' },
  { number: 17, epgId: '458', name: 'CStar' },
  { number: 18, epgId: '4139', name: 'T18' },
  { number: 19, epgId: '4138', name: 'Novo19' },
  { number: 20, epgId: '1404', name: 'TF1 Séries Films' },
  { number: 21, epgId: '1401', name: "L'Équipe" },
  { number: 22, epgId: '1403', name: '6ter' },
  { number: 23, epgId: '1402', name: 'RMC Story' },
  { number: 24, epgId: '1400', name: 'RMC Découverte' },
  { number: 25, epgId: '1399', name: 'RMC Life' },
  { number: 33, epgId: '205', name: 'TV5Monde' },
  { number: 34, epgId: '115', name: 'RTL9' },
  { number: 35, epgId: '191', name: 'Téva' },
  { number: 36, epgId: '145', name: 'Paris Première' },
  { number: 37, epgId: '225', name: 'TV Breizh' },
  { number: 40, epgId: '34', name: 'Canal+' },
]);

const BY_EPG = new Map(CHANNELS.map((channel) => [channel.epgId, channel]));
const BY_NUMBER = new Map(CHANNELS.map((channel) => [channel.number, channel]));

// Highest number the "channel" commands accept (four digits on the remote).
export const MAX_CHANNEL_NUMBER = 9999;

/** The channel of an EPG id, null when unknown. */
export const channelByEpg = (epgId) => BY_EPG.get(String(epgId)) ?? null;

/** The channel of a remote number, null when not in the table. */
export const channelByNumber = (number) => BY_NUMBER.get(Number(number)) ?? null;

/**
 * A channel number typed in a scene, a form or the device: an integer from 1
 * to 9999, or null.
 * @param {unknown} raw
 */
export function parseChannelNumber(raw) {
  const number =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw.trim())
        : NaN;
  return Number.isInteger(number) && number >= 1 && number <= MAX_CHANNEL_NUMBER ? number : null;
}
