import { describe, it, expect } from "vitest";
import { panelsToClose } from "./panelsToClose";

const IDS = ["pianoRoll", "lyrics", "takes", "coach"] as const;
const all = (v: boolean) => ({ pianoRoll: v, lyrics: v, takes: v, coach: v });
const close = (prev: Record<string, boolean>, next: Record<string, boolean>, detached: Record<string, boolean>) =>
  panelsToClose(IDS, prev, next, detached);

describe("panelsToClose", () => {
  it("is empty when nothing changed", () => {
    expect(close(all(true), all(true), { pianoRoll: true })).toEqual([]);
  });

  it("closes the window of a detached panel that has just been hidden", () => {
    expect(close(all(true), { ...all(true), pianoRoll: false }, { pianoRoll: true })).toEqual(["pianoRoll"]);
  });

  it("leaves a docked panel alone: there is no window to close", () => {
    expect(close(all(true), { ...all(true), lyrics: false }, { pianoRoll: true })).toEqual([]);
  });

  it("leaves a detached panel alone while it stays visible", () => {
    expect(close(all(true), { ...all(true), lyrics: false }, { pianoRoll: true, lyrics: false })).toEqual([]);
  });

  it("closes every detached panel that Hide all hides, and only those", () => {
    expect(close(all(true), all(false), { coach: true, lyrics: true, takes: false }).sort()).toEqual(["coach", "lyrics"]);
  });

  it("does not act on a panel that was already hidden", () => {
    expect(close({ ...all(true), coach: false }, all(false), { coach: true })).toEqual([]);
  });

  it("ignores ids that are not detachable panels", () => {
    expect(close({ ...all(true), waveform: true }, { ...all(true), waveform: false }, { waveform: true })).toEqual([]);
  });
});
