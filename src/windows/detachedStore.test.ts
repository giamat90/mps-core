import { describe, it, expect, beforeEach } from "vitest";
import { createDetachedStore } from "./detachedStore";
import { definePanelWindows } from "./protocol";

const windows = definePanelWindows(["pianoRoll", "lyrics", "takes"] as const);
const store = createDetachedStore(windows.isPanel);

beforeEach(() => {
  store.getState().reset();
});

describe("detached panels", () => {
  it("starts with everything docked", () => {
    expect(store.getState().detached).toEqual({});
  });

  it("marks a panel detached and docked again", () => {
    store.getState().markDetached("pianoRoll");
    expect(store.getState().detached).toEqual({ pianoRoll: true });
    store.getState().markDocked("pianoRoll");
    expect(store.getState().detached.pianoRoll).toBeFalsy();
  });

  it("keeps panels independent", () => {
    store.getState().markDetached("pianoRoll");
    store.getState().markDetached("lyrics");
    store.getState().markDocked("pianoRoll");
    expect(store.getState().detached).toEqual({ lyrics: true });
  });

  it("ignores a docked announcement for a panel it does not know", () => {
    store.getState().markDetached("lyrics");
    store.getState().markDocked("waveform");
    expect(store.getState().detached).toEqual({ lyrics: true });
  });

  it("reset docks everything", () => {
    store.getState().markDetached("lyrics");
    store.getState().reset();
    expect(store.getState().detached).toEqual({});
  });
});
