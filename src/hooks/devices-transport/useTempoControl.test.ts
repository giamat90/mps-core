// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";

const m = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), startSequence: vi.fn() }));
vi.mock("../../audio/metronome", () => ({ metronome: m }));

import { formatDownbeat, useTempoControl, type TempoControlState, type TempoControlOptions } from "./useTempoControl";
import type { BarMap } from "../../meter";

beforeEach(() => {
  m.start.mockClear();
  m.stop.mockClear();
  m.startSequence.mockClear();
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

describe("useTempoControl following a bar map", () => {
  const meterMap: BarMap = { version: 1, bars: [{ start: 0, num: 4, den: 4 }, { start: 2, num: 7, den: 8 }], end: 3.4, source: "edited" };
  const withMap = (store: ReturnType<typeof make>, over: Partial<TempoControlOptions> = {}, time = () => 0) =>
    renderHook(() => useTempoControl(store, { detectedBpm: 120, getCurrentTime: time, meterMap, ...over }));

  it("starts the click on the map's pulses instead of a steady tempo", () => {
    const store = make({ isPlaying: true });
    const { result } = withMap(store);
    act(() => result.current.toggleMetronome());
    expect(m.start).not.toHaveBeenCalled();
    expect(m.startSequence).toHaveBeenCalledTimes(1);
    const [first, next] = m.startSequence.mock.calls[0];
    expect(first).toEqual({ wait: 0, level: 0 });
    expect(next()).toEqual({ wait: 0.5, level: 2 });
  });

  it("starts from where the playhead is, at the song's speed", () => {
    const store = make({ isPlaying: true, playbackRate: 0.5 });
    const { result } = withMap(store, {}, () => 1.2);
    act(() => result.current.toggleMetronome());
    const [first] = m.startSequence.mock.calls[0];
    expect(first.wait).toBeCloseTo(0.6, 6);
  });

  it("clicks only the groups when asked", () => {
    const store = make({ isPlaying: true });
    const { result } = withMap(store, { clickDensity: "bars" });
    act(() => result.current.toggleMetronome());
    const [, next] = m.startSequence.mock.calls[0];
    expect(next()).toEqual({ wait: 2, level: 0 });
  });

  it("starts again when the map is edited", () => {
    const store = make({ isPlaying: true });
    let current = meterMap;
    const { result, rerender } = renderHook(() => useTempoControl(store, { detectedBpm: 120, getCurrentTime: () => 0, meterMap: current }));
    act(() => result.current.toggleMetronome());
    current = { ...meterMap, bars: [{ start: 0, num: 3, den: 4 }] };
    rerender();
    expect(m.startSequence).toHaveBeenCalledTimes(2);
  });

  it("stops when the map has nothing left to click", () => {
    const store = make({ isPlaying: true });
    const { result } = withMap(store, {}, () => 99);
    act(() => result.current.toggleMetronome());
    expect(m.startSequence).not.toHaveBeenCalled();
    expect(m.stop).toHaveBeenCalled();
  });
});
