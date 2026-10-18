import { useEffect, useState } from "react";
import { metronome } from "../../audio/metronome";
import { computeMetronomePhase } from "../../lib/metronomeSync";
import type { StoreHook } from "./storeHook";

export const RATE_MIN = 0.25;
export const RATE_MAX = 2.5;
export const RATE_STEP = 0.05;
const FALLBACK_BPM = 120;

export interface TempoControlState {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  isPlaying: boolean;
  metronomeOffset: number;
  setMetronomeOffset: (seconds: number) => void;
}

export interface TempoControlOptions {
  /** Detected tempo of the song, if any: without it only the speed factor is editable. */
  detectedBpm?: number;
  /** Song time now, read when the click has to be phase-locked. */
  getCurrentTime: () => number;
}

export interface TempoControl {
  bpmInput: string;
  setBpmInput: (v: string) => void;
  commitBpm: (raw: string) => void;
  onBpmKey: (key: string) => void;
  bpmMin: number | undefined;
  bpmMax: number | undefined;
  rateInput: string;
  setRateInput: (v: string) => void;
  commitRate: (raw: string) => void;
  onRateKey: (key: string) => void;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
  metronomeOffset: number;
  downbeatText: string;
  setDownbeatToPlayhead: () => void;
  resetDownbeat: () => void;
}

/** `m:ss.s`. */
export function formatDownbeat(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function useTempoControl(store: StoreHook<TempoControlState>, o: TempoControlOptions): TempoControl {
  const { detectedBpm, getCurrentTime } = o;
  const playbackRate = store((s) => s.playbackRate);
  const setPlaybackRate = store((s) => s.setPlaybackRate);
  const isPlaying = store((s) => s.isPlaying);
  const metronomeOffset = store((s) => s.metronomeOffset);
  const setMetronomeOffset = store((s) => s.setMetronomeOffset);

  const [bpmInput, setBpmInput] = useState(() => (detectedBpm ? String(Math.round(detectedBpm * playbackRate)) : ""));
  const [rateInput, setRateInput] = useState(() => playbackRate.toFixed(2));
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);

  const effectiveBpm = (detectedBpm ?? FALLBACK_BPM) * playbackRate;

  useEffect(() => {
    if (metronomeEnabled && isPlaying) {
      // Phase-lock to metronomeOffset rather than always starting fresh at
      // beat 0 — otherwise the click drifts out of sync with the song's
      // actual downbeat whenever there's silence (or a pickup) before it.
      const { timeUntilNextBeat, beatIndex } = computeMetronomePhase({
        detectedBpm: detectedBpm ?? FALLBACK_BPM,
        playbackRate,
        anchorTime: metronomeOffset,
        currentSongTime: getCurrentTime(),
      });
      metronome.start(effectiveBpm, timeUntilNextBeat, beatIndex);
    } else {
      metronome.stop();
    }
    // Resyncs (not just retunes) on every bpm/offset change while playing,
    // so a mid-playback speed change or a dragged downbeat marker doesn't
    // leave the click phase-locked to a stale mapping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronomeEnabled, isPlaying, effectiveBpm, metronomeOffset]);

  useEffect(() => () => metronome.stop(), []);

  const applyRate = (rate: number) => {
    const rounded = parseFloat(Math.max(RATE_MIN, Math.min(RATE_MAX, rate)).toFixed(4));
    setPlaybackRate(rounded);
    setRateInput(rounded.toFixed(2));
    if (detectedBpm) setBpmInput(String(Math.round(detectedBpm * rounded)));
  };

  const commitBpm = (raw: string) => {
    if (!detectedBpm) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setBpmInput(String(Math.round(detectedBpm * playbackRate)));
      return;
    }
    applyRate(n / detectedBpm);
  };

  const commitRate = (raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setRateInput(playbackRate.toFixed(2));
      return;
    }
    applyRate(n);
  };

  return {
    bpmInput,
    setBpmInput,
    commitBpm,
    onBpmKey: (key) => {
      if (key === "Enter") commitBpm(bpmInput);
    },
    bpmMin: detectedBpm ? Math.round(detectedBpm * RATE_MIN) : undefined,
    bpmMax: detectedBpm ? Math.round(detectedBpm * RATE_MAX) : undefined,
    rateInput,
    setRateInput,
    commitRate,
    onRateKey: (key) => {
      if (key === "Enter") commitRate(rateInput);
    },
    metronomeEnabled,
    toggleMetronome: () => setMetronomeEnabled((v) => !v),
    metronomeOffset,
    downbeatText: formatDownbeat(metronomeOffset),
    setDownbeatToPlayhead: () => setMetronomeOffset(getCurrentTime()),
    resetDownbeat: () => setMetronomeOffset(0),
  };
}
