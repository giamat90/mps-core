import { RemoteClock } from "./clock";
import { EVT_COMMAND, EVT_HELLO, EVT_STATE, isStateMessage, type TransportSnapshot } from "./protocol";

export interface DetachedBridgeOptions<Id extends string, Shared extends { duration: number }> {
  panelId: Id;
  isShared(value: unknown): value is Shared;
  /** Mirror what the main window said into this window's stores. */
  applyShared(shared: Shared, transport: TransportSnapshot, currentTime: number): void;
  /** Write the extrapolated playhead into this window's player store. */
  writeTime(time: number): void;
  emit(event: string, payload: unknown): void | Promise<void>;
  listen(event: string, cb: (payload: unknown) => void): Promise<() => void>;
  now(): number;
  /** Lets `getPlaybackTime()`-style readers use the mirrored clock. */
  installTimeSource?(source: () => number): () => void;
  /** Events beyond the state message (a live trace, a spectrum), by name. */
  listeners?: Readonly<Record<string, (payload: unknown) => void>>;
  tickMs?: number;
}

export interface DetachedBridge<Cmd> {
  /** Starts listening and says hello. Rejects (after cleaning up) if a listener cannot be set. */
  start(): Promise<void>;
  dispose(): void;
  command(command: Cmd): void;
  /** Moves the local playhead now, ahead of the main window's answer to a seek. */
  seekLocal(time: number): void;
}

const DEFAULT_TICK_MS = 33;

/**
 * Runs in a detached window. The panels are the same components as in the main
 * window, reading this window's own stores, which this keeps in step with the
 * main window; only the actions that would touch the audio engine are replaced
 * by commands.
 */
export function createDetachedBridge<Id extends string, Shared extends { duration: number }, Cmd>(
  opts: DetachedBridgeOptions<Id, Shared>,
): DetachedBridge<Cmd> {
  const clock = new RemoteClock();
  let transport: TransportSnapshot | null = null;
  let lastWritten = Number.NaN;
  let timer: ReturnType<typeof setInterval> | null = null;
  let uninstallTimeSource: (() => void) | null = null;
  let unlisteners: (() => void)[] = [];
  let started = false;

  const send = (event: string, payload: unknown) => {
    Promise.resolve(opts.emit(event, payload)).catch((e: unknown) =>
      console.warn(`[detached] could not send ${event}:`, e),
    );
  };

  const writeTime = () => {
    const t = clock.now(opts.now());
    if (t === lastWritten && !transport?.playing) return;
    lastWritten = t;
    opts.writeTime(t);
  };

  const dispose = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    for (const u of unlisteners) u();
    unlisteners = [];
    uninstallTimeSource?.();
    uninstallTimeSource = null;
    started = false;
  };

  return {
    async start() {
      if (started) return;
      started = true;
      uninstallTimeSource = opts.installTimeSource?.(() => clock.now(opts.now())) ?? null;
      try {
        unlisteners.push(
          await opts.listen(EVT_STATE, (payload) => {
            if (!isStateMessage(payload, opts.isShared)) {
              console.warn("[detached] ignoring a malformed state message:", payload);
              return;
            }
            transport = payload.transport;
            clock.apply(transport);
            clock.setDuration(payload.shared.duration);
            opts.applyShared(payload.shared, transport, clock.now(opts.now()));
          }),
        );
        for (const [event, handler] of Object.entries(opts.listeners ?? {})) {
          unlisteners.push(await opts.listen(event, handler));
        }
      } catch (e) {
        dispose();
        throw e;
      }
      timer = setInterval(writeTime, opts.tickMs ?? DEFAULT_TICK_MS);
      send(EVT_HELLO, { panelId: opts.panelId });
    },

    dispose,

    command(command) {
      send(EVT_COMMAND, command);
    },

    seekLocal(time) {
      if (transport) {
        transport = { ...transport, time, sentAt: opts.now() };
        clock.apply(transport);
      }
      lastWritten = time;
      opts.writeTime(time);
    },
  };
}
