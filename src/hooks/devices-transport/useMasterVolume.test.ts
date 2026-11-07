// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useMasterVolume, type MasterVolumeState } from "./useMasterVolume";

function make(masterVolume = 1) {
  const store = createFakeStore<MasterVolumeState>({
    masterVolume,
    setMasterVolume: vi.fn((v: number) => store.set({ masterVolume: v })),
  });
  return store;
}

describe("useMasterVolume", () => {
  it("shows the level and says what a click does", () => {
    const { result } = renderHook(() => useMasterVolume(make(0.8)));
    expect(result.current.value).toBe(0.8);
    expect(result.current.percentText).toBe("80%");
    expect(result.current.muted).toBe(false);
    expect(result.current.title).toBe("Master volume 80%. Click to mute");
  });

  it("clamps what the slider sends, and reads a string", () => {
    const store = make();
    const { result } = renderHook(() => useMasterVolume(store));
    act(() => result.current.onChange("0.4"));
    expect(store.getState().setMasterVolume).toHaveBeenLastCalledWith(0.4);
    act(() => result.current.onChange(7));
    expect(store.getState().setMasterVolume).toHaveBeenLastCalledWith(1);
  });

  it("mutes, then brings back the level it had", () => {
    const store = make(0.6);
    const { result } = renderHook(() => useMasterVolume(store));
    act(() => result.current.toggleMute());
    expect(store.getState().masterVolume).toBe(0);
    expect(result.current.muted).toBe(true);
    expect(result.current.title).toBe("Master volume: muted. Click to bring it back");
    act(() => result.current.toggleMute());
    expect(store.getState().masterVolume).toBe(0.6);
  });

  it("brings back the last audible level after the slider itself was dragged to zero", () => {
    const store = make(0.6);
    const { result } = renderHook(() => useMasterVolume(store));
    act(() => result.current.onChange(0.45));
    act(() => result.current.onChange(0));
    act(() => result.current.toggleMute());
    expect(store.getState().masterVolume).toBe(0.45);
  });

  it("returns to full level when it starts muted", () => {
    const store = make(0);
    const { result } = renderHook(() => useMasterVolume(store));
    act(() => result.current.toggleMute());
    expect(store.getState().masterVolume).toBe(1);
  });
});
