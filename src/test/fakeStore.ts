import { useSyncExternalStore } from "react";

export interface FakeStore<S extends object> {
  <T>(selector: (state: S) => T): T;
  getState(): S;
  /** Merge a patch and notify subscribers, as a zustand `setState` does. */
  set(patch: Partial<S>): void;
}

/** A reactive stand-in for an app's zustand store, for hook tests. */
export function createFakeStore<S extends object>(initial: S): FakeStore<S> {
  let state = initial;
  const subscribers = new Set<() => void>();
  const subscribe = (cb: () => void) => {
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  };
  const store = (<T>(selector: (s: S) => T): T => useSyncExternalStore(subscribe, () => selector(state))) as FakeStore<S>;
  store.getState = () => state;
  store.set = (patch) => {
    state = { ...state, ...patch };
    subscribers.forEach((cb) => cb());
  };
  return store;
}
