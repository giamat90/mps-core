import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface ActivityTask {
  id: number;
  label: string;
  /** 0 to 1, or null when the work cannot say how far along it is. */
  progress: number | null;
  startedAt: number;
}

export interface ActivityHandle {
  setProgress: (progress: number | null) => void;
  setLabel: (label: string) => void;
  /** Safe to call twice; the second call does nothing. */
  end: () => void;
}

export interface ActivityState {
  tasks: readonly ActivityTask[];
  begin: (label: string) => ActivityHandle;
  /** Runs `work` as a task and ends it whether it resolves or rejects; the result or error passes through. */
  track: <T>(label: string, work: Promise<T> | (() => Promise<T>)) => Promise<T>;
}

export type ActivityStore = UseBoundStore<StoreApi<ActivityState>>;

function clampProgress(progress: number | null): number | null {
  if (progress === null || !Number.isFinite(progress)) return null;
  return Math.min(1, Math.max(0, progress));
}

/**
 * What is running right now, so the window can say so. Headless: the apps pass
 * their slow work through `track`/`begin`, and `useActivity` decides when the
 * indicator is worth showing. Nothing is persisted.
 */
export function createActivityStore({ now = Date.now }: { now?: () => number } = {}): ActivityStore {
  let nextId = 1;

  return create<ActivityState>((set, get) => {
    const patch = (id: number, change: Partial<ActivityTask>) =>
      set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...change } : t)) });

    const begin = (label: string): ActivityHandle => {
      if (!label) throw new Error("createActivityStore: a task needs a label");
      const id = nextId++;
      set({ tasks: [...get().tasks, { id, label, progress: null, startedAt: now() }] });
      let ended = false;
      return {
        setProgress: (progress) => {
          if (!ended) patch(id, { progress: clampProgress(progress) });
        },
        setLabel: (next) => {
          if (!ended && next) patch(id, { label: next });
        },
        end: () => {
          if (ended) return;
          ended = true;
          set({ tasks: get().tasks.filter((t) => t.id !== id) });
        },
      };
    };

    const track = async <T,>(label: string, work: Promise<T> | (() => Promise<T>)): Promise<T> => {
      const handle = begin(label);
      try {
        return await (typeof work === "function" ? work() : work);
      } finally {
        handle.end();
      }
    };

    return { tasks: [], begin, track };
  });
}
