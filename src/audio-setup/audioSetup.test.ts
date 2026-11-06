import { describe, it, expect } from "vitest";
import { EMPTY_AUDIO_SETUP, normalizeAudioSetup, resolveSavedDevice, toSavedDevice } from "./index";

const devices = [
  { deviceId: "a1", label: "Focusrite USB" },
  { deviceId: "b2", label: "Speakers (Realtek)" },
];

describe("normalizeAudioSetup", () => {
  it("keeps a valid setup", () => {
    expect(normalizeAudioSetup({ input: { id: "a1", label: "Focusrite USB" }, output: { id: "b2", label: "S" } })).toEqual({
      input: { id: "a1", label: "Focusrite USB" },
      output: { id: "b2", label: "S" },
    });
  });

  it.each([undefined, null, 5, "x", [], { input: 3 }, { input: { id: "" } }, { input: { label: "x" } }])(
    "turns %j into the default setup",
    (raw) => {
      expect(normalizeAudioSetup(raw)).toEqual(EMPTY_AUDIO_SETUP);
    },
  );

  it("tolerates a missing label", () => {
    expect(normalizeAudioSetup({ input: { id: "a1" } }).input).toEqual({ id: "a1", label: "" });
  });
});

describe("toSavedDevice", () => {
  it("remembers the name the device has now", () => {
    expect(toSavedDevice("a1", devices)).toEqual({ id: "a1", label: "Focusrite USB" });
  });

  it("saves nothing for the system default", () => {
    expect(toSavedDevice(null, devices)).toBeNull();
    expect(toSavedDevice("", devices)).toBeNull();
  });

  it("keeps the id of a device that is not listed, with an empty name", () => {
    expect(toSavedDevice("zz", devices)).toEqual({ id: "zz", label: "" });
  });
});

describe("resolveSavedDevice", () => {
  it("is the default when nothing is saved", () => {
    expect(resolveSavedDevice(null, devices)).toEqual({ id: null, missing: null });
  });

  it("matches by id", () => {
    expect(resolveSavedDevice({ id: "b2", label: "renamed" }, devices)).toEqual({ id: "b2", missing: null });
  });

  it("falls back to the name when the id changed", () => {
    expect(resolveSavedDevice({ id: "old", label: "Focusrite USB" }, devices)).toEqual({ id: "a1", missing: null });
  });

  it("reports a device that is not connected, and uses the default meanwhile", () => {
    const saved = { id: "gone", label: "USB Mic" };
    expect(resolveSavedDevice(saved, devices)).toEqual({ id: null, missing: saved });
  });

  it("does not match an empty name against an unnamed device", () => {
    const list = [{ deviceId: "x", label: "" }];
    const saved = { id: "gone", label: "" };
    expect(resolveSavedDevice(saved, list)).toEqual({ id: null, missing: saved });
  });

  it("claims nothing while the list has no ids (microphone not allowed yet)", () => {
    const blind = [{ deviceId: "", label: "" }];
    expect(resolveSavedDevice({ id: "a1", label: "Focusrite USB" }, blind)).toEqual({ id: null, missing: null });
    expect(resolveSavedDevice({ id: "a1", label: "Focusrite USB" }, [])).toEqual({ id: null, missing: null });
  });
});
