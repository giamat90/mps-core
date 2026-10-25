import { describe, it, expect, vi } from "vitest";
import {
  FOLDER_DRAG_PREFIX,
  ROOT_CONTAINER_ID,
  activateOnKey,
  arrayMove,
  formatDuration,
  layoutLibrary,
  libraryDropTarget,
  resolveLibraryDrop,
  sortByIndex,
} from "./libraryView";

interface Song { id: string; title: string; sortIndex: number; folderId?: string | null }
interface Folder { id: string; name: string; sortIndex: number }
const song = (id: string, sortIndex: number, folderId: string | null = null): Song => ({ id, title: id, sortIndex, folderId });
const folder = (id: string, sortIndex: number): Folder => ({ id, name: id.toUpperCase(), sortIndex });
const filter = (songs: Song[], _f: Folder[], q: string) => songs.filter((s) => s.id.includes(q.trim()));

describe("small helpers", () => {
  it("formats a duration as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65.4)).toBe("1:05");
    expect(formatDuration(599.6)).toBe("9:60");
  });

  it("sorts by index without touching the input", () => {
    const input = [song("b", 2), song("a", 1)];
    expect(sortByIndex(input).map((s) => s.id)).toEqual(["a", "b"]);
    expect(input[0].id).toBe("b");
  });

  it("moves an item like dnd-kit's arrayMove", () => {
    expect(arrayMove([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(arrayMove([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
  });

  it("opens a row on Enter or Space, but only when the key went to the row itself", () => {
    const open = vi.fn();
    const handler = activateOnKey(open);
    const row = {};
    const preventDefault = vi.fn();
    handler({ key: "Enter", target: row, currentTarget: row, preventDefault });
    handler({ key: " ", target: row, currentTarget: row, preventDefault });
    handler({ key: "a", target: row, currentTarget: row, preventDefault });
    handler({ key: "Enter", target: {}, currentTarget: row, preventDefault });
    expect(open).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });
});

describe("layoutLibrary", () => {
  const songs = [song("r2", 2), song("r1", 1), song("x2", 2, "f1"), song("x1", 1, "f1"), song("y1", 1, "f2")];
  const folders = [folder("f2", 2), folder("f1", 1)];

  it("orders folders and the songs inside each list by index", () => {
    const l = layoutLibrary(songs, folders, "", filter);
    expect(l.sortedFolders.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(l.rootSongs.map((s) => s.id)).toEqual(["r1", "r2"]);
    expect(l.songsByFolder.get("f1")?.map((s) => s.id)).toEqual(["x1", "x2"]);
    expect(l.searching).toBe(false);
    expect(l.matches).toEqual([]);
  });

  it("searches root songs first, then each folder in order, and names a result's folder", () => {
    const l = layoutLibrary(songs, folders, " 1", filter);
    expect(l.searching).toBe(true);
    expect(l.matches.map((s) => s.id)).toEqual(["r1", "x1", "y1"]);
    expect(l.folderNameOf(song("x1", 1, "f1"))).toBe("F1");
    expect(l.folderNameOf(song("r1", 1))).toBeNull();
  });
});

describe("resolveLibraryDrop", () => {
  const layout = layoutLibrary(
    [song("r1", 1), song("r2", 2), song("a", 1, "f1"), song("b", 2, "f1")],
    [folder("f1", 1), folder("f2", 2)],
    "",
    filter,
  );
  const fid = (id: string) => `${FOLDER_DRAG_PREFIX}${id}`;

  it("ignores a drop on itself", () => {
    expect(resolveLibraryDrop(layout, "r1", "r1")).toBeNull();
  });

  it("reorders folders", () => {
    expect(resolveLibraryDrop(layout, fid("f1"), fid("f2"))).toEqual({ type: "reorder-folders", orderedIds: ["f2", "f1"] });
    expect(resolveLibraryDrop(layout, fid("f1"), "r1")).toBeNull();
    expect(resolveLibraryDrop(layout, fid("gone"), fid("f2"))).toBeNull();
  });

  it("reorders songs inside a list", () => {
    expect(resolveLibraryDrop(layout, "r1", "r2")).toEqual({ type: "move-songs", folderId: null, orderedSongIds: ["r2", "r1"] });
    expect(resolveLibraryDrop(layout, "b", "a")).toEqual({ type: "move-songs", folderId: "f1", orderedSongIds: ["b", "a"] });
  });

  it("moves a song to the list of the row it lands on, at that row", () => {
    expect(resolveLibraryDrop(layout, "r1", "b")).toEqual({ type: "move-songs", folderId: "f1", orderedSongIds: ["a", "r1", "b"] });
  });

  it("moves a song to the end of a folder or of the root when dropped on the container", () => {
    expect(resolveLibraryDrop(layout, "r1", "f2")).toEqual({ type: "move-songs", folderId: "f2", orderedSongIds: ["r1"] });
    expect(resolveLibraryDrop(layout, "a", ROOT_CONTAINER_ID)).toEqual({
      type: "move-songs",
      folderId: null,
      orderedSongIds: ["r1", "r2", "a"],
    });
  });

  it("does nothing for unknown songs or targets", () => {
    expect(resolveLibraryDrop(layout, "ghost", "r1")).toBeNull();
    expect(resolveLibraryDrop(layout, "r1", "ghost")).toBeNull();
  });

  it("moves a song dropped on a folder's section, which is all a closed folder shows", () => {
    expect(resolveLibraryDrop(layout, "r1", fid("f2"))).toEqual({ type: "move-songs", folderId: "f2", orderedSongIds: ["r1"] });
    expect(resolveLibraryDrop(layout, "r1", fid("f1"))).toEqual({
      type: "move-songs",
      folderId: "f1",
      orderedSongIds: ["a", "b", "r1"],
    });
    expect(resolveLibraryDrop(layout, "a", fid("f2"))).toEqual({ type: "move-songs", folderId: "f2", orderedSongIds: ["a"] });
  });

  it("does nothing for a song dropped on the section of the folder it is already in, or of one that is gone", () => {
    expect(resolveLibraryDrop(layout, "a", fid("f1"))).toBeNull();
    expect(resolveLibraryDrop(layout, "r1", fid("gone"))).toBeNull();
  });
});

describe("libraryDropTarget", () => {
  const layout = layoutLibrary(
    [song("r1", 1), song("r2", 2), song("a", 1, "f1"), song("b", 2, "f1")],
    [folder("f1", 1), folder("f2", 2)],
    "",
    filter,
  );
  const fid = (id: string) => `${FOLDER_DRAG_PREFIX}${id}`;

  it("names the folder a song would land in, whether the pointer is on its body, header or one of its rows", () => {
    expect(libraryDropTarget(layout, "r1", "f2")).toBe("f2");
    expect(libraryDropTarget(layout, "r1", fid("f2"))).toBe("f2");
    expect(libraryDropTarget(layout, "r1", "b")).toBe("f1");
  });

  it("names the root when a folder's song is over a root row or the root list", () => {
    expect(libraryDropTarget(layout, "a", "r2")).toBe(ROOT_CONTAINER_ID);
    expect(libraryDropTarget(layout, "a", ROOT_CONTAINER_ID)).toBe(ROOT_CONTAINER_ID);
  });

  it("names nothing while the song stays in its own list, over nothing, over something unknown or when a folder is dragged", () => {
    expect(libraryDropTarget(layout, "r1", "r2")).toBeNull();
    expect(libraryDropTarget(layout, "a", "b")).toBeNull();
    expect(libraryDropTarget(layout, "a", fid("f1"))).toBeNull();
    expect(libraryDropTarget(layout, "r1", null)).toBeNull();
    expect(libraryDropTarget(layout, "r1", "ghost")).toBeNull();
    expect(libraryDropTarget(layout, "r1", fid("gone"))).toBeNull();
    expect(libraryDropTarget(layout, "ghost", "f1")).toBeNull();
    expect(libraryDropTarget(layout, fid("f1"), fid("f2"))).toBeNull();
  });
});
