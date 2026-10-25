import type { FolderLike, SongLike } from "./libraryStore";

export const ROOT_CONTAINER_ID = "root";
export const FOLDER_DRAG_PREFIX = "folder:";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function sortByIndex<T extends { sortIndex: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortIndex - b.sortIndex);
}

export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

type OrderedSong = SongLike & { sortIndex: number };
type OrderedFolder = FolderLike & { name: string; sortIndex: number };

export interface LibraryLayout<Song extends OrderedSong, Folder extends OrderedFolder> {
  sortedFolders: Folder[];
  rootSongs: Song[];
  songsByFolder: Map<string, Song[]>;
  searching: boolean;
  matches: Song[];
  folderNameOf: (song: Song) => string | null;
}

/** Songs and folders as the page lists them: root songs, each folder's songs, and the search results. */
export function layoutLibrary<Song extends OrderedSong, Folder extends OrderedFolder>(
  songs: Song[],
  folders: Folder[],
  query: string,
  filterSongs: (songs: Song[], folders: Folder[], query: string) => Song[],
): LibraryLayout<Song, Folder> {
  const sortedFolders = sortByIndex(folders);
  const rootSongs = sortByIndex(songs.filter((s) => !s.folderId));
  const songsByFolder = new Map<string, Song[]>();
  for (const folder of sortedFolders) {
    songsByFolder.set(folder.id, sortByIndex(songs.filter((s) => s.folderId === folder.id)));
  }
  const searching = query.trim() !== "";
  const searchOrder = [...rootSongs, ...sortedFolders.flatMap((f) => songsByFolder.get(f.id) ?? [])];
  return {
    sortedFolders,
    rootSongs,
    songsByFolder,
    searching,
    matches: searching ? filterSongs(searchOrder, folders, query) : [],
    folderNameOf: (song) => folders.find((f) => f.id === song.folderId)?.name ?? null,
  };
}

export type DragOutcome =
  | { type: "reorder-folders"; orderedIds: string[] }
  | { type: "move-songs"; folderId: string | null; orderedSongIds: string[] };

type DropLayout<Song extends OrderedSong, Folder extends OrderedFolder> = Pick<
  LibraryLayout<Song, Folder>,
  "sortedFolders" | "rootSongs" | "songsByFolder"
>;

function containerItems<Song extends OrderedSong, Folder extends OrderedFolder>(
  layout: DropLayout<Song, Folder>,
  containerId: string,
): string[] {
  return (containerId === ROOT_CONTAINER_ID ? layout.rootSongs : (layout.songsByFolder.get(containerId) ?? [])).map(
    (s) => s.id,
  );
}

function findSongContainer<Song extends OrderedSong, Folder extends OrderedFolder>(
  layout: DropLayout<Song, Folder>,
  songId: string,
): string | null {
  if (layout.rootSongs.some((s) => s.id === songId)) return ROOT_CONTAINER_ID;
  for (const [folderId, list] of layout.songsByFolder) {
    if (list.some((s) => s.id === songId)) return folderId;
  }
  return null;
}

/**
 * The container (a folder id or the root) a dragged song lands in when released over `overId`.
 * A folder's whole section counts as that folder, header included, so a closed folder (whose
 * body is not mounted) still takes the song.
 */
function songDropContainer<Song extends OrderedSong, Folder extends OrderedFolder>(
  layout: DropLayout<Song, Folder>,
  overId: string,
): string | null {
  const knownFolderIds = new Set(layout.sortedFolders.map((f) => f.id));
  const sectionFolderId = overId.startsWith(FOLDER_DRAG_PREFIX) ? overId.slice(FOLDER_DRAG_PREFIX.length) : null;
  if (sectionFolderId !== null) return knownFolderIds.has(sectionFolderId) ? sectionFolderId : null;
  if (overId === ROOT_CONTAINER_ID || knownFolderIds.has(overId)) return overId;
  return findSongContainer(layout, overId);
}

/**
 * The folder id (or the root) to highlight while a song is dragged over `overId`: where it would
 * land if released now, or null for a folder drag, nothing under the pointer, or the container
 * the song already sits in.
 */
export function libraryDropTarget<Song extends OrderedSong, Folder extends OrderedFolder>(
  layout: DropLayout<Song, Folder>,
  activeId: string,
  overId: string | null,
): string | null {
  if (overId === null || activeId.startsWith(FOLDER_DRAG_PREFIX)) return null;
  const from = findSongContainer(layout, activeId);
  const to = songDropContainer(layout, overId);
  return from === null || to === null || from === to ? null : to;
}

/** What dropping `activeId` on `overId` should do, or null when nothing changes. */
export function resolveLibraryDrop<Song extends OrderedSong, Folder extends OrderedFolder>(
  layout: DropLayout<Song, Folder>,
  activeId: string,
  overId: string,
): DragOutcome | null {
  if (activeId === overId) return null;

  if (activeId.startsWith(FOLDER_DRAG_PREFIX)) {
    const folderOrder = layout.sortedFolders.map((f) => `${FOLDER_DRAG_PREFIX}${f.id}`);
    const oldIndex = folderOrder.indexOf(activeId);
    const newIndex = folderOrder.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return null;
    return {
      type: "reorder-folders",
      orderedIds: arrayMove(folderOrder, oldIndex, newIndex).map((id) => id.slice(FOLDER_DRAG_PREFIX.length)),
    };
  }

  const fromContainer = findSongContainer(layout, activeId);
  if (!fromContainer) return null;
  const toContainer = songDropContainer(layout, overId);
  if (!toContainer) return null;

  const toItems = containerItems(layout, toContainer);
  let ordered: string[];
  if (fromContainer === toContainer) {
    const oldIndex = containerItems(layout, fromContainer).indexOf(activeId);
    const newIndex = toItems.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
    ordered = arrayMove(toItems, oldIndex, newIndex);
  } else {
    const overIndex = toItems.indexOf(overId);
    ordered = [...toItems];
    ordered.splice(overIndex === -1 ? toItems.length : overIndex, 0, activeId);
  }
  return {
    type: "move-songs",
    folderId: toContainer === ROOT_CONTAINER_ID ? null : toContainer,
    orderedSongIds: ordered,
  };
}

/** Enter or Space on the row itself (not on a control inside it) opens it. */
export function activateOnKey(onSelect: () => void) {
  return (e: { key: string; target: unknown; currentTarget: unknown; preventDefault: () => void }) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };
}
