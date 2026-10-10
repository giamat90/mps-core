# mps-core — Claude Code Context

Code shared by VPS and SPS (the two sibling Tauri apps under `MPS/`). It is a
library, not an app: no UI of its own, no CSS, no Tauri commands.

## Rules that always apply

### 1. Read the wiki first
`wiki/README.md`, then the page for what you are changing. Cross-project context
(why the apps exist, what is ported where) is in `MPS/wiki/` and `MPS/CLAUDE.md`.

### 2. Code belongs here only if both apps need it unchanged
A module goes in this repository when both apps run the same code. If the apps
need different behaviour, the difference is a parameter (see `AppIdentity`), not
a fork and not an `if (app === "vps")`. If only one app needs it, it stays in that
app. Check `MPS/wiki/feature-parity.md` for intentional divergence before moving
anything.

### 3. This package knows nothing about the apps
No import may reach outside `src/`. Everything an app-specific module would
supply (store state, a Tauri command, a data directory) comes in as a peer
dependency, a parameter, or an `AppIdentity`. `tests/package.test.ts` enforces
the structural half of this.

### 4. The public surface is pinned
Every export in `package.json`'s `exports` map is listed in `tests/api.test.ts`.
Adding an export means adding it there; removing or renaming one is a breaking
change and needs a major version bump (a minor bump while 0.x). Do not export
something just because it is convenient to test: import it from its file.

### 5. Tests move with the code
A module's tests live next to it. When code moves here from an app, its tests move
too and the app's copies are deleted in the same change. Nothing is ported without
its tests.

### 6. Verify against both apps before tagging
Passing this repository's tests is not enough: run `node scripts/push-to-app.mjs`
into VPS and SPS and run each app's `npm test`, `tsc --noEmit`, sidecar pytest and
`cargo test --lib`. Then tag, then bump both apps' pins (an app left on an old tag
is allowed, but say so in `MPS/wiki/lineage.md`).

### 7. Repository conventions
- No comments unless the WHY is non-obvious.
- Never swallow errors silently: log with `console.warn`/`console.error` (or the
  sidecar's stderr logger) at minimum, rethrow what is unexpected.
- Relative CSS units only applies to the apps; nothing here styles anything.
- Commits: a PowerShell here-string, `Co-Authored-By` trailer when an assistant
  helped, as in the apps.

## Layout

```
src/               TypeScript source, shipped as-is (no build step)
  audio/           metronome, recorder
  lib/             metronomeSync, zoomPan, music
  updater/         auto-update store
  panels/          headless show/hide store for optional page panels
  lyrics/          types, timing, ipc, store
python/            pip package mps-core (src/mps_core, tests/)
fixtures/          sidecar replies pinned by Python, read by TypeScript
tests/             architecture, public API, wire fixtures (TypeScript)
scripts/           consumer-smoke.mjs, push-to-app.mjs
wiki/              documentation
```

## Commands

```powershell
npm ci; npx tsc; npx vitest run
cd python; pip install pytest -e .; python -m pytest
node scripts/consumer-smoke.mjs                 # needs a commit; installs it like an app
node scripts/push-to-app.mjs ../VPS             # try the working tree in an app
$env:UPDATE_FIXTURES = "1"; python -m pytest tests/test_wire_fixture.py   # regenerate fixtures
```
