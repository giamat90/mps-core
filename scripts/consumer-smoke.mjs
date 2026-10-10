// Installs this repository's last commit into a throwaway "app" the way VPS and
// SPS install it (npm git dependency, pip git requirement), then type-checks,
// bundles and tests against the public entry points. It exists because a
// package that passes its own tests can still be unusable from outside: wrong
// `exports`, TypeScript source Node refuses to load from node_modules, a
// missing peer dependency, a Python module that is not packaged.
//
// Only committed work is tested (that is what an app would receive).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(" ")}   (${cwd})`);
  // npm and npx are .cmd shims on Windows; a shell would also split arguments
  // that contain spaces (the pip requirement does), so only they get one.
  const shell = isWindows && (cmd === "npm" || cmd === "npx");
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell });
}

const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim();
if (dirty) console.warn("warning: uncommitted changes are not part of this test:\n" + dirty);

const repoUrl = pathToFileURL(repo).href;
const npmSpec = `git+${repoUrl}#${sha}`;
const pipSpec = `mps-core @ git+${repoUrl}@${sha}#subdirectory=python`;

const work = mkdtempSync(join(tmpdir(), "mps-core-consumer-"));
console.log(`consumer sandbox: ${work}\nnpm spec: ${npmSpec}\npip spec: ${pipSpec}`);

const app = join(work, "app");
mkdirSync(join(app, "src"), { recursive: true });

writeFileSync(
  join(app, "package.json"),
  JSON.stringify(
    {
      name: "consumer-smoke",
      private: true,
      type: "module",
      dependencies: {
        "@giamat90/mps-core": npmSpec,
        "@tauri-apps/api": "^2.10.1",
        "@tauri-apps/plugin-process": "^2.3.1",
        "@tauri-apps/plugin-updater": "^2.10.1",
        react: "^19.2.4",
        "react-dom": "^19.2.4",
        zustand: "^5.0.12",
      },
      devDependencies: { typescript: "^6.0.2", vite: "^8.0.3", vitest: "^5.0.3" },
    },
    null,
    2,
  ),
);

// The apps' own compiler settings, so the package's TypeScript source is held to
// the strictness it will be held to in production.
writeFileSync(
  join(app, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2021",
      useDefineForClassFields: true,
      lib: ["ES2021", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ["src"],
  }),
);

writeFileSync(
  join(app, "vite.config.ts"),
  `import { defineConfig } from "vite";
export default defineConfig({
  build: { lib: { entry: "src/index.ts", formats: ["es"], fileName: "out" }, outDir: "dist" },
});
`,
);

writeFileSync(
  join(app, "vitest.config.ts"),
  `import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    // The package ships TypeScript source and Node will not load .ts from node_modules.
    server: { deps: { inline: [/@giamat90\\/mps-core/] } },
  },
});
`,
);

writeFileSync(
  join(app, "src", "index.ts"),
  `import { metronome } from "@giamat90/mps-core/metronome";
import { VocalRecorder } from "@giamat90/mps-core/recorder";
import { computeMetronomePhase, countInDurationSeconds } from "@giamat90/mps-core/metronomeSync";
import { clamp } from "@giamat90/mps-core/zoomPan";
import { frequencyToNote } from "@giamat90/mps-core/music";
import { useUpdaterStore } from "@giamat90/mps-core/updater";
import { activeLineIndex, useLyricsStore, type Lyrics } from "@giamat90/mps-core/lyrics";

export const used = {
  metronome, VocalRecorder, computeMetronomePhase, countInDurationSeconds, clamp,
  frequencyToNote, useUpdaterStore, activeLineIndex, useLyricsStore,
};
export type { Lyrics };
`,
);

writeFileSync(
  join(app, "src", "smoke.test.ts"),
  `import { describe, expect, it } from "vitest";
import { frequencyToNote } from "@giamat90/mps-core/music";
import { clamp } from "@giamat90/mps-core/zoomPan";
import { countInDurationSeconds } from "@giamat90/mps-core/metronomeSync";
import { activeLineIndex, lineSeekTime, useLyricsStore } from "@giamat90/mps-core/lyrics";
import { useUpdaterStore } from "@giamat90/mps-core/updater";

describe("the package works from a consumer's node_modules", () => {
  it("pure modules", () => {
    expect(frequencyToNote(440)).toEqual({ note: "A4", cents: 0 });
    expect(clamp(5, 0, 3)).toBe(3);
    expect(countInDurationSeconds(120, 2)).toBe(4);
  });

  it("zustand stores share the consumer's single zustand", () => {
    expect(useLyricsStore.getState().status).toBe("idle");
    expect(useUpdaterStore.getState().status).toBe("idle");
  });

  it("timing", () => {
    const line = { text: "a", start: 5, end: 6, score: 1, words: [] };
    expect(activeLineIndex([line], 5)).toBe(0);
    expect(lineSeekTime(line)).toBeCloseTo(4.7);
  });
});
`,
);

run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], app);
run("npx", ["tsc"], app);
run("npx", ["vite", "build"], app);
run("npx", ["vitest", "run"], app);

// ── Python ────────────────────────────────────────────────────────────────────
const venv = join(work, "venv");
const py = isWindows ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
run(isWindows ? "python" : "python3", ["-m", "venv", venv], work);
run(py, ["-m", "pip", "install", "--quiet", pipSpec], work);

const script = join(work, "smoke.py");
writeFileSync(
  script,
  `import os, sys, tempfile
import numpy as np
import soundfile as sf
from mps_core import lyrics, version_check
from mps_core.app import AppIdentity

assert "site-packages" in lyrics.__file__, lyrics.__file__
app = AppIdentity(name="Smoke", url="https://example.invalid", data_dir=tempfile.mkdtemp(), env_prefix="SMOKE")
os.environ["SMOKE_LYRICS_ENGINE"] = "uniform"

wav = os.path.join(tempfile.mkdtemp(), "v.wav")
t = np.arange(16000 * 3) / 16000
sf.write(wav, (0.3 * np.sin(2 * np.pi * 220 * t)).astype("float32"), 16000)

out = lyrics.align_lyrics(wav, "hello world\\nsecond line", app=app)
assert out["aligner"] == "uniform-test-engine", out["aligner"]
assert [l["text"] for l in out["lines"]] == ["hello world", "second line"]
assert version_check.MIN_YT_DLP_VERSION.count(".") == 2
print("python consumer ok:", out["aligner"], len(out["lines"]), "lines")
`,
);
run(py, [script], work);

rmSync(work, { recursive: true, force: true });
console.log("\nconsumer smoke test passed");
