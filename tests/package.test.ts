// Architecture guard. This package is consumed by apps it knows nothing about,
// so it must stay self-contained: nothing may reach out of src/, every external
// import must be declared as a peer dependency (the app supplies one copy of
// React/Zustand/Tauri), and every module must be reachable from a public entry.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { builtinModules } from "node:module";

const root = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  exports: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.includes(`${sep}test${sep}`);
const sources = walk(join(root, "src")).filter((f) => /\.tsx?$/.test(f) && !isTest(f));

function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found: string[] = [];
  for (const m of text.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) found.push(m[1]);
  return found;
}

// zustand's `create` imports react itself, so the app must supply react even
// though no module here does.
const REQUIRED_BY_A_PEER = ["react"];

const packageName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

describe("public entry points", () => {
  const entries = Object.entries(pkg.exports);

  it("exposes at least the modules the apps import", () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  it.each(entries)("%s points at a source file inside src/", (_subpath, target) => {
    const abs = resolve(root, target);
    expect(existsSync(abs), `${target} does not exist`).toBe(true);
    expect(relative(root, abs).split(sep)[0]).toBe("src");
    expect(isTest(abs), `${target} is a test file`).toBe(false);
  });

  it("every source module is reachable from a public entry (no dead code ships)", () => {
    const reachable = new Set<string>();
    const visit = (file: string) => {
      if (reachable.has(file)) return;
      reachable.add(file);
      for (const spec of specifiers(file)) {
        if (!spec.startsWith(".")) continue;
        const base = resolve(dirname(file), spec);
        const next = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((c) => existsSync(c) && statSync(c).isFile());
        if (next) visit(next);
      }
    };
    for (const [, target] of entries) visit(resolve(root, target));
    const orphans = sources.filter((f) => !reachable.has(f)).map((f) => relative(root, f));
    expect(orphans).toEqual([]);
  });
});

describe("self-containment", () => {
  it("no source file imports from outside src/", () => {
    const escapes: string[] = [];
    for (const file of sources) {
      for (const spec of specifiers(file)) {
        if (!spec.startsWith(".")) continue;
        const target = resolve(dirname(file), spec);
        if (relative(join(root, "src"), target).startsWith("..")) escapes.push(`${relative(root, file)} -> ${spec}`);
      }
    }
    expect(escapes).toEqual([]);
  });

  it("every external import is a declared peer dependency", () => {
    const peers = new Set(Object.keys(pkg.peerDependencies));
    const builtin = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
    const undeclared = new Set<string>();
    for (const file of sources) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) continue;
        const name = packageName(spec);
        if (!peers.has(name) && !builtin.has(name) && !builtin.has(spec)) undeclared.add(`${name} (${relative(root, file)})`);
      }
    }
    expect([...undeclared]).toEqual([]);
  });

  it("every peer dependency is actually used (no stale requirement forced on the apps)", () => {
    const used = new Set(sources.flatMap((f) => specifiers(f)).filter((s) => !s.startsWith(".")).map(packageName));
    for (const p of REQUIRED_BY_A_PEER) used.add(p);
    const unused = Object.keys(pkg.peerDependencies).filter((p) => !used.has(p));
    expect(unused).toEqual([]);
  });

  it("every peer dependency is also a dev dependency, so this repo can test against it", () => {
    const missing = Object.keys(pkg.peerDependencies).filter((p) => !(p in pkg.devDependencies));
    expect(missing).toEqual([]);
  });
});
