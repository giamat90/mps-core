# Changelog

## 0.3.0

TypeScript (`@giamat90/mps-core`):
- `windows`: the app-independent half of detachable panels (a panel dragged out of the main window into a window of its own). `definePanelWindows` (the allowlist, window labels), `RemoteClock` / `TransportPublisher` (a detached window extrapolates the playhead instead of receiving it 30 times a second), `startMainBridge` and `createDetachedBridge` (the event protocol: hello, state, command, docked; commands are parsed by the app and applied by the app; extra streams plug in), `decideDrop` (a drag released outside the window detaches), `createDockGesture` (a drag released over the main window docks), `createDetachedStore`, `panelsToClose`, and the guards for validating what crosses the window boundary. No Tauri import: `emit` and `listen` are injected.

## 0.2.0

TypeScript (`@giamat90/mps-core`):
- `panels`: `createPanelStore({ storageKey, panels })`, a headless store of which optional panels of a page the user wants to see. Only explicit choices are persisted, so a panel added later takes its default while old choices are kept. Unknown ids and non-boolean values in storage are ignored; storage failures warn and keep the in-memory choice. The package ships no UI for it: each app renders its own menu.

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
