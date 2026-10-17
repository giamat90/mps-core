import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

export interface Popover {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  toggle: () => void;
  /** Attach to the element that holds both the button and the popover: a press outside it, or Escape, closes. */
  rootRef: RefObject<HTMLDivElement | null>;
}

export function usePopover(): Popover {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  return { open, setOpen, toggle, rootRef };
}
