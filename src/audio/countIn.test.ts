import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  COUNT_IN_LEAD_S,
  countInBpm,
  createCountInSlice,
  steadyCountIn,
  type CountInClick,
  type CountInPlan,
  type CountInSlice,
  type CountInState,
} from "./countIn";

describe("countInBpm", () => {
  it("scales the detected tempo by the playback rate", () => {
    expect(countInBpm(120, 0.5)).toBe(60);
    expect(countInBpm(90, 1)).toBe(90);
  });

  it("falls back to 120 when the song has no detected tempo", () => {
    expect(countInBpm(undefined, 1)).toBe(120);
    expect(countInBpm(undefined, 2)).toBe(240);
  });
});

describe("steadyCountIn", () => {
  it("counts four beats a bar and ends after the bars' duration", () => {
    const plan = steadyCountIn(120, 1);
    expect(plan.beats).toBe(4);
    expect(plan.stepsMs).toEqual([500, 1000, 1500]);
    expect(plan.totalMs).toBe(2000);
  });

  it("two bars at 60 bpm", () => {
    const plan = steadyCountIn(60, 2);
    expect(plan.beats).toBe(8);
    expect(plan.stepsMs).toHaveLength(7);
    expect(plan.totalMs).toBe(8000);
  });

  it("starts the click a moment after the start, on the downbeat", () => {
    const click = fakeClick();
    steadyCountIn(100, 1).begin(click);
    expect(click.start).toHaveBeenCalledWith(100, COUNT_IN_LEAD_S, 0);
  });
});

function fakeClick() {
  return { start: vi.fn<CountInClick["start"]>(), startSequence: vi.fn<CountInClick["startSequence"]>(), stop: vi.fn<CountInClick["stop"]>() };
}

interface Host {
  state: CountInState & { isRecording: boolean };
  slice: CountInSlice;
  click: ReturnType<typeof fakeClick>;
}

function host(isRecording = false): Host {
  const click = fakeClick();
  const state = { isRecording, countInBars: 0, isCountingIn: false, countInBeatsRemaining: 0, countInFor: null } as Host["state"];
  const slice = createCountInSlice(
    (patch) => Object.assign(state, patch),
    () => state,
    click,
  );
  Object.assign(state, slice);
  return { state, slice, click };
}

describe("createCountInSlice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle with the count-in off", () => {
    expect(host().slice).toMatchObject({ countInBars: 0, isCountingIn: false, countInBeatsRemaining: 0, countInFor: null });
  });

  it("clicks, counts the beats down and resolves true when the count ends", async () => {
    const { state, slice, click } = host();
    const done = vi.fn();
    const pending = slice.runCountIn(steadyCountIn(120, 1), "play").then(done);
    expect(state).toMatchObject({ isCountingIn: true, countInBeatsRemaining: 4, countInFor: "play" });
    expect(click.start).toHaveBeenCalledWith(120, COUNT_IN_LEAD_S, 0);

    await vi.advanceTimersByTimeAsync(499);
    expect(state.countInBeatsRemaining).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.countInBeatsRemaining).toBe(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.countInBeatsRemaining).toBe(1);
    expect(done).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(done).toHaveBeenCalledWith(true);
    expect(click.stop).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ isCountingIn: false, countInBeatsRemaining: 0, countInFor: null });
  });

  it("cancelling stops the click, resolves false and never finishes the count", async () => {
    const { state, slice, click } = host();
    const pending = slice.runCountIn(steadyCountIn(120, 1), "record");
    await vi.advanceTimersByTimeAsync(700);
    slice.cancelCountIn();
    expect(await pending).toBe(false);
    expect(click.stop).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ isCountingIn: false, countInBeatsRemaining: 0, countInFor: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(click.stop).toHaveBeenCalledTimes(1);
    expect(state.countInBeatsRemaining).toBe(0);
  });

  it("cancelling with nothing running does nothing", () => {
    const { slice, click } = host();
    slice.cancelCountIn();
    expect(click.stop).not.toHaveBeenCalled();
  });

  it("a second count cancels the first and takes over the display", async () => {
    const { state, slice } = host();
    const first = slice.runCountIn(steadyCountIn(120, 1), "play");
    await vi.advanceTimersByTimeAsync(600);
    const second = slice.runCountIn(steadyCountIn(60, 1), "record");
    expect(await first).toBe(false);
    expect(state).toMatchObject({ isCountingIn: true, countInBeatsRemaining: 4, countInFor: "record" });

    await vi.advanceTimersByTimeAsync(4000);
    expect(await second).toBe(true);
    expect(state.isCountingIn).toBe(false);
  });

  it("follows the steps of a plan that is not steady", async () => {
    const { state, slice, click } = host();
    const plan: CountInPlan = { begin: (c) => c.startSequence({ wait: 0.05, level: "accent" } as never, () => null), beats: 3, stepsMs: [100, 900], totalMs: 1000 };
    const pending = slice.runCountIn(plan, "monitor");
    expect(click.startSequence).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(state.countInBeatsRemaining).toBe(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(state.countInBeatsRemaining).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBe(true);
  });

  describe("setCountInBars", () => {
    it("sets the bars", () => {
      const { state, slice } = host();
      slice.setCountInBars(2);
      expect(state.countInBars).toBe(2);
    });

    it("is refused while counting in", () => {
      const { state, slice } = host();
      slice.setCountInBars(1);
      void slice.runCountIn(steadyCountIn(120, 1), "play");
      slice.setCountInBars(2);
      expect(state.countInBars).toBe(1);
    });

    it("is refused while recording", () => {
      const { state, slice } = host(true);
      slice.setCountInBars(1);
      expect(state.countInBars).toBe(0);
    });
  });
});
