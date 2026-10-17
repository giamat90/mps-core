// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { formatClock, useTransportControls, type TransportControlsState } from "./useTransportControls";

const make = (patch: Partial<TransportControlsState> = {}) =>
  createFakeStore<TransportControlsState>({
    isPlaying: false,
    currentTime: 65.4,
    duration: 200,
    togglePlay: vi.fn(),
    stop: vi.fn(),
    stopRecording: vi.fn(async () => {}),
    isRecording: false,
    skipToStart: vi.fn(),
    skipToEnd: vi.fn(),
    ...patch,
  });

describe("formatClock", () => {
  it("is m:ss, minutes unbounded", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65.9)).toBe("1:05");
    expect(formatClock(3599)).toBe("59:59");
    expect(formatClock(3601)).toBe("60:01");
  });
});

describe("useTransportControls", () => {
  it("reports the position and names the play button after the state", () => {
    const store = make();
    const { result } = renderHook(() => useTransportControls(store, { stopEndsRecording: true }));
    expect(result.current.currentText).toBe("1:05");
    expect(result.current.durationText).toBe("3:20");
    expect(result.current.playLabel).toBe("Play");
    act(() => store.set({ isPlaying: true, currentTime: 70 }));
    expect(result.current.playLabel).toBe("Pause");
    expect(result.current.currentText).toBe("1:10");
  });

  it("passes the plain actions through", () => {
    const store = make();
    const { result } = renderHook(() => useTransportControls(store, { stopEndsRecording: true }));
    result.current.togglePlay();
    result.current.skipToStart();
    result.current.skipToEnd();
    expect(store.getState().togglePlay).toHaveBeenCalledTimes(1);
    expect(store.getState().skipToStart).toHaveBeenCalledTimes(1);
    expect(store.getState().skipToEnd).toHaveBeenCalledTimes(1);
  });

  it("stops playback when not recording", () => {
    const store = make();
    const { result } = renderHook(() => useTransportControls(store, { stopEndsRecording: true }));
    result.current.onStop();
    expect(store.getState().stop).toHaveBeenCalledTimes(1);
    expect(store.getState().stopRecording).not.toHaveBeenCalled();
  });

  it("ends the recording instead when asked to and recording", () => {
    const store = make({ isRecording: true });
    const { result } = renderHook(() => useTransportControls(store, { stopEndsRecording: true }));
    expect(result.current.isRecording).toBe(true);
    result.current.onStop();
    expect(store.getState().stopRecording).toHaveBeenCalledTimes(1);
    expect(store.getState().stop).not.toHaveBeenCalled();
  });

  it("is the plain stop action where Stop does not end recordings", () => {
    const store = make({ isRecording: true });
    const { result } = renderHook(() => useTransportControls(store, { stopEndsRecording: false }));
    result.current.onStop();
    expect(store.getState().stop).toHaveBeenCalledTimes(1);
    expect(store.getState().stopRecording).not.toHaveBeenCalled();
  });
});
