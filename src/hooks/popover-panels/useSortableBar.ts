import type { CSSProperties } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PanelStore } from "../../panels";
import { applyPanelDrop, type PanelGrip } from "./useSortablePanels";

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** A card is dragged anywhere inside its bar, along a line or to another, and never out of it. */
export const withinBar: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return transform;
  return {
    ...transform,
    x: clamp(transform.x, containerNodeRect.left - draggingNodeRect.left, containerNodeRect.right - draggingNodeRect.right),
    y: clamp(transform.y, containerNodeRect.top - draggingNodeRect.top, containerNodeRect.bottom - draggingNodeRect.bottom),
  };
};

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Everything a bar of cards needs, to spread on dnd-kit's `DndContext`; the strategy goes to `SortableContext`.
 * The bar wraps, so the cards are laid out as rectangles and move along a line or to another; it is kept apart
 * from `useSortablePanels` (a column that moves up and down) on purpose, so a page can have both with no drag
 * shared between them. `noun` is what the cards are called in the spoken announcements.
 */
export function useSortableBar<Id extends string>(store: PanelStore<Id>, noun = "card") {
  const panels = store((s) => s.panels);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const label = (id: string | number) => `the ${panels.find((p) => p.id === id)?.label ?? String(id)} ${noun}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => sentence(`picked up ${label(active.id)}.`),
    onDragOver: ({ active, over }) => (over ? sentence(`${label(active.id)} is over ${label(over.id)}.`) : undefined),
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? sentence(`${label(active.id)} was moved to the place of ${label(over.id)}.`)
        : sentence(`${label(active.id)} was dropped where it was.`),
    onDragCancel: ({ active }) => sentence(`moving ${label(active.id)} was cancelled.`),
  };

  return {
    dnd: {
      sensors,
      collisionDetection: closestCenter,
      modifiers: [withinBar],
      onDragEnd: (event: DragEndEvent) => applyPanelDrop(store, event),
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable: `Press space to pick this ${noun} up, the arrow keys to move it, space to drop it, escape to cancel.`,
        },
      },
    },
    strategy: rectSortingStrategy,
  };
}

/** One card of the bar: the node ref, its style, and the grip that moves it (hand it to the card's own handle). */
export function useSortableBarCard(id: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const grip: PanelGrip = { attributes, listeners, setActivatorNodeRef, isDragging };
  return { setNodeRef, style, isDragging, grip };
}
