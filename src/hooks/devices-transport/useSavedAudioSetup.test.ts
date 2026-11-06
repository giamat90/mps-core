// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import type { AudioSetup } from "../../audio-setup";
import { useSavedAudioSetup, type SavedAudioSettingsState, type SavedAudioSetupState } from "./useSavedAudioSetup";

const player = (patch: Partial<SavedAudioSetupState> = {}) =>
  createFakeStore<SavedAudioSetupState>({
    audioDevices: [{ deviceId: "in1", label: "Focusrite" }],
    outputDevices: [{ deviceId: "out1", label: "Speakers" }],
    setAudioDevice: vi.fn(),
    setOutputDevice: vi.fn(),
    ...patch,
  });
const settings = (audioSetup: AudioSetup) => createFakeStore<SavedAudioSettingsState>({ audioSetup });

describe("useSavedAudioSetup", () => {
  it("reports nothing missing when the saved devices are connected", () => {
    const { result } = renderHook(() =>
      useSavedAudioSetup({
        settings: settings({ input: { id: "in1", label: "Focusrite" }, output: { id: "out1", label: "Speakers" } }),
        player: player(),
      }),
    );
    expect(result.current.inputMissing).toBeNull();
    expect(result.current.outputMissing).toBeNull();
  });

  it("names a saved device that is not connected, and recovers when it returns", () => {
    const store = player();
    const saved = { id: "usb", label: "USB Mic" };
    const { result } = renderHook(() => useSavedAudioSetup({ settings: settings({ input: saved, output: null }), player: store }));
    expect(result.current.inputMissing).toEqual(saved);
    expect(result.current.outputMissing).toBeNull();
    act(() => store.set({ audioDevices: [{ deviceId: "usb", label: "USB Mic" }] }));
    expect(result.current.inputMissing).toBeNull();
  });

  it("reset puts both pickers back on the system default", () => {
    const store = player();
    const { result } = renderHook(() => useSavedAudioSetup({ settings: settings({ input: null, output: null }), player: store }));
    result.current.reset();
    expect(store.getState().setAudioDevice).toHaveBeenCalledWith(null);
    expect(store.getState().setOutputDevice).toHaveBeenCalledWith(null);
  });
});
