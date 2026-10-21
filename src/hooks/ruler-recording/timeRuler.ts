import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from "react";
import {
  finishPunchDrag,
  grabPunchEdge,
  startPunchDrag,
  updatePunchPreview,
  type PunchCommit,
  type PunchDrag,
} from "../../punch";
import type { BarMap } from "../../meter";
import { drawBarLines } from "./barLines";
import type { StoreHook } from "./storeHook";

const HANDLE_HIT_PX = 12;
const TICK_INTERVALS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** Seconds between ruler ticks so that labels stay about 80 px apart. */
export function tickInterval(duration: number, widthPx: number): number {
  const raw = (duration / widthPx) * 80;
  for (const n of TICK_INTERVALS_S) {
    if (n >= raw) return n;
  }
  return 600;
}

export function formatRulerClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface TimeRulerView {
  width: number;
  height: number;
  duration: number;
  minPxPerSec: number;
  scrollTime: number;
  punchIn: number | null;
  punchOut: number | null;
  metronomeOffset: number;
  /** The punch region's colour as "r,g,b", the one thing the apps style differently. */
  accentRgb: string;
  /** The bars of the song, when it has a map; they take the place of the single downbeat marker. */
  meter?: BarMap | null;
}

export function drawTimeRuler(ctx: CanvasRenderingContext2D, view: TimeRulerView): void {
  const { width: W, height: H, duration, minPxPerSec, scrollTime, punchIn, punchOut, accentRgb } = view;
  const tX = (t: number) => (t - scrollTime) * minPxPerSec;
  const visibleDuration = W / minPxPerSec;

  ctx.fillStyle = "#0d1b2e";
  ctx.fillRect(0, 0, W, H);

  if (punchIn !== null && punchOut !== null && punchOut > punchIn) {
    const x1 = tX(punchIn);
    const x2 = tX(punchOut);
    ctx.fillStyle = `rgba(${accentRgb},0.22)`;
    ctx.fillRect(x1, 0, x2 - x1, H);
    ctx.strokeStyle = `rgba(${accentRgb},0.85)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, H); ctx.stroke();
    ctx.fillStyle = `rgba(${accentRgb},0.9)`;
    ctx.fillRect(x1 - 3, 0, 6, 4);
    ctx.fillRect(x2 - 3, 0, 6, 4);
  }

  // Spaced from the visible window, not the whole song, so ticks get finer as zoom increases.
  const interval = tickInterval(visibleDuration, W);
  const fontSize = Math.max(10, Math.round(H * 0.42));
  ctx.font = `${fontSize}px monospace`;
  const visibleStart = Math.max(0, Math.floor(scrollTime / interval) * interval);
  const visibleEnd = Math.min(duration, scrollTime + visibleDuration);
  for (let t = visibleStart; t <= visibleEnd + 0.001; t += interval) {
    const x = Math.round(tX(t));
    ctx.strokeStyle = "#3a4a5e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x, H * 0.35);
    ctx.stroke();
    if (x + 3 < W) {
      ctx.fillStyle = "#7a8a9e";
      ctx.textAlign = "left";
      ctx.fillText(formatRulerClock(t), x + 3, H * 0.62);
    }
  }

  ctx.strokeStyle = "#2a3a4e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 0.5);
  ctx.lineTo(W, H - 0.5);
  ctx.stroke();

  if (view.meter && view.meter.bars.length > 0) {
    drawBarLines(ctx, view.meter, { width: W, height: H, minPxPerSec, scrollTime, accentRgb });
    return;
  }

  // Dashed line plus a flag at the bottom edge, draggable to line the click track up with the downbeat.
  const mx = tX(view.metronomeOffset);
  ctx.strokeStyle = "rgba(74,158,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(mx, 0);
  ctx.lineTo(mx, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(74,158,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(mx, H);
  ctx.lineTo(mx - 5, H - 7);
  ctx.lineTo(mx + 5, H - 7);
  ctx.closePath();
  ctx.fill();
}

/** The slice of an app's player store the ruler reads. */
export interface TimeRulerState {
  duration: number;
  punchIn: number | null;
  punchOut: number | null;
  isRecording: boolean;
  minPxPerSec: number;
  scrollTime: number;
  metronomeOffset: number;
  /** The song's bars, if an app keeps them. */
  meterMap?: BarMap | null;
  setPunchIn: (t: number) => void;
  setPunchOut: (t: number) => void;
  clearPunch: () => void;
  setMetronomeOffset: (t: number) => void;
}

export interface TimeRulerOptions {
  useStore: StoreHook<TimeRulerState>;
  accentRgb: string;
  /** Recording freezes the punch region (VPS); false leaves the ruler live (SPS). */
  lockWhileRecording: boolean;
}

export interface TimeRulerHandlers {
  onMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: (e: MouseEvent<HTMLCanvasElement>) => void;
}

export interface TimeRulerBinding {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The cursor for the idle canvas; hovering and dragging change it on the element directly. */
  cursor: "default" | "crosshair";
  handlers: TimeRulerHandlers;
}

type RulerDrag = { kind: "metronome" } | { kind: "punch"; drag: PunchDrag };

export function useTimeRuler({ useStore, accentRgb, lockWhileRecording }: TimeRulerOptions): TimeRulerBinding {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = useStore((s) => s.duration);
  const punchIn = useStore((s) => s.punchIn);
  const punchOut = useStore((s) => s.punchOut);
  const locked = useStore((s) => lockWhileRecording && s.isRecording);
  const setPunchIn = useStore((s) => s.setPunchIn);
  const setPunchOut = useStore((s) => s.setPunchOut);
  const clearPunch = useStore((s) => s.clearPunch);
  const minPxPerSec = useStore((s) => s.minPxPerSec);
  const scrollTime = useStore((s) => s.scrollTime);
  const metronomeOffset = useStore((s) => s.metronomeOffset);
  const setMetronomeOffset = useStore((s) => s.setMetronomeOffset);
  const meter = useStore((s) => s.meterMap ?? null);

  const drag = useRef<RulerDrag | null>(null);

  const draw = useCallback(
    (overrideIn?: number | null, overrideOut?: number | null, overrideMetronome?: number) => {
      const canvas = canvasRef.current;
      if (!canvas || duration <= 0 || minPxPerSec <= 0) return;
      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawTimeRuler(ctx, {
        width: W,
        height: H,
        duration,
        minPxPerSec,
        scrollTime,
        punchIn: overrideIn !== undefined ? overrideIn : punchIn,
        punchOut: overrideOut !== undefined ? overrideOut : punchOut,
        metronomeOffset: overrideMetronome !== undefined ? overrideMetronome : metronomeOffset,
        accentRgb,
        meter,
      });
    },
    [duration, punchIn, punchOut, minPxPerSec, scrollTime, metronomeOffset, accentRgb, meter],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    };
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    sync();
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  const xToTime = (offsetX: number): number => {
    if (duration <= 0 || minPxPerSec <= 0) return 0;
    return Math.max(0, Math.min(duration, scrollTime + offsetX / minPxPerSec));
  };

  const setCursor = (c: string) => {
    if (canvasRef.current) canvasRef.current.style.cursor = c;
  };

  const edgeAt = (offsetX: number) =>
    grabPunchEdge(
      offsetX,
      punchIn === null ? null : (punchIn - scrollTime) * minPxPerSec,
      punchOut === null ? null : (punchOut - scrollTime) * minPxPerSec,
      HANDLE_HIT_PX,
    );

  const commitPunch = (commit: PunchCommit) => {
    if (commit.type === "in") setPunchIn(commit.t);
    else if (commit.type === "out") setPunchOut(commit.t);
    else if (commit.type === "clear") clearPunch();
    else {
      setPunchIn(commit.inT);
      setPunchOut(commit.outT);
    }
  };

  const idleCursor = locked || duration <= 0 ? "default" : "crosshair";

  const onMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (locked || duration <= 0) return;
    e.preventDefault();
    const { offsetX } = e.nativeEvent;

    const metroX = (metronomeOffset - scrollTime) * minPxPerSec;
    if (!meter && Math.abs(offsetX - metroX) <= HANDLE_HIT_PX) {
      drag.current = { kind: "metronome" };
      setCursor("ew-resize");
      return;
    }

    const started = startPunchDrag(edgeAt(offsetX), xToTime(offsetX), punchIn, punchOut);
    drag.current = { kind: "punch", drag: started.drag };
    if (started.drag.mode === "create") draw(started.preview.inT, started.preview.outT);
    else setCursor("ew-resize");
  };

  const onMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const { offsetX } = e.nativeEvent;
    const active = drag.current;
    const t = xToTime(offsetX);

    if (!active) {
      const metroX = (metronomeOffset - scrollTime) * minPxPerSec;
      if (!meter && Math.abs(offsetX - metroX) <= HANDLE_HIT_PX) {
        setCursor("ew-resize");
        return;
      }
      if (!locked && punchIn !== null && punchOut !== null) {
        setCursor(edgeAt(offsetX) !== "create" ? "ew-resize" : "crosshair");
      }
      return;
    }

    if (active.kind === "metronome") {
      draw(undefined, undefined, t);
    } else {
      const preview = updatePunchPreview(active.drag, t);
      draw(preview.inT, preview.outT);
    }
  };

  const onMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;

    const t = xToTime(e.nativeEvent.offsetX);
    if (active.kind === "metronome") setMetronomeOffset(Math.round(t * 10) / 10);
    else commitPunch(finishPunchDrag(active.drag, t));

    setCursor(idleCursor);
  };

  const onMouseLeave = (e: MouseEvent<HTMLCanvasElement>) => {
    if (drag.current) onMouseUp(e);
    else setCursor("default");
  };

  return { canvasRef, cursor: idleCursor, handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave } };
}
