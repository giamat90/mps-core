import { countInDurationSeconds } from "../lib/metronomeSync";
import { metronome } from "./metronome";

export type CountInBars = 0 | 1 | 2;

/** What the count-in is for: the Record button owns the label of "record" and "monitor", the Play button that of "play". */
export type CountInPurpose = "play" | "record" | "monitor";

/** The click a count-in plays: the shared metronome, or a stand-in in a test. */
export type CountInClick = Pick<typeof metronome, "start" | "startSequence" | "stop">;

/** The first click lands this long (seconds) after the count starts. */
export const COUNT_IN_LEAD_S = 0.05;

const BEATS_PER_BAR = 4;
const FALLBACK_BPM = 120;

export interface CountInPlan {
  /** Starts the click. The count stops it when it ends or is cancelled. */
  begin: (click: CountInClick) => void;
  /** Beats shown at the start. */
  beats: number;
  /** Wall-clock ms after the start at which the shown number drops by one (`beats - 1` entries). */
  stepsMs: number[];
  /** Wall-clock ms after the start at which the count is over. */
  totalMs: number;
}

/** The tempo the singer hears: the detected tempo scaled by the playback rate. */
export function countInBpm(detectedBpm: number | undefined, playbackRate: number): number {
  return (detectedBpm ?? FALLBACK_BPM) * playbackRate;
}

/** `bars` bars of four steady beats at `bpm`. */
export function steadyCountIn(bpm: number, bars: number): CountInPlan {
  const beats = bars * BEATS_PER_BAR;
  const beatMs = (60 / bpm) * 1000;
  return {
    begin: (click) => click.start(bpm, COUNT_IN_LEAD_S, 0),
    beats,
    stepsMs: Array.from({ length: Math.max(0, beats - 1) }, (_, i) => (i + 1) * beatMs),
    totalMs: countInDurationSeconds(bpm, bars) * 1000,
  };
}

export interface CountInState {
  countInBars: CountInBars;
  isCountingIn: boolean;
  countInBeatsRemaining: number;
  countInFor: CountInPurpose | null;
}

export interface CountInSlice extends CountInState {
  /** Resolves true when the count finished, false when it was cancelled or replaced by another one. */
  runCountIn: (plan: CountInPlan, purpose: CountInPurpose) => Promise<boolean>;
  cancelCountIn: () => void;
  setCountInBars: (bars: CountInBars) => void;
}

const IDLE: Pick<CountInState, "isCountingIn" | "countInBeatsRemaining" | "countInFor"> = {
  isCountingIn: false,
  countInBeatsRemaining: 0,
  countInFor: null,
};

/**
 * The count-in of an app's player store, as a zustand slice creator. The timers live in the closure, so the
 * action that cancels reaches the promise the action that started it is awaiting. One count at a time: starting
 * a second cancels the first.
 */
export function createCountInSlice(
  set: (patch: Partial<CountInState>) => void,
  get: () => CountInState & { isRecording: boolean },
  click: CountInClick = metronome,
): CountInSlice {
  let timers: ReturnType<typeof setTimeout>[] = [];
  let resolveRunning: ((completed: boolean) => void) | null = null;

  const settle = (completed: boolean): void => {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
    click.stop();
    set(IDLE);
    const resolve = resolveRunning;
    resolveRunning = null;
    resolve?.(completed);
  };

  const cancelCountIn = (): void => {
    if (resolveRunning !== null) settle(false);
  };

  return {
    countInBars: 0,
    ...IDLE,

    runCountIn: (plan, purpose) => {
      cancelCountIn();
      return new Promise<boolean>((resolve) => {
        resolveRunning = resolve;
        set({ isCountingIn: true, countInBeatsRemaining: plan.beats, countInFor: purpose });
        plan.begin(click);
        plan.stepsMs.forEach((ms, i) => {
          timers.push(setTimeout(() => set({ countInBeatsRemaining: plan.beats - 1 - i }), ms));
        });
        timers.push(setTimeout(() => settle(true), plan.totalMs));
      });
    },

    cancelCountIn,

    setCountInBars: (bars) => {
      if (get().isCountingIn || get().isRecording) return;
      set({ countInBars: bars });
    },
  };
}
