// -----------------------------------------------------------------------------
// The answer of operation 10, reduced to what the integration uses. Example
// (UHD 86, a live channel):
//   { "timeShiftingState": "0", "playedMediaType": "LIVE",
//     "playedMediaState": "PLAY", "playedMediaId": "192",
//     "playedMediaContextId": "1", "playedMediaPosition": "NA",
//     "osdContext": "LIVE", "macAddress": "...", "wolSupport": "0",
//     "friendlyName": "décodeur TV d'Orange", "activeStandbyState": "0" }
// `activeStandbyState` "0" is on, "1" standby. `playedMediaId` is the EPG id
// of the live channel, "-1" (or absent) when nothing is tuned: home page,
// replay, an app.
// -----------------------------------------------------------------------------

import { channelByEpg } from '../channels.js';

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * @param {Record<string, unknown>} data `result.data` of operation 10
 * @returns {{ on: boolean, epgId: string|null, context: string|null, mediaType: string|null }}
 */
export function parseStatus(data = {}) {
  const epgId = text(data.playedMediaId);
  return {
    // Anything but an explicit "0" is standby: a half-booted decoder is not on.
    on: String(data.activeStandbyState) === '0',
    epgId: epgId && /^\d+$/.test(epgId) ? epgId : null,
    context: text(data.osdContext),
    mediaType: text(data.playedMediaType),
  };
}

/**
 * The channel being watched, from the EPG id: its remote number and name
 * when the embedded table knows it, else `EPG <id>` and no number.
 * @param {string|null} epgId
 * @returns {{ epgId: string, number: number|null, name: string }|null}
 */
export function describeChannel(epgId) {
  if (!epgId) {
    return null;
  }
  const channel = channelByEpg(epgId);
  return channel
    ? { epgId, number: channel.number, name: channel.name }
    : { epgId, number: null, name: `EPG ${epgId}` };
}
