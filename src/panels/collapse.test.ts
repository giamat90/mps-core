// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCollapseStore } from "./collapse";

let n = 0;
const key = () => `collapse_${n++}`;

beforeEach(() => localStorage.clear());

describe("createCollapseStore", () => {
  it("starts with every panel open", () => {
    const store = createCollapseStore({ storageKey: key() });
    expect(store.getState().isCollapsed("pianoRoll")).toBe(false);
    expect(store.getState().collapsed).toEqual({});
  });

  it("folds and unfolds a panel, one at a time", () => {
    const store = createCollapseStore({ storageKey: key() });
    store.getState().toggle("a");
    store.getState().toggle("b");
    expect(store.getState().isCollapsed("a")).toBe(true);
    store.getState().toggle("a");
    expect(store.getState().isCollapsed("a")).toBe(false);
    expect(store.getState().isCollapsed("b")).toBe(true);
  });

  it("stores only the collapsed panels, and keeps them for the next run", () => {
    const storageKey = key();
    const first = createCollapseStore({ storageKey });
    first.getState().setCollapsed("a", true);
    first.getState().setCollapsed("b", true);
    first.getState().setCollapsed("b", false);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toEqual(["a"]);

    const second = createCollapseStore({ storageKey });
    expect(second.getState().isCollapsed("a")).toBe(true);
    expect(second.getState().isCollapsed("b")).toBe(false);
  });

  it("does not write when nothing changes", () => {
    const storageKey = key();
    const store = createCollapseStore({ storageKey });
    store.getState().setCollapsed("a", false);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("ignores storage that is not a list of ids", () => {
    const storageKey = key();
    localStorage.setItem(storageKey, JSON.stringify({ a: true }));
    expect(createCollapseStore({ storageKey }).getState().collapsed).toEqual({});
    localStorage.setItem(storageKey, JSON.stringify(["a", 3, "", null, "b"]));
    expect(Object.keys(createCollapseStore({ storageKey }).getState().collapsed)).toEqual(["a", "b"]);
  });

  it("warns and starts open when storage is unreadable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storageKey = key();
    localStorage.setItem(storageKey, "{not json");
    expect(createCollapseStore({ storageKey }).getState().collapsed).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still folds when storage refuses the write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const set = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const store = createCollapseStore({ storageKey: key() });
    store.getState().toggle("a");
    expect(store.getState().isCollapsed("a")).toBe(true);
    expect(warn).toHaveBeenCalled();
    set.mockRestore();
    warn.mockRestore();
  });

  it("follows another window that folds a panel", () => {
    const storageKey = key();
    const store = createCollapseStore({ storageKey });
    localStorage.setItem(storageKey, JSON.stringify(["a"]));
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
    expect(store.getState().isCollapsed("a")).toBe(true);
    localStorage.setItem("unrelated", "x");
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(store.getState().isCollapsed("a")).toBe(true);
  });

  it("rejects a missing key and an empty panel id", () => {
    expect(() => createCollapseStore({ storageKey: "" })).toThrow(/storageKey/);
    expect(() => createCollapseStore({ storageKey: key() }).getState().toggle("")).toThrow(/empty id/);
  });
});
