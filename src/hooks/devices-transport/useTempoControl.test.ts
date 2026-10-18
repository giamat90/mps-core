// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";

const m = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("../../audio/metronome", () => ({ metronome: m }));

import { formatDownbeat, useTempoControl, type TempoControlState } from "./useTempoControl";

beforeEach(() => {
  m.start.mockClear();
  m.stop.mockClear();
});

const make = (patch: Partial<TempoControlState> = {}) =>
  createFakeStore<TempoControlState>({
    playbackRate: 1,
    setPlaybackRate: vi.fn(),
    isPlaying: false,
    metronomeOffset: 0,
    setMetronomeOffset: vi.fn(),
    ...patch,
  });

const render = (store = make(), detectedBpm?: number, getCurrentTime = () => 0) =>
  renderHook(() => useTempoControl(store, { detectedBpm, getCurrentTime }));

describe("formatDownbeat", () => {
  it("is m:ss.s", () => {
    expect(formatDownbeat(0)).toBe("0:00.0");
    expect(formatDownbeat(12.5)).toBe("0:12.5");
    expect(formatDownbeat(75.04)).toBe("1:15.0");
  });
});

describe("useTempoControl inputs", () => {
  it("starts from the song's tempo times the speed, and the speed with two decimals", () => {
    const { result } = render(make({ playbackRate: 0.75 }), 90);
    expect(result.current.bpmInput).toBe("68");
    expect(result.current.rateInput).toBe("0.75");
    expect(result.current.bpmMin).toBe(23);
    expect(result.current.bpmMax).toBe(225);
  });

  it("has no tempo input without a detected tempo", () => {
    const { result } = render();
    expect(result.current.bpmInput).toBe("");
    expect(result.current.bpmMin).toBeUndefined();
    act(() => result.current.commitBpm("100"));
    expect(result.current.bpmInput).toBe("");
  });

  it("commits a typed tempo as a speed factor, rounded, and refreshes both inputs", () => {
    const store = make();
    const { result } = render(store, 100);
    act(() => result.current.commitBpm("150"));
    expect(store.getState().setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(result.current.rateInput).toBe("1.50");
    expect(result.current.bpmInput).toBe("150");
  });

  it("clamps a tempo to the speed range", () => {
    const store = make();
    const { result } = render(store, 100);
    act(() => result.current.commitBpm("1000"));
    expect(store.getState().setPlaybackRate).toHaveBeenLastCalledWith(2.5);
    act(() => result.current.commitBpm("1"));
    expect(store.getState().setPlaybackRate).toHaveBeenLastCalledWith(0.25);
  });

  it("puts the current tempo back when the typed one is not a positive number", () => {
    const store = make({ playbackRate: 0.5 });
    const { result } = render(store, 100);
    act(() => result.current.setBpmInput("abc"));
    act(() => result.current.commitBpm("abc"));
    expect(result.current.bpmInput).toBe("50");
    act(() => result.current.commitBpm("-4"));
    expect(result.current.bpmInput).toBe("50");
    expect(store.getState().setPlaybackRate).not.toHaveBeenCalled();
  });

  it("commits a typed speed and updates the tempo input when there is one", () => {
    const store = make();
    const { result } = render(store, 120);
    act(() => result.current.commitRate("0.5"));
    expect(store.getState().setPlaybackRate).toHaveBeenCalledWith(0.5);
    expect(result.current.rateInput).toBe("0.50");
    expect(result.current.bpmInput).toBe("60");
    const none = render(make());
    act(() => none.result.current.commitRate("9"));
    expect(none.result.current.rateInput).toBe("2.50");
    expect(none.result.current.bpmInput).toBe("");
  });

  it("puts the current speed back for a bad speed", () => {
    const store = make({ playbackRate: 1.25 });
    const { result } = render(store);
    act(() => result.current.setRateInput("x"));
    act(() => result.current.commitRate("x"));
    expect(result.current.rateInput).toBe("1.25");
  });

  it("commits on Enter only", () => {
    const store = make();
    const { result } = render(store, 100);
    act(() => result.current.setBpmInput("200"));
    act(() => result.current.onBpmKey("a"));
    expect(store.getState().setPlaybackRate).not.toHaveBeenCalled();
    act(() => result.current.onBpmKey("Enter"));
    expect(store.getState().setPlaybackRate).toHaveBeenCalledWith(2);
    act(() => result.current.setRateInput("0.8"));
    act(() => result.current.onRateKey("Tab"));
    act(() => result.current.onRateKey("Enter"));
    expect(store.getState().setPlaybackRate).toHaveBeenLastCalledWith(0.8);
  });
});

describe("useTempoControl metronome", () => {
  it("stays stopped until enabled and playing", () => {
    const store = make();
    const { result } = render(store, 120);
    expect(m.start).not.toHaveBeenCalled();
    act(() => result.current.toggleMetronome());
    expect(result.current.metronomeEnabled).toBe(true);
    expect(m.start).not.toHaveBeenCalled();
    act(() => store.set({ isPlaying: true }));
    expect(m.start).toHaveBeenCalledTimes(1);
  });

  it("starts phase-locked to the downbeat and retunes when the speed changes", () => {
    const store = make({ isPlaying: true, metronomeOffset: 0.25 });
    const { result } = render(store, 120, () => 1.0);
    act(() => result.current.toggleMetronome());
    const [bpm, untilNext, beat] = m.start.mock.calls[0];
    expect(bpm).toBe(120);
    expect(untilNext).toBeGreaterThanOrEqual(0);
    expect(untilNext).toBeLessThanOrEqual(0.5);
    expect(Number.isInteger(beat)).toBe(true);
    act(() => store.set({ playbackRate: 2 }));
    expect(m.start.mock.calls[m.start.mock.calls.length - 1][0]).toBe(240);
  });

  it("falls back to 120 bpm without a detected tempo", () => {
    const store = make({ isPlaying: true });
    const { result } = render(store);
    act(() => result.current.toggleMetronome());
    expect(m.start.mock.calls[0][0]).toBe(120);
  });

  it("stops when playback stops and on unmount", () => {
    const store = make({ isPlaying: true });
    const { result, unmount } = render(store, 100);
    act(() => result.current.toggleMetronome());
    m.stop.mockClear();
    act(() => store.set({ isPlaying: false }));
    expect(m.stop).toHaveBeenCalled();
    m.stop.mockClear();
    unmount();
    expect(m.stop).toHaveBeenCalled();
  });

  it("sets the downbeat to the playhead and resets it", () => {
    const store = make({ metronomeOffset: 12.5 });
    const { result } = render(store, 100, () => 7.25);
    expect(result.current.downbeatText).toBe("0:12.5");
    expect(result.current.metronomeOffset).toBe(12.5);
    act(() => result.current.setDownbeatToPlayhead());
    expect(store.getState().setMetronomeOffset).toHaveBeenCalledWith(7.25);
    act(() => result.current.resetDownbeat());
    expect(store.getState().setMetronomeOffset).toHaveBeenLastCalledWith(0);
  });
});
