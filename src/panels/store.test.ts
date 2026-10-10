import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPanelStore, type PanelDef } from "./store";

const KEY = "test_panels";

const PANELS = [
  { id: "takes", label: "Takes", defaultVisible: true },
  { id: "lyrics", label: "Lyrics", defaultVisible: true },
  { id: "spectrum", label: "Spectrum", defaultVisible: false },
] as const satisfies readonly PanelDef[];

const make = (panels: readonly PanelDef[] = PANELS, storageKey = KEY) => createPanelStore({ storageKey, panels });
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

beforeEach(() => {
  localStorage.clear();
});

describe("defaults", () => {
  it("starts with each panel at its default visibility", () => {
    expect(make().getState().visible).toEqual({ takes: true, lyrics: true, spectrum: false });
  });

  it("does not write anything until the user changes something", () => {
    make();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("exposes the panel definitions in order", () => {
    expect(make().getState().panels.map((p) => p.id)).toEqual(["takes", "lyrics", "spectrum"]);
  });
});

describe("changing visibility", () => {
  it("toggle flips one panel and leaves the others alone", () => {
    const store = make();
    store.getState().toggle("spectrum");
    expect(store.getState().visible).toEqual({ takes: true, lyrics: true, spectrum: true });
    store.getState().toggle("takes");
    expect(store.getState().visible).toEqual({ takes: false, lyrics: true, spectrum: true });
  });

  it("setVisible sets an explicit value and is idempotent", () => {
    const store = make();
    store.getState().setVisible("lyrics", false);
    store.getState().setVisible("lyrics", false);
    expect(store.getState().visible.lyrics).toBe(false);
  });

  it("showAll and hideAll apply to every panel", () => {
    const store = make();
    store.getState().showAll();
    expect(Object.values(store.getState().visible)).toEqual([true, true, true]);
    store.getState().hideAll();
    expect(Object.values(store.getState().visible)).toEqual([false, false, false]);
  });

  it("reset returns every panel to its default and forgets the stored choices", () => {
    const store = make();
    store.getState().hideAll();
    store.getState().reset();
    expect(store.getState().visible).toEqual({ takes: true, lyrics: true, spectrum: false });
    expect(stored()).toEqual({ overrides: {} });
  });

  it("rejects an id that is not registered instead of inventing a panel", () => {
    const store = make();
    expect(() => store.getState().toggle("nope" as never)).toThrow(/nope/);
    expect(() => store.getState().setVisible("nope" as never, true)).toThrow(/nope/);
  });
});

describe("persistence", () => {
  it("stores the user's explicit choices under the given key", () => {
    const store = make();
    store.getState().toggle("spectrum");
    expect(stored()).toEqual({ overrides: { spectrum: true } });
  });

  it("keeps a choice that happens to equal the default, so a later default change does not undo it", () => {
    const store = make();
    store.getState().setVisible("takes", true);
    expect(stored()).toEqual({ overrides: { takes: true } });
  });

  it("restores choices in a fresh store", () => {
    make().getState().setVisible("takes", false);
    const again = make();
    expect(again.getState().visible).toEqual({ takes: false, lyrics: true, spectrum: false });
  });

  it("gives a panel added in a later version its default while keeping the old choices", () => {
    make([PANELS[0], PANELS[1]]).getState().setVisible("lyrics", false);
    const upgraded = make();
    expect(upgraded.getState().visible).toEqual({ takes: true, lyrics: false, spectrum: false });
  });

  it("applies a changed default to a panel the user never touched, not to one they chose", () => {
    const first = make();
    first.getState().setVisible("takes", false);
    const flipped = PANELS.map((p) => ({ ...p, defaultVisible: !p.defaultVisible }));
    expect(make(flipped).getState().visible).toEqual({ takes: false, lyrics: false, spectrum: true });
  });

  it("ignores stored ids that no longer exist and values that are not booleans", () => {
    localStorage.setItem(KEY, JSON.stringify({ overrides: { gone: true, takes: "no", lyrics: false, spectrum: 1 } }));
    expect(make().getState().visible).toEqual({ takes: true, lyrics: false, spectrum: false });
  });

  it("drops those stale entries the next time it saves", () => {
    localStorage.setItem(KEY, JSON.stringify({ overrides: { gone: true } }));
    make().getState().toggle("takes");
    expect(stored()).toEqual({ overrides: { takes: false } });
  });

  it.each([["null"], ["[]"], ['"x"'], ["{}"], ['{"overrides":null}'], ['{"overrides":[true]}']])(
    "treats the stored value %s as nothing stored",
    (raw) => {
      localStorage.setItem(KEY, raw);
      expect(make().getState().visible).toEqual({ takes: true, lyrics: true, spectrum: false });
    },
  );

  it("survives corrupt JSON, warning instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEY, "{not json");
    expect(make().getState().visible.takes).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("survives localStorage itself throwing on read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(make().getState().visible.takes).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps the in-memory choice and warns when storage rejects the write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = make();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    store.getState().toggle("takes");
    expect(store.getState().visible.takes).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps separate stores apart by storage key", () => {
    const a = make(PANELS, "a_panels");
    const b = make(PANELS, "b_panels");
    a.getState().hideAll();
    expect(b.getState().visible.takes).toBe(true);
  });
});

describe("validating the definition", () => {
  it("rejects duplicate ids", () => {
    const dup = [PANELS[0], { ...PANELS[1], id: "takes" }];
    expect(() => make(dup)).toThrow(/duplicate.*takes/i);
  });

  it("rejects an empty id and an empty storage key", () => {
    expect(() => make([{ id: "", label: "x", defaultVisible: true }])).toThrow();
    expect(() => make(PANELS, "")).toThrow();
  });
});
