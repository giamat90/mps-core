// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { renderHook } from "../../test/hookEnv";
import { createPanelStore } from "../../panels";
import { useSortableBar, useSortableBarCard, withinBar } from "./useSortableBar";

const CARDS = [
  { id: "a", label: "Alpha", defaultVisible: true },
  { id: "b", label: "Beta", defaultVisible: true },
  { id: "c", label: "Gamma", defaultVisible: true },
] as const;

let n = 0;
const make = () => createPanelStore({ storageKey: `bar_${n++}`, panels: CARDS });
const event = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over === null ? null : { id: over } }) as never;
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height });
const run = (x: number, y: number) =>
  withinBar({
    transform: { x, y, scaleX: 1, scaleY: 1 },
    draggingNodeRect: rect(100, 10, 200, 50),
    containerNodeRect: rect(0, 0, 1000, 120),
  } as never);

beforeEach(() => localStorage.clear());

describe("withinBar", () => {
  it("lets a card travel along the bar and between its lines", () => {
    expect(run(300, 40)).toMatchObject({ x: 300, y: 40 });
  });

  it("holds a card inside the bar on every side", () => {
    expect(run(-500, -30)).toMatchObject({ x: -100, y: -10 });
    expect(run(5000, 900)).toMatchObject({ x: 700, y: 60 });
  });

  it("leaves the drag alone while the bar or the card has not been measured", () => {
    const transform = { x: 9, y: 9, scaleX: 1, scaleY: 1 };
    expect(withinBar({ transform, draggingNodeRect: null, containerNodeRect: null } as never)).toBe(transform);
  });
});

describe("useSortableBar", () => {
  it("drops through the store and keeps the drag inside the bar", () => {
    const store = make();
    const { result } = renderHook(() => useSortableBar(store));
    result.current.dnd.onDragEnd(event("c", "a"));
    expect(store.getState().order).toEqual(["c", "a", "b"]);
    result.current.dnd.onDragEnd(event("c", null));
    result.current.dnd.onDragEnd(event("c", "c"));
    expect(store.getState().order).toEqual(["c", "a", "b"]);
    expect(result.current.dnd.modifiers).toEqual([withinBar]);
  });

  it("lays the cards out as rectangles, because the bar wraps", () => {
    const { result } = renderHook(() => useSortableBar(make()));
    expect(typeof result.current.strategy).toBe("function");
    expect(result.current.strategy.name).toBe("rectSortingStrategy");
  });

  it("announces moves with the cards' labels and the noun the app chose", () => {
    const { result } = renderHook(() => useSortableBar(make(), "card"));
    const say = result.current.dnd.accessibility.announcements;
    const a = { id: "a" } as never;
    expect(say.onDragStart?.({ active: a } as never)).toBe("Picked up the Alpha card.");
    expect(say.onDragOver?.({ active: a, over: { id: "b" } as never })).toBe("The Alpha card is over the Beta card.");
    expect(say.onDragOver?.({ active: a, over: null })).toBeUndefined();
    expect(say.onDragEnd?.({ active: a, over: { id: "b" } as never })).toBe("The Alpha card was moved to the place of the Beta card.");
    expect(say.onDragEnd?.({ active: a, over: { id: "a" } as never })).toBe("The Alpha card was dropped where it was.");
    expect(say.onDragCancel?.({ active: a } as never)).toBe("Moving the Alpha card was cancelled.");
    expect(say.onDragStart?.({ active: { id: "zzz" } } as never)).toBe("Picked up the zzz card.");
  });

  it("names the cards as the app asks", () => {
    const { result } = renderHook(() => useSortableBar(make(), "tile"));
    expect(result.current.dnd.accessibility.announcements.onDragStart?.({ active: { id: "b" } } as never)).toBe("Picked up the Beta tile.");
    expect(result.current.dnd.accessibility.screenReaderInstructions.draggable).toContain("pick this tile up");
  });
});

describe("useSortableBarCard", () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(DndContext, null, createElement(SortableContext, { items: ["a", "b"], children }));

  it("gives a card its ref, style and a grip, reachable by keyboard", () => {
    const { result } = renderHook(() => useSortableBarCard("a"), { wrapper });
    expect(typeof result.current.setNodeRef).toBe("function");
    expect(result.current.isDragging).toBe(false);
    expect(result.current.grip.isDragging).toBe(false);
    expect(result.current.grip.attributes.tabIndex).toBe(0);
  });
});
