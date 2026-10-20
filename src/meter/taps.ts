import { MAX_PULSES, MIN_PULSE_SECONDS, round3, type Bar } from "./barMap";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Taps closer than this are one tap pressed twice. */
const DOUBLE_TAP_SECONDS = 0.08;

/** Sorted, with a double press dropped. */
export function cleanTaps(taps: readonly number[]): number[] {
  const out: number[] = [];
  for (const t of [...taps].sort((a, b) => a - b)) {
    if (out.length === 0 || t - out[out.length - 1] >= DOUBLE_TAP_SECONDS) out.push(t);
  }
  return out;
}

export interface TapFit {
  /** Seconds between taps. */
  period: number;
  /** Where the grid of that period passes through the first tap, nudged to the best fit. */
  first: number;
  /** How far the taps strayed from the fitted grid, as a share of the period (0 is perfect). */
  scatter: number;
}

/**
 * The steady beat that best explains a run of taps: the median gap sets the period (so a tap that was missed or a
 * late one does not drag it), every tap is given its beat number, and a line through them gives period and phase.
 */
export function fitTaps(raw: readonly number[]): TapFit | null {
  const taps = cleanTaps(raw);
  if (taps.length < 3) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  const rough = median(gaps);
  if (!(rough >= MIN_PULSE_SECONDS)) return null;
  const ks = taps.map((t) => Math.round((t - taps[0]) / rough));
  const n = taps.length;
  const mk = ks.reduce((a, b) => a + b, 0) / n;
  const mt = taps.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (ks[i] - mk) * (taps[i] - mt);
    den += (ks[i] - mk) ** 2;
  }
  if (den === 0) return null;
  const period = num / den;
  const first = mt - period * mk;
  const scatter = median(taps.map((t, i) => Math.abs(t - (first + ks[i] * period)))) / period;
  return { period, first, scatter };
}

export interface TappedBars {
  bars: Bar[];
  /** Where the last bar ends. */
  closing: number;
}

/**
 * Bars from taps on the first beat of each bar, and one more tap where the last bar ends: each tap starts a bar,
 * which gets as many pulses as fit before the next tap at `pulse` seconds each. A bar of seven pulses between
 * two taps comes out as seven.
 */
export function barsFromBarTaps(raw: readonly number[], o: { den: number; pulse: number }): TappedBars | null {
  const taps = cleanTaps(raw);
  if (taps.length < 2) return null;
  const bars: Bar[] = [];
  for (let i = 0; i + 1 < taps.length; i++) {
    const num = Math.max(1, Math.min(MAX_PULSES, Math.round((taps[i + 1] - taps[i]) / o.pulse)));
    bars.push({ start: round3(taps[i]), num, den: o.den });
  }
  return { bars, closing: round3(taps[taps.length - 1]) };
}

/**
 * Bars from taps on every beat: `perBar` taps make a bar of `perBar` pulses, so 7 taps are one bar of 7. A last
 * group with fewer taps still makes a bar, and the last beat lasts as long as the typical gap.
 */
export function barsFromBeatTaps(raw: readonly number[], o: { den: number; perBar: number }): TappedBars | null {
  const taps = cleanTaps(raw);
  if (taps.length < 2 || o.perBar < 1) return null;
  const gap = median(taps.slice(1).map((t, i) => t - taps[i]));
  const bars: Bar[] = [];
  for (let i = 0; i < taps.length; i += o.perBar) {
    bars.push({ start: round3(taps[i]), num: Math.min(o.perBar, taps.length - i), den: o.den });
  }
  return { bars, closing: round3(taps[taps.length - 1] + gap) };
}
