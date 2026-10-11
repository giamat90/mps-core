export interface DockGestureDeps {
  /** Is the pointer over the main window right now? The OS answers, so no coordinates are converted. */
  isOverMain: () => Promise<boolean>;
  dock: () => Promise<void>;
  /** Whether releasing now would dock; drives the feedback in the detached window. */
  onHover: (over: boolean) => void;
  now: () => number;
  /** How often the pointer position is asked for while it moves. */
  hoverIntervalMs?: number;
}

export interface DockGesture {
  start(): void;
  move(): void;
  /** Resolves true when the panel was docked. */
  end(): Promise<boolean>;
  cancel(): void;
}

/**
 * The drag that puts a detached panel back: the pointer is carried over the
 * main window and released there. Moving the detached window itself with its
 * title bar never docks, so a panel can still sit on top of the main window.
 */
export function createDockGesture(deps: DockGestureDeps): DockGesture {
  const interval = deps.hoverIntervalMs ?? 100;
  let active = false;
  let inFlight = false;
  let lastAskedAt = Number.NEGATIVE_INFINITY;
  let generation = 0;

  const ask = async (): Promise<boolean> => {
    try {
      return await deps.isOverMain();
    } catch (e) {
      console.warn("[detached] could not tell whether the pointer is over the main window:", e);
      return false;
    }
  };

  return {
    start() {
      active = true;
      generation += 1;
      lastAskedAt = Number.NEGATIVE_INFINITY;
    },

    move() {
      if (!active || inFlight) return;
      const t = deps.now();
      if (t - lastAskedAt < interval) return;
      lastAskedAt = t;
      inFlight = true;
      const mine = generation;
      ask()
        .then((over) => {
          if (active && mine === generation) deps.onHover(over);
        })
        .finally(() => {
          inFlight = false;
        });
    },

    async end() {
      if (!active) return false;
      active = false;
      generation += 1;
      deps.onHover(false);
      if (!(await ask())) return false;
      try {
        await deps.dock();
        return true;
      } catch (e) {
        console.error("[detached] could not dock the panel:", e);
        return false;
      }
    },

    cancel() {
      active = false;
      generation += 1;
      deps.onHover(false);
    },
  };
}
