// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { TRANSPOSE_MAX, TRANSPOSE_MIN, useKeyTranspose, type KeyTransposeState } from "./useKeyTranspose";

afterEach(() => vi.restoreAllMocks());

const make = (patch: Partial<KeyTransposeState> = {}) =>
  createFakeStore<KeyTransposeState>({ transpose: 0, isTransposing: false, song: {}, setTranspose: vi.fn(async () => {}), ...patch });

describe("useKeyTranspose", () => {
  it("formats the value with a sign for positive shifts", () => {
    const store = make({ transpose: 3 });
    expect(renderHook(() => useKeyTranspose(store)).result.current.valueText).toBe("+3");
    store.set({ transpose: -2 });
    expect(renderHook(() => useKeyTranspose(store)).result.current.valueText).toBe("-2");
    store.set({ transpose: 0 });
    expect(renderHook(() => useKeyTranspose(store)).result.current.valueText).toBe("0");
  });

  it("is disabled without a song or while a shift is being applied", () => {
    expect(renderHook(() => useKeyTranspose(make({ song: null }))).result.current.disabled).toBe(true);
    expect(renderHook(() => useKeyTranspose(make({ isTransposing: true }))).result.current.disabled).toBe(true);
    expect(renderHook(() => useKeyTranspose(make())).result.current.disabled).toBe(false);
  });

  it("shifts by a semitone and clamps to the allowed range", () => {
    const store = make({ transpose: 5 });
    const { result } = renderHook(() => useKeyTranspose(store));
    act(() => result.current.shift(1));
    act(() => result.current.shift(5));
    expect(store.getState().setTranspose).toHaveBeenNthCalledWith(1, 6);
    expect(store.getState().setTranspose).toHaveBeenNthCalledWith(2, TRANSPOSE_MAX);
    act(() => store.set({ transpose: -5 }));
    act(() => result.current.shift(-9));
    expect(store.getState().setTranspose).toHaveBeenLastCalledWith(TRANSPOSE_MIN);
  });

  it("does nothing when the target equals the current value", () => {
    const store = make({ transpose: 6 });
    const { result } = renderHook(() => useKeyTranspose(store));
    act(() => result.current.shift(1));
    expect(store.getState().setTranspose).not.toHaveBeenCalled();
  });

  it("shows the pending value while transposing and offers Reset only when idle and shifted", async () => {
    let finish!: () => void;
    const setTranspose = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const store = make({ transpose: 2, setTranspose });
    const { result } = renderHook(() => useKeyTranspose(store));
    expect(result.current.showReset).toBe(true);
    act(() => result.current.shift(1));
    act(() => store.set({ isTransposing: true }));
    expect(result.current.displayValue).toBe(3);
    expect(result.current.showReset).toBe(false);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    act(() => store.set({ isTransposing: false, transpose: 3 }));
    expect(result.current.displayValue).toBe(3);
  });

  it("resets to zero", () => {
    const store = make({ transpose: 4 });
    const { result } = renderHook(() => useKeyTranspose(store));
    act(() => result.current.reset());
    expect(store.getState().setTranspose).toHaveBeenCalledWith(0);
  });

  it("logs a failed transpose and recovers", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("sidecar");
    const store = make({ setTranspose: vi.fn(() => Promise.reject(boom)) });
    const { result } = renderHook(() => useKeyTranspose(store));
    await act(async () => {
      result.current.shift(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(error).toHaveBeenCalledWith("[KeyTranspose] setTranspose failed:", boom);
  });
});
