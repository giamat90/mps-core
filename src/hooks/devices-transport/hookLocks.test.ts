// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useTransportControls, type TransportControlsState } from "./useTransportControls";
import { useRecordButton, type RecordButtonState } from "./useRecordButton";
import { useExportMix } from "./useExportMix";
import { useDownloadAll, type TakeFile } from "./useDownloadAll";
import type { BusyState } from "../../locks";

const transport = (patch: Partial<TransportControlsState> = {}) =>
  createFakeStore<TransportControlsState>({
    isPlaying: false,
    currentTime: 0,
    duration: 100,
    togglePlay: vi.fn(),
    stop: vi.fn(),
    stopRecording: vi.fn(async () => {}),
    isRecording: false,
    isCountingIn: false,
    countInFor: null,
    countInBeatsRemaining: 0,
    skipToStart: vi.fn(),
    skipToEnd: vi.fn(),
    ...patch,
  });

const recorder = (patch: Partial<RecordButtonState> = {}) =>
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

describe("transport lock", () => {
  it("names the reason while the song loads or is transposed, and is free otherwise", () => {
    expect(renderHook(() => useTransportControls(transport(), { stopEndsRecording: true })).result.current.lockReason).toBeNull();
    const loading = renderHook(() => useTransportControls(transport({ isLoadingSong: true }), { stopEndsRecording: true }));
    expect(loading.result.current.lockReason).toBe("The song is still loading");
    const shifting = renderHook(() => useTransportControls(transport({ isTransposing: true }), { stopEndsRecording: true }));
    expect(shifting.result.current.lockReason).toBe("Wait for the transpose to finish");
  });
});

describe("record lock", () => {
  it("refuses to start while transposing or analyzing, and says why", async () => {
    const store = recorder({ isTransposing: true });
    const { result } = renderHook(() => useRecordButton(store));
    expect(result.current.lockReason).toBe("Wait for the transpose to finish");
    await act(async () => result.current.onRecordClick());
    expect(store.getState().startRecording).not.toHaveBeenCalled();

    act(() => store.set({ isTransposing: false, isSavingTake: true }));
    expect(result.current.lockReason).toBe("Wait for the take to finish analyzing");
  });

  it("never locks stopping a recording or cancelling a count-in", async () => {
    const rec = recorder({ isRecording: true, isSavingTake: true });
    const { result } = renderHook(() => useRecordButton(rec));
    expect(result.current.lockReason).toBeNull();
    await act(async () => result.current.onRecordClick());
    expect(rec.getState().stopRecording).toHaveBeenCalledTimes(1);

    const counting = recorder({ isCountingIn: true, countInFor: "record", isTransposing: true });
    const c = renderHook(() => useRecordButton(counting));
    expect(c.result.current.lockReason).toBeNull();
    await act(async () => c.result.current.onRecordClick());
    expect(counting.getState().cancelCountIn).toHaveBeenCalledTimes(1);
  });

  it("starts when nothing runs", async () => {
    const store = recorder();
    const { result } = renderHook(() => useRecordButton(store));
    await act(async () => result.current.onRecordClick());
    expect(store.getState().startRecording).toHaveBeenCalledTimes(1);
  });
});

describe("export locks", () => {
  interface S extends BusyState {
    song: { title: string } | null;
  }

  it("Export Mix refuses to start while the tracks are swapped and names the reason", async () => {
    const store = createFakeStore<S>({ song: { title: "A" }, isTransposing: true });
    const exportMix = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useExportMix({ store, watch: [], buildMixSources: () => ({ sources: ["a"], startSec: 0, endSec: 1 }), exportMix }),
    );
    expect(result.current.lockReason).toBe("Wait for the transpose to finish");
    await act(async () => result.current.onExport());
    expect(exportMix).not.toHaveBeenCalled();

    act(() => store.set({ isTransposing: false }));
    expect(result.current.lockReason).toBeNull();
    await act(async () => result.current.onExport());
    expect(exportMix).toHaveBeenCalledTimes(1);
  });

  it("Download All waits for a take that is still being added, and for a transpose", async () => {
    const store = createFakeStore<{ takes: readonly TakeFile[] } & BusyState>({ takes: [], isSavingTake: true });
    const exportAll = vi.fn(async () => {});
    const song = { directory: "d", title: "T" };
    const { result } = renderHook(() => useDownloadAll({ store, song, trackEntries: () => [], exportAll }));
    expect(result.current.lockReason).toBe("Wait for the take to finish analyzing");
    await act(async () => result.current.onDownload());
    expect(exportAll).not.toHaveBeenCalled();

    act(() => store.set({ isSavingTake: false, isTransposing: true }));
    expect(result.current.lockReason).toBe("Wait for the transpose to finish");

    act(() => store.set({ isTransposing: false }));
    await act(async () => result.current.onDownload());
    expect(exportAll).toHaveBeenCalledTimes(1);
  });
});
