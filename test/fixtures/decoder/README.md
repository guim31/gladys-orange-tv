# Decoder fixtures

Answers of the local API of the Orange TV decoder (`/remoteControl/cmd`):

- `status-live.json` and `key-ok.json`: the answers served by the emulator of
  AkA57/liveboxtvuhd (`tools/livebox-emulator.py`), themselves copied from a
  real decoder;
- `status-standby.json` and `status-homepage.json`: the same answer with the
  values the open source clients handle for standby (`activeStandbyState`
  "1", no channel: `playedMediaId` "-1") and the home page (`osdContext`
  "HOMEPAGE"). Reconstructed, not captured: to be replaced by real captures;
- `refused.json`: the shape of an error answer (`responseCode` other than
  "0"); its message is illustrative.

The MAC address is a made-up one.
