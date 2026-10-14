// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// The power switch and the channel number are already controllable from a
// scene ("control a device"). These actions add what a device feature cannot
// say: a channel typed on a decoder in standby (turned on first), a key of
// the remote pressed several times, and "turn on" that never toggles a
// decoder already on. Gladys applies the field defaults to scene actions.
// -----------------------------------------------------------------------------

import { channelByNumber } from './channels.js';

export const POWER_VALUES = Object.freeze({ ON: 'on', OFF: 'off' });

export const SCENE_ACTIONS = {
  async set_power(hub, { fields = {} }) {
    const changed = await hub.setPower(fields.device || null, fields.state !== POWER_VALUES.OFF);
    return { changed };
  },

  async set_channel(hub, { fields = {} }) {
    const number = await hub.setChannel(fields.device || null, fields.channel, { wake: true });
    return { channel: number, channel_name: channelByNumber(number)?.name ?? '' };
  },

  async send_key(hub, { fields = {} }) {
    const sent = await hub.sendKey(fields.device || null, fields.key, fields.repeat ?? 1);
    return { sent };
  },
};
