// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useLoopToggle, type LoopToggleState } from "./useLoopToggle";

const make = (patch: Partial<LoopToggleState> = {}) =>
  createFakeStore<LoopToggleState>({ punchIn: null, punchOut: null, punchLoop: false, isRecording: false, setPunchLoop: vi.fn(), ...patch });

describe("useLoopToggle", () => {
  it("needs a punch region and says so", () => {
    const { result } = renderHook(() => useLoopToggle(make()));
    expect(result.current.disabled).toBe(true);
    expect(result.current.title).toBe("Set a punch region first");
    expect(renderHook(() => useLoopToggle(make({ punchIn: 1 }))).result.current.disabled).toBe(true);
  });

  it("is available with a region, and off while recording", () => {
    const store = make({ punchIn: 1, punchOut: 4 });
    const { result } = renderHook(() => useLoopToggle(store));
    expect(result.current.disabled).toBe(false);
    expect(result.current.title).toBe("Loop region");
    act(() => store.set({ isRecording: true }));
    expect(result.current.disabled).toBe(true);
  });

  it("toggles the loop and names the action", () => {
    const store = make({ punchIn: 1, punchOut: 4 });
    const { result } = renderHook(() => useLoopToggle(store));
    act(() => result.current.toggle());
    expect(store.getState().setPunchLoop).toHaveBeenCalledWith(true);
    act(() => store.set({ punchLoop: true }));
    expect(result.current.active).toBe(true);
    expect(result.current.title).toBe("Disable loop");
    act(() => result.current.toggle());
    expect(store.getState().setPunchLoop).toHaveBeenLastCalledWith(false);
  });
});
