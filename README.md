# mps-core

Code shared by the two Music Practice Studio desktop apps:

| App | Repository |
|---|---|
| **VPS**, Vocal Practice Studio | `github.com/giamat90/vps` |
| **SPS**, Song Practice Studio | `github.com/giamat90/SongPracticeStudio` |

The apps were forked from one another and for a long time shared code by
copying it, which meant every fix was made twice and the copies drifted. This
repository is where code that must stay identical lives instead. Each app pins a
tagged version, so a change here reaches users only after the app bumps its pin
and passes its own tests.

## What is in it

| Where | Package | Contents |
|---|---|---|
| `src/` | `@giamat90/mps-core` (TypeScript source) | `metronome`, `recorder`, `metronomeSync`, `zoomPan`, `music` (note/frequency maths), `updater` (auto-update store), `lyrics` (types, karaoke timing, IPC wrappers, store), `panels` (headless show/hide store for optional page panels), `windows` (detachable panels: clock, event bridges, drag gestures; no Tauri import), `takes` (which recorded takes are shown and which is heard), `shortcuts` (global keyboard shortcut handler), `loops` (named loops and bar sections) |
| `python/` | `mps-core` (`import mps_core`) | `lyrics` (CTC forced alignment + LRCLIB lookup), `version_check` (yt-dlp floor and freshness), `app.AppIdentity` |
| `fixtures/` | | Real sidecar replies, read by both the Python and the TypeScript tests |

## Using it

```jsonc
// package.json
"@giamat90/mps-core": "git+https://github.com/giamat90/mps-core.git#v0.1.0"
```
```text
# sidecar/requirements.txt
git+https://github.com/giamat90/mps-core.git@v0.1.0#subdirectory=python
```

```ts
import { metronome } from "@giamat90/mps-core/metronome";
import { activeLineIndex, useLyricsStore } from "@giamat90/mps-core/lyrics";
```

Vitest needs one setting (the package ships TypeScript source):
`test: { server: { deps: { inline: [/@giamat90\/mps-core/] } } }`.
Details, the Python wiring and the release procedure are in [`wiki/`](wiki/README.md).

## Developing

```powershell
npm ci
npx tsc
npx vitest run                                   # TypeScript + architecture + public API + wire fixtures
cd python; pip install pytest -e .; python -m pytest
node scripts/consumer-smoke.mjs                  # installs the last commit the way an app does
```

Read [CLAUDE.md](CLAUDE.md) before adding a module.
