import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSettingsStore } from "./settingsStore";

const KEY = "any_settings";
const fresh = () => createSettingsStore({ storageKey: KEY });
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "{}");

beforeEach(() => {
  localStorage.clear();
});

describe("loading persisted settings", () => {
  it("falls back to defaults when nothing is stored", () => {
    const s = fresh().getState();
    expect(s.youtubeCookiesPath).toBeNull();
    expect(s.collapsedFolders).toEqual({});
  });

  it("restores valid stored values", () => {
    localStorage.setItem(KEY, JSON.stringify({ youtubeCookiesPath: "/c.txt", collapsedFolders: { f1: true } }));
    const s = fresh().getState();
    expect(s.youtubeCookiesPath).toBe("/c.txt");
    expect(s.collapsedFolders).toEqual({ f1: true });
  });

  it("reads and writes only the key it was given", () => {
    localStorage.setItem("other_settings", JSON.stringify({ youtubeCookiesPath: "/other.txt" }));
    const store = fresh();
    expect(store.getState().youtubeCookiesPath).toBeNull();
    store.getState().setYoutubeCookiesPath("/c.txt");
    expect(JSON.parse(localStorage.getItem("other_settings") ?? "{}").youtubeCookiesPath).toBe("/other.txt");
  });

  // Until VPS v0.1.63 the user picked the pitch algorithm in Settings and it was persisted.
  // Nobody may stay pinned to that old choice: the app decides it now.
  it.each(["crepe", "praat", "pyin", "hps", "srh", "garbage", 42])(
    "ignores a pitchAlgorithm of %j stored by an older version",
    (legacy) => {
      localStorage.setItem(KEY, JSON.stringify({ pitchAlgorithm: legacy, youtubeCookiesPath: "/c.txt" }));
      const state = fresh().getState();
      expect(state).not.toHaveProperty("pitchAlgorithm");
      expect(state.youtubeCookiesPath).toBe("/c.txt");
    },
  );

  it("drops a setting an older version saved the next time anything is saved", () => {
    localStorage.setItem(KEY, JSON.stringify({ pitchAlgorithm: "crepe", collapsedFolders: {} }));
    fresh().getState().setFolderCollapsed("a", true);
    expect(stored()).toEqual({ youtubeCookiesPath: null, collapsedFolders: { a: true } });
  });

  it("ignores a wrongly-typed cookies path and collapsedFolders", () => {
    localStorage.setItem(KEY, JSON.stringify({ youtubeCookiesPath: 5, collapsedFolders: ["a"] }));
    const s = fresh().getState();
    expect(s.youtubeCookiesPath).toBeNull();
    expect(s.collapsedFolders).toEqual({});
  });

  it("ignores a null collapsedFolders", () => {
    localStorage.setItem(KEY, JSON.stringify({ collapsedFolders: null }));
    expect(fresh().getState().collapsedFolders).toEqual({});
  });

  it("survives corrupt JSON, warning instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEY, "{not json");
    expect(fresh().getState().collapsedFolders).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("survives localStorage itself throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(fresh().getState().youtubeCookiesPath).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe("persisting changes", () => {
  it("persists only the settings the user can change", () => {
    fresh().getState().setYoutubeCookiesPath("/c.txt");
    expect(stored()).toEqual({ youtubeCookiesPath: "/c.txt", collapsedFolders: {} });
  });

  it("writes and clears the cookies path", () => {
    const store = fresh();
    store.getState().setYoutubeCookiesPath("/c.txt");
    expect(stored().youtubeCookiesPath).toBe("/c.txt");
    store.getState().setYoutubeCookiesPath(null);
    expect(stored().youtubeCookiesPath).toBeNull();
  });

  it("merges folder collapse flags instead of replacing them", () => {
    const store = fresh();
    store.getState().setFolderCollapsed("a", true);
    store.getState().setFolderCollapsed("b", true);
    store.getState().setFolderCollapsed("a", false);
    expect(store.getState().collapsedFolders).toEqual({ a: false, b: true });
    expect(stored().collapsedFolders).toEqual({ a: false, b: true });
  });

  it("round-trips through a second store on the same key", () => {
    const first = fresh();
    first.getState().setYoutubeCookiesPath("/c.txt");
    first.getState().setFolderCollapsed("x", true);
    const second = fresh().getState();
    expect(second.youtubeCookiesPath).toBe("/c.txt");
    expect(second.collapsedFolders).toEqual({ x: true });
  });

  it("keeps the in-memory value and warns when storage rejects the write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = fresh();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    store.getState().setYoutubeCookiesPath("/c.txt");
    expect(store.getState().youtubeCookiesPath).toBe("/c.txt");
    expect(warn).toHaveBeenCalled();
  });
});
