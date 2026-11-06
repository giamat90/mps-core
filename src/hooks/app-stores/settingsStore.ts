import { create, type StoreApi, type UseBoundStore } from "zustand";
import { EMPTY_AUDIO_SETUP, normalizeAudioSetup, type AudioSetup, type SavedDevice } from "../../audio-setup";

export interface SettingsState {
  youtubeCookiesPath: string | null;
  setYoutubeCookiesPath: (path: string | null) => void;
  collapsedFolders: Record<string, boolean>;
  setFolderCollapsed: (folderId: string, collapsed: boolean) => void;
  /** The input and output wanted in every song (see `audio-setup`). */
  audioSetup: AudioSetup;
  setAudioInput: (device: SavedDevice | null) => void;
  setAudioOutput: (device: SavedDevice | null) => void;
}

export type SettingsStore = UseBoundStore<StoreApi<SettingsState>>;

type PersistedSettings = Pick<SettingsState, "youtubeCookiesPath" | "collapsedFolders" | "audioSetup">;

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
      audioSetup: normalizeAudioSetup(raw.audioSetup),
    };
  } catch (e) {
    console.warn("[settings] Could not load settings:", e);
    return { youtubeCookiesPath: null, collapsedFolders: {}, audioSetup: EMPTY_AUDIO_SETUP };
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
        audioSetup: get().audioSetup,
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

      setAudioInput: (device) => {
        set({ audioSetup: { ...get().audioSetup, input: device } });
        save();
      },

      setAudioOutput: (device) => {
        set({ audioSetup: { ...get().audioSetup, output: device } });
        save();
      },
    };
  });
}
