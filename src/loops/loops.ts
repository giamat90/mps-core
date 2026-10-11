/** A region of a song the user saved under a name, to come back to with one click. */
export interface NamedLoop {
  id: string;
  name: string;
  start: number;
  end: number;
}

/** A stretch of a song a fixed number of bars long, as a loop candidate. */
export interface BarSection {
  start: number;
  end: number;
  label: string;
}

export const MAX_LOOPS = 100;
export const MAX_LOOP_NAME = 80;
export const MIN_LOOP_SECONDS = 0.25;

const EN_DASH = "–";
const INTRO_MIN_SECONDS = 1;

/** Why a loop cannot be saved, or null when it can. `duration` of 0 means the length is not known. */
export function validateLoop(name: string, start: number, end: number, duration: number): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Give the loop a name";
  if (trimmed.length > MAX_LOOP_NAME) return `The name can be at most ${MAX_LOOP_NAME} characters`;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < MIN_LOOP_SECONDS) {
    return "The region must run forward and be at least a quarter of a second long";
  }
  if (duration > 0 && end > duration + 0.001) return "The region ends past the end of the song";
  return null;
}

function byStart(a: NamedLoop, b: NamedLoop): number {
  return a.start - b.start || a.end - b.end;
}

/** The list with the loop added, in time order. Throws an Error whose message says what is wrong. */
export function addLoop(
  loops: readonly NamedLoop[],
  loop: { id: string; name: string; start: number; end: number },
  duration: number,
): NamedLoop[] {
  const problem = validateLoop(loop.name, loop.start, loop.end, duration);
  if (problem) throw new Error(problem);
  if (loops.length >= MAX_LOOPS) throw new Error(`Too many loops (at most ${MAX_LOOPS})`);
  if (loops.some((l) => l.id === loop.id)) throw new Error("A loop with this id already exists");
  return [...loops, { ...loop, name: loop.name.trim() }].sort(byStart);
}

export function renameLoop(loops: readonly NamedLoop[], id: string, name: string): NamedLoop[] {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LOOP_NAME) {
    throw new Error(trimmed.length === 0 ? "Give the loop a name" : `The name can be at most ${MAX_LOOP_NAME} characters`);
  }
  return loops.map((l) => (l.id === id ? { ...l, name: trimmed } : l));
}

export function removeLoop(loops: readonly NamedLoop[], id: string): NamedLoop[] {
  return loops.filter((l) => l.id !== id);
}

export interface BarSectionInput {
  duration: number;
  bpm: number;
  beatsPerBar: number;
  /** Song time of the first downbeat. */
  offset: number;
  barsPerSection: number;
}

/**
 * Cuts a song into groups of bars counted from its first downbeat. This is not
 * structure detection: it only knows the tempo and where bar one starts.
 */
export function barSections(input: BarSectionInput): BarSection[] {
  const { duration, bpm, beatsPerBar, offset, barsPerSection } = input;
  if (!(duration > 0) || !(bpm > 0) || !(beatsPerBar > 0) || !(barsPerSection > 0)) return [];

  const barSeconds = (beatsPerBar * 60) / bpm;
  const sectionSeconds = barSeconds * barsPerSection;
  const sections: BarSection[] = [];

  let first = Math.max(0, offset);
  if (first >= INTRO_MIN_SECONDS && first < duration) {
    sections.push({ start: 0, end: first, label: "Intro" });
  } else if (first >= duration) {
    first = 0;
  }

  let startBar = 1;
  for (let start = first; start < duration - 1e-9; start += sectionSeconds) {
    const end = Math.min(start + sectionSeconds, duration);
    const bars = Math.max(1, Math.round((end - start) / barSeconds));
    const last = startBar + barsPerSection - 1;
    const endBar = end - start < sectionSeconds - 1e-9 ? startBar + bars - 1 : last;
    if (end - start < barSeconds - 1e-9 && sections.length > 0) {
      sections[sections.length - 1].end = end;
      break;
    }
    sections.push({
      start,
      end,
      label: endBar > startBar ? `Bars ${startBar}${EN_DASH}${endBar}` : `Bars ${startBar}`,
    });
    startBar = endBar + 1;
  }
  return sections;
}
