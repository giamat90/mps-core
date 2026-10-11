import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startMainBridge, type BridgeStream } from "./mainBridge";
import { EVT_COMMAND, EVT_DOCKED, EVT_HELLO, EVT_STATE } from "./protocol";

type Id = "lyrics" | "takes";
const isPanel = (v: unknown): v is Id => v === "lyrics" || v === "takes";

interface Shared {
  song: string;
  duration: number;
  n: number;
}
type Cmd = { type: "bump" } | { type: "seek"; time: number };

function harness(streams?: (send: (e: string, p: unknown) => void) => BridgeStream<Id>[]) {
  const player = { time: 0, playing: false, rate: 1, shared: { song: "a", duration: 100, n: 0 } as Shared };
  let notify: () => void = () => {};
  let clock = 1000;
  const handlers = new Map<string, (p: unknown) => void>();
  const emitted: { event: string; payload: unknown }[] = [];
  const applied: Cmd[] = [];
  const unlisten = vi.fn();
  const unsubscribe = vi.fn();

  const options = {
    isPanel,
    subscribe: (l: () => void) => {
      notify = l;
      return unsubscribe;
    },
    transport: () => ({ time: player.time, playing: player.playing, rate: player.rate }),
    shared: () => player.shared,
    parseCommand: (v: unknown): Cmd | null => {
      const o = v as { type?: string; time?: unknown } | null;
      if (o?.type === "bump") return { type: "bump" };
      if (o?.type === "seek" && typeof o.time === "number") return { type: "seek", time: o.time };
      return null;
    },
    apply: (c: Cmd) => applied.push(c),
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
    listen: async (event: string, cb: (p: unknown) => void) => {
      handlers.set(event, cb);
      return unlisten;
    },
    now: () => clock,
    streams,
  };
  return {
    player, emitted, applied, unlisten, unsubscribe, options,
    fire: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    notify: () => notify(),
    advance: (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    states: () => emitted.filter((e) => e.event === EVT_STATE).map((e) => e.payload as { transport: { time: number }; shared: Shared }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("main bridge", () => {
  it("publishes nothing and runs no timer until a window says hello", async () => {
    const h = harness();
    await startMainBridge(h.options);
    h.player.time = 5;
    h.notify();
    h.advance(1000);
    expect(h.emitted).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("answers hello with the whole state", async () => {
    const h = harness();
    await startMainBridge(h.options);
    h.player.time = 7;
    h.fire(EVT_HELLO, { panelId: "lyrics" });
    expect(h.states()).toHaveLength(1);
    expect(h.states()[0].transport.time).toBe(7);
    expect(h.states()[0].shared.song).toBe("a");
  });

  it("ignores a hello from a panel it does not know", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "waveform" });
    h.fire(EVT_HELLO, null);
    expect(h.emitted).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("sends again only when something changed", async () => {
    const h = harness();
    await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "takes" });
    h.states().length = 0;
    const before = h.emitted.length;
    h.notify();
    h.advance(200);
    expect(h.emitted.length).toBe(before);
    h.player.shared = { ...h.player.shared, n: 1 };
    h.notify();
    expect(h.emitted.length).toBe(before + 1);
  });

  it("sends a seek straight away and keeps a playing clock alive with a heartbeat", async () => {
    const h = harness();
    await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "takes" });
    h.player.playing = true;
    h.notify();
    const afterPlay = h.states().length;
    h.player.time = 50;
    h.notify();
    expect(h.states().length).toBe(afterPlay + 1);
    h.player.time = 50 + 1.2;
    h.advance(1200);
    expect(h.states().length).toBeGreaterThan(afterPlay + 1);
  });

  it("applies a parsed command and drops what it cannot parse", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    await startMainBridge(h.options);
    h.fire(EVT_COMMAND, { type: "seek", time: 3 });
    h.fire(EVT_COMMAND, { type: "rm -rf" });
    expect(h.applied).toEqual([{ type: "seek", time: 3 }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stops the timer when the last window is docked, and starts it again for the next", async () => {
    const h = harness();
    await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "lyrics" });
    h.fire(EVT_HELLO, { panelId: "takes" });
    expect(vi.getTimerCount()).toBe(1);
    h.fire(EVT_DOCKED, "lyrics");
    expect(vi.getTimerCount()).toBe(1);
    h.fire(EVT_DOCKED, "takes");
    expect(vi.getTimerCount()).toBe(0);
    h.fire(EVT_HELLO, { panelId: "lyrics" });
    expect(vi.getTimerCount()).toBe(1);
    expect(h.states().length).toBeGreaterThan(1);
  });

  it("gives a new window the whole picture even if nothing changed", async () => {
    const h = harness();
    await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "lyrics" });
    const first = h.states().length;
    h.fire(EVT_HELLO, { panelId: "takes" });
    expect(h.states().length).toBe(first + 1);
  });

  it("runs extra streams: tick while attached, hello per window, dispose at the end", async () => {
    const stream = { tick: vi.fn(), hello: vi.fn(), dispose: vi.fn() };
    const h = harness(() => [stream]);
    const bridge = await startMainBridge(h.options);
    h.advance(100);
    expect(stream.tick).not.toHaveBeenCalled();
    h.fire(EVT_HELLO, { panelId: "takes" });
    expect(stream.hello).toHaveBeenCalledWith("takes", new Set(["takes"]));
    h.advance(34);
    expect(stream.tick).toHaveBeenCalled();
    bridge.dispose();
    expect(stream.dispose).toHaveBeenCalled();
  });

  it("lets a stream send through the bridge's own sender", async () => {
    let send: (e: string, p: unknown) => void = () => {};
    const h = harness((s) => {
      send = s;
      return [];
    });
    await startMainBridge(h.options);
    send("mps:live", { a: 1 });
    expect(h.emitted).toContainEqual({ event: "mps:live", payload: { a: 1 } });
  });

  it("does not let a failing emit break the bridge", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.options.emit = () => Promise.reject(new Error("window gone"));
    await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "takes" });
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
  });

  it("dispose releases the subscription, the timer and every listener", async () => {
    const h = harness();
    const bridge = await startMainBridge(h.options);
    h.fire(EVT_HELLO, { panelId: "takes" });
    bridge.dispose();
    expect(h.unsubscribe).toHaveBeenCalled();
    expect(h.unlisten).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up what it had set up when a listener cannot be registered", async () => {
    const h = harness();
    let calls = 0;
    h.options.listen = async () => {
      calls += 1;
      if (calls === 2) throw new Error("no events");
      return h.unlisten;
    };
    await expect(startMainBridge(h.options)).rejects.toThrow("no events");
    expect(h.unsubscribe).toHaveBeenCalled();
    expect(h.unlisten).toHaveBeenCalledTimes(1);
  });
});
