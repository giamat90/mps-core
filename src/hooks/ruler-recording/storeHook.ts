/** What an app's zustand store hook looks like to a hook here: select a slice of its state. */
export type StoreHook<S> = <T>(selector: (state: S) => T) => T;
