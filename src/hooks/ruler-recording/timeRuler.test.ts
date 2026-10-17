// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import "../../test/hookEnv";
import { createRecordingContext } from "../../test/fakeCanvas";
import {
  drawTimeRuler,
  formatRulerClock,
  tickInterval,
  useTimeRuler,
  type TimeRulerOptions,
  type TimeRulerState,
} from "./timeRuler";

describe("tickInterval", () => {
  it("picks the first step that keeps labels about 80 px apart", () => {
    expect(tickInterval(60, 600)).toBe(10);
    expect(tickInterval(10, 800)).toBe(1);
    expect(tickInterval(3600, 600)).toBe(600);
  });

  it("never goes above ten minutes", () => {
    expect(tickInterval(1e9, 100)).toBe(600);
  });
});

describe("formatRulerClock", () => {
  it("shows minutes and zero-padded seconds, truncating fractions", () => {
    expect(formatRulerClock(0)).toBe("0:00");
    expect(formatRulerClock(75.9)).toBe("1:15");
    expect(formatRulerClock(3605)).toBe("60:05");
  });
});

describe("drawTimeRuler", () => {
  const view = {
    width: 600, height: 24, duration: 120, minPxPerSec: 10, scrollTime: 0,
    punchIn: 10 as number | null, punchOut: 20 as number | null, metronomeOffset: 2, accentRgb: "1,2,3",
  };

  it("paints the punch region in the accent colour, with an I-beam cap on each edge", () => {
    const { ctx, log } = createRecordingContext();
    drawTimeRuler(ctx, view);
    expect(log).toContain('fillStyle="rgba(1,2,3,0.22)"');
    expect(log).toContain("fillRect(100,0,100,24)");
    expect(log).toContain("fillRect(97,0,6,4)");
    expect(log).toContain("fillRect(197,0,6,4)");
  });

  it.each([[null, 20], [10, null], [20, 10], [10, 10]])("draws no region for in=%s out=%s", (punchIn, punchOut) => {
    const { ctx, log } = createRecordingContext();
    drawTimeRuler(ctx, { ...view, punchIn, punchOut });
    expect(log.some((l) => l.includes("rgba(1,2,3"))).toBe(false);
  });

  it("labels only the ticks that fit, spaced from the visible window", () => {
    const { ctx, log } = createRecordingContext();
    drawTimeRuler(ctx, { ...view, scrollTime: 30, punchIn: null, punchOut: null });
    const labels = log.filter((l) => l.startsWith("fillText(")).map((l) => l.split(",")[0]);
    expect(labels[0]).toBe('fillText("0:30"');
    expect(labels.length).toBeGreaterThan(3);
  });

  it("draws the metronome marker at its own position, dashed, in the fixed blue", () => {
    const { ctx, log } = createRecordingContext();
    drawTimeRuler(ctx, { ...view, punchIn: null, punchOut: null, metronomeOffset: 5 });
    expect(log).toContain("setLineDash([3,2])");
    expect(log).toContain("moveTo(50,0)");
    expect(log).toContain('strokeStyle="rgba(74,158,255,0.85)"');
  });
});

describe("useTimeRuler", () => {
  let log: string[];
  let state: TimeRulerState;
  let actions: { setPunchIn: Mock<(t: number) => void>; setPunchOut: Mock<(t: number) => void>; clearPunch: Mock<() => void>; setMetronomeOffset: Mock<(t: number) => void> };

  beforeEach(() => {
    const rec = createRecordingContext();
    log = rec.log;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(rec.ctx as never);
    Object.defineProperty(HTMLCanvasElement.prototype, "offsetWidth", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLCanvasElement.prototype, "offsetHeight", { configurable: true, get: () => 24 });
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    actions = { setPunchIn: vi.fn<(t: number) => void>(), setPunchOut: vi.fn<(t: number) => void>(), clearPunch: vi.fn<() => void>(), setMetronomeOffset: vi.fn<(t: number) => void>() };
    state = {
      duration: 120, punchIn: null, punchOut: null, isRecording: false, minPxPerSec: 10, scrollTime: 0, metronomeOffset: 50,
      ...actions,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(over: Partial<TimeRulerOptions> = {}) {
    const options: TimeRulerOptions = { useStore: (sel) => sel(state), accentRgb: "233,69,96", lockWhileRecording: true, ...over };
    function Harness() {
      const { canvasRef, cursor, handlers } = useTimeRuler(options);
      return createElement("canvas", { ref: canvasRef, style: { cursor }, "data-testid": "ruler", ...handlers });
    }
    const { container, rerender } = render(createElement(Harness));
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    return { canvas, rerender: () => rerender(createElement(Harness)) };
  }

  function mouse(canvas: HTMLCanvasElement, type: "mouseDown" | "mouseMove" | "mouseUp" | "mouseLeave", x: number) {
    // React derives mouseleave from mouseout (no related target = left the element).
    const name = type === "mouseLeave" ? "mouseout" : type.toLowerCase();
    const ev = new MouseEvent(name, { bubbles: true, cancelable: true, relatedTarget: null });
    Object.defineProperty(ev, "offsetX", { value: x });
    fireEvent(canvas, ev);
  }

  it("sizes the canvas to its box and draws once on mount", () => {
    const { canvas } = mount();
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(24);
    expect(log).toContain('fillStyle="#0d1b2e"');
  });

  it("draws nothing without a song", () => {
    state.duration = 0;
    mount();
    expect(log).toEqual([]);
  });

  it("uses the accent it is given", () => {
    state.punchIn = 10;
    state.punchOut = 20;
    mount({ accentRgb: "245,158,11" });
    expect(log).toContain('fillStyle="rgba(245,158,11,0.22)"');
  });

  it("drags out a new region and commits it, rounded, on release", () => {
    const { canvas } = mount();
    mouse(canvas, "mouseDown", 100);
    mouse(canvas, "mouseMove", 303);
    mouse(canvas, "mouseUp", 303);
    expect(actions.setPunchIn).toHaveBeenCalledWith(10);
    expect(actions.setPunchOut).toHaveBeenCalledWith(30.3);
  });

  it("previews the region while dragging without committing", () => {
    const { canvas } = mount();
    const before = log.length;
    mouse(canvas, "mouseDown", 100);
    mouse(canvas, "mouseMove", 300);
    expect(log.length).toBeGreaterThan(before);
    expect(log).toContain('fillStyle="rgba(233,69,96,0.22)"');
    expect(actions.setPunchIn).not.toHaveBeenCalled();
  });

  it("treats a click as clearing the region", () => {
    state.punchIn = 10;
    state.punchOut = 20;
    const { canvas } = mount();
    mouse(canvas, "mouseDown", 400);
    mouse(canvas, "mouseUp", 402);
    expect(actions.clearPunch).toHaveBeenCalled();
  });

  it("moves the grabbed edge and keeps the other", () => {
    state.punchIn = 10;
    state.punchOut = 30;
    const { canvas } = mount();
    mouse(canvas, "mouseDown", 105);
    expect(canvas.style.cursor).toBe("ew-resize");
    mouse(canvas, "mouseUp", 50);
    expect(actions.setPunchIn).toHaveBeenCalledWith(5);
    expect(actions.setPunchOut).not.toHaveBeenCalled();
  });

  it("moves the metronome marker", () => {
    state.metronomeOffset = 5;
    const { canvas } = mount();
    mouse(canvas, "mouseDown", 52);
    mouse(canvas, "mouseMove", 80);
    mouse(canvas, "mouseUp", 80);
    expect(actions.setMetronomeOffset).toHaveBeenCalledWith(8);
    expect(actions.setPunchIn).not.toHaveBeenCalled();
  });

  it("ends a drag when the pointer leaves, committing where it was", () => {
    const { canvas } = mount();
    mouse(canvas, "mouseDown", 100);
    mouse(canvas, "mouseLeave", 300);
    expect(actions.setPunchOut).toHaveBeenCalledWith(30);
  });

  it("leaves the cursor alone but resets it to default when the pointer leaves with no drag", () => {
    const { canvas } = mount();
    mouse(canvas, "mouseLeave", 10);
    expect(canvas.style.cursor).toBe("default");
  });

  it("shows resize cursors over an edge or the metronome, crosshair elsewhere on a region", () => {
    state.punchIn = 10;
    state.punchOut = 30;
    state.metronomeOffset = 60;
    const { canvas } = mount();
    mouse(canvas, "mouseMove", 102);
    expect(canvas.style.cursor).toBe("ew-resize");
    mouse(canvas, "mouseMove", 200);
    expect(canvas.style.cursor).toBe("crosshair");
    mouse(canvas, "mouseMove", 598);
    expect(canvas.style.cursor).toBe("ew-resize");
  });

  it("does nothing on a press when there is no song", () => {
    state.duration = 0;
    const { canvas } = mount();
    mouse(canvas, "mouseDown", 100);
    mouse(canvas, "mouseUp", 300);
    expect(actions.setPunchIn).not.toHaveBeenCalled();
    expect(canvas.style.cursor).toBe("default");
  });

  describe("while recording", () => {
    beforeEach(() => {
      state.isRecording = true;
    });

    it("locks the ruler when asked to", () => {
      const { canvas } = mount({ lockWhileRecording: true });
      expect(canvas.style.cursor).toBe("default");
      mouse(canvas, "mouseDown", 100);
      mouse(canvas, "mouseUp", 300);
      expect(actions.setPunchIn).not.toHaveBeenCalled();
    });

    it("does not show the edge-hover cursor when locked", () => {
      state.punchIn = 10;
      state.punchOut = 30;
      state.metronomeOffset = 90;
      const { canvas } = mount({ lockWhileRecording: true });
      mouse(canvas, "mouseMove", 102);
      expect(canvas.style.cursor).toBe("default");
    });

    it("stays live when not asked to lock", () => {
      const { canvas } = mount({ lockWhileRecording: false });
      expect(canvas.style.cursor).toBe("crosshair");
      mouse(canvas, "mouseDown", 100);
      mouse(canvas, "mouseUp", 300);
      expect(actions.setPunchIn).toHaveBeenCalledWith(10);
    });
  });
});
