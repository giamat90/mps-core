# Changelog

## 0.20.0

**Imports queue up instead of being refused while one is running.** The library store lines `uploadSong` and `importYoutubeRequest` up behind the running import.
- The store publishes `queue` and `processingLabel`; `removeFromQueue` drops a waiting import.
- A failed import does not stop the line, and names itself in the error when others wait.
- `useYouTubeImport` frees the link box when the link is handed over to the queue.

## 0.19.0

**A song can be dropped on a closed folder, and the folder it would land in is highlighted.** A closed folder has no body to drop on; hovering its header gave the sortable section id `folder:<id>`, which `resolveLibraryDrop` mapped to nothing. The highlight used dnd-kit's `isOver`, false while the pointer is over a song row.
- `resolveLibraryDrop`: a song over `folder:<id>` lands at the end of that folder.
- `libraryDropTarget(layout, activeId, overId)` (new, `hooks`): the container (folder id or `ROOT_CONTAINER_ID`) a drop would move the song into, or `null` (folder drag, nothing under the pointer, the song's own container, unknown id).
- `useLibraryPage` returns `dropTarget`, `handleDragOver` and `handleDragCancel` (wire them to `DndContext`'s `onDragOver` / `onDragCancel`); `handleDragEnd` clears the target. Apps highlight with `dropTarget === folder.id`, no longer with `isOver`.

## 0.18.0

**A bar of cards that the user reorders, for the top bar of both apps.** The cards wrap with the window and are dragged anywhere inside the bar, along a line or to another; the panels under the stems keep their own vertical drag.
- `@giamat90/mps-core/hooks/dnd` (new): `useSortableBar(store, noun?)` (what to spread on `DndContext`, plus the `rectSortingStrategy` for `SortableContext`; the drop goes through the panel store's `move`, the announcements and the screen-reader text name the cards with `noun`), `useSortableBarCard(id)` (a card's node ref, style and `grip`, the same `PanelGrip` the panels use) and `withinBar` (the modifier that keeps a dragged card inside its bar). Markup, class names and what a card holds stay in the apps.
- The order, and which cards are shown, are an ordinary `createPanelStore`; the apps give it a storage key of its own, apart from the panels'.

**The count-in is shared, and it counts in Play.** Until now each app carried its own count-in timers and only Record (and VPS's Monitor) used it; Play started the song at once.
- `@giamat90/mps-core/countIn` (new): `createCountInSlice` (the zustand slice: `countInBars`, `isCountingIn`, `countInBeatsRemaining`, `countInFor`, `runCountIn(plan, purpose)`, `cancelCountIn`, `setCountInBars`; one count at a time, a second cancels the first), `steadyCountIn(bpm, bars)` (a plan: beats, the instants the countdown steps, the total, how to start the click), `countInBpm(detectedBpm, playbackRate)` and `COUNT_IN_LEAD_S`. A plan is plain data, so SPS builds its bar-map plan itself.
- `hooks`: `useCountInButton` (the clock button, moved out of `useRecordButton`). **Breaking for the hooks' callers:** `useRecordButton` no longer returns `countInBars`, `countInDisabled`, `countInText`, `countInTitle`, `countInLabel` or `onCountInClick`, and its state wants `countInFor` instead of `countInBars`/`setCountInBars`; its `isCountingIn` is true only for a count the Record button owns (`"record"` or `"monitor"`). `useTransportControls` gains `isCountingIn`, `countInBeatsRemaining` and the label "Cancel count-in" for a count before Play, and its state wants `isCountingIn`, `countInFor` and `countInBeatsRemaining`.
- `hooks` shortcuts: Space stays live while counting in (it cancels the count before Play); every other key still waits.
- The countdown steps on one timeout per beat (it was an interval beside a timeout), so a bar map's pulses and a steady count step the same way.

## 0.16.0

**A panel's title can fold it.** Every panel in both apps gets its name as a button, like the Lyrics panel always had; clicking it folds the panel down to the title.
- `panels`: `createCollapseStore({ storageKey })`, a headless store of the folded panel ids (only folded ones are stored, so every panel starts open; the store re-reads when another window writes the same key, for panels in windows of their own). Separate from `createPanelStore`: a component does not know which page shows it, so the choice is keyed by the panel's own id.
- `hooks/popover-panels`: `useCollapsiblePanel(store, id)` returns `{ open, toggle, buttonProps }`; the app spreads `buttonProps` on its title button and draws the body only while `open`.
- No change to the wire fixtures, the sidecar or the Rust crates; the apps bump the pin for the new exports.

## 0.15.0

**Bar maps: a song's bars as data, a metronome that follows them, and bar lines on the ruler.** The part of SPS's new Meter feature that VPS could run unchanged; every addition is an optional parameter, so an app that passes none behaves as before (VPS's own suite passes against it).
- `@giamat90/mps-core/meter` (new): `BarMap` (each bar's start, pulse count, unit note and optional accent groups; the pulses are spaced evenly over the bar, so tempo is the bar's length), queries (`barIndexAt`, `pulsesBetween`, `nextPulse`, `meterRuns`, `dominantMeter`, `repeatingCycle`, `defaultGroups`, `validateMap`), edits that return a new map or null when it would not fit (`gridMap`, `setBarStart`, `shiftBars`, `shiftDownbeat`, `splitBar`, `mergeBars`, `removeBar`, `relabelBars`, `rescalePulse`, `fillCycle`, `replaceBars`), tap fitting (`fitTaps`, `cleanTaps`, `barsFromBarTaps`, `barsFromBeatTaps`) and the click cursor (`PulseCursor`, `clickSequence`, `countInMap`).
- `metronome`: `startSequence(first, next)` schedules clicks from a function instead of a steady tempo, with three accent levels (1500, 1200 and 900 Hz); `start(bpm, ...)` is unchanged.
- `hooks`: `useTempoControl` takes `meterMap` and `clickDensity` (the click follows the bars and starts again when the playhead jumps); `useLoopsMenu` cuts bar sections from a `meterMap`; `useTimeRuler` draws a `meterMap`'s bars (a line and number per bar, the signature where it changes) in place of the single downbeat marker.
- `loops`: `barSectionsFromMap`.

## 0.14.0

**The lyrics search finds the song by artist as well as title.** Imports left the artist empty, so the lookup searched the title alone and a common title found other bands' songs.
- `mps_core.identity` (new, needs `mutagen`): `artist_from_file` (ID3/MP4/Vorbis tags), `artist_from_ytdlp` (the video's `artist`/`creator`, else the channel with `- Topic`, `VEVO` and `Official` stripped), `clean_channel`. The apps' sidecars return the result as `artist` from `process` and `import_yt`, and the shell stores it as `officialArtist`.
- `lyrics`: when `Artist Title` finds nothing usable the lookup retries with the title alone (an artist LRCLIB spells differently no longer means no result); results by another artist rank behind the artist's own (`ARTIST_MISMATCH_PENALTY`).
- Apps need this release for the new sidecar import (`mps_core.identity`); bump the pin together with the sidecar and Rust changes.

## 0.13.0

The code that VPS and SPS each carried twice, apart from a name or a table, moves here; the apps keep only markup and their CSS.

**Headless hooks (`@giamat90/mps-core/hooks`, and `.../hooks/dnd` for the ones that need `@dnd-kit`, an optional peer).** Each hook is the logic of a component that was in both apps (state, effects, handlers, pending and error handling); the store, the IPC calls and the dialogs are passed in. No markup and no CSS ship here, so the apps still render their own components with their own class names.
- `popover-panels`: `usePopover`, `usePanelMenu`, `useDetachHandle`, `useDockHandle`, `useLoopsMenu`; in `hooks/dnd`: `useSortablePanels`, `useSortablePanel`, `usePanelGrip`, `PanelGripProvider`, `applyPanelDrop`, `sortablePanelClass`.
- `devices-transport`: `useDeviceSelect` (`useMicSelect`, `useOutputSelect`), `useKeyTranspose`, `useLoopToggle`, `useTempoControl`, `useRecordButton`, `useTransportControls`, `useExportMix`, `useDownloadAll`.
- `ruler-recording`: `useTimeRuler` (with `drawTimeRuler`), `useTakeList`, `useLatencyCalibration`, and the click-clap detector `detectClapLatency` (moved from VPS; SPS had an older inline copy that counted frames as 1 ms each, so SPS gets that fix).
- `lyrics-library-actions`: `useLyricsPanel`, `useYouTubeCookies`, `useYouTubeImport`, `useDropZone`, `useUpdateDialog`.
- `library-page-stores`: `useLibraryPage`, `useEditableText`, `libraryStateCreator` (the library store's logic, with the IPC injected), `createFriendlyError` (a rule table instead of a string-matching chain), `createSongFilter`, the library layout and drop rules; in `hooks/dnd`: `useLibrarySensors`, `libraryCollisionDetection`, `useSortableSongRow`, `useSortableFolder`, `useRootDropZone`.
- `app-stores`: `createSettingsStore`, `installPlayerShortcuts` / `buildShortcuts`, `hiddenTrackTags`, `useMainBridgeHost` / `startMainBridgeHost`.
- Tests use `jsdom` and `@testing-library/react`; `src/test/hookEnv.ts`, `fakeStore.ts` and `fakeCanvas.ts` are the helpers.

**Rust crates and `punch`.**
- `mps-sidecar` (0.1.0): `SidecarManager` starts the Python sidecar (`python main.py` from the source tree, else the installed PyInstaller binary), reads its JSON-lines replies on a thread and waits for `ready` (90 s); `SidecarMessage`, `find_sidecar_dir`, `spawn_command`. The one difference between the apps, the binary's name, is a `SidecarConfig`.
- `mps-detached-windows` (0.1.0): the allowlist (a `PanelSpec` table passed by the app), the window plan, remembered position (`WindowMemory::load(panels, data_dir)`), `detach_panel`, `dock_panel`, `close_detached_panel`, `cursor_over_main`, `close_all`. The apps keep their `#[tauri::command]` wrappers. `tests/detachedWindows.contract.test.ts` pins its label prefix and `mps:docked` event against `@giamat90/mps-core/windows`.
- TypeScript `@giamat90/mps-core/punch`: `grabPunchEdge`, `startPunchDrag`, `updatePunchPreview`, `finishPunchDrag`, `MIN_HANDLE_GAP_S`, `MIN_REGION_S` and the types `PunchMode`, `PunchDrag`, `PunchPreview`, `PunchCommit`.
- Apps name the two crates by `git` + `tag = "v0.13.0"` like `mps-youtube-signin`.

## 0.12.0

The short-term spectrum, so the phone shows the same curve as VPS (new `@giamat90/mps-core/spectrum`; nothing imports a DOM or Web Audio):
- `computeMagnitudeSpectrumDb` / `fft`: Blackman-windowed radix-2 FFT in dB on the Web Audio scale. The sine and cosine of each butterfly are now looked up in a table cached per size instead of computed every time (results unchanged, the tests pin them); on a phone, where nothing is JIT-compiled, that was most of the time.
- `analyserCurvePoints`, `smoothSpectrumEnvelope`, `smoothSpectrumLight`, `freqToX` / `xToFreq`, `WEBAUDIO_TO_DBFS`, `SPECTRUM_MIN_DB` / `SPECTRUM_MAX_DB`, `SPECTRO_COLORMAP`: the log-frequency curve, its levels on the sidecar's dBFS scale, the smoothing and the thermal colours.
- `estimateVoice` / `estimateFormants` with `analyseHarmonics`, `envelopeAutocorrelation` and `refineF0`: F0 and F1-F3 of one window (LPC on the envelope through the harmonics, Durand-Kerner roots, continuity between frames).
- Moved from VPS (`src/lib/fft.ts`, `formants.ts`, `harmonicEnvelope.ts`, `pitchRefine.ts`, the pure half of `spectroUtils.ts`) with their tests and the synthetic-vowel fixture. The part of `spectroUtils.ts` that needs a canvas or the stored spectrogram stays in VPS.
## 0.11.0

Choosing among online lyrics results (the lookup used to return only its single best guess):
- Python `mps_core.lyrics.search_lyrics(title, artist, duration, ...)`: every usable LRCLIB result, best match first, each with its own text. Entries of the wrong length are kept and flagged `lengthMismatch` (a live or acoustic version rarely matches the studio length), where `find_lyrics` drops them. `find_lyrics` and `pick_best` behave as before.
- TypeScript `@giamat90/mps-core/lyrics`: `searchLyrics(songId)` (command `search_lyrics`), types `LyricsCandidate` and `LyricsSearch`, and store state `candidates` / `chosen` with `searchOnline(songId)` (fills the draft with the best match and keeps the rest) and `chooseCandidate(index)`. `findLyrics` / `findOnline` are unchanged.
- `fixtures/search_result.json`, written by the Python tests and read by the TypeScript tests.
- Each app's Rust must register `search_lyrics(songId)`; the sidecar dispatches `search_lyrics` with the same arguments as `find_lyrics`.

## 0.10.0

The practice pack, the file a laptop app writes and the phone app reads (design: `MPS/wiki/pocket-practice-design.md`):
- Python `mps_core.pack`: `build_manifest`, `validate_manifest`, `manifest_files`, `write_pack` (atomic zip, m4a stored and JSON deflated, refuses a manifest whose files are missing or extra), `read_manifest`, `decimate_reference` (the analysis pitch line on a fixed 20 ms grid, 0 where unvoiced), `encode_aac` (ffmpeg, runner injectable) and `PackError`. Schema 1.
- TypeScript `@giamat90/mps-core/pack`: `parseManifest` (the same rules, a newer schema is refused with a message asking for an update), `parseReference`, `referenceAt`, `packFiles`, `PackError`, `PACK_SCHEMA`, `MAX_LOOPS` and the types.
- `fixtures/pack_manifest.json` and `fixtures/pack_reference.json`, written by the Python tests and read by the TypeScript tests, so the two sides cannot drift.
## 0.9.1

TypeScript (`@giamat90/mps-core`), `pitch` fast path only; the exact path and the API are unchanged:
- `{ fast: true }` read head voice an octave too high (reported from the first phone test: falsetto was right, head voice an octave up). Reproduced with synthetic voices, a pulse train through formant resonators with the first formant on the 2nd or 3rd harmonic and bandwidths of 45, 60 and 90 Hz, at 44.1 and 48 kHz, with and without a 250 Hz high-pass: 91.0 % correct and 55 octave-up errors, against 100 % for the exact path. Cause: "first local maximum within 90 % of the strongest" took the half or third period when the formant boosted that harmonic and left the fundamental weak.
- The fast path now uses Praat's windowed autocorrelation (Hann window, each lag divided by the correlation of the window with itself), peak heights from the parabola through each peak, and the first peak within 98 % of the tallest. Formant-tuned head voice: **98.3 % correct, no octave-up errors** (20 octave-down, 11 no reading); harsh synthetic vowels 70-1300 Hz: 93.0 % against 87.2 % for the exact path; pure and harmonic tones 70-1300 Hz: 98.6 %, worst error 0.44 %. Cost is the same as 0.9.0 (the window correlation is cached per window length).
- Known limit: a fundamental above about 650 Hz with the first formant on the 3rd harmonic can still read an octave up.

## 0.9.0

TypeScript (`@giamat90/mps-core`):
- `pitch`: `autocorrelatePitch(samples, sampleRate, { fast: true })`. The exact path took **149 ms** (p95 152 ms) for a 2048-sample window on a Moto G 5G in Hermes, three times the 46 ms window, so the phone's UI fell seconds behind. The fast path averages the window down to about 11 kHz, correlates only over the lags a 65 Hz voice can have, and takes the first local maximum within 90 % of the strongest (an octave-down guard for the low rate). On 245 tones from 70 to 1300 Hz at 44.1 and 48 kHz (sine and harmonic) the worst error is 0.54 % (about 9 cents) with no octave errors and no misses, and it is about 27 times cheaper on V8. Off by default: VPS keeps the exact path. The exact path now accumulates each lag in a double and stores once (it used to round to float32 at every addition), so its last digits can differ from 0.8.x.
## 0.8.1

TypeScript (`@giamat90/mps-core`), package metadata only, no code change:
- `react` peer range is `^19.2.0` (was `^19.2.4`) and `zustand` is `^5.0.0` (was `^5.0.12`). Found by the first React Native consumer (VPP, Expo SDK 55): Expo pins react 19.2.0, so `npm install` failed with ERESOLVE against `^19.2.4`.
- The three Tauri packages and `zustand` are now optional peers (`peerDependenciesMeta`). A consumer that imports only `pitch` or `music` (the phone app) is no longer asked to install Tauri; VPS and SPS still install them because they use the modules that need them.

## 0.8.0

TypeScript (`@giamat90/mps-core`):
- `pitch`: `autocorrelatePitch(samples, sampleRate)`, the pitch of one window of mono samples in Hz, or `null` when it is too quiet (RMS under 0.01), not periodic enough (clarity under 0.25) or outside 65-1400 Hz. It is the algorithm VPS's live `PitchDetector` ran inside the class, moved out unchanged apart from returning `null` instead of `-1`: no `AudioContext`, no state, so it also runs where there is no Web Audio (a React Native app). Cost is quadratic in the window length, about 2 million multiply-adds at 2048 samples; measure before calling it every frame on a slow JavaScript engine. VPS keeps `PitchDetector` as a thin wrapper that supplies an AnalyserNode's samples. SPS has no live pitch and stays on 0.7.0.

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
