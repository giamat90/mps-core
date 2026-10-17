# Releasing

## Versioning

Semantic versioning, read against the public surface pinned in `tests/api.test.ts`
and the Python names documented in [Consuming](consuming.md):

| Change | Bump |
|---|---|
| Bug fix, internal refactor, new tests | patch |
| New export, new optional parameter | minor |
| Removed or renamed export, changed argument or reply shape, changed wire fixture | major (minor while the version is 0.x) |

`package.json`'s `version` and `python/pyproject.toml`'s `version` are bumped
together; one tag covers both languages.

## Checklist for a tag

1. `npx tsc`, `npx vitest run`, `cd python; python -m pytest`: green.
2. If a wire fixture changed, the diff in `fixtures/` is reviewed and intended.
3. `node scripts/consumer-smoke.mjs` passes on the commit being tagged, and `cd rust; cargo test` is green.
4. `node scripts/push-to-app.mjs` into each app, then in each app: `npx tsc
   --noEmit`, `npm test`, `cd sidecar; python -m pytest`, `cd src-tauri; cargo
   test --lib`.
5. Update `CHANGELOG.md`, commit, tag `vX.Y.Z`, push both.
6. In each app, on a branch: change the pin in `package.json`,
   `sidecar/requirements*.txt` and the `mps-youtube-signin` tag in
   `src-tauri/Cargo.toml` (then `cargo update -p mps-youtube-signin`), `npm install`, run that app's CI. Merge.
7. Record the new pin in `MPS/wiki/lineage.md` if either app stays behind.
8. A release that adds a Rust crate (`mps-sidecar`, `mps-detached-windows`): in each app replace its `path = "..."` dependency with `git` + `tag` and run `cargo update -p <crate>` in the same change as the pin bump.

A tag is never moved after an app has pinned it. Fix forward with a new patch
version.

## When both apps need a new feature

Implement it here with its tests, release, then bump both apps. This replaces the
old "port it afterwards" workflow; the parity matrix then only needs an entry
when the app-side UI differs.
