import { barIndexAt, barSeconds, pulseLevels, pulseTimes, type BarMap, type PulseLevel } from "./barMap";

/** Which pulses click: all of them, the start of each group, or only the start of each bar. */
export type ClickDensity = "pulses" | "groups" | "bars";

export const CLICK_DENSITIES: readonly ClickDensity[] = ["pulses", "groups", "bars"];

export interface Click {
  time: number;
  level: PulseLevel;
}

const lowestLevel: Record<ClickDensity, PulseLevel> = { pulses: 2, groups: 1, bars: 0 };

/** Walks the clicks of a bar map one at a time from a song time, for a scheduler that asks for the next one. */
export class PulseCursor {
  private bar: number;
  private times: number[] = [];
  private levels: PulseLevel[] = [];
  private k = 0;

  constructor(private readonly map: BarMap, from: number, private readonly density: ClickDensity = "pulses") {
    const at = barIndexAt(map, from);
    this.bar = from < (map.bars[0]?.start ?? 0) ? 0 : from >= map.end ? map.bars.length : Math.max(0, at);
    this.load();
    while (this.k < this.times.length && this.times[this.k] < from - 1e-6) this.k++;
  }

  private load() {
    if (this.bar >= this.map.bars.length) {
      this.times = [];
      this.levels = [];
      return;
    }
    this.times = pulseTimes(this.map, this.bar);
    this.levels = pulseLevels(this.map.bars[this.bar]);
    this.k = 0;
  }

  next(): Click | null {
    for (;;) {
      if (this.bar >= this.map.bars.length) return null;
      if (this.k >= this.times.length) {
        this.bar += 1;
        this.load();
        continue;
      }
      const level = this.levels[this.k];
      const time = this.times[this.k];
      this.k += 1;
      if (level <= lowestLevel[this.density]) return { time, level };
    }
  }
}

export interface ClickCue {
  wait: number;
  level: PulseLevel;
}

/**
 * The clicks of a bar map from a song time, in the form the metronome plays: the first one and a function giving the
 * next. Waits are wall-clock seconds, so the song's playback `rate` stretches them. Null when no click is left.
 */
export function clickSequence(
  map: BarMap,
  from: number,
  rate: number,
  density: ClickDensity = "pulses",
): { first: ClickCue; next: () => ClickCue | null } | null {
  if (!(rate > 0)) return null;
  const cursor = new PulseCursor(map, from, density);
  const head = cursor.next();
  if (!head) return null;
  let previous = head.time;
  return {
    first: { wait: Math.max(0, (head.time - from) / rate), level: head.level },
    next: () => {
      const click = cursor.next();
      if (!click) return null;
      const wait = (click.time - previous) / rate;
      previous = click.time;
      return { wait, level: click.level };
    },
  };
}

/**
 * A map of `bars` copies of the bar playing at `time` (or the first bar after it, or the last), laid out from 0:
 * what a count-in clicks before a take that starts at `time`. Null when there is no map to follow.
 */
export function countInMap(map: BarMap, time: number, bars: number): BarMap | null {
  if (map.bars.length === 0 || bars < 1) return null;
  const at = barIndexAt(map, time);
  const index = at >= 0 ? at : time < map.bars[0].start ? 0 : map.bars.length - 1;
  const bar = map.bars[index];
  const length = barSeconds(map, index);
  return {
    version: 1,
    bars: Array.from({ length: bars }, (_, k) => ({ start: k * length, num: bar.num, den: bar.den, ...(bar.groups ? { groups: bar.groups } : {}) })),
    end: bars * length,
    source: "edited",
  };
}
