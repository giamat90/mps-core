// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useDeviceSelect, useMicSelect, useOutputSelect, type MicSelectState, type OutputSelectState } from "./useDeviceSelect";

afterEach(() => vi.restoreAllMocks());

const devices = [
  { deviceId: "abcdef123456", label: "Mic A" },
  { deviceId: "zzzzzzzz", label: "" },
];

describe("useDeviceSelect", () => {
  const base = { devices, selectedId: null, fetchDevices: vi.fn(), select: vi.fn(), unnamedPrefix: "Thing", disabled: false };

  it("fetches the devices once, on mount", () => {
    const fetchDevices = vi.fn();
    const { rerender } = renderHook(() => useDeviceSelect({ ...base, fetchDevices }));
    rerender();
    expect(fetchDevices).toHaveBeenCalledTimes(1);
  });

  it("lists devices with their label, or the first six characters of the id when unnamed", () => {
    const { result } = renderHook(() => useDeviceSelect(base));
    expect(result.current.options).toEqual([
      { id: "abcdef123456", label: "Mic A" },
      { id: "zzzzzzzz", label: "Thing zzzzzz" },
    ]);
  });

  it("shows an empty value for the default device and the id for a chosen one", () => {
    expect(renderHook(() => useDeviceSelect(base)).result.current.value).toBe("");
    expect(renderHook(() => useDeviceSelect({ ...base, selectedId: "abcdef123456" })).result.current.value).toBe("abcdef123456");
  });

  it("selects null for the default entry and the id otherwise", () => {
    const select = vi.fn();
    const { result } = renderHook(() => useDeviceSelect({ ...base, select }));
    result.current.onChange("");
    result.current.onChange("zzzzzzzz");
    expect(select.mock.calls).toEqual([[null], ["zzzzzzzz"]]);
  });

  it("logs a failed selection when asked to, and ignores a plain return value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("no sink");
    const { result } = renderHook(() => useDeviceSelect({ ...base, select: () => Promise.reject(boom), selectFailureLog: "failed:" }));
    result.current.onChange("x");
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith("failed:", boom);

    error.mockClear();
    const quiet = renderHook(() => useDeviceSelect({ ...base, select: () => Promise.resolve(), selectFailureLog: "failed:" }));
    quiet.result.current.onChange("x");
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("useMicSelect", () => {
  const state = (): MicSelectState => ({
    audioDevices: devices,
    selectedDeviceId: null,
    fetchAudioDevices: vi.fn(),
    setAudioDevice: vi.fn(),
    isRecording: false,
  });

  it("is locked while recording and follows the store", () => {
    const store = createFakeStore(state());
    const { result } = renderHook(() => useMicSelect(store));
    expect(result.current.disabled).toBe(false);
    expect(result.current.options[1].label).toBe("Microphone zzzzzz");
    act(() => store.set({ isRecording: true, selectedDeviceId: "abcdef123456" }));
    expect(result.current.disabled).toBe(true);
    expect(result.current.value).toBe("abcdef123456");
  });

  it("fetches on mount and sets the device", () => {
    const store = createFakeStore(state());
    const { result } = renderHook(() => useMicSelect(store));
    expect(store.getState().fetchAudioDevices).toHaveBeenCalledTimes(1);
    result.current.onChange("");
    expect(store.getState().setAudioDevice).toHaveBeenCalledWith(null);
  });
});

describe("useOutputSelect", () => {
  const state = (): OutputSelectState => ({
    outputDevices: devices,
    selectedOutputDeviceId: null,
    fetchOutputDevices: vi.fn(),
    setOutputDevice: vi.fn(async () => {}),
    song: null,
  });

  it("needs a song and uses the speaker wording", () => {
    const store = createFakeStore(state());
    const { result } = renderHook(() => useOutputSelect(store));
    expect(result.current.disabled).toBe(true);
    expect(result.current.options[1].label).toBe("Speaker zzzzzz");
    act(() => store.set({ song: { id: "s" } }));
    expect(result.current.disabled).toBe(false);
  });

  it("logs when the sink cannot be set", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("sink");
    const store = createFakeStore({ ...state(), song: {}, setOutputDevice: vi.fn(() => Promise.reject(boom)) });
    const { result } = renderHook(() => useOutputSelect(store));
    result.current.onChange("zzzzzzzz");
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith("[OutputSelector] setSinkId failed:", boom);
  });
});
