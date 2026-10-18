// The detachable-window protocol is written twice: in `src/windows` (TypeScript)
// and in `rust/detached-windows` (Rust). A label prefix or event name known to
// only one side would open windows the frontend cannot read, or dock nothing,
// so the two are compared here.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DETACHED_LABEL_PREFIX, EVT_DOCKED } from "../src/windows";

const root = resolve(__dirname, "..");
const rust = readFileSync(join(root, "rust/detached-windows/src/lib.rs"), "utf8").replace(/\r\n/g, "\n");

describe("detached windows: Rust and TypeScript halves", () => {
  it("name their windows with the same label prefix", () => {
    expect(rust).toContain(`pub const DETACHED_PREFIX: &str = "${DETACHED_LABEL_PREFIX}";`);
  });

  it("agree on the event that announces a panel was docked", () => {
    expect(rust).toContain(`const EVT_DOCKED: &str = "${EVT_DOCKED}";`);
  });
});
