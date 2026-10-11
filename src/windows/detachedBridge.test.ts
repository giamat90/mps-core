import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDetachedBridge } from "./detachedBridge";
import { EVT_COMMAND, EVT_HELLO, EVT_STATE, type TransportSnapshot } from "./protocol";

interface Shared {
  duration: number;
  song: string;
}
const isShared = (v: unknown): v is Shared =>
  typeof v === "object" && v !== null && typeof (v as Shared).duration === "number" && typeof (v as Shared).song === "string";

function setup() {
  let clock = 10_000;
  const handlers = new Map<string, (p: unknown) => void>();
  const emitted: { event: string; payload: unknown }[] = [];
  const times: number[] = [];
  const applied: { shared: Shared; transport: TransportSnapshot; time: number }[] = [];
  const unlisten = vi.fn();
  const uninstall = vi.fn();
  let source: (() => number) | null = null;

  const options = {
    panelId: "lyrics" as const,
    isShared,
    applyShared: (shared: Shared, transport: TransportSnapshot, time: number) => applied.push({ shared, transport, time }),
    writeTime: (t: number) => times.push(t),
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
    listen: async (event: string, cb: (p: unknown) => void) => {
      handlers.set(event, cb);
      return unlisten;
    },
    now: () => clock,
    installTimeSource: (s: () => number) => {
      source = s;
      return uninstall;
    },
    listeners: {} as Record<string, (p: unknown) => void>,
  };
  const state = (time: number, playing = false, duration = 100) => ({
    transport: { time, playing, rate: 1, sentAt: clock },
    shared: { duration, song: "a" },
  });
  return {
    options, emitted, times, applied, unlisten, uninstall,
    source: () => source,
    fire: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    state,
    advance: (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("detached bridge", () => {
  it("says hello with its panel once it is listening", async () => {
    const t = setup();
    await createDetachedBridge(t.options).start();
    expect(t.emitted).toEqual([{ event: EVT_HELLO, payload: { panelId: "lyrics" } }]);
  });

  it("hands the shared state to the app together with the extrapolated time", async () => {
    const t = setup();
    await createDetachedBridge(t.options).start();
    t.fire(EVT_STATE, t.state(20, true));
    t.advance(500);
    t.fire(EVT_STATE, { ...t.state(30, true) });
    expect(t.applied[0].time).toBeCloseTo(20, 3);
    expect(t.applied[1].transport.time).toBe(30);
    expect(t.applied[1].shared.song).toBe("a");
  });

  it("writes the playhead every tick while playing, and stops writing when paused and unchanged", async () => {
    const t = setup();
    await createDetachedBridge(t.options).start();
    t.fire(EVT_STATE, t.state(10, true));
    t.advance(100);
    const whilePlaying = t.times.length;
    expect(whilePlaying).toBeGreaterThanOrEqual(2);
    expect(t.times[t.times.length - 1]).toBeGreaterThan(10);
    t.fire(EVT_STATE, t.state(15, false));
    t.advance(100);
    const afterPause = t.times.length;
    t.advance(300);
    expect(t.times.length).toBe(afterPause);
  });

  it("never runs past the duration", async () => {
    const t = setup();
    await createDetachedBridge(t.options).start();
    t.fire(EVT_STATE, t.state(99, true, 100));
    t.advance(5000);
    expect(t.times[t.times.length - 1]).toBe(100);
  });

  it("exposes the mirrored clock as a time source and removes it on dispose", async () => {
    const t = setup();
    const bridge = createDetachedBridge(t.options);
    await bridge.start();
    t.fire(EVT_STATE, t.state(40, false));
    expect(t.source()?.()).toBe(40);
    bridge.dispose();
    expect(t.uninstall).toHaveBeenCalled();
  });

  it("ignores a malformed state message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = setup();
    await createDetachedBridge(t.options).start();
    t.fire(EVT_STATE, { transport: { time: "x" }, shared: {} });
    t.fire(EVT_STATE, null);
    expect(t.applied).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("sends commands to the main window", async () => {
    const t = setup();
    const bridge = createDetachedBridge(t.options);
    await bridge.start();
    bridge.command({ type: "seek", time: 3 });
    expect(t.emitted[t.emitted.length - 1]).toEqual({ event: EVT_COMMAND, payload: { type: "seek", time: 3 } });
  });

  it("moves the local playhead at once on a seek, before the main window answers", async () => {
    const t = setup();
    const bridge = createDetachedBridge(t.options);
    await bridge.start();
    t.fire(EVT_STATE, t.state(10, true));
    bridge.seekLocal(60);
    expect(t.times[t.times.length - 1]).toBe(60);
    expect(t.source()?.()).toBe(60);
    t.advance(1000);
    expect(t.times[t.times.length - 1]).toBeCloseTo(61, 1);
  });

  it("routes extra events to the app's listeners", async () => {
    const t = setup();
    const live = vi.fn();
    t.options.listeners = { "mps:live": live };
    await createDetachedBridge(t.options).start();
    t.fire("mps:live", { a: 1 });
    expect(live).toHaveBeenCalledWith({ a: 1 });
  });

  it("dispose releases every listener and the timer, and is safe twice", async () => {
    const t = setup();
    t.options.listeners = { "mps:live": () => {} };
    const bridge = createDetachedBridge(t.options);
    await bridge.start();
    bridge.dispose();
    bridge.dispose();
    expect(t.unlisten).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up and rejects when a listener cannot be set, without saying hello", async () => {
    const t = setup();
    let calls = 0;
    t.options.listen = async () => {
      calls += 1;
      if (calls === 2) throw new Error("no events");
      return t.unlisten;
    };
    t.options.listeners = { "mps:live": () => {} };
    await expect(createDetachedBridge(t.options).start()).rejects.toThrow("no events");
    expect(t.uninstall).toHaveBeenCalled();
    expect(t.unlisten).toHaveBeenCalledTimes(1);
    expect(t.emitted).toEqual([]);
  });
});
