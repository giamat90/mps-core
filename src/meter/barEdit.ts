import {
  MAX_PULSES,
  MIN_PULSE_SECONDS,
  UNITS,
  barEnd,
  barIndexAt,
  barSeconds,
  round3,
  type Bar,
  type BarMap,
} from "./barMap";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

const edited = (map: BarMap, bars: Bar[]): BarMap => {
  const { confidence: _guess, ...rest } = map;
  return { ...rest, bars, source: "edited" };
};

const fits = (map: BarMap): boolean => map.bars.every((bar, i) => barSeconds(map, i) / bar.num >= MIN_PULSE_SECONDS - 1e-9);

/** A bar map of one signature from `first` to the end, at a steady pulse: what the old click track assumed. */
export function gridMap(o: { first: number; pulse: number; num: number; den: number; end: number; source?: "grid" | "tapped" }): BarMap | null {
  const { first, pulse, num, den, end } = o;
  if (!(pulse >= MIN_PULSE_SECONDS) || num < 1 || num > MAX_PULSES || !(UNITS as readonly number[]).includes(den)) return null;
  const barLength = pulse * num;
  const bars: Bar[] = [];
  for (let t = Math.max(0, first); t < end - barLength * 0.5; t += barLength) bars.push({ start: round3(t), num, den });
  if (bars.length === 0) return null;
  return { version: 1, bars, end, source: o.source ?? "grid" };
}

/** Moves where bar `index` starts. It cannot cross a neighbour and leaves every bar room for its pulses. */
export function setBarStart(map: BarMap, index: number, time: number): BarMap {
  const bar = map.bars[index];
  if (!bar) return map;
  const prev = map.bars[index - 1];
  const lower = prev ? prev.start + prev.num * MIN_PULSE_SECONDS : 0;
  const upper = barEnd(map, index) - bar.num * MIN_PULSE_SECONDS;
  if (lower > upper) return map;
  const at = round3(Math.min(Math.max(time, lower), upper));
  return edited(map, map.bars.map((b, i) => (i === index ? { ...b, start: at } : b)));
}

/** Moves every bar by `seconds`, keeping the first one inside the song. */
export function shiftBars(map: BarMap, seconds: number): BarMap {
  const first = map.bars[0];
  if (!first) return map;
  const last = map.bars[map.bars.length - 1];
  const dt = Math.max(-first.start, Math.min(seconds, map.end - last.num * MIN_PULSE_SECONDS - last.start));
  if (dt === 0) return map;
  return edited(map, map.bars.map((b) => ({ ...b, start: round3(b.start + dt) })));
}

/** Cuts bar `index` in two at `time`, handing each half the pulses that fit it. Null when a half would be too short. */
export function splitBar(map: BarMap, index: number, time: number): BarMap | null {
  const bar = map.bars[index];
  if (!bar || bar.num < 2) return null;
  const end = barEnd(map, index);
  const at = round3(time);
  if (at <= bar.start || at >= end) return null;
  const first = Math.min(bar.num - 1, Math.max(1, Math.round((bar.num * (at - bar.start)) / (end - bar.start))));
  const { groups: _g, ...plain } = bar;
  const bars = [
    ...map.bars.slice(0, index),
    { ...plain, num: first },
    { ...plain, start: at, num: bar.num - first },
    ...map.bars.slice(index + 1),
  ];
  const next = edited(map, bars);
  return fits(next) ? next : null;
}

/** Joins bar `index + 1` into bar `index`: one bar with the pulses of both. Null when the units differ or it would be too long. */
export function mergeBars(map: BarMap, index: number): BarMap | null {
  const a = map.bars[index];
  const b = map.bars[index + 1];
  if (!a || !b || a.den !== b.den || a.num + b.num > MAX_PULSES) return null;
  const groups = a.groups && b.groups ? [...a.groups, ...b.groups] : undefined;
  const joined: Bar = { start: a.start, num: a.num + b.num, den: a.den, ...(groups ? { groups } : {}) };
  return edited(map, [...map.bars.slice(0, index), joined, ...map.bars.slice(index + 2)]);
}

/**
 * Takes bar `index` away. The bar before it keeps its pulses and runs on over the gap; the first bar's removal
 * turns its time into intro. Null for the only bar.
 */
export function removeBar(map: BarMap, index: number): BarMap | null {
  if (map.bars.length < 2 || !map.bars[index]) return null;
  const next = edited(map, map.bars.filter((_, i) => i !== index));
  return fits(next) ? next : null;
}

export interface BarPatch {
  num?: number;
  den?: number;
  groups?: number[] | null;
}

/**
 * Relabels bars `from` to `to` (inclusive) without moving a bar line: the pulses of each bar are spaced anew over
 * the same time. Null when the patch is not a signature or leaves a pulse too short.
 */
export function relabelBars(map: BarMap, from: number, to: number, patch: BarPatch): BarMap | null {
  if (from < 0 || to >= map.bars.length || from > to) return null;
  const num = patch.num;
  if (num !== undefined && (!Number.isInteger(num) || num < 1 || num > MAX_PULSES)) return null;
  if (patch.den !== undefined && !(UNITS as readonly number[]).includes(patch.den)) return null;
  const bars = map.bars.map((bar, i) => {
    if (i < from || i > to) return bar;
    const { groups: _old, ...rest } = bar;
    const next: Bar = { ...rest, num: num ?? bar.num, den: patch.den ?? bar.den };
    const groups = patch.groups === undefined ? (num === undefined ? bar.groups : undefined) : patch.groups ?? undefined;
    return groups ? { ...next, groups } : next;
  });
  for (const bar of bars) {
    if (bar.groups && sum(bar.groups) !== bar.num) return null;
  }
  const next = edited(map, bars);
  return fits(next) ? next : null;
}

/**
 * Counts the same bars in pulses `factor` times as fast: 4/4 becomes 8/8 at 2, 6/8 becomes 3/8 at 0.5. The bar
 * lines stay where they are; only how finely each bar is counted changes. Null when the result is not a signature.
 */
export function rescalePulse(map: BarMap, from: number, to: number, factor: number): BarMap | null {
  if (from < 0 || to >= map.bars.length || from > to) return null;
  const bars: Bar[] = [];
  for (let i = 0; i < map.bars.length; i++) {
    const bar = map.bars[i];
    if (i < from || i > to) {
      bars.push(bar);
      continue;
    }
    const num = bar.num * factor;
    const den = bar.den * factor;
    if (!Number.isInteger(num) || num < 1 || num > MAX_PULSES || !(UNITS as readonly number[]).includes(den)) return null;
    const { groups: _g, ...rest } = bar;
    const groups = bar.groups && factor >= 1 ? bar.groups.map((g) => g * factor) : undefined;
    bars.push({ ...rest, num, den, ...(groups ? { groups } : {}) });
  }
  const next = edited(map, bars);
  return fits(next) ? next : null;
}

export interface Fill {
  /** First bar to replace. */
  from: number;
  /** First bar to keep after the replaced ones; null replaces everything to the end. */
  until: number | null;
  /** Pulses of each bar in turn, repeated: [5, 7] for a song that alternates 5/8 and 7/8. */
  cycle: number[];
  den: number;
  /** Seconds per pulse. */
  pulse: number;
}

/**
 * Replaces the bars from `from` up to `until` with bars cut from a repeating pattern at a steady pulse, starting
 * where bar `from` started. What is left at the end is absorbed by the last bar, or becomes a short bar of its own.
 */
export function fillCycle(map: BarMap, o: Fill): BarMap | null {
  const { from, until, cycle, den, pulse } = o;
  const first = map.bars[from];
  if (!first || cycle.length === 0 || !(pulse >= MIN_PULSE_SECONDS) || !(UNITS as readonly number[]).includes(den)) return null;
  if (cycle.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PULSES)) return null;
  if (until !== null && (until <= from || until > map.bars.length)) return null;
  const stop = until === null || until >= map.bars.length ? map.end : map.bars[until].start;

  const made: Bar[] = [];
  let t = first.start;
  for (let k = 0; stop - t > pulse * 0.5; k++) {
    const num = cycle[k % cycle.length];
    const length = num * pulse;
    if (t + length <= stop + pulse * 0.5) {
      made.push({ start: round3(t), num, den });
      t += length;
      continue;
    }
    const left = Math.round((stop - t) / pulse);
    if (left >= 1) made.push({ start: round3(t), num: left, den });
    break;
  }
  if (made.length === 0) return null;
  const kept = until === null ? [] : map.bars.slice(until);
  const next = edited(map, [...map.bars.slice(0, from), ...made, ...kept]);
  return validBars(next) ? next : null;
}

/**
 * Swaps the bars that start in [from, to) for `replacement`, which has to end at `to`. Whatever was playing at `to`
 * carries on from there at its own pulse, so a retimed stretch does not swallow the bars after it.
 */
export function replaceBars(map: BarMap, from: number, to: number, replacement: Bar[]): BarMap | null {
  if (replacement.length === 0 || !(to > from)) return null;
  const covering = barIndexAt(map, to);
  let tail: Bar[] = [];
  if (covering >= 0 && map.bars[covering].start < to - 1e-6) {
    const old = map.bars[covering];
    const pulse = barSeconds(map, covering) / old.num;
    const left = Math.round((barEnd(map, covering) - to) / pulse);
    if (left >= 1) tail = [{ start: round3(to), num: left, den: old.den }];
  }
  const before = map.bars.filter((b) => b.start < from);
  const after = map.bars.filter((b) => b.start >= to);
  const next = edited(map, [...before, ...replacement, ...tail, ...after]);
  return validBars(next) ? next : null;
}

function validBars(map: BarMap): boolean {
  for (let i = 1; i < map.bars.length; i++) if (map.bars[i].start <= map.bars[i - 1].start) return false;
  return fits(map);
}
