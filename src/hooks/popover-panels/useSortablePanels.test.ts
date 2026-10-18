// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { renderHook } from "../../test/hookEnv";
import { createPanelStore } from "../../panels";
import {
  PanelGripProvider,
  applyPanelDrop,
  sortablePanelClass,
  usePanelGrip,
  useSortablePanel,
  useSortablePanels,
} from "./useSortablePanels";

const PANELS = [
  { id: "a", label: "Alpha", defaultVisible: true },
  { id: "b", label: "Beta", defaultVisible: true },
  { id: "c", label: "Gamma", defaultVisible: true },
] as const;

let n = 0;
const make = () => createPanelStore({ storageKey: `sortable_${n++}`, panels: PANELS });
const event = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over === null ? null : { id: over } }) as never;

beforeEach(() => localStorage.clear());

describe("applyPanelDrop", () => {
  it("moves the dragged panel to the place of the one it was dropped on", () => {
    const store = make();
    applyPanelDrop(store, event("a", "c"));
    expect(store.getState().order).toEqual(["b", "c", "a"]);
  });

  it("leaves the order alone when dropped on itself, or on nothing", () => {
    const store = make();
    applyPanelDrop(store, event("a", "a"));
    applyPanelDrop(store, event("a", null));
    expect(store.getState().order).toEqual(["a", "b", "c"]);
  });
});

describe("sortablePanelClass", () => {
  it("names the slot, marks a dragged one and adds the page's own class", () => {
    expect(sortablePanelClass(false)).toBe("sortable-panel");
    expect(sortablePanelClass(true, "page__alpha")).toBe("sortable-panel sortable-panel--dragging page__alpha");
  });
});

describe("useSortablePanels", () => {
  it("drops through the store and constrains the drag to vertical", () => {
    const store = make();
    const { result } = renderHook(() => useSortablePanels(store));
    result.current.dnd.onDragEnd(event("c", "a"));
    expect(store.getState().order).toEqual(["c", "a", "b"]);
    const [verticalOnly] = result.current.dnd.modifiers;
    expect(verticalOnly({ transform: { x: 40, y: 12, scaleX: 1, scaleY: 1 } } as never)).toMatchObject({ x: 0, y: 12 });
  });

  it("announces moves with the panels' labels", () => {
    const { result } = renderHook(() => useSortablePanels(make()));
    const say = result.current.dnd.accessibility.announcements;
    const a = { id: "a" } as never;
    expect(say.onDragStart?.({ active: a } as never)).toBe("Picked up Alpha.");
    expect(say.onDragOver?.({ active: a, over: { id: "b" } as never })).toBe("Alpha is over Beta.");
    expect(say.onDragOver?.({ active: a, over: null })).toBeUndefined();
    expect(say.onDragEnd?.({ active: a, over: { id: "b" } as never })).toBe("Alpha was moved to the place of Beta.");
    expect(say.onDragEnd?.({ active: a, over: { id: "a" } as never })).toBe("Alpha was dropped where it was.");
    expect(say.onDragCancel?.({ active: a } as never)).toBe("Moving Alpha was cancelled.");
    expect(say.onDragStart?.({ active: { id: "zzz" } } as never)).toBe("Picked up zzz.");
  });

  it("explains the keyboard controls to screen readers", () => {
    const { result } = renderHook(() => useSortablePanels(make()));
    expect(result.current.dnd.accessibility.screenReaderInstructions.draggable).toContain("space to pick this panel up");
  });
});

describe("useSortablePanel and the grip", () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(DndContext, null, createElement(SortableContext, { items: ["a", "b"], children }));

  it("gives a slot its ref, style, class and a grip", () => {
    const { result } = renderHook(() => useSortablePanel("a", "page__alpha"), { wrapper });
    expect(result.current.className).toBe("sortable-panel page__alpha");
    expect(typeof result.current.setNodeRef).toBe("function");
    expect(result.current.grip.isDragging).toBe(false);
    expect(result.current.grip.attributes.tabIndex).toBe(0);
  });

  it("has no grip outside a sortable list, and the provider's grip inside one", () => {
    expect(renderHook(() => usePanelGrip()).result.current).toBeNull();
    const grip = renderHook(() => useSortablePanel("a"), { wrapper }).result.current.grip;
    const inside = renderHook(() => usePanelGrip(), {
      wrapper: ({ children }: { children: ReactNode }) => createElement(PanelGripProvider, { value: grip }, children),
    });
    expect(inside.result.current).toBe(grip);
  });
});
