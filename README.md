# Orange TV for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that controls and follows
the **Orange TV decoder** (UHD 86, TV 4, TV 5, TV 6) over its local HTTP API: power, channel on screen,
channels, volume, a remote widget, scene triggers and scene actions. Local only: no account, no cloud.

> **Developed without the hardware: feedback welcome.** Built and tested against a simulator of the
> decoder API (the answers published by the open source projects listed below), not against a real
> decoder. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-orange-tv/issues).

## Features

- **One device per decoder** (up to three): _Power_ (on / standby, writable), _Channel number_
  (writable: typed on the remote), _Channel_ (name of the channel, or "Home page", "Standby"…), and
  push buttons for channel up / down, volume up / down, mute and play / pause.
- **Widgets**: _Remote_ (state, channel, power, channel or volume buttons, mute) and _Favorite
  channels_ (four channel buttons of your choice, the one on screen checked; a tap turns the decoder
  on if needed).
- **Scene triggers**: _Decoder turned on_, _Decoder turned off_ (standby or no longer answering),
  _Channel changed_ (with the channel number and name, and the previous one).
- **Scene actions**: _Turn the decoder on or off_ (never toggles the wrong way), _Put on a channel_
  (turns the decoder on first), _Press a remote key_ (up to 10 times).
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- An Orange TV decoder on the same network as Gladys, with a fixed IP address (a DHCP reservation in the
  Livebox).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the address of this repository:
   `https://github.com/guim31/gladys-orange-tv` (or install **Orange TV** from the catalog once it is
   listed).
2. In **Configuration**, enter the IP address of the decoder and a name; up to two more decoders below.
   Choose the language of the names, save, then click **Test the decoders**.
3. Open the **Discovery** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in [French](docs/fr.md), [German](docs/de.md)
and [Spanish](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

- `GET http://<decoder>:8080/remoteControl/cmd?operation=10` gives the state (`activeStandbyState`: "0"
  on, "1" standby) and the EPG id of the live channel (`playedMediaId`, "-1" when none). The
  integration reads it on its own timer (5 to 60 s; the devices are published with
  `should_poll: false`) and publishes only the changes, with a heartbeat every 12 hours.
- `operation=01&key=<code>&mode=0` presses a key of the remote. The power key is a toggle: "turn on"
  and "turn off" read the decoder first and press it only when the state differs. A channel number is
  typed digit by digit (0.35 s apart), so it follows your own line-up, regional channels included.
- Two silent readings in a row make a decoder _off_ (deep standby, unplugged): the _Decoder turned off_
  trigger then says `unreachable`. A decoder that answered once is not reported as a configuration
  problem when it falls silent.
- The channel names come from a table embedded in `src/channels.js` (free channels and the main ones up
  to 40); an unknown channel shows as `EPG <id>`.

## Limitations

- No program guide: the decoder does not give it, and the integration calls no Orange online service.
- A decoder in deep standby cannot be woken up from the network (the decoders report no Wake-on-LAN
  support).
- No discovery: the decoders are typed in the configuration.
- The Orange "Clé TV" (Android TV) probably has no such API: not supported until someone confirms it.
- The local API has no authentication: anyone on the network can drive the decoder. The integration
  only sends keys of the remote.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`) and in-memory
decoders (`test/helpers/fakeDecoder.js`) built from the fixtures of `test/fixtures/decoder/`. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [AkA57/liveboxtvuhd](https://github.com/AkA57/liveboxtvuhd), the Home Assistant custom component for
  this decoder: the description of the API (operations, key codes), the answers of its emulator used
  as fixtures, and the channel line-up (numbers and EPG ids). The repository carries no license file:
  only facts were taken from it (codes, ids, answer format), no code was copied.
- The older Python library `liveboxplaytv` and its Home Assistant platform, which documented the same
  API.
- The architecture and the conformity tests follow [gladys-wled](https://github.com/guim31/gladys-wled)
  and [gladys-pihole](https://github.com/guim31/gladys-pihole).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Orange SA. "Orange" is a trademark of
Orange SA.

## License

Apache-2.0
