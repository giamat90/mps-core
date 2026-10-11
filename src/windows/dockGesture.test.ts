import { describe, it, expect, vi } from "vitest";
import { createDockGesture } from "./dockGesture";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(over: boolean | Error = true) {
  let t = 0;
  const state = { over };
  const isOverMain = vi.fn(async () => {
    if (state.over instanceof Error) throw state.over;
    return state.over;
  });
  const dock = vi.fn(async () => {});
  const onHover = vi.fn();
  const gesture = createDockGesture({ isOverMain, dock, onHover, now: () => t, hoverIntervalMs: 100 });
  return { gesture, isOverMain, dock, onHover, state, advance: (ms: number) => (t += ms) };
}

describe("dock gesture", () => {
  it("docks when the pointer is released over the main window", async () => {
    const t = setup(true);
    t.gesture.start();
    expect(await t.gesture.end()).toBe(true);
    expect(t.dock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when released anywhere else", async () => {
    const t = setup(false);
    t.gesture.start();
    expect(await t.gesture.end()).toBe(false);
    expect(t.dock).not.toHaveBeenCalled();
  });

  it("asks again on release instead of trusting the last hover", async () => {
    const t = setup(true);
    t.gesture.start();
    t.gesture.move();
    await flush();
    t.state.over = false;
    expect(await t.gesture.end()).toBe(false);
    expect(t.dock).not.toHaveBeenCalled();
  });

  it("reports hover while moving, no more often than the interval", async () => {
    const t = setup(true);
    t.gesture.start();
    t.gesture.move();
    await flush();
    t.advance(30);
    t.gesture.move();
    await flush();
    expect(t.isOverMain).toHaveBeenCalledTimes(1);
    t.advance(100);
    t.gesture.move();
    await flush();
    expect(t.isOverMain).toHaveBeenCalledTimes(2);
    expect(t.onHover).toHaveBeenLastCalledWith(true);
  });

  it("does not stack questions while one is unanswered", async () => {
    const t = setup(true);
    t.gesture.start();
    t.gesture.move();
    t.advance(500);
    t.gesture.move();
    t.gesture.move();
    expect(t.isOverMain).toHaveBeenCalledTimes(1);
    await flush();
  });

  it("ignores movement before start and after the end", async () => {
    const t = setup(true);
    t.gesture.move();
    await flush();
    expect(t.isOverMain).not.toHaveBeenCalled();
    t.gesture.start();
    await t.gesture.end();
    t.isOverMain.mockClear();
    t.advance(1000);
    t.gesture.move();
    await flush();
    expect(t.isOverMain).not.toHaveBeenCalled();
  });

  it("a late hover answer cannot light up a gesture that has ended", async () => {
    const t = setup(true);
    let release: (v: boolean) => void = () => {};
    t.isOverMain.mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)));
    t.gesture.start();
    t.gesture.move();
    t.gesture.cancel();
    t.onHover.mockClear();
    release(true);
    await flush();
    expect(t.onHover).not.toHaveBeenCalled();
  });

  it("clears the hover feedback on release and on cancel", async () => {
    const t = setup(true);
    t.gesture.start();
    await t.gesture.end();
    expect(t.onHover).toHaveBeenLastCalledWith(false);
    t.gesture.start();
    t.gesture.cancel();
    expect(t.onHover).toHaveBeenLastCalledWith(false);
  });

  it("treats a failed question as not over the main window, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = setup(new Error("no window"));
    t.gesture.start();
    expect(await t.gesture.end()).toBe(false);
    expect(t.dock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("reports a dock that failed rather than claiming success", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup(true);
    t.dock.mockRejectedValueOnce(new Error("closed already"));
    t.gesture.start();
    expect(await t.gesture.end()).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it("end without start is a no-op", async () => {
    const t = setup(true);
    expect(await t.gesture.end()).toBe(false);
    expect(t.dock).not.toHaveBeenCalled();
  });
});
