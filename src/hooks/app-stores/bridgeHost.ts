import { useEffect, type DependencyList } from "react";
import { panelsToClose } from "../../windows";

export interface Disposable {
  dispose(): void;
}

/** What starting a window bridge gives back: the bridge when it is up, and what to undo at once on leaving. */
export interface BridgeRun {
  bridge: Promise<Disposable>;
  cleanup?: () => void;
}

/**
 * Starts a bridge and returns the function that stops it. A bridge that comes up
 * after the stop is disposed the moment it arrives; one that fails to start is
 * logged, never thrown.
 */
export function runBridge(run: () => BridgeRun, failure: string): () => void {
  let cancelled = false;
  let bridge: Disposable | null = null;
  const started = run();
  started.bridge
    .then((b) => {
      if (cancelled) b.dispose();
      else bridge = b;
    })
    .catch((e: unknown) => console.error(failure, e));
  return () => {
    cancelled = true;
    started.cleanup?.();
    bridge?.dispose();
  };
}

/** `runBridge` for a component: starts when mounted (or when `deps` change), stops when unmounted. */
export function useBridgeRun(run: () => BridgeRun, failure: string, deps: DependencyList): void {
  useEffect(() => runBridge(run, failure), deps);
}

/** What `dockPanel` is asked for from a detached window's Dock button: failures are logged. */
export function dockSafely(dock: () => Promise<unknown>): void {
  dock().catch((e: unknown) => console.error("[detached] could not dock:", e));
}

/** The title of a detached window: the panel's name, then the song's when there is one. */
export function detachedTitle<Id extends string>(titles: Readonly<Record<Id, string>>, panel: Id, songTitle?: string | null): string {
  return `${titles[panel]}${songTitle ? ` — ${songTitle}` : ""}`;
}

interface VisibilityStore {
  getState(): { visible: Readonly<Record<string, boolean>> };
  subscribe(listener: (state: { visible: Readonly<Record<string, boolean>> }) => void): () => void;
}

interface DetachedStoreLike {
  getState(): {
    detached: Readonly<Partial<Record<string, boolean>>>;
    markDocked(panel: string): void;
    reset(): void;
  };
}

export interface MainBridgeHostOptions<Id extends string> {
  /** Starts the app's `startMainBridge(...)`. */
  startBridge: () => Promise<Disposable>;
  /** The panels that can be detached. */
  ids: readonly Id[];
  /** The store behind the Panels menu. */
  panels: VisibilityStore;
  /** The store of panels that live in a window of their own. */
  detached: DetachedStoreLike;
  /** Calls `cb` with the panel id each time a detached window announces it was docked. */
  listenDocked: (cb: (panelId: string) => void) => Promise<() => void>;
  closePanel: (id: Id) => Promise<unknown>;
  closeAll: () => Promise<unknown>;
}

/**
 * Lets a page feed panels that were dragged out into windows of their own, and
 * ends them with the page: hiding a panel closes its window, docking marks it
 * docked, and leaving closes everything, since they would otherwise keep
 * showing a song that is no longer loaded. Returns the function that stops it.
 */
export function startMainBridgeHost<Id extends string>(o: MainBridgeHostOptions<Id>): () => void {
  const stopBridge = runBridge(() => ({ bridge: o.startBridge() }), "[detached] could not start the window bridge:");

  const unlistenDocked = o.listenDocked((panelId) => o.detached.getState().markDocked(panelId));

  let previousVisible = o.panels.getState().visible;
  const unsubscribePanels = o.panels.subscribe((state) => {
    const next = state.visible;
    for (const id of panelsToClose(o.ids, previousVisible, next, o.detached.getState().detached)) {
      o.closePanel(id).catch((e: unknown) => console.warn(`[detached] could not close the ${id} window:`, e));
    }
    previousVisible = next;
  });

  return () => {
    unsubscribePanels();
    stopBridge();
    unlistenDocked
      .then((unlisten) => unlisten())
      .catch((e: unknown) => console.warn("[detached] could not stop listening for docked panels:", e));
    o.closeAll().catch((e: unknown) => console.warn("[detached] could not close detached windows:", e));
    o.detached.getState().reset();
  };
}

/** `startMainBridgeHost` for a component that is mounted for as long as the page lives. */
export function useMainBridgeHost<Id extends string>(options: () => MainBridgeHostOptions<Id>): void {
  useEffect(() => startMainBridgeHost(options()), []);
}
