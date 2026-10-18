// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "../../test/hookEnv";
import {
  detachedTitle,
  dockSafely,
  runBridge,
  startMainBridgeHost,
  useBridgeRun,
  useMainBridgeHost,
  type MainBridgeHostOptions,
} from "./bridgeHost";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("runBridge", () => {
  it("keeps the bridge until stopped, then disposes it and runs the cleanup", async () => {
    const dispose = vi.fn();
    const cleanup = vi.fn();
    const stop = runBridge(() => ({ bridge: Promise.resolve({ dispose }), cleanup }), "failed:");
    await flush();
    expect(dispose).not.toHaveBeenCalled();
    stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a bridge that comes up after it was stopped", async () => {
    const dispose = vi.fn();
    let up: (b: { dispose(): void }) => void = () => {};
    const stop = runBridge(() => ({ bridge: new Promise((r) => (up = r)) }), "failed:");
    stop();
    up({ dispose });
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("logs a bridge that fails to start instead of throwing, and stops cleanly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = runBridge(() => ({ bridge: Promise.reject(new Error("no")) }), "could not start:");
    await flush();
    expect(error).toHaveBeenCalledWith("could not start:", expect.any(Error));
    expect(() => stop()).not.toThrow();
  });
});

describe("useBridgeRun", () => {
  it("starts on mount, restarts when the deps change and stops on unmount", async () => {
    const disposed: string[] = [];
    const starts: string[] = [];
    const { rerender, unmount } = renderHook(
      ({ panel }) =>
        useBridgeRun(
          () => {
            starts.push(panel);
            return { bridge: Promise.resolve({ dispose: () => disposed.push(panel) }) };
          },
          "failed:",
          [panel],
        ),
      { initialProps: { panel: "a" } },
    );
    await flush();
    rerender({ panel: "a" });
    expect(starts).toEqual(["a"]);
    rerender({ panel: "b" });
    await flush();
    expect(starts).toEqual(["a", "b"]);
    expect(disposed).toEqual(["a"]);
    unmount();
    expect(disposed).toEqual(["a", "b"]);
  });
});

describe("dockSafely and detachedTitle", () => {
  it("logs a dock that fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    dockSafely(() => Promise.reject(new Error("closed")));
    await flush();
    expect(error).toHaveBeenCalledWith("[detached] could not dock:", expect.any(Error));
  });

  it("asks to dock without logging when it works", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const dock = vi.fn().mockResolvedValue(undefined);
    dockSafely(dock);
    await flush();
    expect(dock).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("titles a window with the panel and, when there is one, the song", () => {
    const titles = { lyrics: "Lyrics", takes: "Takes" };
    expect(detachedTitle(titles, "lyrics")).toBe("Lyrics");
    expect(detachedTitle(titles, "takes", null)).toBe("Takes");
    expect(detachedTitle(titles, "takes", "Hey Jude")).toBe("Takes — Hey Jude");
  });
});

function fakeHost(over: Partial<MainBridgeHostOptions<"a" | "b">> = {}) {
  const visibleListeners: Array<(s: { visible: Record<string, boolean> }) => void> = [];
  let visible: Record<string, boolean> = { a: true, b: true };
  const detached = {
    detached: {} as Partial<Record<string, boolean>>,
    markDocked: vi.fn<(panel: string) => void>(),
    reset: vi.fn<() => void>(),
  };
  const bridge = { dispose: vi.fn() };
  const unlisten = vi.fn();
  let docked: (id: string) => void = () => {};
  const options: MainBridgeHostOptions<"a" | "b"> = {
    startBridge: vi.fn().mockResolvedValue(bridge),
    ids: ["a", "b"],
    panels: {
      getState: () => ({ visible }),
      subscribe: (l) => {
        visibleListeners.push(l);
        return () => visibleListeners.splice(visibleListeners.indexOf(l), 1);
      },
    },
    detached: { getState: () => detached },
    listenDocked: (cb) => {
      docked = cb;
      return Promise.resolve(unlisten);
    },
    closePanel: vi.fn().mockResolvedValue(undefined),
    closeAll: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return {
    options,
    bridge,
    detached,
    unlisten,
    listeners: visibleListeners,
    setVisible: (next: Record<string, boolean>) => {
      visible = next;
      visibleListeners.forEach((l) => l({ visible }));
    },
    dock: (id: string) => docked(id),
  };
}

describe("startMainBridgeHost", () => {
  it("starts the bridge and marks a panel docked when its window says so", async () => {
    const h = fakeHost();
    const stop = startMainBridgeHost(h.options);
    await flush();
    expect(h.options.startBridge).toHaveBeenCalledTimes(1);
    h.dock("a");
    expect(h.detached.markDocked).toHaveBeenCalledWith("a");
    stop();
  });

  it("closes the window of a detached panel that is hidden, and only that one", async () => {
    const h = fakeHost();
    h.detached.detached = { a: true };
    const stop = startMainBridgeHost(h.options);
    h.setVisible({ a: true, b: false });
    expect(h.options.closePanel).not.toHaveBeenCalled();
    h.setVisible({ a: false, b: false });
    expect(h.options.closePanel).toHaveBeenCalledTimes(1);
    expect(h.options.closePanel).toHaveBeenCalledWith("a");
    stop();
  });

  it("warns, rather than throws, when a window cannot be closed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = fakeHost({ closePanel: vi.fn().mockRejectedValue(new Error("gone")) });
    h.detached.detached = { a: true };
    const stop = startMainBridgeHost(h.options);
    h.setVisible({ a: false, b: true });
    await flush();
    expect(warn).toHaveBeenCalledWith("[detached] could not close the a window:", expect.any(Error));
    stop();
  });

  it("stops everything on leaving: bridge, listeners, windows and the detached state", async () => {
    const h = fakeHost();
    const stop = startMainBridgeHost(h.options);
    await flush();
    stop();
    await flush();
    expect(h.listeners).toHaveLength(0);
    expect(h.bridge.dispose).toHaveBeenCalledTimes(1);
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    expect(h.options.closeAll).toHaveBeenCalledTimes(1);
    expect(h.detached.reset).toHaveBeenCalledTimes(1);
  });

  it("warns when it cannot stop listening or close the windows, and still resets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = fakeHost({
      listenDocked: () => Promise.reject(new Error("no listener")),
      closeAll: vi.fn().mockRejectedValue(new Error("no windows")),
    });
    const stop = startMainBridgeHost(h.options);
    stop();
    await flush();
    expect(warn).toHaveBeenCalledWith("[detached] could not stop listening for docked panels:", expect.any(Error));
    expect(warn).toHaveBeenCalledWith("[detached] could not close detached windows:", expect.any(Error));
    expect(h.detached.reset).toHaveBeenCalled();
  });
});

describe("useMainBridgeHost", () => {
  it("runs for as long as the component lives", async () => {
    const h = fakeHost();
    const { unmount } = renderHook(() => useMainBridgeHost(() => h.options));
    await flush();
    expect(h.options.startBridge).toHaveBeenCalledTimes(1);
    unmount();
    await flush();
    expect(h.options.closeAll).toHaveBeenCalledTimes(1);
  });
});
