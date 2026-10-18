// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createPanelStore } from "../../panels";
import { usePanelMenu } from "./usePanelMenu";

const PANELS = [
  { id: "a", label: "Alpha", defaultVisible: true },
  { id: "b", label: "Beta", defaultVisible: false },
  { id: "c", label: "Gamma", defaultVisible: true },
] as const;
const AREAS = [
  { id: "wave", label: "Waveforms", defaultVisible: true },
  { id: "t1", label: "Track", defaultVisible: false },
] as const;
const ITEMS = [{ id: "wave", label: "Waveforms", parts: [{ id: "t1", label: "Track" }] }];

let n = 0;
const stores = () => ({
  store: createPanelStore({ storageKey: `pm_${n++}`, panels: PANELS }),
  areas: createPanelStore({ storageKey: `pm_${n++}`, panels: AREAS }),
});

beforeEach(() => localStorage.clear());

describe("usePanelMenu", () => {
  it("counts the panels shown out of all of them and lists them in the user's order", () => {
    const { store } = stores();
    store.getState().move("c", "a");
    const { result } = renderHook(() => usePanelMenu({ store, panels: PANELS, useDetached: () => ({}) }));
    expect([result.current.shown, result.current.total]).toEqual([2, 3]);
    expect(result.current.list.panels.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(result.current.list.visible).toEqual({ a: true, b: false, c: true });
    expect(result.current.list.fixed).toBeUndefined();
  });

  it("passes the detached panels and the movable flag through", () => {
    const { store } = stores();
    const { result } = renderHook(() =>
      usePanelMenu({ store, panels: PANELS, movable: false, useDetached: () => ({ a: true }) }),
    );
    expect(result.current.list.detached).toEqual({ a: true });
    expect(result.current.list.movable).toBe(false);
  });

  it("toggles, shows all, hides all and resets the panels", () => {
    const { store } = stores();
    const { result } = renderHook(() => usePanelMenu({ store, panels: PANELS, useDetached: () => ({}) }));
    act(() => result.current.list.onToggle("b"));
    expect(store.getState().visible.b).toBe(true);
    act(() => result.current.list.onHideAll());
    expect(Object.values(store.getState().visible)).toEqual([false, false, false]);
    act(() => result.current.list.onShowAll());
    expect(Object.values(store.getState().visible)).toEqual([true, true, true]);
    act(() => result.current.list.onReset());
    expect(store.getState().visible).toEqual({ a: true, b: false, c: true });
    expect(result.current.shown).toBe(2);
  });

  it("counts the fixed areas too and keeps their tracks when only the areas are hidden", () => {
    const { store, areas } = stores();
    const { result } = renderHook(() =>
      usePanelMenu({ store, panels: PANELS, fixed: { store: areas, items: ITEMS, tags: { t1: "muted" } }, useDetached: () => ({}) }),
    );
    expect([result.current.shown, result.current.total]).toEqual([3, 4]);
    expect(result.current.list.fixed?.tags).toEqual({ t1: "muted" });
    act(() => result.current.list.fixed?.onToggle("t1"));
    expect(areas.getState().visible.t1).toBe(true);
    act(() => result.current.list.onHideAll());
    expect(areas.getState().visible.wave).toBe(false);
    expect(areas.getState().visible.t1).toBe(true);
    act(() => result.current.list.onShowAll());
    expect(areas.getState().visible.wave).toBe(true);
    act(() => result.current.list.onReset());
    expect(areas.getState().visible).toEqual({ wave: true, t1: false });
  });

  it("opens and closes like any popover and gives the button an id to control", () => {
    const { store } = stores();
    const { result } = renderHook(() => usePanelMenu({ store, panels: PANELS, useDetached: () => ({}) }));
    expect(result.current.open).toBe(false);
    expect(result.current.listId).not.toBe("");
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
  });
});
