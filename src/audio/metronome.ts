const BEATS_PER_BAR = 4;
const SCHEDULE_AHEAD_TIME = 0.1;
const LOOKAHEAD_MS = 25;
const CLICK_DURATION = 0.03;

/** 0 is the accented first pulse of a bar, 1 the first of another group, 2 any other pulse. */
export type ClickLevel = 0 | 1 | 2;

/** A click and how long to wait for it, in wall-clock seconds, from the click before it (or from now, for the first). */
export interface ClickCue {
  wait: number;
  level: ClickLevel;
}

const FREQUENCY: Record<ClickLevel, number> = { 0: 1500, 1: 1200, 2: 900 };
const PEAK: Record<ClickLevel, number> = { 0: 0.9, 1: 0.7, 2: 0.5 };

class Metronome {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private beat = 0;
  private bpm = 120;
  private pending: ClickLevel = 0;
  private sequence: (() => ClickCue | null) | null = null;
  // Output device to route clicks to. Recording opens the mic via getUserMedia,
  // which on Windows silently reroutes the system default output to the
  // Communications device — the same issue AudioEngine.setOutputDevice() works
  // around for the WaveSurfer tracks. Without this, clicks scheduled during/after
  // a recording's mic-open (e.g. count-in) can play to a device the user isn't
  // listening on, sounding like nothing happened.
  private sinkId: string | null = null;

  private scheduleClick(level: ClickLevel, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = FREQUENCY[level];
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(PEAK[level], time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_DURATION);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + CLICK_DURATION + 0.01);
  }

  private tick = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      if (this.sequence) {
        this.scheduleClick(this.pending, this.nextNoteTime);
        const cue = this.sequence();
        if (!cue) {
          this.sequence = null;
          this.timerId = null;
          return;
        }
        this.nextNoteTime += cue.wait;
        this.pending = cue.level;
      } else {
        this.scheduleClick(this.beat === 0 ? 0 : 2, this.nextNoteTime);
        this.nextNoteTime += 60 / this.bpm;
        this.beat = (this.beat + 1) % BEATS_PER_BAR;
      }
    }
    this.timerId = window.setTimeout(this.tick, LOOKAHEAD_MS);
  };

  private open() {
    if (!this.ctx) {
      this.ctx = new AudioContext(this.sinkId ? ({ sinkId: this.sinkId } as AudioContextOptions) : undefined);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => console.warn("Metronome: failed to resume AudioContext", e));
    }
    return this.ctx;
  }

  /**
   * (Re)starts the click scheduler, phase-locked so the next click lands
   * `timeUntilNextBeat` seconds from now (wall-clock) at bar position
   * `startBeat` (0 = accented downbeat) — lets the caller keep the click
   * aligned to a specific song-time downbeat (see src/lib/metronomeSync.ts)
   * instead of always resetting to beat 0 at whatever moment start() is
   * called. Always resyncs, even if already running, since a stale
   * scheduled phase is exactly the bug this is meant to fix.
   */
  start(bpm: number, timeUntilNextBeat = 0, startBeat = 0) {
    this.bpm = bpm;
    this.sequence = null;
    const ctx = this.open();
    this.beat = ((startBeat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
    this.nextNoteTime = ctx.currentTime + Math.max(0.05, timeUntilNextBeat);
    if (this.timerId === null) this.tick();
  }

  /**
   * (Re)starts the scheduler on a sequence of clicks that is not at a steady tempo, such as the pulses of a bar
   * map: `first` is the click to start with and `next` returns the one after it until it returns null.
   * Always resyncs, like start().
   */
  startSequence(first: ClickCue, next: () => ClickCue | null) {
    const ctx = this.open();
    this.sequence = next;
    this.pending = first.level;
    this.nextNoteTime = ctx.currentTime + Math.max(0.05, first.wait);
    if (this.timerId === null) this.tick();
  }

  stop() {
    this.sequence = null;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.ctx?.suspend().catch((e) => console.warn("Metronome: failed to suspend AudioContext", e));
  }

  /**
   * Pins clicks to a specific output device (see the `sinkId` field comment).
   * If the context already exists, re-routes it live via the modern
   * AudioContext.setSinkId() API where available; otherwise the id is applied
   * the next time start() lazily creates a context.
   */
  setOutputDevice(deviceId: string) {
    this.sinkId = deviceId;
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (ctx?.setSinkId) {
      ctx.setSinkId(deviceId).catch((e) => console.warn("Metronome: setSinkId failed", e));
    }
  }
}

export const metronome = new Metronome();
