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
    countInFor: null,
    countInBeatsRemaining: 0,
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => {}),
    cancelCountIn: vi.fn(),
    ...patch,
  });

describe("useRecordButton labels", () => {
  it("names the record action after the state", () => {
    expect(renderHook(() => useRecordButton(make())).result.current.recordLabel).toBe("Record");
    expect(renderHook(() => useRecordButton(make({ isRecording: true }))).result.current.recordLabel).toBe("Stop recording");
    expect(renderHook(() => useRecordButton(make({ isCountingIn: true, countInFor: "record" }))).result.current.recordLabel).toBe(
      "Cancel count-in",
    );
  });

  it("owns the count-in of a recording or a monitor, not the one before Play", () => {
    for (const countInFor of ["record", "monitor"] as const) {
      const rec = renderHook(() => useRecordButton(make({ isCountingIn: true, countInFor, countInBeatsRemaining: 2 }))).result.current;
      expect(rec).toMatchObject({ isCountingIn: true, countInBeatsRemaining: 2 });
    }
    const play = renderHook(() => useRecordButton(make({ isCountingIn: true, countInFor: "play" }))).result.current;
    expect(play).toMatchObject({ isCountingIn: false, recordLabel: "Record" });
  });
});

describe("useRecordButton actions", () => {
  it("starts, stops or cancels depending on the state", async () => {
    const store = make();
    const { result } = renderHook(() => useRecordButton(store));
    await act(() => result.current.onRecordClick());
    expect(store.getState().startRecording).toHaveBeenCalledTimes(1);
    act(() => store.set({ isRecording: true }));
    await act(() => result.current.onRecordClick());
    expect(store.getState().stopRecording).toHaveBeenCalledTimes(1);
    act(() => store.set({ isRecording: false, isCountingIn: true, countInFor: "record" }));
    await act(() => result.current.onRecordClick());
    expect(store.getState().cancelCountIn).toHaveBeenCalledTimes(1);
  });

  it("starts a recording over a count-in before Play instead of cancelling it", async () => {
    const store = make({ isCountingIn: true, countInFor: "play" });
    const { result } = renderHook(() => useRecordButton(store));
    await act(() => result.current.onRecordClick());
    expect(store.getState().startRecording).toHaveBeenCalledTimes(1);
    expect(store.getState().cancelCountIn).not.toHaveBeenCalled();
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
