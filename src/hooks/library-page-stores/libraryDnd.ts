import {
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FOLDER_DRAG_PREFIX, ROOT_CONTAINER_ID } from "./libraryView";

// `closestCenter` compares rect *centers*, so a short/empty folder next to a
// tall song list frequently loses to a nearby list row even when the pointer
// is squarely over the folder — the drop then silently resolves to the wrong
// container (or nothing moves at all). Resolve by what's actually under the
// pointer instead, falling back to rect overlap only when nothing is
// directly under it (e.g. a fast drag between two containers).
export const libraryCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

export function useLibrarySensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
}

function sortableStyle(
  transform: Parameters<typeof CSS.Transform.toString>[0],
  transition: string | undefined,
  isDragging: boolean,
  draggingOpacity: number,
) {
  return { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? draggingOpacity : 1 };
}

/** A song row that can be dragged within and between lists. */
export function useSortableSongRow(songId: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: songId });
  return {
    setNodeRef,
    style: sortableStyle(transform, transition, isDragging, 0.4),
    handleProps: { ...attributes, ...listeners },
  };
}

/** A folder that can be reordered by its grip and receives songs dropped on its body. */
export function useSortableFolder(folderId: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${FOLDER_DRAG_PREFIX}${folderId}`,
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: folderId });
  return {
    setSortableRef: setNodeRef,
    setDroppableRef,
    isOver,
    style: sortableStyle(transform, transition, isDragging, 0.5),
    handleProps: { ...attributes, ...listeners },
  };
}

/** The list of songs that belong to no folder. */
export function useRootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_CONTAINER_ID });
  return { setNodeRef, isOver };
}
