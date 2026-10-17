/**
 * What a hook needs of an app's zustand store: select a slice (as a hook) and read
 * the whole state once. A bound zustand store satisfies it, and so does a plain
 * function over a fixed state in a test.
 */
export interface StoreHook<S> {
  <T>(selector: (state: S) => T): T;
  getState(): S;
}
