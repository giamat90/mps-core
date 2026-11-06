import { useEffect, useRef, useState } from "react";
import { describeActivity, type ActivityStore, type ActivitySummary } from "../../activity";

export interface UseActivityOptions {
  /** Work shorter than this never shows the indicator, so quick actions do not flash it. */
  showAfterMs?: number;
  /** Once shown, the indicator stays at least this long, so it is readable. */
  minShownMs?: number;
}

export interface ActivityView extends ActivitySummary {
  visible: boolean;
}

export const ACTIVITY_SHOW_AFTER_MS = 300;
export const ACTIVITY_MIN_SHOWN_MS = 600;

/**
 * Whether to show the activity indicator and what it says. The text and progress
 * come straight from the store; only `visible` is debounced. The last summary is
 * kept while the indicator lingers so it does not go blank before it fades.
 */
export function useActivity(
  store: ActivityStore,
  { showAfterMs = ACTIVITY_SHOW_AFTER_MS, minShownMs = ACTIVITY_MIN_SHOWN_MS }: UseActivityOptions = {},
): ActivityView {
  const tasks = store((s) => s.tasks);
  const summary = describeActivity(tasks);
  const busy = summary !== null;
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const lastSummary = useRef<ActivitySummary>({ label: "", progress: null, others: 0 });
  if (summary) lastSummary.current = summary;

  useEffect(() => {
    if (busy && !visible) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, showAfterMs);
      return () => clearTimeout(timer);
    }
    if (!busy && visible) {
      const remaining = Math.max(0, minShownMs - (Date.now() - shownAt.current));
      const timer = setTimeout(() => setVisible(false), remaining);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [busy, visible, showAfterMs, minShownMs]);

  return { visible, ...(summary ?? lastSummary.current) };
}
