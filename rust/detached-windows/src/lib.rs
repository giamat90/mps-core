//! Detached panels: a panel dragged out of the main window gets a window of its
//! own. The window only ever loads the app's own page; what it shows is decided
//! from its label by the frontend, so nothing from a caller is put in a URL.
//!
//! Where a panel's window last was (and how big) is remembered between uses,
//! but only applied while it is still on a connected monitor.
//!
//! This crate knows nothing about an app: the panels that may be detached are a
//! [`PanelSpec`] table the app passes in (and keeps equal to the frontend's list,
//! which an app-side contract test compares), and the directory the memory file
//! lives in is passed to [`WindowMemory::load`]. The app wraps these functions in
//! its own `#[tauri::command]`s.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

pub const DETACHED_PREFIX: &str = "detached-";
/// Event the frontend listens for (mps-core `windows`) to dock a panel again.
const EVT_DOCKED: &str = "mps:docked";
const MEMORY_FILE: &str = "detached_windows.json";

/// Far beyond any real desktop; a value outside this is a bug or an attack, not a position.
const MAX_COORDINATE: f64 = 20_000.0;
pub const MIN_WIDTH: u32 = 240;
pub const MIN_HEIGHT: u32 = 140;
const MAX_SIZE: u32 = 10_000;
/// Windows reports a minimised window at about (-32000, -32000); that is not a place.
const MINIMISED_BELOW: i32 = -30_000;
/// How much of a remembered window must overlap a monitor for the position to be worth restoring.
const MIN_VISIBLE_W: i64 = 80;
const MIN_VISIBLE_H: i64 = 40;

/// One panel an app lets the user detach.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PanelSpec {
    pub id: &'static str,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, PartialEq)]
pub struct WindowPlan {
    pub label: String,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
}

/// The window for `panel_id`, or an error for anything not in the allowlist.
pub fn plan(panels: &[PanelSpec], panel_id: &str) -> Result<WindowPlan, String> {
    let spec = panels
        .iter()
        .find(|p| p.id == panel_id)
        .ok_or_else(|| format!("{panel_id:?} cannot be detached"))?;
    Ok(WindowPlan {
        label: format!("{DETACHED_PREFIX}{panel_id}"),
        title: spec.title,
        width: spec.width,
        height: spec.height,
    })
}

pub fn checked_position(x: f64, y: f64) -> Result<(f64, f64), String> {
    if x.is_finite() && y.is_finite() && x.abs() <= MAX_COORDINATE && y.abs() <= MAX_COORDINATE {
        Ok((x, y))
    } else {
        Err(format!("Window position ({x}, {y}) is not on any screen"))
    }
}

pub fn is_detached_label(panels: &[PanelSpec], label: &str) -> bool {
    label.strip_prefix(DETACHED_PREFIX).is_some_and(|rest| plan(panels, rest).is_ok())
}

/// Outer position and inner size, physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn is_sane(g: &Geometry) -> bool {
    (MIN_WIDTH..=MAX_SIZE).contains(&g.width)
        && (MIN_HEIGHT..=MAX_SIZE).contains(&g.height)
        && g.x > MINIMISED_BELOW
        && g.y > MINIMISED_BELOW
        && g.x.abs() <= 100_000
        && g.y.abs() <= 100_000
}

/// Is enough of the window on some monitor for the user to find and grab it?
pub fn is_visible(g: &Geometry, monitors: &[Geometry]) -> bool {
    monitors.iter().any(|m| {
        let w = (i64::from(g.x) + i64::from(g.width)).min(i64::from(m.x) + i64::from(m.width)) - i64::from(g.x).max(i64::from(m.x));
        let h = (i64::from(g.y) + i64::from(g.height)).min(i64::from(m.y) + i64::from(m.height)) - i64::from(g.y).max(i64::from(m.y));
        w >= MIN_VISIBLE_W && h >= MIN_VISIBLE_H
    })
}

/// Is the point inside the rectangle? The right and bottom edges are outside, as for any pixel grid.
pub fn contains(rect: &Geometry, x: f64, y: f64) -> bool {
    x >= f64::from(rect.x)
        && y >= f64::from(rect.y)
        && x < f64::from(rect.x) + f64::from(rect.width)
        && y < f64::from(rect.y) + f64::from(rect.height)
}

/// Reads the remembered windows, dropping anything unusable instead of failing:
/// a damaged file must never stop a panel from opening.
pub fn parse_saved(panels: &[PanelSpec], json: &str) -> BTreeMap<String, Geometry> {
    let mut out = BTreeMap::new();
    let value: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("Ignoring the remembered window positions: {e}");
            return out;
        }
    };
    let Some(map) = value.as_object() else {
        log::warn!("Ignoring the remembered window positions: not an object");
        return out;
    };
    for (id, v) in map {
        if plan(panels, id).is_err() {
            continue;
        }
        match serde_json::from_value::<Geometry>(v.clone()) {
            Ok(g) if is_sane(&g) => {
                out.insert(id.clone(), g);
            }
            Ok(g) => log::warn!("Ignoring an implausible remembered position for {id}: {g:?}"),
            Err(e) => log::warn!("Ignoring the remembered position of {id}: {e}"),
        }
    }
    out
}

pub fn serialize_saved(saved: &BTreeMap<String, Geometry>) -> String {
    serde_json::to_string_pretty(saved).unwrap_or_else(|e| {
        log::warn!("Could not serialise the window positions: {e}");
        "{}".to_string()
    })
}

/// Where each panel window last was. Managed by the app; read at start, written when a window closes.
pub struct WindowMemory {
    path: PathBuf,
    saved: Mutex<BTreeMap<String, Geometry>>,
}

impl WindowMemory {
    /// Reads the memory file in `data_dir`; a missing or damaged file is an empty memory.
    pub fn load(panels: &[PanelSpec], data_dir: &Path) -> Self {
        let path = data_dir.join(MEMORY_FILE);
        let saved = match std::fs::read_to_string(&path) {
            Ok(text) => parse_saved(panels, &text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => {
                log::warn!("Could not read {}: {e}", path.display());
                BTreeMap::new()
            }
        };
        Self { path, saved: Mutex::new(saved) }
    }

    fn get(&self, id: &str) -> Option<Geometry> {
        self.saved.lock().ok()?.get(id).copied()
    }

    fn set(&self, id: &str, g: Geometry) {
        if let Ok(mut map) = self.saved.lock() {
            map.insert(id.to_string(), g);
        }
    }

    fn update(&self, id: &str, f: impl FnOnce(&mut Geometry)) {
        if let Ok(mut map) = self.saved.lock() {
            if let Some(g) = map.get_mut(id) {
                f(g);
            }
        }
    }

    fn persist(&self) {
        let Ok(map) = self.saved.lock() else { return };
        if let Err(e) = std::fs::write(&self.path, serialize_saved(&map)) {
            log::warn!("Could not remember the window positions in {}: {e}", self.path.display());
        }
    }
}

fn monitor_rects(app: &AppHandle) -> Vec<Geometry> {
    match app.available_monitors() {
        Ok(monitors) => monitors
            .iter()
            .map(|m| Geometry { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height })
            .collect(),
        Err(e) => {
            log::warn!("Could not list the monitors: {e}");
            Vec::new()
        }
    }
}

/// Closes every detached window. An app that has windows of its own to close
/// with them does that next to this call.
pub fn close_all(app: &AppHandle, panels: &[PanelSpec]) {
    for (label, window) in app.webview_windows() {
        if is_detached_label(panels, &label) {
            if let Err(e) = window.destroy() {
                log::warn!("Could not close the detached window {label}: {e}");
            }
        }
    }
}

fn place(window: &WebviewWindow, label: &str, dropped: Option<(f64, f64)>, remembered: Option<Geometry>) -> Result<(), String> {
    if let Some(g) = remembered {
        window
            .set_size(Size::Physical(PhysicalSize::new(g.width, g.height)))
            .map_err(|e| format!("Size {label}: {e}"))?;
    }
    if let Some((x, y)) = dropped {
        window
            .set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| format!("Place {label}: {e}"))?;
    } else if let Some(g) = remembered {
        window
            .set_position(Position::Physical(PhysicalPosition::new(g.x, g.y)))
            .map_err(|e| format!("Place {label}: {e}"))?;
    }
    Ok(())
}

fn track_geometry(app: &AppHandle, window: &WebviewWindow, panel_id: String) {
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(pos) if pos.x > MINIMISED_BELOW && pos.y > MINIMISED_BELOW => {
            handle.state::<WindowMemory>().update(&panel_id, |g| {
                g.x = pos.x;
                g.y = pos.y;
            });
        }
        WindowEvent::Resized(size) if size.width > 0 && size.height > 0 => {
            handle.state::<WindowMemory>().update(&panel_id, |g| {
                g.width = size.width;
                g.height = size.height;
            });
        }
        WindowEvent::Destroyed => {
            handle.state::<WindowMemory>().persist();
            if let Err(e) = handle.emit(EVT_DOCKED, &panel_id) {
                log::warn!("Could not announce that {panel_id} was docked: {e}");
            }
        }
        _ => {}
    });
}

/// `x` and `y` are where the user let go (logical, screen coordinates). Without
/// them the window goes where it was last, if that is still on a monitor.
pub async fn detach_panel(
    app: &AppHandle,
    panels: &[PanelSpec],
    panel_id: String,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let plan = plan(panels, &panel_id)?;
    let dropped = match (x, y) {
        (Some(x), Some(y)) => Some(checked_position(x, y)?),
        _ => None,
    };

    if let Some(existing) = app.get_webview_window(&plan.label) {
        return existing.set_focus().map_err(|e| format!("Focus {}: {e}", plan.label));
    }

    let memory = app.state::<WindowMemory>();
    let remembered = memory.get(&panel_id).filter(|g| is_visible(g, &monitor_rects(app)));

    let window = WebviewWindowBuilder::new(app, &plan.label, WebviewUrl::App("index.html".into()))
        .title(plan.title)
        .inner_size(plan.width, plan.height)
        .visible(false)
        .build()
        .map_err(|e| format!("Open {}: {e}", plan.label))?;

    place(&window, &plan.label, dropped, remembered)?;
    window.show().map_err(|e| format!("Show {}: {e}", plan.label))?;

    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
        memory.set(&panel_id, Geometry { x: pos.x, y: pos.y, width: size.width, height: size.height });
    }
    track_geometry(app, &window, panel_id);
    Ok(())
}

/// Closes the window that asked, which docks its panel again in the main window.
pub async fn dock_panel(panels: &[PanelSpec], window: WebviewWindow) -> Result<(), String> {
    if !is_detached_label(panels, window.label()) {
        return Err(format!("{} is not a detached panel", window.label()));
    }
    window.close().map_err(|e| format!("Close {}: {e}", window.label()))
}

/// Closes one panel's window from the main window (hiding the panel in the menu).
pub async fn close_detached_panel(app: &AppHandle, panels: &[PanelSpec], panel_id: &str) -> Result<(), String> {
    let plan = plan(panels, panel_id)?;
    match app.get_webview_window(&plan.label) {
        Some(window) => window.destroy().map_err(|e| format!("Close {}: {e}", plan.label)),
        None => Ok(()),
    }
}

/// Is the mouse pointer over the main window right now? Asked of the OS in
/// physical screen pixels, so a drag that ends over the main window docks the
/// panel without any DPI conversion of coordinates the webview reports.
pub async fn cursor_over_main(app: &AppHandle) -> Result<bool, String> {
    let main = app.get_webview_window("main").ok_or_else(|| "The main window is not open".to_string())?;
    if main.is_minimized().map_err(|e| format!("Main window state: {e}"))? {
        return Ok(false);
    }
    let cursor = app.cursor_position().map_err(|e| format!("Pointer position: {e}"))?;
    let pos = main.outer_position().map_err(|e| format!("Main window position: {e}"))?;
    let size = main.outer_size().map_err(|e| format!("Main window size: {e}"))?;
    Ok(contains(&Geometry { x: pos.x, y: pos.y, width: size.width, height: size.height }, cursor.x, cursor.y))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PANELS: &[PanelSpec] = &[
        PanelSpec { id: "roll", title: "Roll", width: 1000.0, height: 460.0 },
        PanelSpec { id: "lyrics", title: "Lyrics", width: 560.0, height: 640.0 },
        PanelSpec { id: "takes", title: "Takes", width: 420.0, height: 560.0 },
    ];

    fn g(x: i32, y: i32, width: u32, height: u32) -> Geometry {
        Geometry { x, y, width, height }
    }

    #[test]
    fn plans_a_window_for_each_panel_in_the_table() {
        for spec in PANELS {
            let p = plan(PANELS, spec.id).unwrap();
            assert_eq!(p.label, format!("detached-{}", spec.id));
            assert_eq!((p.title, p.width, p.height), (spec.title, spec.width, spec.height));
            assert!(p.width >= f64::from(MIN_WIDTH) && p.height >= f64::from(MIN_HEIGHT), "{}", spec.id);
        }
    }

    #[test]
    fn refuses_anything_else_so_a_caller_cannot_choose_a_label() {
        for bad in ["", "waveform", "main", "Roll", "roll ", "../main", "roll/../x", "detached-roll"] {
            assert!(plan(PANELS, bad).is_err(), "{bad:?} must not be detachable");
        }
    }

    #[test]
    fn an_empty_table_detaches_nothing() {
        assert!(plan(&[], "roll").is_err());
        assert!(!is_detached_label(&[], "detached-roll"));
    }

    #[test]
    fn only_our_own_labels_count_as_detached() {
        for spec in PANELS {
            assert!(is_detached_label(PANELS, &format!("detached-{}", spec.id)));
        }
        for other in ["main", "detached-", "detached-waveform", "xdetached-lyrics", "detached-lyrics-2"] {
            assert!(!is_detached_label(PANELS, other), "{other:?}");
        }
    }

    #[test]
    fn accepts_positions_on_any_realistic_desktop_including_negative_ones() {
        assert_eq!(checked_position(0.0, 0.0), Ok((0.0, 0.0)));
        assert_eq!(checked_position(-1920.0, 40.0), Ok((-1920.0, 40.0)));
        assert_eq!(checked_position(3840.0, 2160.0), Ok((3840.0, 2160.0)));
    }

    #[test]
    fn rejects_positions_that_are_not_on_a_screen() {
        for (x, y) in [(f64::NAN, 0.0), (0.0, f64::INFINITY), (1e9, 0.0), (0.0, -1e9)] {
            assert!(checked_position(x, y).is_err(), "({x}, {y})");
        }
    }

    #[test]
    fn sane_geometry_is_bounded_in_size_and_not_minimised() {
        assert!(is_sane(&g(10, 20, 900, 400)));
        assert!(!is_sane(&g(10, 20, MIN_WIDTH - 1, 400)));
        assert!(!is_sane(&g(10, 20, 900, MIN_HEIGHT - 1)));
        assert!(!is_sane(&g(10, 20, MAX_SIZE + 1, 400)));
        assert!(!is_sane(&g(-32000, -32000, 900, 400)));
        assert!(!is_sane(&g(200_000, 0, 900, 400)));
    }

    #[test]
    fn a_window_on_a_connected_monitor_is_worth_restoring() {
        let monitors = [g(0, 0, 1920, 1080), g(1920, 0, 2560, 1440)];
        assert!(is_visible(&g(100, 100, 900, 400), &monitors));
        assert!(is_visible(&g(2000, 50, 900, 400), &monitors));
    }

    #[test]
    fn a_window_that_straddles_two_monitors_is_visible() {
        assert!(is_visible(&g(1500, 100, 900, 400), &[g(0, 0, 1920, 1080), g(1920, 0, 2560, 1440)]));
    }

    #[test]
    fn a_window_left_on_a_monitor_that_is_gone_is_not_restored() {
        assert!(!is_visible(&g(2000, 50, 900, 400), &[g(0, 0, 1920, 1080)]));
        assert!(!is_visible(&g(-1800, 50, 900, 400), &[g(0, 0, 1920, 1080)]));
    }

    #[test]
    fn a_window_with_only_a_sliver_on_screen_cannot_be_grabbed() {
        assert!(!is_visible(&g(1900, 100, 900, 400), &[g(0, 0, 1920, 1080)]));
        assert!(!is_visible(&g(100, 1060, 900, 400), &[g(0, 0, 1920, 1080)]));
    }

    #[test]
    fn nothing_is_visible_when_the_monitors_cannot_be_listed() {
        assert!(!is_visible(&g(0, 0, 900, 400), &[]));
    }

    #[test]
    fn a_point_inside_the_window_is_over_it() {
        assert!(contains(&g(100, 50, 800, 600), 400.0, 300.0));
        assert!(contains(&g(100, 50, 800, 600), 100.0, 50.0));
    }

    #[test]
    fn the_far_edges_and_everything_beyond_are_outside() {
        let w = g(100, 50, 800, 600);
        assert!(!contains(&w, 900.0, 300.0));
        assert!(!contains(&w, 400.0, 650.0));
        assert!(!contains(&w, 99.0, 300.0));
        assert!(!contains(&w, 400.0, 49.0));
    }

    #[test]
    fn a_main_window_on_a_monitor_left_of_the_primary_still_works() {
        let w = g(-1920, 0, 1920, 1040);
        assert!(contains(&w, -500.0, 500.0));
        assert!(!contains(&w, 10.0, 500.0));
    }

    #[test]
    fn a_pointer_position_that_is_not_a_number_is_never_over_the_window() {
        let w = g(0, 0, 800, 600);
        assert!(!contains(&w, f64::NAN, 10.0));
        assert!(!contains(&w, 10.0, f64::NAN));
    }

    #[test]
    fn remembered_windows_round_trip() {
        let mut saved = BTreeMap::new();
        saved.insert("roll".to_string(), g(2000, 50, 1000, 460));
        saved.insert("lyrics".to_string(), g(-1900, 10, 560, 640));
        assert_eq!(parse_saved(PANELS, &serialize_saved(&saved)), saved);
    }

    #[test]
    fn a_damaged_file_never_stops_a_panel_opening() {
        for junk in ["", "not json", "[]", "null", "42", "{\"roll\": 3}"] {
            assert!(parse_saved(PANELS, junk).is_empty(), "{junk:?}");
        }
    }

    #[test]
    fn unknown_panels_and_implausible_geometry_are_dropped_but_the_rest_kept() {
        let json = r#"{
            "roll":     {"x": 10, "y": 20, "width": 1000, "height": 460},
            "waveform": {"x": 10, "y": 20, "width": 1000, "height": 460},
            "lyrics":   {"x": 10, "y": 20, "width": 5,    "height": 460},
            "takes":    {"x": -32000, "y": -32000, "width": 420, "height": 560},
            "other":    {"x": "left", "y": 0, "width": 520, "height": 520}
        }"#;
        let saved = parse_saved(PANELS, json);
        assert_eq!(saved.keys().collect::<Vec<_>>(), vec!["roll"]);
    }

    #[test]
    fn the_memory_is_read_from_and_written_to_the_apps_data_directory() {
        let dir = tempfile::tempdir().unwrap();
        assert!(WindowMemory::load(PANELS, dir.path()).get("roll").is_none(), "no file is an empty memory");

        let memory = WindowMemory::load(PANELS, dir.path());
        memory.set("roll", g(2000, 50, 1000, 460));
        memory.update("roll", |geometry| geometry.x = 2100);
        memory.update("unknown", |_| panic!("an unknown panel has nothing to update"));
        memory.persist();

        let reloaded = WindowMemory::load(PANELS, dir.path());
        assert_eq!(reloaded.get("roll"), Some(g(2100, 50, 1000, 460)));
        assert!(dir.path().join(MEMORY_FILE).exists());
    }

    #[test]
    fn an_unreadable_memory_file_is_an_empty_memory() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join(MEMORY_FILE)).unwrap();
        assert!(WindowMemory::load(PANELS, dir.path()).get("roll").is_none());
    }
}
