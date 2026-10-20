/** The notes that can be one pulse: the bottom of a time signature. */
export const UNITS = [1, 2, 4, 8, 16, 32] as const;
/** The most pulses one bar can have. */
export const MAX_PULSES = 32;
/** A pulse shorter than this could not be heard as a click or told apart on screen. */
export const MIN_PULSE_SECONDS = 0.05;

export type MeterSource = "detected" | "grid" | "tapped" | "edited";

export interface Bar {
  /** Song time (s) the bar starts; it lasts until the next bar starts. */
  start: number;
  /** Pulses in the bar: the top of the time signature, spaced evenly over the bar. */
  num: number;
  /** The note that is one pulse: the bottom of the time signature. */
  den: number;
  /** How the pulses split into accented groups, summing to `num`; absent means the usual split. */
  groups?: number[];
}

export interface BarMap {
  version: 1;
  /** In time order. Before the first bar the song has no bars (an intro or a count-in). */
  bars: Bar[];
  /** Where the last bar ends: the song's length. */
  end: number;
  source: MeterSource;
  /** 0 to 1, how sure the detector was; absent for anything a person made. */
  confidence?: number;
}

/** 0 is the first pulse of a bar, 1 the first of another group in it, 2 any other pulse. */
export type PulseLevel = 0 | 1 | 2;

export interface Pulse {
  time: number;
  bar: number;
  /** Position in the bar, from 0. */
  beat: number;
  level: PulseLevel;
}

export const round3 = (t: number) => Math.round(t * 1000) / 1000;

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * The usual accents of a signature: threes with a two (or two twos) to make up the rest, so 5 is 3+2 and
 * 7 is 3+2+2, and 6/8, 9/8, 12/8 are all threes. Up to four pulses stay one group.
 */
export function defaultGroups(num: number): number[] {
  if (num <= 4) return [num];
  if (num % 3 === 0) return Array<number>(num / 3).fill(3);
  const rest = num % 3;
  return [...Array<number>(Math.floor(num / 3) - (rest === 1 ? 1 : 0)).fill(3), ...(rest === 1 ? [2, 2] : [2])];
}

export function barGroups(bar: Bar): number[] {
  return bar.groups && bar.groups.length > 0 && sum(bar.groups) === bar.num ? bar.groups : defaultGroups(bar.num);
}

export function barEnd(map: BarMap, index: number): number {
  return index + 1 < map.bars.length ? map.bars[index + 1].start : map.end;
}

export function barSeconds(map: BarMap, index: number): number {
  return barEnd(map, index) - map.bars[index].start;
}

export function pulseSeconds(map: BarMap, index: number): number {
  return barSeconds(map, index) / map.bars[index].num;
}

/** Pulses per minute in the bar, counting the bar's own unit note. */
export function unitBpm(map: BarMap, index: number): number {
  return 60 / pulseSeconds(map, index);
}

/** The bar playing at `time`, or -1 before the first bar or after the last. */
export function barIndexAt(map: BarMap, time: number): number {
  const { bars } = map;
  if (bars.length === 0 || time < bars[0].start || time >= map.end) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].start <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The accent of each pulse of a bar. */
export function pulseLevels(bar: Bar): PulseLevel[] {
  const levels: PulseLevel[] = [];
  barGroups(bar).forEach((g, gi) => {
    for (let k = 0; k < g; k++) levels.push(k > 0 ? 2 : gi === 0 ? 0 : 1);
  });
  return levels;
}

export function pulseTimes(map: BarMap, index: number): number[] {
  const bar = map.bars[index];
  const step = pulseSeconds(map, index);
  return Array.from({ length: bar.num }, (_, k) => bar.start + k * step);
}

/** Every pulse from `from` up to, not including, `to`. */
export function pulsesBetween(map: BarMap, from: number, to: number): Pulse[] {
  const out: Pulse[] = [];
  if (map.bars.length === 0 || !(to > from)) return out;
  let i = Math.max(0, barIndexAt(map, from));
  if (from < map.bars[0].start) i = 0;
  for (; i < map.bars.length && map.bars[i].start < to; i++) {
    const times = pulseTimes(map, i);
    const levels = pulseLevels(map.bars[i]);
    for (let k = 0; k < times.length; k++) {
      if (times[k] >= to) break;
      if (times[k] >= from) out.push({ time: times[k], bar: i, beat: k, level: levels[k] });
    }
  }
  return out;
}

/** The first pulse at or after `time`, or null once the bars have run out. */
export function nextPulse(map: BarMap, time: number): Pulse | null {
  const first = pulsesBetween(map, time, Math.min(map.end, time + 120))[0];
  return first ?? null;
}

export function formatSignature(bar: Bar): string {
  return `${bar.num}/${bar.den}`;
}

export function formatGroups(bar: Bar): string {
  return barGroups(bar).join("+");
}

export interface MeterRun {
  num: number;
  den: number;
  /** First bar of the run, from 0. */
  first: number;
  bars: number;
  start: number;
  end: number;
}

/** Stretches of consecutive bars with the same signature, for the overview and the summary. */
export function meterRuns(map: BarMap): MeterRun[] {
  const runs: MeterRun[] = [];
  map.bars.forEach((bar, i) => {
    const last = runs[runs.length - 1];
    if (last && last.num === bar.num && last.den === bar.den) {
      last.bars += 1;
      last.end = barEnd(map, i);
    } else {
      runs.push({ num: bar.num, den: bar.den, first: i, bars: 1, start: bar.start, end: barEnd(map, i) });
    }
  });
  return runs;
}

/** The signature that covers the most time. */
export function dominantMeter(map: BarMap): { num: number; den: number; share: number } | null {
  const time = new Map<string, number>();
  let total = 0;
  map.bars.forEach((bar, i) => {
    const key = `${bar.num}/${bar.den}`;
    const d = barSeconds(map, i);
    time.set(key, (time.get(key) ?? 0) + d);
    total += d;
  });
  let best: string | null = null;
  for (const [key, d] of time) if (best === null || d > (time.get(best) ?? 0)) best = key;
  if (best === null || total <= 0) return null;
  const [num, den] = best.split("/").map(Number);
  return { num, den, share: (time.get(best) ?? 0) / total };
}

/**
 * The shortest sequence of bar lengths (in pulses of one unit) that repeats through bars `from` to `to`
 * (inclusive), with at least two full turns; null when nothing repeats. 5,7,5,7 gives [5,7].
 */
export function repeatingCycle(map: BarMap, from = 0, to = map.bars.length - 1): number[] | null {
  const bars = map.bars.slice(from, to + 1);
  if (bars.length < 4) return null;
  const sizes = bars.map((b) => b.num * (8 / b.den));
  for (let period = 1; period <= Math.floor(sizes.length / 2) && period <= 8; period++) {
    if (sizes.every((s, i) => s === sizes[i % period])) {
      if (period === 1 && new Set(sizes).size === 1) return [bars[0].num];
      return bars.slice(0, period).map((b) => b.num);
    }
  }
  return null;
}

/** Why a map cannot be stored, or null when it can. The same rules as the Rust side. */
export function validateMap(map: BarMap): string | null {
  if (map.bars.length === 0) return "A bar map needs at least one bar";
  if (!Number.isFinite(map.end) || map.end <= 0) return "The map has no length";
  let previous = -Infinity;
  for (let i = 0; i < map.bars.length; i++) {
    const bar = map.bars[i];
    const n = i + 1;
    if (!Number.isFinite(bar.start) || bar.start < 0) return `Bar ${n} starts before the song`;
    if (bar.start <= previous) return `Bar ${n} does not start after the bar before it`;
    previous = bar.start;
    if (!Number.isInteger(bar.num) || bar.num < 1 || bar.num > MAX_PULSES) return `Bar ${n} needs between 1 and ${MAX_PULSES} pulses`;
    if (!(UNITS as readonly number[]).includes(bar.den)) return `Bar ${n} has a unit of 1/${bar.den}, which is not a note`;
    if (bar.groups && (bar.groups.some((g) => !Number.isInteger(g) || g < 1) || sum(bar.groups) !== bar.num)) {
      return `The groups of bar ${n} do not add up to ${bar.num}`;
    }
    if (barSeconds(map, i) / bar.num < MIN_PULSE_SECONDS - 1e-9) return `Bar ${n} is too short for ${bar.num} pulses`;
  }
  return null;
}
