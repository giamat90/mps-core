// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { DndContext, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { renderHook } from "../../test/hookEnv";
import {
  libraryCollisionDetection,
  useLibrarySensors,
  useRootDropZone,
  useSortableFolder,
  useSortableSongRow,
} from "./libraryDnd";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DndContext, {}, createElement(SortableContext, { items: ["s1", "folder:f1"], children }));

describe("library drag and drop hooks", () => {
  it("gives a song row a ref, a style and the handle's props", () => {
    const { result } = renderHook(() => useSortableSongRow("s1"), { wrapper });
    expect(typeof result.current.setNodeRef).toBe("function");
    expect(result.current.style.opacity).toBe(1);
    expect(result.current.handleProps).toMatchObject({ role: "button", tabIndex: 0 });
  });

  it("gives a folder a sortable ref, a drop target and a handle", () => {
    const { result } = renderHook(() => useSortableFolder("f1"), { wrapper });
    expect(typeof result.current.setSortableRef).toBe("function");
    expect(typeof result.current.setDroppableRef).toBe("function");
    expect(result.current.isOver).toBe(false);
    expect(result.current.style.opacity).toBe(1);
    expect(result.current.handleProps).toHaveProperty("aria-describedby");
  });

  it("gives the root list a drop target", () => {
    const { result } = renderHook(() => useRootDropZone(), { wrapper });
    expect(result.current.isOver).toBe(false);
    expect(typeof result.current.setNodeRef).toBe("function");
  });

  it("builds the pointer sensor list", () => {
    const { result } = renderHook(() => useLibrarySensors(), { wrapper });
    expect(result.current).toHaveLength(1);
  });

  it("detects a collision by the pointer first and by overlap only as a fallback", () => {
    const detect = libraryCollisionDetection as CollisionDetection;
    const rect = (left: number, top: number, width: number, height: number) => ({
      left, top, width, height, right: left + width, bottom: top + height,
    });
    const container = (id: string, r: ReturnType<typeof rect>) => ({ id, rect: { current: r }, data: { current: undefined }, disabled: false });
    const droppableContainers = [container("a", rect(0, 0, 100, 100)), container("b", rect(0, 200, 100, 100))];
    const common = {
      active: null,
      collisionRect: rect(40, 190, 50, 50),
      droppableRects: new Map(droppableContainers.map((c) => [c.id, c.rect.current])),
      droppableContainers,
    };
    const underPointer = detect({ ...common, pointerCoordinates: { x: 10, y: 10 } } as unknown as Parameters<CollisionDetection>[0]);
    expect(underPointer.map((c) => c.id)).toEqual(["a"]);
    const overlapOnly = detect({ ...common, pointerCoordinates: { x: 500, y: 500 } } as unknown as Parameters<CollisionDetection>[0]);
    expect(overlapOnly.map((c) => c.id)).toEqual(["b"]);
  });
});
