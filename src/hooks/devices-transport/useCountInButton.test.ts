// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useCountInButton, type CountInButtonState } from "./useCountInButton";

const make = (patch: Partial<CountInButtonState> = {}) =>
  createFakeStore<CountInButtonState>({
    isRecording: false,
    isSavingTake: false,
    isCountingIn: false,
    countInBars: 0,
    setCountInBars: vi.fn(),
    ...patch,
  });

describe("useCountInButton", () => {
  it("describes the count-in setting", () => {
    const off = renderHook(() => useCountInButton(make())).result.current;
    expect(off.text).toBe("⏱");
    expect(off.label).toBe("Count-in off");
    expect(off.title).toBe("Count-in: off — click to enable a click count-off before playing or recording");
    const one = renderHook(() => useCountInButton(make({ countInBars: 1 }))).result.current;
    expect(one.text).toBe("⏱1");
    expect(one.label).toBe("Count-in 1 bar");
    const two = renderHook(() => useCountInButton(make({ countInBars: 2 }))).result.current;
    expect(two.label).toBe("Count-in 2 bars");
    expect(two.title).toBe("Count-in: 2 bars of click before playing or recording starts (click to change)");
  });

  it("locks while recording, counting in or saving", () => {
    expect(renderHook(() => useCountInButton(make())).result.current.disabled).toBe(false);
    for (const patch of [{ isRecording: true }, { isCountingIn: true }, { isSavingTake: true }]) {
      expect(renderHook(() => useCountInButton(make(patch))).result.current.disabled).toBe(true);
    }
  });

  it("cycles the count-in 0, 1, 2 and back", () => {
    const store = make({ countInBars: 2 });
    const { result } = renderHook(() => useCountInButton(store));
    act(() => result.current.onClick());
    expect(store.getState().setCountInBars).toHaveBeenLastCalledWith(0);
    act(() => store.set({ countInBars: 0 }));
    act(() => result.current.onClick());
    expect(store.getState().setCountInBars).toHaveBeenLastCalledWith(1);
    act(() => store.set({ countInBars: 1 }));
    act(() => result.current.onClick());
    expect(store.getState().setCountInBars).toHaveBeenLastCalledWith(2);
  });
});
