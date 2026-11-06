// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createActivityStore, type ActivityHandle } from "../../activity";
import { useActivity } from "./useActivity";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useActivity", () => {
  it("is hidden when idle", () => {
    const { result } = renderHook(() => useActivity(createActivityStore()));
    expect(result.current.visible).toBe(false);
  });

  it("stays hidden for work shorter than the delay", () => {
    const store = createActivityStore();
    const { result } = renderHook(() => useActivity(store, { showAfterMs: 300 }));
    let h!: ActivityHandle;
    act(() => void (h = store.getState().begin("Quick")));
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.visible).toBe(false);
    act(() => h.end());
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.visible).toBe(false);
  });

  it("shows after the delay with the label and progress", () => {
    const store = createActivityStore();
    const { result } = renderHook(() => useActivity(store, { showAfterMs: 300 }));
    let h!: ActivityHandle;
    act(() => void (h = store.getState().begin("Exporting")));
    act(() => void vi.advanceTimersByTime(300));
    expect(result.current).toMatchObject({ visible: true, label: "Exporting", progress: null, others: 0 });
    act(() => h.setProgress(0.5));
    expect(result.current.progress).toBe(0.5);
  });

  it("lingers for the minimum time, keeping the last label", () => {
    const store = createActivityStore();
    const { result } = renderHook(() => useActivity(store, { showAfterMs: 100, minShownMs: 600 }));
    let h!: ActivityHandle;
    act(() => void (h = store.getState().begin("Transposing")));
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.visible).toBe(true);
    act(() => void vi.advanceTimersByTime(200));
    act(() => h.end());
    expect(result.current.visible).toBe(true);
    expect(result.current.label).toBe("Transposing");
    act(() => void vi.advanceTimersByTime(399));
    expect(result.current.visible).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it("counts other running tasks", () => {
    const store = createActivityStore();
    const { result } = renderHook(() => useActivity(store, { showAfterMs: 0 }));
    act(() => {
      store.getState().begin("A");
      store.getState().begin("B");
    });
    act(() => void vi.advanceTimersByTime(0));
    expect(result.current.others).toBe(1);
  });

  it("restarts the delay when one task ends and another begins", () => {
    const store = createActivityStore();
    const { result } = renderHook(() => useActivity(store, { showAfterMs: 300 }));
    let a!: ActivityHandle;
    act(() => void (a = store.getState().begin("A")));
    act(() => void vi.advanceTimersByTime(250));
    act(() => a.end());
    act(() => void store.getState().begin("B"));
    act(() => void vi.advanceTimersByTime(250));
    expect(result.current.visible).toBe(false);
  });
});
