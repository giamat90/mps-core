# Consuming mps-core from an app

## TypeScript

`package.json`:

```json
"dependencies": {
  "@giamat90/mps-core": "git+https://github.com/giamat90/mps-core.git#v0.1.0"
}
```

Use the explicit `git+https://` form. npm's `github:user/repo` shorthand is
written to the lockfile as an `ssh://` URL, which fails on a CI runner without an
SSH key.

The package needs these to be installed by the app (they are peer dependencies,
all of which both apps already have): `react`, `zustand`, `@tauri-apps/api`,
`@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater`.

### Entry points

| Import | Gives |
|---|---|
| `@giamat90/mps-core/metronome` | `metronome` (singleton lookahead click track) |
| `@giamat90/mps-core/recorder` | `VocalRecorder` |
| `@giamat90/mps-core/metronomeSync` | `computeMetronomePhase`, `countInDurationSeconds` |
| `@giamat90/mps-core/zoomPan` | zoom/pan maths and constants |
| `@giamat90/mps-core/music` | `NOTE_NAMES`, `midiToFrequency`, `frequencyToMidi`, `frequencyToNote` |
| `@giamat90/mps-core/updater` | `useUpdaterStore` |
| `@giamat90/mps-core/panels` | `createPanelStore` (headless: visibility and order; the app renders its own menu, drag handles and decides what each panel is) |
| `@giamat90/mps-core/windows` | detachable panels: `definePanelWindows`, `startMainBridge`, `createDetachedBridge`, `RemoteClock`, `decideDrop`, `createDockGesture`, `createDetachedStore`, `panelsToClose`, and the guards (see below) |
| `@giamat90/mps-core/takes` | `toggleTake`, `showTake`, `hideTake`, `reconcileTakes`, `EMPTY_SELECTION`: pure transitions of `{ shown, active }`; `audibleTakes`: which of them are heard (all together / selected only, lane mutes, muted while recording). The app keeps the state in its player store and owns the audio |
| `@giamat90/mps-core/lyrics` | lyric types, `activeLineIndex`/`activeWordIndex`/`lineSeekTime`/`lyricsPlainText`, the IPC wrappers, `useLyricsStore` |

### Detachable panels

`windows` is the half that is the same in both apps. What stays in each app: the
list of panels, the shared state and its guard, the commands and `parseCommand`,
the components (`DetachHandle`, `DockHandle`, the host that renders a panel), and
the Rust side (`windows.rs`: allowlist, window creation, remembered geometry,
`cursor_over_main`), which is Rust and therefore not here.

```ts
const windows = definePanelWindows(["lyrics", "takes"] as const);   // allowlist + labels

startMainBridge({            // in the main window
  isPanel: windows.isPanel,
  subscribe, transport, shared,        // read from the app's player store
  parseCommand, apply,                 // the app's commands, validated
  emit, listen, now,                   // from @tauri-apps/api/event
  streams: (send) => [/* optional extra feeds: live trace, spectrum */],
});

const bridge = createDetachedBridge({  // in a detached window
  panelId, isShared, applyShared, writeTime, emit, listen, now,
  installTimeSource, listeners,
});
player.setState({ seek: (t) => { bridge.seekLocal(t); bridge.command({ type: "seek", time: t }); } });
await bridge.start();
```

The Rust allowlist and `definePanelWindows`' list are written twice on purpose
(the Rust side must refuse labels on its own); each app has a contract test that
compares them.

### Vitest

The package ships TypeScript. Node refuses to load `.ts` from `node_modules`, so
Vitest has to compile it:

```ts
// vitest.config.ts
test: {
  server: { deps: { inline: [/@giamat90\/mps-core/] } },
}
```

`vi.mock("@giamat90/mps-core/metronome", ...)` works as for any module.

### The IPC contract test

The lyrics wrappers live in the package, so an app's
`tests/contract/ipcContract.test.ts` must read them as well as its own
`src/lib/tauri.ts`:

```ts
const tauriTs = read("src/lib/tauri.ts") + "\n" + read("node_modules/@giamat90/mps-core/src/lyrics/ipc.ts");
```

The Rust side must register `load_lyrics(songId)`, `sync_lyrics(songId, text, source?)`,
`find_lyrics(songId)`, `delete_lyrics(songId)` and emit `lyrics-progress`
(`{songId, progress, stage}`).

## Rust

The YouTube sign-in lives in the `mps-youtube-signin` crate (`rust/youtube-signin`). In the app's `src-tauri/Cargo.toml`:

```toml
mps-youtube-signin = { git = "https://github.com/giamat90/mps-core", tag = "v0.7.0" }
```

The app keeps two thin commands and calls the crate with its own data directory:

```rust
#[tauri::command]
pub async fn sign_in_youtube(app: AppHandle) -> Result<String, String> {
    mps_youtube_signin::sign_in(&app, &storage::app_data_dir()).await.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn sign_out_youtube() -> Result<(), String> {
    mps_youtube_signin::sign_out(&storage::app_data_dir())
}
```

The app's invoke handler must call `mps_youtube_signin::may_invoke(webview.label())` first and reject when it is false, and its main-window teardown should call `mps_youtube_signin::close(&app)`. The TypeScript half is `@giamat90/mps-core/youtube` (`signInYoutube`, `signOutYoutube`, `cookiesSource`, `isSessionExpiredError`).

## Python sidecar

`sidecar/requirements.txt` and `requirements-test.txt`:

```text
git+https://github.com/giamat90/mps-core.git@v0.1.0#subdirectory=python
```

Use the bare URL form; `name @ url` is rejected by older pip when the URL has a
Windows drive path, which is how the local development loop is tested.

```python
from mps_core import lyrics
from mps_core.app import AppIdentity
from mps_core.version_check import check_yt_dlp_freshness

APP = AppIdentity(
    name="SongPracticeStudio",                       # user agent: "<name> (<url>)"
    url="https://github.com/giamat90/SongPracticeStudio",
    data_dir="~/.songpracticestudio",                # models/ and yt_dlp_check.json live here
    env_prefix="SPS",                                # SPS_LYRICS_ENGINE=uniform switches the test engine
)

advisory = check_yt_dlp_freshness(APP)
result = lyrics.align_lyrics(vocals_path, text, on_progress=cb, models_dir=cmd.get("modelsDir"), app=APP)
found = lyrics.find_lyrics(title, artist=None, duration=duration, app=APP)
```

`yt_importer` reads the floor with `from mps_core.version_check import MIN_YT_DLP_VERSION`.
Each app keeps a test that its requirement files carry the same floor
(`tests/test_yt_dlp_floor.py`).

PyInstaller needs nothing extra: the package is imported statically from
`main.py`, so it is collected like any other dependency.

## Local development loop

To try a change in this repository inside an app without tagging:

```powershell
node scripts/push-to-app.mjs ../VPS
node scripts/push-to-app.mjs ../SPS --python ../SPS/sidecar/.venv/Scripts/python.exe
```

This copies `src/` over `node_modules/@giamat90/mps-core` and `pip install
--no-deps --force-reinstall`s `python/`. It does not touch the app's
`package.json` or lockfile; `npm ci` restores the pinned version. Symlinking
(`npm link`, `file:../core`) is deliberately not the recommended loop: the linked
package would resolve React and Zustand from this repository, and the app would
run with two copies of each.
