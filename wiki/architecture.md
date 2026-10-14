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
| Which Tauri commands exist (TypeScript) | The IPC wrappers *are* the contract: each app's Rust must implement `load_lyrics`, `sync_lyrics`, `find_lyrics`, `delete_lyrics`; each app's IPC contract test reads the package's wrappers next to its own |
| Anything about one app's data model | Stays in the app (SPS's `canSyncLyrics(stems)` is an example: SPS songs may lack a vocals stem, VPS songs may not) |

## What is shared, and what deliberately is not

Shared (v0.1.0): the modules that were byte-identical and depend on nothing app
specific: `metronome`, `recorder`, `metronomeSync`, `zoomPan`, the updater store,
note/frequency maths, the lyrics slice, the panel visibility and order store (v0.2.0, order v0.6.0), the window plumbing for detachable panels
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

## Failure modes this design has, and what covers them

| Risk | Cover |
|---|---|
| A module quietly starts depending on an app | `tests/package.test.ts` (no import leaves `src/`, every external import is a declared peer) |
| An export is removed or renamed and an app breaks later | `tests/api.test.ts` pins the surface; apps compile against it |
| The package works in its own tests but cannot be installed | `scripts/consumer-smoke.mjs`, run in CI: npm git install, `tsc` under the apps' strict settings, Vite build, Vitest, pip install, a real alignment |
| Sidecar reply shape changes, TypeScript types do not | `fixtures/*.json` written by the Python tests, read by `tests/wire.test.ts` |
| An app is left behind on an old tag | Documented in `MPS/wiki/lineage.md`; both apps' CI installs exactly the pinned tag |
| IPC command renamed here, Rust still has the old name | Each app's `tests/contract/ipcContract.test.ts` reads the package's `ipc.ts` |
