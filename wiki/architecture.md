# Architecture

## Why this exists

VPS and SPS were forked from one codebase and kept in step by porting. Before
this repository, at least 35 files were byte-identical between them and another
30 differed by a handful of lines, and each cross-port cost a parity-matrix
entry. A bug fixed in one was a bug someone had to remember in the other (the
−6 dB recording downmix was fixed twice, the same day, by hand).

The apps are still separate products with separate repositories. What changed is
that code which is the same in both now has one home.

## Boundaries

```
 ┌────────────────────┐          ┌────────────────────┐
 │ VPS                │          │ SPS                │
 │  app code          │          │  app code          │
 │  src-tauri (Rust)  │          │  src-tauri (Rust)  │
 └─────────┬──────────┘          └─────────┬──────────┘
           │ pinned tag                    │ pinned tag
           ▼                               ▼
 ┌───────────────────────────────────────────────────┐
 │ mps-core                                          │
 │  src/      TypeScript source (npm git dependency) │
 │  python/   mps_core        (pip git requirement)  │
 └───────────────────────────────────────────────────┘
```

Dependencies point one way. The package never imports an app, never reads an
app's stores, and holds no state that belongs to one app. When the apps need
different behaviour from shared code, the difference is passed in:

| Difference | How it is passed |
|---|---|
| Name on the network, data directory, test-engine variable (Python) | `AppIdentity(name, url, data_dir, env_prefix)` |
| Which Tauri commands exist (TypeScript) | The IPC wrappers *are* the contract: each app's Rust must implement `load_lyrics`, `sync_lyrics`, `find_lyrics`, `search_lyrics`, `delete_lyrics`; each app's IPC contract test reads the package's wrappers next to its own |
| Anything about one app's data model | Stays in the app (SPS's `canSyncLyrics(stems)` is an example: SPS songs may lack a vocals stem, VPS songs may not) |

## What is shared, and what deliberately is not

Shared (v0.1.0): the modules that were byte-identical and depend on nothing app
specific: `metronome`, `recorder`, `metronomeSync`, `zoomPan`, the updater store,
note/frequency maths, the lyrics slice, the panel visibility and order store (v0.2.0, order v0.6.0) and the collapse store behind the panels' title buttons (v0.16.0), the window plumbing for detachable panels
(v0.3.0), and in Python the lyrics engine and the yt-dlp floor check.

Not shared yet, with the reason, so the next person does not have to rediscover it:

| Candidate | Why it is not here |
|---|---|
| `KeyTranspose`, `OutputSelector`, `MicSelector`, `YouTubeCookiesControl` components | Identical today, but each reads a store that differs between the apps, and each styles itself with classes defined in the app's CSS. Sharing them needs a props-based API and a shipped stylesheet. |
| `windows.rs` (detached window creation, remembered geometry, `cursor_over_main`) | Identical in the two apps apart from the panel table and the data directory. Now that `rust/` exists it is the next candidate, together with `sidecar.rs`; until then it is copied, and each copy says so. |
| `DetachHandle`, `DockHandle`, the detached host | Components styled by each app's CSS, like the menu; the gesture logic they call is shared. |
| `sidecar.rs`, `test_util.rs`, most of `lyrics.rs` | 85% identical but entangled with each app's `Song` model, binary name and Tauri state. A Rust crate with injected configuration is the shape; not attempted in 0.1. |
| `yt_importer.py` | Differs in the signature of the pipeline it calls; needs the pipeline injected. |
| `AudioEngine`, `player` store | Fixed three-track trio versus dynamic stem map: divergent by design (see `MPS/CLAUDE.md` rule 3). |
| `release.yml`, `test.yml` | Per-app CI. Only the dependency installation lines changed. |

## Decisions

**A separate repository, pinned by tag, not a submodule or a monorepo.** Both apps
have their own repositories, release trains and CI, and merging them would be a
different project. A submodule carries source into each repository but needs
`--recurse-submodules` everywhere (CI, installer builds, a fresh clone) and edits
inside the submodule are easy to lose. A tagged git dependency uses each
ecosystem's normal install step, is read-only in `node_modules`, and leaves a
lockfile that names the exact commit.

**TypeScript is shipped as source.** Both apps compile with the same Vite and
TypeScript settings, so a build step in this repository would only add a second
compiler configuration and a `dist/` that must be kept in sync with `src/`. The
cost is one Vitest setting (Node will not load `.ts` from `node_modules`); the
consumer smoke test pins that this works.

**Peer dependencies, not bundled ones.** React, Zustand and the Tauri packages
are `peerDependencies`. Two copies of React or of a Zustand module-level store
would silently break hooks and state sharing, so the app supplies the only copy.
This is also why the local development loop copies files rather than symlinking
(a symlink resolves peers from this repository's own `node_modules`).

**The Python library takes identity as data.** An earlier version of `lyrics.py`
was byte-identical apart from three lines (user agent, models directory,
test-engine variable), kept in step by a comment. Those are now an `AppIdentity`.
There is no default models directory on purpose: a wrong default is silent and
costs a 360 MB download into the wrong folder.

**The yt-dlp floor has one home.** `mps_core.version_check.MIN_YT_DLP_VERSION`
replaces two constants that a convention (`MPS/wiki/conventions.md#10`) asked
people to keep equal. Each app's tests assert that its `requirements*.txt` floor
equals it.

**The first Rust crate is a git dependency in a subdirectory.** `rust/youtube-signin` (0.7.0) is a Cargo package the apps name by repository and tag, so one tag still covers all three languages. Cargo locates the package inside the repository by name; the apps' `Cargo.lock` records the exact commit. What differs per app (the data directory) is a parameter; what is an app's alone (the `#[tauri::command]` wrappers, the invoke handler that rejects the sign-in window) stays in the app. The crate is generic over the Tauri runtime and its pure logic (cookie file format, signed-in detection, the navigation allowlist) takes plain strings so its tests need no window. Its CI job runs on Windows, where the webview crates build without system packages.

**`pitch` is the first module whose second consumer is not SPS.** SPS has no live pitch; the second user is the planned phone app VPP (React Native, no Web Audio). It is shared because the algorithm is a pure function of a sample window, and it was kept free of `AudioContext` on purpose: the `PitchDetector` class that owns the AnalyserNode stays in VPS. It was moved unchanged (same thresholds, same quadratic cost); making it faster for a phone (lag-limited or FFT-based correlation) is a separate change that has to be measured on a device first, because it can shift results.

## Failure modes this design has, and what covers them

| Risk | Cover |
|---|---|
| A module quietly starts depending on an app | `tests/package.test.ts` (no import leaves `src/`, every external import is a declared peer) |
| An export is removed or renamed and an app breaks later | `tests/api.test.ts` pins the surface; apps compile against it |
| The package works in its own tests but cannot be installed | `scripts/consumer-smoke.mjs`, run in CI: npm git install, `tsc` under the apps' strict settings, Vite build, Vitest, pip install, a real alignment |
| Sidecar reply shape changes, TypeScript types do not | `fixtures/*.json` written by the Python tests, read by `tests/wire.test.ts` |
| An app is left behind on an old tag | Documented in `MPS/wiki/lineage.md`; both apps' CI installs exactly the pinned tag |
| IPC command renamed here, Rust still has the old name | Each app's `tests/contract/ipcContract.test.ts` reads the package's `ipc.ts` |

**Two more Rust crates, and the `punch` module (unreleased).** `rust/sidecar` (`mps-sidecar`) is the process manager both apps' `sidecar.rs` carried: the Python sidecar is started from the source tree in a dev run and from the PyInstaller binary in an installed app, its JSON-lines replies are read on a thread, and `ready` is awaited for 90 s. The only app difference, the binary's name, is a `SidecarConfig`. `rust/detached-windows` (`mps-detached-windows`) is the Tauri half of detachable panels: the app passes a `PanelSpec` table (the allowlist) and the data directory, and wraps `detach_panel`, `dock_panel`, `close_detached_panel` and `cursor_over_main` in its own commands. `tests/detachedWindows.contract.test.ts` reads the crate's source and pins its label prefix and `mps:docked` event against `src/windows`. `src/punch` holds the pure rules of dragging a punch region (which edge a press grabs, the live preview, what a release commits); how a pixel maps to a time stays with each ruler. What was **not** moved: the React panels (`PanelMenu`, `LyricsPanel`, `TimeRuler` are near-identical but read app stores and app CSS, and this package ships no UI); see `MPS/wiki/code-metrics-2026-10-17.md`.

**Headless hooks (`src/hooks`).** The React components both apps carried differed mostly in markup and class names; what they did was the same. Each one's logic is now a hook here (`usePanelMenu`, `useKeyTranspose`, `useTimeRuler`, `useLibraryPage`, ...), with the zustand store hook, the IPC functions and the dialogs passed in as options, so nothing here knows an app. A hook returns state, derived values and handlers (sometimes prop objects); the app's component maps them onto its own markup. Differences between the apps are options (`stopEndsRecording`, `accentRgb`, `hasVocals`, an `artistFallback`, the `watch` selectors of the export), never an `if (app === ...)`. The hooks that import `@dnd-kit` are a second entry point (`hooks/dnd`) so an app without drag-and-drop (VPP) never needs it installed. What a hook cannot remove is the markup itself, 25 to 40 lines per component; sharing that would put components, and the class-name contract with each app's CSS, into this package. Tested with `jsdom` and `@testing-library/react`; the apps compared the old and new components' server-rendered markup over recorded store states before the move.

**The `meter` module and the click sequence (v0.15.0).** A song's bars as data (`BarMap`: each bar's start, pulse count, unit note and optional accent groups; the pulses are spaced evenly over the bar, so tempo is the bar's length) with pure queries (`barIndexAt`, `pulsesBetween`, `meterRuns`, `repeatingCycle`), edits that return a new map or null when it would not fit (`setBarStart`, `splitBar`, `mergeBars`, `relabelBars`, `rescalePulse`, `shiftDownbeat`, `fillCycle`, `replaceBars`), tap fitting (`fitTaps`, `barsFromBarTaps`, `barsFromBeatTaps`) and the click cursor (`PulseCursor`, `clickSequence`, `countInMap`). It is the part of the Meter feature both apps could run unchanged; only SPS uses it today. It reaches the shared hooks through optional parameters (`useTempoControl`'s `meterMap` and `clickDensity`, `useLoopsMenu`'s `meterMap`, the ruler's `meterMap`), so an app that passes none behaves exactly as before: VPS's 1,258 tests pass against it. `Metronome.startSequence(first, next)` is a second scheduling mode beside `start(bpm, ...)`: the same look-ahead scheduler asking a function for each next click, with three accent levels (1500, 1200, 900 Hz).
