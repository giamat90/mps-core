import { isSessionExpiredError } from "../../youtube";
import type { FriendlyError } from "./friendlyError";

export interface SongLike {
  id: string;
  folderId?: string | null;
}

export interface FolderLike {
  id: string;
}

export interface ProcessingLike {
  songId: string;
  stage: string;
  progress: number;
  isComplete: boolean;
}

export interface YoutubeRequestLike {
  url: string;
}

export interface LibraryYoutubeOptions {
  freshSession?: boolean;
}

/** The backend this library talks to; the app passes its generated IPC wrappers. */
export interface LibraryApi<Song, Folder, Processing, Request, Upload extends unknown[]> {
  listSongs: () => Promise<Song[]>;
  listFolders: () => Promise<Folder[]>;
  processSong: (filePath: string, ...rest: Upload) => Promise<Song>;
  importYoutube: (request: Request, cookiesPath?: string | null) => Promise<Song>;
  deleteSong: (songId: string) => Promise<void>;
  renameSong: (songId: string, title: string) => Promise<Song>;
  setSongIdentity: (songId: string, officialTitle: string | null, officialArtist: string | null) => Promise<Song>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (folderId: string, name: string) => Promise<Folder>;
  deleteFolder: (folderId: string) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<Folder[]>;
  moveSongs: (folderId: string | null, orderedSongIds: string[]) => Promise<Song[]>;
  onProcessingProgress: (callback: (status: Processing) => void) => Promise<() => void>;
}

export interface LibraryDeps<Song, Folder, Processing, Request, Upload extends unknown[]> {
  api: LibraryApi<Song, Folder, Processing, Request, Upload>;
  friendlyError: FriendlyError;
  /** Opens the sign-in window and resolves with the cookies file it wrote. */
  signInYoutube: () => Promise<string>;
  /** Where the app keeps the cookies path after a sign-in. */
  saveCookiesPath: (path: string) => void;
}

export interface LibraryCoreState<
  Song extends SongLike,
  Folder extends FolderLike,
  Processing extends ProcessingLike,
  Request extends YoutubeRequestLike,
  Upload extends unknown[],
> {
  songs: Song[];
  folders: Folder[];
  processing: Processing | null;
  isLoading: boolean;
  error: string | null;
  /** The last YouTube import was turned down in a way a fresh sign-in can fix. */
  sessionExpired: boolean;
  retryableYoutubeImport: Request | null;

  fetchSongs: () => Promise<void>;
  uploadSong: (filePath: string, ...rest: Upload) => Promise<void>;
  importYoutubeRequest: (request: Request, cookiesPath?: string | null, options?: LibraryYoutubeOptions) => Promise<void>;
  signInAndRetryYoutube: () => Promise<void>;
  deleteSong: (songId: string) => Promise<void>;
  renameSong: (songId: string, title: string) => Promise<void>;
  /** Returns the saved song, or null when the backend refused (the reason is in `error`) */
  setSongIdentity: (songId: string, officialTitle: string, officialArtist: string) => Promise<Song | null>;
  fetchFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<void>;
  moveSongs: (folderId: string | null, orderedSongIds: string[]) => Promise<void>;
  clearError: () => void;
  initProgressListener: () => Promise<() => void>;
}

type SetState<S> = (partial: Partial<S> | ((state: S) => Partial<S>)) => void;

const idleStatus = (stage: string) => ({ songId: "", stage, progress: 0, isComplete: false });

/**
 * The library's state and actions, for `create<YourState>((set, get) => ({ ...libraryStateCreator(deps)(set, get), ... }))`.
 * The app adds its own `importYoutube(url, ...)` that builds the request its backend takes.
 */
export function libraryStateCreator<
  Song extends SongLike,
  Folder extends FolderLike,
  Processing extends ProcessingLike,
  Request extends YoutubeRequestLike,
  Upload extends unknown[],
  S extends LibraryCoreState<Song, Folder, Processing, Request, Upload>,
>({ api, friendlyError, signInYoutube, saveCookiesPath }: LibraryDeps<Song, Folder, Processing, Request, Upload>) {
  return (set: SetState<S>, get: () => S): LibraryCoreState<Song, Folder, Processing, Request, Upload> => ({
    songs: [],
    folders: [],
    processing: null,
    isLoading: false,
    error: null,
    sessionExpired: false,
    retryableYoutubeImport: null,

    fetchSongs: async () => {
      set({ isLoading: true } as Partial<S>);
      try {
        const songs = await api.listSongs();
        set({ songs, isLoading: false } as Partial<S>);
      } catch (e) {
        console.error("Failed to fetch songs:", e);
        set({ isLoading: false } as Partial<S>);
      }
    },

    uploadSong: async (filePath, ...rest) => {
      set({ error: null, processing: idleStatus("Preparing…") } as Partial<S>);
      try {
        const song = await api.processSong(filePath, ...rest);
        set((state) => ({ songs: [...state.songs, song], processing: null }) as Partial<S>);
      } catch (e) {
        console.error("Failed to process song:", e);
        set({ processing: null, error: friendlyError(e, "upload") } as Partial<S>);
      }
    },

    importYoutubeRequest: async (request, cookiesPath, options) => {
      const fresh = !!options?.freshSession;
      set({
        error: null,
        sessionExpired: false,
        retryableYoutubeImport: null,
        processing: idleStatus("Connecting…"),
      } as Partial<S>);
      try {
        const song = await api.importYoutube(request, cookiesPath);
        set((state) => ({ songs: [...state.songs, song], processing: null }) as Partial<S>);
      } catch (e) {
        console.error("YouTube import failed:", e);
        const expired = !!cookiesPath && !fresh && isSessionExpiredError(e);
        set({
          processing: null,
          error: friendlyError(e, "youtube", !!cookiesPath, fresh),
          sessionExpired: expired,
          retryableYoutubeImport: expired ? request : null,
        } as Partial<S>);
      }
    },

    signInAndRetryYoutube: async () => {
      const request = get().retryableYoutubeImport;
      if (!request) return;
      set({ error: null, sessionExpired: false } as Partial<S>);
      let cookiesPath: string;
      try {
        cookiesPath = await signInYoutube();
      } catch (e) {
        console.warn("[youtube] sign-in before retry failed:", e);
        set({ error: String(e), sessionExpired: true } as Partial<S>);
        return;
      }
      saveCookiesPath(cookiesPath);
      await get().importYoutubeRequest(request, cookiesPath, { freshSession: true });
    },

    deleteSong: async (songId) => {
      try {
        await api.deleteSong(songId);
        set((state) => ({ songs: state.songs.filter((s) => s.id !== songId) }) as Partial<S>);
      } catch (e) {
        console.error("Failed to delete song:", e);
      }
    },

    renameSong: async (songId, title) => {
      try {
        const updated = await api.renameSong(songId, title);
        set((state) => ({ songs: state.songs.map((s) => (s.id === songId ? updated : s)) }) as Partial<S>);
      } catch (e) {
        console.error("Failed to rename song:", e);
        set({ error: String(e) } as Partial<S>);
      }
    },

    setSongIdentity: async (songId, officialTitle, officialArtist) => {
      try {
        const updated = await api.setSongIdentity(songId, officialTitle.trim() || null, officialArtist.trim() || null);
        set((state) => ({ songs: state.songs.map((s) => (s.id === songId ? updated : s)) }) as Partial<S>);
        return updated;
      } catch (e) {
        console.error("Failed to set song identity:", e);
        set({ error: String(e) } as Partial<S>);
        return null;
      }
    },

    fetchFolders: async () => {
      try {
        set({ folders: await api.listFolders() } as Partial<S>);
      } catch (e) {
        console.error("Failed to fetch folders:", e);
      }
    },

    createFolder: async (name) => {
      try {
        const folder = await api.createFolder(name);
        set((state) => ({ folders: [...state.folders, folder] }) as Partial<S>);
      } catch (e) {
        console.error("Failed to create folder:", e);
        set({ error: String(e) } as Partial<S>);
      }
    },

    renameFolder: async (folderId, name) => {
      try {
        const updated = await api.renameFolder(folderId, name);
        set((state) => ({ folders: state.folders.map((f) => (f.id === folderId ? updated : f)) }) as Partial<S>);
      } catch (e) {
        console.error("Failed to rename folder:", e);
        set({ error: String(e) } as Partial<S>);
      }
    },

    deleteFolder: async (folderId) => {
      try {
        await api.deleteFolder(folderId);
        set(
          (state) =>
            ({
              folders: state.folders.filter((f) => f.id !== folderId),
              songs: state.songs.map((s) => (s.folderId === folderId ? { ...s, folderId: null } : s)),
            }) as Partial<S>,
        );
      } catch (e) {
        console.error("Failed to delete folder:", e);
      }
    },

    reorderFolders: async (orderedIds) => {
      try {
        set({ folders: await api.reorderFolders(orderedIds) } as Partial<S>);
      } catch (e) {
        console.error("Failed to reorder folders:", e);
      }
    },

    moveSongs: async (folderId, orderedSongIds) => {
      try {
        const updated = await api.moveSongs(folderId, orderedSongIds);
        set((state) => ({ songs: state.songs.map((s) => updated.find((u) => u.id === s.id) ?? s) }) as Partial<S>);
      } catch (e) {
        console.error("Failed to move/reorder songs:", e);
        set({ error: String(e) } as Partial<S>);
      }
    },

    clearError: () => set({ error: null, sessionExpired: false, retryableYoutubeImport: null } as Partial<S>),

    initProgressListener: async () =>
      api.onProcessingProgress((status) => {
        set({ processing: status.isComplete ? null : status } as Partial<S>);
      }),
  });
}
