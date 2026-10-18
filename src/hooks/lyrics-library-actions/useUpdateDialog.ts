import { useUpdaterStore } from "../../updater";

type UpdaterState = ReturnType<typeof useUpdaterStore.getState>;

export interface UpdateDialog {
  visible: boolean;
  status: UpdaterState["status"];
  update: UpdaterState["update"];
  progress: number;
  percent: number;
  install: () => void;
  dismiss: () => void;
}

export function useUpdateDialog(): UpdateDialog {
  const status = useUpdaterStore((s) => s.status);
  const update = useUpdaterStore((s) => s.update);
  const progress = useUpdaterStore((s) => s.progress);
  const dismissed = useUpdaterStore((s) => s.dismissed);
  const installAndRestart = useUpdaterStore((s) => s.installAndRestart);
  const dismiss = useUpdaterStore((s) => s.dismiss);

  return {
    visible: !dismissed && status !== "idle" && status !== "checking",
    status,
    update,
    progress,
    percent: Math.round(progress * 100),
    install: () => {
      void installAndRestart();
    },
    dismiss,
  };
}
