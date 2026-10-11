import { TransportPublisher } from "./clock";
import { EVT_COMMAND, EVT_DOCKED, EVT_HELLO, EVT_STATE, type StateMessage, type TransportSnapshot } from "./protocol";

/** An extra stream an app sends to its detached windows (a live trace, a spectrum). */
export interface BridgeStream<Id extends string> {
  /** Every tick while at least one window is attached. */
  tick?(attached: ReadonlySet<Id>): void;
  /** A window said hello and knows nothing yet: forget what it was told. */
  hello?(panel: Id, attached: ReadonlySet<Id>): void;
  dispose?(): void;
}

export interface MainBridgeOptions<Id extends string, Shared, Cmd> {
  isPanel(value: unknown): value is Id;
  /** Called whenever the app's player state may have changed. */
  subscribe(listener: () => void): () => void;
  transport(): { time: number; playing: boolean; rate: number };
  /** Fields that are unchanged must be the same values, so a time tick compares equal. */
  shared(): Shared;
  parseCommand(value: unknown): Cmd | null;
  apply(command: Cmd): void;
  emit(event: string, payload: unknown): void | Promise<void>;
  listen(event: string, cb: (payload: unknown) => void): Promise<() => void>;
  now(): number;
  streams?(send: (event: string, payload: unknown) => void): BridgeStream<Id>[];
  tickMs?: number;
}

const DEFAULT_TICK_MS = 33;

function shallowEqual<T>(a: T, b: T): boolean {
  const keys = Object.keys(a as object) as (keyof T)[];
  return keys.every((k) => a[k] === b[k]);
}

/**
 * Runs in the main window, which stays the only owner of audio, recording and
 * the song state. Detached windows are views of it: this publishes what they
 * need and carries out the few commands they may send back. While no window is
 * detached it runs no timer and sends nothing.
 */
export async function startMainBridge<Id extends string, Shared extends object, Cmd>(
  opts: MainBridgeOptions<Id, Shared, Cmd>,
): Promise<{ dispose(): void }> {
  const attached = new Set<Id>();
  const publisher = new TransportPublisher();
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS;

  let lastTransport: TransportSnapshot | null = null;
  let lastShared: Shared | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const send = (event: string, payload: unknown) => {
    Promise.resolve(opts.emit(event, payload)).catch((e: unknown) =>
      console.warn(`[detached] could not send ${event}:`, e),
    );
  };

  const streams = opts.streams?.(send) ?? [];

  const publishState = () => {
    if (attached.size === 0) return;
    const transport = publisher.next(opts.transport(), opts.now());
    const shared = opts.shared();
    const changed = !lastShared || !shallowEqual(lastShared, shared);
    if (!transport && !changed) return;
    if (transport) lastTransport = transport;
    lastShared = shared;
    if (lastTransport) {
      const message: StateMessage<Shared> = { transport: lastTransport, shared };
      send(EVT_STATE, message);
    }
  };

  const startTimer = () => {
    if (timer !== null) return;
    timer = setInterval(() => {
      publishState();
      for (const s of streams) s.tick?.(attached);
    }, tickMs);
  };

  const stopTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const unsubscribe = opts.subscribe(publishState);

  const unlisteners: (() => void)[] = [];
  const dispose = () => {
    stopTimer();
    unsubscribe();
    for (const s of streams) s.dispose?.();
    for (const u of unlisteners) u();
  };

  try {
    unlisteners.push(
      await opts.listen(EVT_HELLO, (payload) => {
        const id = (payload as { panelId?: unknown } | null)?.panelId;
        if (!opts.isPanel(id)) {
          console.warn("[detached] ignoring hello from an unknown panel:", payload);
          return;
        }
        attached.add(id);
        startTimer();
        publisher.reset();
        lastShared = null;
        publishState();
        for (const s of streams) s.hello?.(id, attached);
      }),
    );

    unlisteners.push(
      await opts.listen(EVT_COMMAND, (payload) => {
        const command = opts.parseCommand(payload);
        if (command === null) {
          console.warn("[detached] ignoring an unrecognised command:", payload);
          return;
        }
        opts.apply(command);
      }),
    );

    unlisteners.push(
      await opts.listen(EVT_DOCKED, (payload) => {
        if (opts.isPanel(payload)) attached.delete(payload);
        if (attached.size === 0) {
          stopTimer();
          lastShared = null;
          lastTransport = null;
        }
      }),
    );
  } catch (e) {
    dispose();
    throw e;
  }

  return { dispose };
}
