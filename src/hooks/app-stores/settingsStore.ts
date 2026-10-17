import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface SettingsState {
  youtubeCookiesPath: string | null;
  setYoutubeCookiesPath: (path: string | null) => void;
  collapsedFolders: Record<string, boolean>;
  setFolderCollapsed: (folderId: string, collapsed: boolean) => void;
}

export type SettingsStore = UseBoundStore<StoreApi<SettingsState>>;

type PersistedSettings = Pick<SettingsState, "youtubeCookiesPath" | "collapsedFolders">;

function load(storageKey: string): PersistedSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, unknown>;
    const cookiesPath = raw.youtubeCookiesPath;
    const collapsed = raw.collapsedFolders;
    return {
      youtubeCookiesPath: typeof cookiesPath === "string" ? cookiesPath : null,
      collapsedFolders:
        collapsed && typeof collapsed === "object" && !Array.isArray(collapsed)
          ? (collapsed as Record<string, boolean>)
          : {},
    };
  } catch (e) {
    console.warn("[settings] Could not load settings:", e);
    return { youtubeCookiesPath: null, collapsedFolders: {} };
  }
}

function persist(storageKey: string, settings: PersistedSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch (e) {
    console.warn("[settings] Could not persist settings:", e);
  }
}

/**
 * The app settings the user can change, kept in localStorage under `storageKey`.
 * Anything else found there (a setting an older version used to save) is ignored
 * and dropped the next time something is saved.
 */
export function createSettingsStore({ storageKey }: { storageKey: string }): SettingsStore {
  return create<SettingsState>((set, get) => {
    const save = () =>
      persist(storageKey, {
        youtubeCookiesPath: get().youtubeCookiesPath,
        collapsedFolders: get().collapsedFolders,
      });

    return {
      ...load(storageKey),

      setYoutubeCookiesPath: (path) => {
        set({ youtubeCookiesPath: path });
        save();
      },

      setFolderCollapsed: (folderId, collapsed) => {
        set({ collapsedFolders: { ...get().collapsedFolders, [folderId]: collapsed } });
        save();
      },
    };
  });
}
