import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { decideDrop } from "../../windows";

export interface UseDetachHandleOptions<Panel extends string> {
  panel: Panel;
  /** Opens the panel's own window; `x` and `y` are where the drag was released, none for the pop-out button. */
  detach: (panel: Panel, x?: number, y?: number) => Promise<void>;
  /** Called once the window is open, e.g. to mark the panel as detached in the app's store. */
  onDetached: (panel: Panel) => void;
}

export function useDetachHandle<Panel extends string>({ panel, detach, onDetached }: UseDetachHandleOptions<Panel>) {
  const [dragging, setDragging] = useState(false);

  const open = async (x?: number, y?: number) => {
    try {
      await detach(panel, x, y);
      onDetached(panel);
    } catch (e) {
      console.error(`[detach] could not open a window for ${panel}:`, e);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    const drop = decideDrop({
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    });
    if (drop.detach) void open(drop.x, drop.y);
  };

  return {
    dragging,
    /** The pop-out button: opens the window where it was last. */
    popOut: () => void open(),
    gripProps: { onPointerDown, onPointerUp, onPointerCancel: () => setDragging(false) },
  };
}
