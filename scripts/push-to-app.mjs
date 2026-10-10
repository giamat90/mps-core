// Development loop: copy this working tree into an app so a change here can be
// tried there without tagging, pushing or re-resolving the lockfile.
//
//   node scripts/push-to-app.mjs ../VPS
//   node scripts/push-to-app.mjs ../SPS --python ../SPS/sidecar/.venv/Scripts/python.exe
//
// It copies (not symlinks): a symlinked package resolves react/zustand from this
// repository's own node_modules, giving the app two copies of React.
// Nothing here is committed in the app; `npm ci` puts the pinned version back.

import { cpSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [appArg, flag, pythonArg] = process.argv.slice(2);
if (!appArg) {
  console.error("usage: node scripts/push-to-app.mjs <app dir> [--python <python executable>]");
  process.exit(2);
}

const app = resolve(appArg);
const dest = join(app, "node_modules", "@giamat90", "mps-core");
if (!existsSync(join(app, "node_modules"))) {
  console.error(`${app} has no node_modules; run npm install there first`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(join(repo, "package.json"), join(dest, "package.json"), { recursive: true });
cpSync(join(repo, "src"), join(dest, "src"), {
  recursive: true,
  filter: (p) => !/\.test\.ts$/.test(p) && !p.replace(/\\/g, "/").includes("/src/test"),
});
console.log(`copied src/ into ${dest}`);

if (flag === "--python") {
  if (!pythonArg) {
    console.error("--python needs the app's python executable");
    process.exit(2);
  }
  execFileSync(resolve(pythonArg), ["-m", "pip", "install", "--quiet", "--no-deps", "--force-reinstall", join(repo, "python")], {
    stdio: "inherit",
  });
  console.log("installed python/ into the app's sidecar environment");
}
