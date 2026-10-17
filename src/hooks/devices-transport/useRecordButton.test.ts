// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useRecordButton, type RecordButtonState } from "./useRecordButton";

afterEach(() => vi.restoreAllMocks());

const make = (patch: Partial<RecordButtonState> = {}) =>
  createFakeStore<RecordButtonState>({
    isRecording: false,
    isSavingTake: false,
    isCountingIn: false,
    countInBars: 0,
    countInBeatsRemaining: 0,
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => {}),
    cancelCountIn: vi.fn(),
    setCountInBars: vi.fn(),
    ...patch,
  });

describe("useRecordButton labels", () => {
  it("describes the count-in setting", () => {
    const off = renderHook(() => useRecordButton(make())).result.current;
    expect(off.countInText).toBe("⏱");
    expect(off.countInLabel).toBe("Count-in off");
    expect(off.countInTitle).toBe("Count-in: off — click to enable a click count-off before recording");
    const one = renderHook(() => useRecordButton(make({ countInBars: 1 }))).result.current;
    expect(one.countInText).toBe("⏱1");
    expect(one.countInLabel).toBe("Count-in 1 bar");
    const two = renderHook(() => useRecordButton(make({ countInBars: 2 }))).result.current;
    expect(two.countInLabel).toBe("Count-in 2 bars");
    expect(two.countInTitle).toBe("Count-in: 2 bars of click before recording starts (click to change)");
  });

  it("names the record action after the state", () => {
    expect(renderHook(() => useRecordButton(make())).result.current.recordLabel).toBe("Record");
    expect(renderHook(() => useRecordButton(make({ isRecording: true }))).result.current.recordLabel).toBe("Stop recording");
    expect(renderHook(() => useRecordButton(make({ isCountingIn: true }))).result.current.recordLabel).toBe("Cancel count-in");
  });

  it("locks the count-in button while recording, counting in or saving", () => {
    expect(renderHook(() => useRecordButton(make())).result.current.countInDisabled).toBe(false);
    for (const patch of [{ isRecording: true }, { isCountingIn: true }, { isSavingTake: true }]) {
      expect(renderHook(() => useRecordButton(make(patch))).result.current.countInDisabled).toBe(true);
    }
  });
});

describe("useRecordButton actions", () => {
  it("cycles the count-in 0, 1, 2 and back", () => {
    const store = make({ countInBars: 2 });
    const { result } = renderHook(() => useRecordButton(store));
    act(() => result.current.onCountInClick());
    expect(store.getState().setCountInBars).toHaveBeenLastCalledWith(0);
    act(() => store.set({ countInBars: 0 }));
    act(() => result.current.onCountInClick());
    expect(store.getState().setCountInBars).toHaveBeenLastCalledWith(1);
    act(() => store.set({ countInBars: 1 }));
    act(() => result.current.onCountInClick());
    expect(store.getState().setCountInBars).toHaveBeenLastCalledWith(2);
  });

  it("starts, stops or cancels depending on the state", async () => {
    const store = make();
    const { result } = renderHook(() => useRecordButton(store));
    await act(() => result.current.onRecordClick());
    expect(store.getState().startRecording).toHaveBeenCalledTimes(1);
    act(() => store.set({ isRecording: true }));
    await act(() => result.current.onRecordClick());
    expect(store.getState().stopRecording).toHaveBeenCalledTimes(1);
    act(() => store.set({ isRecording: false, isCountingIn: true }));
    await act(() => result.current.onRecordClick());
    expect(store.getState().cancelCountIn).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure's message, logs it, and clears it on the next click", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const startRecording = vi.fn().mockRejectedValueOnce(new Error("No microphone")).mockResolvedValueOnce(undefined);
    const store = make({ startRecording });
    const { result } = renderHook(() => useRecordButton(store));
    await act(() => result.current.onRecordClick());
    expect(result.current.error).toBe("No microphone");
    expect(error).toHaveBeenCalled();
    await act(() => result.current.onRecordClick());
    expect(result.current.error).toBeNull();
  });

  it("uses a generic message for a failure that is not an Error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = make({ startRecording: vi.fn(() => Promise.reject("boom")) });
    const { result } = renderHook(() => useRecordButton(store));
    await act(() => result.current.onRecordClick());
    expect(result.current.error).toBe("Recording failed");
  });
});
