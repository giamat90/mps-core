import { useEffect, useState } from "react";
import { layoutLibrary, libraryDropTarget, resolveLibraryDrop, type DragOutcome } from "./libraryView";
import type { FolderLike, SongLike } from "./libraryStore";

type PageSong = SongLike & { title: string; sortIndex: number };
type PageFolder = FolderLike & { name: string; sortIndex: number };
type DragEvent = { active: { id: unknown }; over: { id: unknown } | null };

/** What the page reads from the app's library store. */
export interface LibraryPageStore<Song, Folder> {
  songs: Song[];
  folders: Folder[];
  isLoading: boolean;
  error: string | null;
  sessionExpired: boolean;
  processing: unknown;
  fetchSongs: () => Promise<void>;
  fetchFolders: () => Promise<void>;
  deleteSong: (songId: string) => Promise<void>;
  renameSong: (songId: string, title: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<void>;
  moveSongs: (folderId: string | null, orderedSongIds: string[]) => Promise<void>;
  clearError: () => void;
  signInAndRetryYoutube: () => Promise<void>;
  initProgressListener: () => Promise<() => void>;
}

export interface LibraryPageOptions<State extends LibraryPageStore<PageSong, PageFolder>> {
  /** The app's zustand library store hook. */
  useStore: <T>(select: (state: State) => T) => T;
  /** The app's version for the About dialog. */
  getVersion: () => Promise<string>;
  filterSongs: (songs: State["songs"], folders: State["folders"], query: string) => State["songs"];
}

/** The state of the library page: loading, search, the folder list, the About and Settings toggles, and what a drop does. */
export function useLibraryPage<State extends LibraryPageStore<PageSong, PageFolder>>({
  useStore,
  getVersion,
  filterSongs,
}: LibraryPageOptions<State>) {
  const songs = useStore((s) => s.songs);
  const folders = useStore((s) => s.folders);
  const isLoading = useStore((s) => s.isLoading);
  const error = useStore((s) => s.error);
  const sessionExpired = useStore((s) => s.sessionExpired);
  const isProcessing = useStore((s) => s.processing !== null);
  const fetchSongs = useStore((s) => s.fetchSongs);
  const fetchFolders = useStore((s) => s.fetchFolders);
  const deleteSong = useStore((s) => s.deleteSong);
  const renameSong = useStore((s) => s.renameSong);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const reorderFolders = useStore((s) => s.reorderFolders);
  const moveSongs = useStore((s) => s.moveSongs);
  const clearError = useStore((s) => s.clearError);
  const signInAndRetryYoutube = useStore((s) => s.signInAndRetryYoutube);
  const initProgressListener = useStore((s) => s.initProgressListener);

  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [highQuality, setHighQuality] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [query, setQuery] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    fetchSongs();
    fetchFolders();
    const cleanupPromise = initProgressListener();
    getVersion()
      .then(setAppVersion)
      .catch((e: unknown) => console.warn("[About] getVersion failed:", e));
    return () => {
      cleanupPromise.then((unlisten) => unlisten());
    };
  }, []);

  const layout = layoutLibrary<State["songs"][number], State["folders"][number]>(songs, folders, query, filterSongs);

  const applyDrop = (outcome: DragOutcome | null) => {
    if (!outcome) return;
    if (outcome.type === "reorder-folders") reorderFolders(outcome.orderedIds);
    else moveSongs(outcome.folderId, outcome.orderedSongIds);
  };

  const handleDragOver = (event: DragEvent) => {
    setDropTarget(event.over ? libraryDropTarget(layout, String(event.active.id), String(event.over.id)) : null);
  };

  const handleDragCancel = () => setDropTarget(null);

  const handleDragEnd = (event: DragEvent) => {
    setDropTarget(null);
    if (!event.over) return;
    applyDrop(resolveLibraryDrop(layout, String(event.active.id), String(event.over.id)));
  };

  const commitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) createFolder(trimmed);
    setNewFolderName("");
    setIsCreatingFolder(false);
  };

  const cancelNewFolder = () => {
    setNewFolderName("");
    setIsCreatingFolder(false);
  };

  return {
    ...layout,
    songs,
    folders,
    isLoading,
    error,
    sessionExpired,
    isProcessing,
    hasContent: songs.length > 0 || layout.sortedFolders.length > 0,
    deleteSong,
    renameSong,
    renameFolder,
    deleteFolder,
    clearError,
    signInAndRetryYoutube,
    dropTarget,
    handleDragOver,
    handleDragCancel,
    handleDragEnd,
    showAbout,
    openAbout: () => setShowAbout(true),
    closeAbout: () => setShowAbout(false),
    showSettings,
    toggleSettings: () => setShowSettings((v) => !v),
    appVersion,
    highQuality,
    setHighQuality,
    query,
    setQuery,
    clearQuery: () => setQuery(""),
    isCreatingFolder,
    startCreatingFolder: () => setIsCreatingFolder(true),
    newFolderName,
    setNewFolderName,
    commitNewFolder,
    cancelNewFolder,
  };
}
