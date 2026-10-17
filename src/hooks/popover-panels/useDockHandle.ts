import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createDockGesture } from "../../windows";

export interface UseDockHandleOptions {
  /** Is the pointer over the main window right now? The OS answers. */
  isOverMain: () => Promise<boolean>;
  dock: () => Promise<void>;
  now?: () => number;
}

/**
 * In a detached window: carry the grip over the main window and let go to put
 * the panel back. Moving the window by its title bar never docks it.
 */
export function useDockHandle({ isOverMain, dock, now = () => performance.now() }: UseDockHandleOptions) {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);

  // The gesture keeps its own state for the life of the handle, so it is built once and its callbacks are read once.
  const gesture = useMemo(() => createDockGesture({ isOverMain, dock, onHover: setOver, now }), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    gesture.start();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    void gesture.end();
  };

  const onPointerCancel = () => {
    setDragging(false);
    gesture.cancel();
  };

  return {
    dragging,
    over,
    gripProps: { onPointerDown, onPointerMove: () => gesture.move(), onPointerUp, onPointerCancel },
  };
}
