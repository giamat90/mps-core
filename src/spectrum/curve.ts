// Drawing helpers for a live magnitude spectrum: the log-frequency axis, the dB span, the thermal colour map and
// the smoothing. Plain numbers in and out, no canvas, so the desktop apps and the phone draw the same curve.

// Thermal colormap: index-based control points, segments interpolated linearly.
// Layout: [r0,g0,b0, r1,g1,b1, ...] — 256 entries × 3 bytes.
function buildColormap(): Uint8Array {
  const map = new Uint8Array(256 * 3);
  const stops = [
    [  0,   0,   0,  16],  // 0.00
    [ 51,  10,  10, 110],  // 0.20
    [102,   0, 112, 255],  // 0.40
    [140,   0, 229, 255],  // 0.55
    [179, 170, 255,   0],  // 0.70
    [209, 255, 170,   0],  // 0.82
    [235, 255,  34,   0],  // 0.92
    [255, 255, 255, 255],  // 1.00
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [i0, r0, g0, b0] = stops[i];
    const [i1, r1, g1, b1] = stops[i + 1];
    for (let j = i0; j <= i1; j++) {
      const t = (j - i0) / (i1 - i0);
      map[j * 3]     = Math.round(r0 + t * (r1 - r0));
      map[j * 3 + 1] = Math.round(g0 + t * (g1 - g0));
      map[j * 3 + 2] = Math.round(b0 + t * (b1 - b0));
    }
  }
  return map;
}

export const SPECTRO_COLORMAP: Uint8Array = buildColormap();

// ─── log-Hz x-axis mapping (shared by ShortTermSpectrumPanel and
// ShortTermSpectrumComparisonPanel) ────────────────────────────────────────
//
// Mirrors SpectrogramPanel.tsx's freqToY (fMax→0 / fMin→size, high freq at
// top) onto the X axis so high freq lands on the right: x = w - freqToY-shaped.
// fMin/fMax are passed in rather than imported from SpectrogramPanel.tsx to
// avoid a circular module dependency (SpectrogramPanel already imports from
// this file).

export function freqToX(f: number, w: number, fMin: number, fMax: number): number {
  const logFMin = Math.log(fMin);
  const logFMax = Math.log(fMax);
  return w - ((logFMax - Math.log(f)) / (logFMax - logFMin)) * w;
}

export function xToFreq(x: number, w: number, fMin: number, fMax: number): number {
  const logFMin = Math.log(fMin);
  const logFMax = Math.log(fMax);
  const t = (w - x) / w;
  return Math.exp(logFMax - t * (logFMax - logFMin));
}

// Web Audio's AnalyserNode (and fft.ts's mimic of it) divides the windowed FFT
// by N, so a full-scale tone reads about -13.6 dB; the sidecar's stored
// spectra divide by the window's coherent gain (sum/2) so it reads 0 dBFS.
// Blackman's coherent gain is 0.42, so adding this to an AnalyserNode/fft.ts
// dB value puts it on the sidecar's dBFS scale.
export const WEBAUDIO_TO_DBFS = 20 * Math.log10(2 / 0.42);

export interface SpectrumPoint { x: number; y: number; normalized: number }

// Display span and layout shared by ShortTermSpectrumPanel (Free Exercise) and
// ShortTermSpectrumComparisonPanel (Practice Room) so the same level lands at
// the same height in both. The span also matches the sidecar's stored range.
export const SPECTRUM_MIN_DB = -100;
export const SPECTRUM_MAX_DB = 0;
export const SPECTRUM_BOTTOM_AXIS_H = 16; // px (dpr-scaled) reserved under the plot for Hz labels

/**
 * Per-pixel-column curve from a Web Audio-style dB spectrum (AnalyserNode or
 * fft.ts): max over the FFT bins under each column, lifted onto the sidecar's
 * dBFS scale so it is directly comparable with the stored curves.
 */
export function analyserCurvePoints(
  data: Float32Array,
  sr: number,
  rollW: number,
  fMin: number,
  fMax: number,
  axisW: number,
): SpectrumPoint[] {
  const binCount = data.length;
  const binHz = sr / (binCount * 2);
  const maxBin = binCount - 1;
  const dbRange = SPECTRUM_MAX_DB - SPECTRUM_MIN_DB;
  const points: SpectrumPoint[] = [];
  for (let px = 0; px < rollW; px++) {
    const fLo = xToFreq(Math.max(0, px - 0.5), rollW, fMin, fMax);
    const fHi = xToFreq(Math.min(rollW, px + 0.5), rollW, fMin, fMax);
    const binLo = Math.max(0, Math.floor(Math.min(fLo, fHi) / binHz));
    const binHi = Math.min(maxBin, Math.ceil(Math.max(fLo, fHi) / binHz));
    let db = -Infinity;
    for (let b = binLo; b <= binHi; b++) {
      if (data[b] > db) db = data[b];
    }
    if (db === -Infinity) {
      db = data[Math.min(maxBin, Math.max(0, Math.round(xToFreq(px, rollW, fMin, fMax) / binHz)))];
    }
    const normalized = Math.max(0, Math.min(1, (db + WEBAUDIO_TO_DBFS - SPECTRUM_MIN_DB) / dbRange));
    points.push({ x: axisW + px, y: 0, normalized });
  }
  return points;
}

/**
 * Moving average with a window that widens with frequency — formants are
 * proportionally wider at high frequencies on a log axis. Shared by
 * ShortTermSpectrumPanel (Free Exercise) and ShortTermSpectrumComparisonPanel
 * (PracticeRoom, applied to the singer's own live/take curve only — the Song
 * reference curve is left raw/precise on purpose).
 */
export function smoothSpectrumEnvelope(points: SpectrumPoint[]): SpectrumPoint[] {
  const result: SpectrumPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const windowSize = Math.round(15 + (i / points.length) * 25);
    const start = Math.max(0, i - windowSize);
    const end = Math.min(points.length - 1, i + windowSize);
    let sum = 0, count = 0;
    for (let j = start; j <= end; j++) {
      sum += points[j].normalized;
      count++;
    }
    result.push({ x: points[i].x, y: 0, normalized: sum / count });
  }
  return result;
}

/**
 * Light fixed-window moving average — just enough to take the edge off
 * single-frame noise/jitter without flattening real harmonic peaks, unlike
 * smoothSpectrumEnvelope's much wider window (15-40 samples), which is
 * deliberately aggressive to extract a formant-envelope shape and is meant
 * to be drawn as an overlay ON TOP of the raw curve, not as a replacement
 * for it. Used where the curve itself needs to stay recognizable as an
 * actual spectrum (e.g. ShortTermSpectrumComparisonPanel's live/take line).
 */
export function smoothSpectrumLight(points: SpectrumPoint[], windowSize = 2): SpectrumPoint[] {
  const result: SpectrumPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(points.length - 1, i + windowSize);
    let sum = 0, count = 0;
    for (let j = start; j <= end; j++) {
      sum += points[j].normalized;
      count++;
    }
    result.push({ x: points[i].x, y: 0, normalized: sum / count });
  }
  return result;
}
