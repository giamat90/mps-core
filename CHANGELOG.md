# Changelog

## 0.7.0

Rust (`mps-youtube-signin`, new, `rust/youtube-signin`, the first Rust crate here):
- The in-app YouTube sign-in that both apps had as copies: a private WebView2 window on Google's sign-in, cookie reading, the Netscape cookies file yt-dlp reads, the navigation allowlist (Google domains, country domains by shape) and `may_invoke`, which lets an app keep that window away from its commands. The data directory is passed in; the apps keep two thin `#[tauri::command]`s (`sign_in_youtube`, `sign_out_youtube`). Consumed as a git dependency: `mps-youtube-signin = { git = "https://github.com/giamat90/mps-core", tag = "v0.7.0" }`.

TypeScript (`@giamat90/mps-core`):
- `youtube`: `signInYoutube` / `signOutYoutube` (the two IPC wrappers), `cookiesSource` and `MANAGED_COOKIES_FILE` (is the configured cookies file the in-app sign-in's or one the user chose), and `isSessionExpiredError` (did YouTube turn the request down in a way a fresh sign-in can fix).

## 0.6.0

TypeScript (`@giamat90/mps-core`):
- `panels`: `createPanelStore` also keeps the order the user wants the panels in. New state `order` (every registered panel, theirs else registered order) and actions `move(id, overId)` (the panel takes the place of the one it is dropped on), `resetOrder()`; `reset()` now returns visibility and order to the defaults. The order is stored next to the visibility choices only once the user has moved something; a panel added in a later version slots in after the panel that precedes it by default; unknown and repeated ids in storage are dropped. No new export: the change is in `PanelsState`.

## 0.5.0

TypeScript (`@giamat90/mps-core`):
- `shortcuts`: `installShortcuts(target, bindings)`, a global keydown handler with the rules both apps need: keys typed into inputs, chords with ctrl / meta / alt, auto-repeat and keys already handled are ignored, and space is left to a focused button. `matchShortcut`, `shouldIgnoreKey` are exported for tests. No DOM import: the event and target are structural types.
- `loops`: named loops and bar sections as pure functions. `NamedLoop`, `validateLoop`, `addLoop` / `renameLoop` / `removeLoop` (a bad loop throws an Error whose message is meant for the user), and `barSections`, which cuts a song into groups of bars from its first downbeat (not structure detection).

## 0.4.0

TypeScript (`@giamat90/mps-core`):
- `takes`: the pure logic of which recorded takes are shown and which are heard. `toggleTake`, `showTake`, `hideTake`, `reconcileTakes` (`TakeSelection`): a click on a take shows it, selects it, or hides it when it is already the selected one; several can be shown at once. `audibleTakes` (`TakeAudibility`, `TakePlayback`): all shown takes together or only the selected one, minus the takes muted on their lane, a take soloed on its lane heard alone, and nothing while recording when the app asks for takes to be muted then.

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
