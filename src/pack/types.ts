export interface PackTrack {
  name: string;
  file: string;
}

export interface PackVariant {
  semitones: number;
  tracks: PackTrack[];
}

export interface PackLoop {
  name: string;
  start: number;
  end: number;
}

export interface PackManifest {
  schema: number;
  app: string;
  songId: string;
  rev: number;
  createdAt: string;
  title: string;
  artist: string | null;
  durationS: number;
  bpm: number | null;
  key: string | null;
  metronomeOffsetS: number | null;
  /** seconds of silence the AAC encoder put in front of the audio; 0 when the container trims it */
  encoderDelayS: number;
  tracks: PackTrack[];
  variants: PackVariant[];
  reference: { file: string; hopS: number } | null;
  lyrics: { file: string } | null;
  loops: PackLoop[];
}

/** reference_pitch.json: the laptop's pitch line on a fixed grid, 0 where unvoiced. */
export interface ReferencePitch {
  hopS: number;
  durationS: number;
  f0: number[];
}
