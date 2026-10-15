const MIN_RMS = 0.01;
const EDGE_LEVEL = 0.2;
// VoceVista's minimumClarity: below it the autocorrelation peak is noise, not a voice
const MIN_CLARITY = 0.25;
const MIN_HZ = 65;
const MAX_HZ = 1400;

/**
 * Fundamental frequency of one window of mono samples by autocorrelation, in Hz,
 * or null when the window is too quiet, not periodic enough, or outside 65-1400 Hz.
 *
 * Pure: no audio context, no state. The caller supplies the samples (an
 * AnalyserNode on the desktop, a recorder callback on a phone). Cost is
 * quadratic in the window length (about 2 million multiply-adds at 2048
 * samples), so a slow JS engine should measure it before calling it per frame.
 */
export function autocorrelatePitch(buf: Float32Array, sampleRate: number): number | null {
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
  const trimmed = buf.slice(start, end);
  const len = trimmed.length;
  if (len < 2) return null;

  const c = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i; j++) c[i] += trimmed[j] * trimmed[j + i];
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let peak = -1;
  let peakAt = -1;
  for (let i = d; i < len; i++) {
    if (c[i] > peak) { peak = c[i]; peakAt = i; }
  }

  if (c[0] <= 0 || peak / c[0] < MIN_CLARITY) return null;

  const x1 = c[peakAt - 1] ?? 0;
  const x2 = c[peakAt];
  const x3 = c[peakAt + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a !== 0 ? -b / (2 * a) : 0;

  const freq = sampleRate / (peakAt + shift);
  return freq >= MIN_HZ && freq <= MAX_HZ ? freq : null;
}
