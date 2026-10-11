import { describe, it, expect } from "vitest";
import { definePanelWindows, isId, isStateMessage, isTransportSnapshot } from "./protocol";

const windows = definePanelWindows(["lyrics", "takes"] as const);

describe("panel windows", () => {
  it("labels a panel's window and reads the panel back from the label", () => {
    expect(windows.label("lyrics")).toBe("detached-lyrics");
    expect(windows.fromLabel("detached-lyrics")).toBe("lyrics");
    expect(windows.fromLabel("detached-takes")).toBe("takes");
  });

  it("knows nothing about labels it did not hand out", () => {
    for (const label of ["main", "detached-", "detached-waveform", "xdetached-lyrics", "detached-lyrics-2", "detached-Lyrics", ""]) {
      expect(windows.fromLabel(label), label).toBeNull();
    }
  });

  it("accepts only listed ids", () => {
    expect(windows.isPanel("takes")).toBe(true);
    for (const v of ["", "Takes", "waveform", null, undefined, 3, {}]) expect(windows.isPanel(v)).toBe(false);
  });
});

describe("guards", () => {
  const snapshot = { time: 1, playing: false, rate: 1, sentAt: 5 };

  it("accepts a transport snapshot and rejects the malformed", () => {
    expect(isTransportSnapshot(snapshot)).toBe(true);
    for (const bad of [null, [], {}, { ...snapshot, time: Number.NaN }, { ...snapshot, playing: 1 }, { ...snapshot, sentAt: "x" }]) {
      expect(isTransportSnapshot(bad)).toBe(false);
    }
  });

  it("validates the shared part with the app's own guard", () => {
    const isShared = (v: unknown): v is { n: number } => typeof v === "object" && v !== null && typeof (v as { n: unknown }).n === "number";
    expect(isStateMessage({ transport: snapshot, shared: { n: 1 } }, isShared)).toBe(true);
    expect(isStateMessage({ transport: snapshot, shared: { n: "1" } }, isShared)).toBe(false);
    expect(isStateMessage({ transport: null, shared: { n: 1 } }, isShared)).toBe(false);
    expect(isStateMessage(null, isShared)).toBe(false);
  });

  it("ids are non-empty and bounded", () => {
    expect(isId("abc")).toBe(true);
    expect(isId("")).toBe(false);
    expect(isId("x".repeat(129))).toBe(false);
    expect(isId(3)).toBe(false);
  });
});
