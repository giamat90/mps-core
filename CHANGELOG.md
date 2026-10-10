# Changelog

## 0.1.0

First release: the code that VPS and SPS ran as byte-identical (or three-line-different) copies.

TypeScript (`@giamat90/mps-core`):
- `metronome`, `recorder`, `metronomeSync`, `zoomPan`: moved unchanged from the apps, with their tests.
- `music`: note / frequency / MIDI maths (from VPS `constants.ts`).
- `updater`: the auto-update Zustand store.
- `lyrics`: lyric types, karaoke timing, the four lyrics IPC wrappers plus `onLyricsProgress`, and the store.

Python (`mps-core`, `import mps_core`):
- `lyrics`: text parsing, CTC forced alignment over wav2vec2, LRCLIB lookup. What used to differ per app (user agent, models directory, test-engine variable) is an `AppIdentity` passed by the caller; there is deliberately no default models directory.
- `version_check`: the single `MIN_YT_DLP_VERSION` and the freshness check, cache under the app's data directory.
- `app.AppIdentity`.

Tests: moved with the code, plus package architecture, pinned public API, Python <-> TypeScript wire fixtures and a consumer smoke test.
