import type { ActivityTask } from "./store";

export interface ActivitySummary {
  label: string;
  /** 0 to 1 when the shown task reports it, otherwise null (indeterminate). */
  progress: number | null;
  /** How many other tasks are running besides the one named. */
  others: number;
}

/**
 * The one line the window shows. The task begun last is named, because it is
 * what the user just asked for; the rest are counted. Null when nothing runs.
 */
export function describeActivity(tasks: readonly ActivityTask[]): ActivitySummary | null {
  if (tasks.length === 0) return null;
  const shown = tasks.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a));
  return { label: shown.label, progress: shown.progress, others: tasks.length - 1 };
}
