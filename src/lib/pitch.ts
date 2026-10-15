const MIN_RMS = 0.01;
const EDGE_LEVEL = 0.2;
// VoceVista's minimumClarity: below it the autocorrelation peak is noise, not a voice
const MIN_CLARITY = 0.25;
const MIN_HZ = 65;
const MAX_HZ = 1400;

// The fast path works at about this rate: a 1400 Hz period is still 8 samples.
const FAST_RATE_HZ = 11025;
const KEY_MAX_RATIO = 0.9;

export interface PitchOptions {
  /**
   * Trade a little resolution for speed: average the window down to about
   * 11 kHz and only correlate over the lags a 65 Hz voice can have. About 20
   * times fewer multiply-adds at 2048 samples (measured 149 ms against the
   * 46 ms window on a Moto G 5G in Hermes without it). Off by default, so the
   * desktop result is unchanged.
   */
  fast?: boolean;
}

/**
 * Fundamental frequency of one window of mono samples by autocorrelation, in Hz,
 * or null when the window is too quiet, not periodic enough, or outside 65-1400 Hz.
 *
 * Pure: no audio context, no state. The caller supplies the samples (an
 * AnalyserNode on the desktop, a recorder callback on a phone). The exact path
 * costs about 2 million multiply-adds at 2048 samples, far too slow for a
 * JavaScript engine without a JIT; pass `{ fast: true }` there.
 */
export function autocorrelatePitch(buf: Float32Array, sampleRate: number, options?: PitchOptions): number | null {
  const size = buf.length;

  let energy = 0;
  for (let i = 0; i < size; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / size) < MIN_RMS) return null;

  let start = 0;
  let end = size - 1;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[i]) < EDGE_LEVEL) { start = i; break; }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buf[size - i]) < EDGE_LEVEL) { end = size - i; break; }
  }
  let x = buf.slice(start, end);
  let rate = sampleRate;
  const fast = options?.fast === true;
  const factor = fast ? Math.max(1, Math.round(sampleRate / FAST_RATE_HZ)) : 1;
  if (factor > 1) {
    const m = Math.floor(x.length / factor);
    const y = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k = 0; k < factor; k++) sum += x[i * factor + k];
      y[i] = sum / factor;
    }
    x = y;
    rate = sampleRate / factor;
  }
  const len = x.length;
  if (len < 2) return null;

  const maxLag = fast ? Math.min(len - 1, Math.ceil(rate / MIN_HZ) + 2) : len - 1;
  const c = new Float32Array(maxLag + 1);
  for (let i = 0; i <= maxLag; i++) {
    let acc = 0;
    for (let j = 0; j < len - i; j++) acc += x[j] * x[j + i];
    c[i] = acc;
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let peak = -1;
  let peakAt = -1;
  for (let i = d; i <= maxLag; i++) {
    if (c[i] > peak) { peak = c[i]; peakAt = i; }
  }
  if (fast) {
    // At 11 kHz a period is a handful of samples, so the peak at one period can
    // fall between samples and lose to the exact peak at two periods (an octave
    // low). Take the first local maximum that is nearly as strong.
    const gate = peak * KEY_MAX_RATIO;
    for (let i = d + 1; i < maxLag; i++) {
      if (c[i] >= gate && c[i] >= c[i - 1] && c[i] >= c[i + 1]) {
        peak = c[i];
        peakAt = i;
        break;
      }
    }
  }

  if (c[0] <= 0 || peak / c[0] < MIN_CLARITY) return null;

  const x1 = c[peakAt - 1] ?? 0;
  const x2 = c[peakAt];
  const x3 = c[peakAt + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a !== 0 ? -b / (2 * a) : 0;

  const freq = rate / (peakAt + shift);
  return freq >= MIN_HZ && freq <= MAX_HZ ? freq : null;
}
