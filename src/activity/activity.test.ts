import { describe, it, expect, vi } from "vitest";
import { createActivityStore, createTrackedInvoke, describeActivity } from "./index";

const clock = () => {
  let t = 0;
  return { now: () => t, tick: (ms: number) => void (t += ms) };
};

describe("createActivityStore", () => {
  it("starts idle", () => {
    expect(createActivityStore().getState().tasks).toEqual([]);
  });

  it("begin adds an indeterminate task and end removes it, once", () => {
    const store = createActivityStore();
    const a = store.getState().begin("Transposing");
    expect(store.getState().tasks.map((t) => [t.label, t.progress])).toEqual([["Transposing", null]]);
    a.end();
    a.end();
    expect(store.getState().tasks).toEqual([]);
  });

  it("progress is clamped, non-finite means unknown, and a finished task ignores updates", () => {
    const store = createActivityStore();
    const h = store.getState().begin("Export");
    h.setProgress(1.7);
    expect(store.getState().tasks[0].progress).toBe(1);
    h.setProgress(-3);
    expect(store.getState().tasks[0].progress).toBe(0);
    h.setProgress(Number.NaN);
    expect(store.getState().tasks[0].progress).toBeNull();
    h.setLabel("Zipping");
    expect(store.getState().tasks[0].label).toBe("Zipping");
    h.end();
    h.setProgress(0.5);
    h.setLabel("late");
    expect(store.getState().tasks).toEqual([]);
  });

  it("refuses an empty label", () => {
    expect(() => createActivityStore().getState().begin("")).toThrow(/label/);
  });

  it("tracks a promise and passes its value through", async () => {
    const store = createActivityStore();
    const p = store.getState().track("Loading", async () => 42);
    expect(store.getState().tasks).toHaveLength(1);
    await expect(p).resolves.toBe(42);
    expect(store.getState().tasks).toEqual([]);
  });

  it("ends the task and rethrows when the work fails", async () => {
    const store = createActivityStore();
    await expect(store.getState().track("Loading", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(store.getState().tasks).toEqual([]);
  });

  it("ends the task when the work function throws before returning a promise", async () => {
    const store = createActivityStore();
    await expect(
      store.getState().track("Loading", () => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");
    expect(store.getState().tasks).toEqual([]);
  });

  it("keeps independent tasks apart", () => {
    const store = createActivityStore();
    const a = store.getState().begin("A");
    store.getState().begin("B");
    a.end();
    expect(store.getState().tasks.map((t) => t.label)).toEqual(["B"]);
  });
});

describe("describeActivity", () => {
  it("is null when idle", () => {
    expect(describeActivity([])).toBeNull();
  });

  it("names the task begun last and counts the rest", () => {
    const c = clock();
    const store = createActivityStore({ now: c.now });
    store.getState().begin("Opening song");
    c.tick(10);
    const b = store.getState().begin("Transposing");
    b.setProgress(0.25);
    expect(describeActivity(store.getState().tasks)).toEqual({ label: "Transposing", progress: 0.25, others: 1 });
  });

  it("breaks a tie by the later task", () => {
    const store = createActivityStore({ now: () => 5 });
    store.getState().begin("A");
    store.getState().begin("B");
    expect(describeActivity(store.getState().tasks)?.label).toBe("B");
  });
});

describe("createTrackedInvoke", () => {
  it("tracks labelled commands and passes the arguments and result through", async () => {
    const store = createActivityStore();
    let during = 0;
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      during = store.getState().tasks.length;
      return { command, args } as never;
    });
    const tracked = createTrackedInvoke(store, { pitch_shift_song: "Transposing" }, invoke);
    await expect(tracked("pitch_shift_song", { nSteps: 2 })).resolves.toEqual({ command: "pitch_shift_song", args: { nSteps: 2 } });
    expect(during).toBe(1);
    expect(store.getState().tasks).toEqual([]);
  });

  it("does not track a command without a label, or inherit one from Object.prototype", async () => {
    const store = createActivityStore();
    let during = -1;
    const invoke = vi.fn(async () => {
      during = store.getState().tasks.length;
      return undefined as never;
    });
    const tracked = createTrackedInvoke(store, {}, invoke);
    await tracked("list_songs");
    await tracked("toString");
    await tracked("constructor");
    expect(during).toBe(0);
  });

  it("calls invoke with the command alone when there are no arguments", async () => {
    const invoke = vi.fn(async () => undefined as never);
    await createTrackedInvoke(createActivityStore(), { a: "A" }, invoke)("a");
    await createTrackedInvoke(createActivityStore(), {}, invoke)("b");
    expect(invoke.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("ends the task when the command fails", async () => {
    const store = createActivityStore();
    const tracked = createTrackedInvoke(store, { save_take: "Analyzing take" }, () => Promise.reject(new Error("no sidecar")));
    await expect(tracked("save_take")).rejects.toThrow("no sidecar");
    expect(store.getState().tasks).toEqual([]);
  });
});
