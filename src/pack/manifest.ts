import type { PackLoop, PackManifest, PackTrack, PackVariant, ReferencePitch } from "./types";

export const PACK_SCHEMA = 1;
export const MAX_LOOPS = 100;

/** A pack or one of its files breaks a rule of the format; the message is for the user. */
export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function safePath(value: unknown, what: string): string {
  if (!isText(value)) throw new PackError(`${what} must be a non-empty path`);
  if (value.startsWith("/") || value.includes("\\") || value.includes(":")) {
    throw new PackError(`${what} must be a relative path with forward slashes: ${JSON.stringify(value)}`);
  }
  if (value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new PackError(`${what} must stay inside the pack: ${JSON.stringify(value)}`);
  }
  return value;
}

function parseTracks(value: unknown, what: string): PackTrack[] {
  if (!Array.isArray(value)) throw new PackError(`${what} must be a list`);
  return value.map((t) => {
    if (!isObject(t) || !isText(t.name)) throw new PackError(`${what}: every track needs a name`);
    return { name: t.name, file: safePath(t.file, `${what} ${t.name} file`) };
  });
}

/**
 * Check a parsed manifest.json against the rules the writer (mps_core.pack)
 * enforces and return it typed. Throws PackError for the first rule it breaks.
 * A schema newer than this reader knows is refused, not guessed at.
 */
export function parseManifest(json: unknown): PackManifest {
  if (!isObject(json)) throw new PackError("manifest.json is not an object");
  if (json.schema !== PACK_SCHEMA) {
    throw new PackError(
      isWhole(json.schema) && json.schema > PACK_SCHEMA
        ? "This pack was made by a newer version of the desktop app. Update this app to open it."
        : `Unsupported pack schema ${JSON.stringify(json.schema)}.`,
    );
  }
  for (const field of ["app", "songId", "title", "createdAt"] as const) {
    if (!isText(json[field])) throw new PackError(`${field} must be a non-empty string`);
  }
  if (!isWhole(json.rev) || json.rev < 1) throw new PackError("rev must be a whole number from 1");
  if (!isNumber(json.durationS) || json.durationS <= 0) throw new PackError("durationS must be a positive number");
  const delay = json.encoderDelayS === undefined ? 0 : json.encoderDelayS;
  if (!isNumber(delay) || delay < 0 || delay > 1) throw new PackError("encoderDelayS must be between 0 and 1 second");

  const tracks = parseTracks(json.tracks, "track");
  if (tracks.length === 0) throw new PackError("tracks must list at least one track");
  const names = new Set(tracks.map((t) => t.name));
  if (names.size !== tracks.length) throw new PackError("track names must be unique, non-empty strings");
  if (json.app === "vps" && !(names.has("vocals") && names.has("instrumental"))) {
    throw new PackError("a VPS pack needs a vocals and an instrumental track");
  }

  const variants: PackVariant[] = [];
  const seen = new Set<number>();
  for (const v of Array.isArray(json.variants) ? json.variants : []) {
    if (!isObject(v) || !isWhole(v.semitones) || v.semitones === 0 || Math.abs(v.semitones) > 12 || seen.has(v.semitones)) {
      throw new PackError("variant semitones must be unique whole numbers in -12..12 except 0");
    }
    seen.add(v.semitones);
    const vt = parseTracks(v.tracks, `variant ${v.semitones} track`);
    const vn = new Set(vt.map((t) => t.name));
    if (vn.size !== names.size || [...vn].some((n) => !names.has(n))) {
      throw new PackError(`variant ${v.semitones} must carry the same tracks as the pack`);
    }
    variants.push({ semitones: v.semitones, tracks: vt });
  }

  let reference: PackManifest["reference"] = null;
  if (json.reference !== null && json.reference !== undefined) {
    if (!isObject(json.reference)) throw new PackError("reference must be an object");
    if (!isNumber(json.reference.hopS) || json.reference.hopS <= 0) throw new PackError("reference hopS must be positive");
    reference = { file: safePath(json.reference.file, "reference file"), hopS: json.reference.hopS };
  }
  let lyrics: PackManifest["lyrics"] = null;
  if (json.lyrics !== null && json.lyrics !== undefined) {
    if (!isObject(json.lyrics)) throw new PackError("lyrics must be an object");
    lyrics = { file: safePath(json.lyrics.file, "lyrics file") };
  }

  const loops: PackLoop[] = [];
  const rawLoops = Array.isArray(json.loops) ? json.loops : [];
  if (rawLoops.length > MAX_LOOPS) throw new PackError(`at most ${MAX_LOOPS} loops`);
  for (const l of rawLoops) {
    if (!isObject(l) || typeof l.name !== "string" || l.name.trim() === "") throw new PackError("a loop needs a name");
    if (!isNumber(l.start) || !isNumber(l.end)) throw new PackError("loop times must be numbers");
    if (!(l.start >= 0 && l.start < l.end && l.end <= json.durationS + 0.5)) {
      throw new PackError(`loop ${JSON.stringify(l.name)} must lie inside the song`);
    }
    loops.push({ name: l.name, start: l.start, end: l.end });
  }

  const optionalText = (v: unknown) => (typeof v === "string" && v ? v : null);
  const optionalNumber = (v: unknown) => (isNumber(v) ? v : null);
  return {
    schema: PACK_SCHEMA,
    app: json.app as string,
    songId: json.songId as string,
    rev: json.rev,
    createdAt: json.createdAt as string,
    title: json.title as string,
    artist: optionalText(json.artist),
    durationS: json.durationS,
    bpm: optionalNumber(json.bpm),
    key: optionalText(json.key),
    metronomeOffsetS: optionalNumber(json.metronomeOffsetS),
    encoderDelayS: delay,
    tracks,
    variants,
    reference,
    lyrics,
    loops,
  };
}

/** Every path the manifest refers to, in a stable order, without duplicates. */
export function packFiles(manifest: PackManifest): string[] {
  const paths = manifest.tracks.map((t) => t.file);
  for (const v of manifest.variants) paths.push(...v.tracks.map((t) => t.file));
  if (manifest.reference) paths.push(manifest.reference.file);
  if (manifest.lyrics) paths.push(manifest.lyrics.file);
  return [...new Set(paths)];
}

/** Check a parsed reference_pitch.json. */
export function parseReference(json: unknown): ReferencePitch {
  if (!isObject(json) || !isNumber(json.hopS) || json.hopS <= 0 || !isNumber(json.durationS) || !Array.isArray(json.f0)) {
    throw new PackError("reference_pitch.json is not a reference pitch");
  }
  if (!json.f0.every((f) => typeof f === "number" && Number.isFinite(f) && f >= 0)) {
    throw new PackError("reference_pitch.json holds a value that is not a frequency");
  }
  return { hopS: json.hopS, durationS: json.durationS, f0: json.f0 as number[] };
}

/** The reference frequency at a song time in seconds, or null for a rest or outside the song. */
export function referenceAt(ref: ReferencePitch, songTimeS: number): number | null {
  if (!(songTimeS >= 0) || ref.hopS <= 0) return null;
  const i = Math.floor(songTimeS / ref.hopS);
  if (i >= ref.f0.length) return null;
  const f = ref.f0[i];
  return f > 0 ? f : null;
}
