const MIN_RMS = 0.01;
const EDGE_LEVEL = 0.2;
// VoceVista's minimumClarity: below it the autocorrelation peak is noise, not a voice
const MIN_CLARITY = 0.25;
const MIN_HZ = 65;
const MAX_HZ = 1400;

// The fast path works at about this rate: a 1400 Hz period is still 8 samples.
const FAST_RATE_HZ = 11025;
// A peak counts as the period when it is within this share of the tallest one.
const KEY_MAX_RATIO = 0.98;

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

  if (fast) return fastPeriodPitch(x, rate);

  const maxLag = len - 1;
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

// The fast path: Praat's windowed autocorrelation (Boersma 1993) read at the
// peak nearest the shortest strong period. Three details come from measurement
// on synthetic voices (pulse train through formant resonators, see CHANGELOG):
// - The window is Hann-weighted and each lag is divided by the correlation of
//   the window with itself, so a lag of two periods is as tall as one period
//   instead of decaying with the shrinking overlap.
// - At 11 kHz a period is a handful of samples, so peak heights are read from
//   the parabola through each peak, not from the sample.
// - The first peak within 98 % of the tallest wins. A looser gate (0.9) read
//   head voice an octave too high when a formant sits on the 2nd or 3rd
//   harmonic and the fundamental is weak; the tight one needs the window
//   correction above or it starts choosing two periods on pure tones.
const windowCache = new Map<string, { w: Float32Array; ww: Float32Array }>();

function windowFor(len: number, maxLag: number) {
  const key = `${len}:${maxLag}`;
  let hit = windowCache.get(key);
  if (!hit) {
    const w = new Float32Array(len);
    for (let i = 0; i < len; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / len);
    const ww = new Float32Array(maxLag + 1);
    for (let lag = 0; lag <= maxLag; lag++) {
      let acc = 0;
      for (let j = 0; j < len - lag; j++) acc += w[j] * w[j + lag];
      ww[lag] = acc;
    }
    hit = { w, ww };
    if (windowCache.size > 8) windowCache.clear();
    windowCache.set(key, hit);
  }
  return hit;
}

function fastPeriodPitch(x: Float32Array, rate: number): number | null {
  const len = x.length;
  const maxLag = Math.min(len - 1, Math.ceil(rate / MIN_HZ) + 2);
  const { w, ww } = windowFor(len, maxLag);
  const xw = new Float32Array(len);
  for (let i = 0; i < len; i++) xw[i] = x[i] * w[i];

  const u = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let acc = 0;
    for (let j = 0; j < len - lag; j++) acc += xw[j] * xw[j + lag];
    u[lag] = acc / ww[lag];
  }
  if (u[0] <= 0) return null;

  let d = 0;
  while (d < maxLag && u[d] > u[d + 1]) d++;

  let topHeight = -1;
  const lags: number[] = [];
  const heights: number[] = [];
  for (let i = Math.max(d + 1, 2); i < maxLag; i++) {
    if (u[i] < u[i - 1] || u[i] <= u[i + 1]) continue;
    const a = u[i - 1];
    const b = u[i];
    const e = u[i + 1];
    const den = a + e - 2 * b;
    const shift = den !== 0 ? (a - e) / (2 * den) : 0;
    const height = b - ((a - e) * shift) / 4;
    lags.push(i + shift);
    heights.push(height);
    if (height > topHeight) topHeight = height;
  }
  if (lags.length === 0 || topHeight / u[0] < MIN_CLARITY) return null;

  const gate = topHeight * KEY_MAX_RATIO;
  for (let k = 0; k < lags.length; k++) {
    if (heights[k] >= gate) {
      const freq = rate / lags[k];
      return freq >= MIN_HZ && freq <= MAX_HZ ? freq : null;
    }
  }
  return null;
}
