import type { ActivityStore } from "./store";

export type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Wraps Tauri's `invoke` so the slow commands show up as activity. `labels` maps
 * a command name to the sentence shown while it runs; a command with no label is
 * passed through untouched (it is fast, or it reports its own progress).
 */
export function createTrackedInvoke(
  store: ActivityStore,
  labels: Readonly<Record<string, string>>,
  invoke: InvokeFn,
): InvokeFn {
  return <T,>(command: string, args?: Record<string, unknown>) => {
    const label = Object.prototype.hasOwnProperty.call(labels, command) ? labels[command] : undefined;
    const call = () => (args === undefined ? invoke<T>(command) : invoke<T>(command, args));
    return label ? store.getState().track(label, call) : call();
  };
}
