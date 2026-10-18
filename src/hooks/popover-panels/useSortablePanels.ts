import { createContext, useContext, type CSSProperties } from "react";
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
import { sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PanelStore } from "../../panels";

export type PanelGrip = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners" | "setActivatorNodeRef" | "isDragging">;

const GripContext = createContext<PanelGrip | null>(null);

/** Provide one around a panel's slot; `usePanelGrip` reads it in the panel's own corner. */
export const PanelGripProvider = GripContext.Provider;

/** The grip that moves the panel it is in, or null outside a sortable list (a panel in a window of its own). */
export function usePanelGrip(): PanelGrip | null {
  return useContext(GripContext);
}

/** Dropping a panel on another puts it in that panel's place; anywhere else leaves the order alone. */
export function applyPanelDrop<Id extends string>(store: PanelStore<Id>, { active, over }: Pick<DragEndEvent, "active" | "over">) {
  if (!over || active.id === over.id) return;
  store.getState().move(active.id as Id, over.id as Id);
}

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export function sortablePanelClass(isDragging: boolean, className?: string): string {
  return ["sortable-panel", isDragging && "sortable-panel--dragging", className].filter(Boolean).join(" ");
}

/** Everything the list needs, to spread on dnd-kit's `DndContext`; the sortable strategy goes to `SortableContext`. */
export function useSortablePanels<Id extends string>(store: PanelStore<Id>) {
  const panels = store((s) => s.panels);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const label = (id: string | number) => panels.find((p) => p.id === id)?.label ?? String(id);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${label(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${label(active.id)} is over ${label(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `${label(active.id)} was moved to the place of ${label(over.id)}.`
        : `${label(active.id)} was dropped where it was.`,
    onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled.`,
  };

  return {
    dnd: {
      sensors,
      collisionDetection: closestCenter,
      modifiers: [verticalOnly],
      onDragEnd: (event: DragEndEvent) => applyPanelDrop(store, event),
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable: "Press space to pick this panel up, the up and down arrows to move it, space to drop it, escape to cancel.",
        },
      },
    },
    strategy: verticalListSortingStrategy,
  };
}

/** One slot of the list: the node ref, its style and class, and the grip to hand to `PanelGripProvider`. */
export function useSortablePanel(id: string, className?: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const grip: PanelGrip = { attributes, listeners, setActivatorNodeRef, isDragging };
  return { setNodeRef, style, className: sortablePanelClass(isDragging, className), grip };
}
