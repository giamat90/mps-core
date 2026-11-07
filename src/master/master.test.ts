// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MASTER_STORAGE_KEY, applyMaster, clampMaster, loadMasterVolume, masterPercent, saveMasterVolume } from "./master";

beforeEach(() => localStorage.clear());

describe("clampMaster", () => {
  it("keeps 0 to 1 and rounds to the hundredth", () => {
    expect(clampMaster(0)).toBe(0);
    expect(clampMaster(0.5)).toBe(0.5);
    expect(clampMaster(0.3333)).toBe(0.33);
    expect(clampMaster(1)).toBe(1);
  });
  it("never boosts or goes negative", () => {
    expect(clampMaster(1.7)).toBe(1);
    expect(clampMaster(-2)).toBe(0);
  });
  it("takes a value that is not a number for the default, not for silence", () => {
    expect(clampMaster(NaN)).toBe(1);
    expect(clampMaster(Infinity)).toBe(1);
  });
});

describe("applyMaster", () => {
  it("scales a gain and leaves a silent track silent", () => {
    expect(applyMaster(0.8, 0.5)).toBeCloseTo(0.4);
    expect(applyMaster(0, 1)).toBe(0);
    expect(applyMaster(1, 0)).toBe(0);
  });
  it("is the identity at full level", () => {
    expect(applyMaster(0.37, 1)).toBe(0.37);
  });
});

describe("masterPercent", () => {
  it("reads as a whole percentage", () => {
    expect(masterPercent(0.8)).toBe("80%");
    expect(masterPercent(0)).toBe("0%");
    expect(masterPercent(5)).toBe("100%");
  });
});

describe("persistence", () => {
  it("is full level before anything was saved", () => {
    expect(loadMasterVolume()).toBe(1);
  });
  it("round-trips, including silence", () => {
    saveMasterVolume(0.35);
    expect(loadMasterVolume()).toBe(0.35);
    saveMasterVolume(0);
    expect(loadMasterVolume()).toBe(0);
  });
  it("ignores garbage in storage", () => {
    localStorage.setItem(MASTER_STORAGE_KEY, "loud");
    expect(loadMasterVolume()).toBe(1);
  });
  it("survives a storage that throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    expect(loadMasterVolume()).toBe(1);
    expect(() => saveMasterVolume(0.5)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    warn.mockRestore();
  });
});
