import { barEnd, formatSignature, type BarMap } from "../../meter";

/** A bar label needs this much room, so numbers are thinned out as the song is zoomed out. */
const LABEL_SPACING_PX = 34;
/** Pulse ticks inside a bar only show while they are at least this far apart. */
const PULSE_TICK_SPACING_PX = 7;
const STEPS = [1, 2, 4, 5, 8, 10, 16, 20, 25, 50, 100, 200, 500];

export interface BarLinesView {
  width: number;
  height: number;
  minPxPerSec: number;
  scrollTime: number;
  accentRgb: string;
}

/**
 * The bars of a map on the ruler: a line where each starts, the bar number where there is room (with the signature
 * wherever it changes), and a small tick for each pulse when zoomed in far enough.
 */
export function drawBarLines(ctx: CanvasRenderingContext2D, meter: BarMap, view: BarLinesView): void {
  const { width: W, height: H, minPxPerSec, scrollTime, accentRgb } = view;
  const tX = (t: number) => (t - scrollTime) * minPxPerSec;
  const from = scrollTime;
  const to = scrollTime + W / minPxPerSec;
  const typical = meter.bars.length > 0 ? (meter.end - meter.bars[0].start) / meter.bars.length : 1;
  const step = STEPS.find((n) => n * typical * minPxPerSec >= LABEL_SPACING_PX) ?? STEPS[STEPS.length - 1];
  const fontSize = Math.max(9, Math.round(H * 0.34));

  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (let i = 0; i < meter.bars.length; i++) {
    const bar = meter.bars[i];
    const end = barEnd(meter, i);
    if (end < from) continue;
    if (bar.start > to) break;
    const x = Math.round(tX(bar.start)) + 0.5;
    const barPx = (end - bar.start) * minPxPerSec;

    if (barPx / bar.num >= PULSE_TICK_SPACING_PX) {
      ctx.strokeStyle = `rgba(${accentRgb},0.4)`;
      ctx.lineWidth = 1;
      for (let k = 1; k < bar.num; k++) {
        const px = Math.round(x + (barPx * k) / bar.num) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, H * 0.78);
        ctx.lineTo(px, H);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = `rgba(${accentRgb},0.85)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.5);
    ctx.lineTo(x, H);
    ctx.stroke();

    const changed = i === 0 || formatSignature(meter.bars[i - 1]) !== formatSignature(bar);
    if (changed || i % step === 0) {
      ctx.fillStyle = changed ? "#ffffff" : `rgba(${accentRgb},0.95)`;
      ctx.fillText(changed ? `${i + 1} ${formatSignature(bar)}` : String(i + 1), x + 3, 1);
    }
  }
  ctx.textBaseline = "alphabetic";
}
