# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One Gladys device per Orange TV decoder (UHD 86, TV 4, TV 5, TV 6; up to
  three), over its local HTTP API: power (on / standby), channel number and
  channel name, push buttons for channel up / down, volume up / down, mute and
  play / pause. Turning on or off never toggles the wrong way; a channel number
  is typed on the remote.
- Dashboard widgets: _Remote_ (state, channel, power, channel or volume
  buttons, mute) and _Favorite channels_ (four channel buttons of your choice).
- Scene triggers: decoder turned on, decoder turned off (standby or no longer
  answering), channel changed (with the channel number and name).
- Scene actions: turn the decoder on or off, put on a channel (turning the
  decoder on first), press a remote key up to 10 times.
- "Test the decoders" in the Configuration screen.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-orange-tv/commits/main
