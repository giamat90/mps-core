# Testing

| Layer | Where | Protects |
|---|---|---|
| Unit | `src/**/*.test.ts` | Behaviour of each module; moved unchanged from the apps where the code was identical |
| Architecture | `tests/package.test.ts` | Self-containment: every `exports` target exists under `src/`, no import leaves `src/`, every external import is a declared peer, no unreachable module ships, every peer is used |
| Public API | `tests/api.test.ts` | The exact exported names per entry point (breaking changes must be deliberate) |
| Wire | `python/tests/test_wire_fixture.py` + `tests/wire.test.ts` | Python replies pinned as `fixtures/*.json`; the TypeScript types and the karaoke timing code are checked against the same files. `Record<keyof T, true>` key lists fail to compile when an interface changes |
| Python unit | `python/tests/` | Text parsing, CTC Viterbi (equal to torchaudio's), timeline and warnings via a scripted acoustic model, windowed inference, model download, LRCLIB lookup, `AppIdentity`, yt-dlp freshness check |
| Consumer | `scripts/consumer-smoke.mjs` | The package installed the way an app installs it |
| In the apps | each app's own suites | Real integration: Rust ↔ real sidecar round trip with the package installed in the sidecar venv, IPC contract against the Rust handlers, frozen sidecar |

## Running

```powershell
npm ci
npx tsc
npx vitest run --coverage
cd python
pip install pytest -e .
python -m pytest
cd ..
node scripts/consumer-smoke.mjs      # needs ~2 minutes; installs numpy/scipy into a throwaway venv
```

torch is deliberately not installed: the real wav2vec2 path is covered by the
apps' local-only real-data tests (`sidecar/tests/test_lyrics_real.py`), which
skip without the model weights.

## Regenerating fixtures

```powershell
$env:UPDATE_FIXTURES = "1"; cd python; python -m pytest tests/test_wire_fixture.py
```

Review the `fixtures/` diff, then run `npx vitest run`. A TypeScript failure there
means the types or the timing code no longer match what the sidecar sends.
