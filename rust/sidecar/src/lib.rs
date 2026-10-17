//! The Python sidecar: start it, send it JSON commands on stdin, read its
//! JSON-lines replies from stdout.
//!
//! This crate knows nothing about an app. The one thing that differs between
//! VPS and SPS is the name of the self-contained binary an installed app ships
//! (`vps-sidecar`, `song-practice-studio-sidecar`), passed in as a
//! [`SidecarConfig`]; where the app's data lives and which commands it sends are
//! the app's business.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

/// 90 s, not 30 s: torch, demucs and librosa are imported before "ready" is
/// sent, and a cold (uncached) first import can exceed 30 s alone. A timeout
/// here makes the first use of a session look broken until a second attempt
/// finds the OS file cache warm.
const READY_TIMEOUT: Duration = Duration::from_secs(90);

/// What an app tells this crate about its sidecar.
#[derive(Debug, Clone, Copy)]
pub struct SidecarConfig {
    /// File name of the PyInstaller binary, without extension or target triple.
    pub binary_name: &'static str,
}

/// Messages received from the Python sidecar (JSON lines on stdout).
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum SidecarMessage {
    #[serde(rename = "ready")]
    Ready {
        #[serde(default)]
        advisory: Option<String>,
    },
    #[serde(rename = "progress")]
    Progress {
        cmd: Option<String>,
        value: f32,
        stage: String,
    },
    #[serde(rename = "result")]
    Result {
        cmd: String,
        data: serde_json::Value,
    },
    #[serde(rename = "error")]
    Error {
        cmd: Option<String>,
        message: String,
        traceback: Option<String>,
    },
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "bye")]
    Bye,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Platform {
    Windows,
    MacOs,
    Linux,
}

impl Platform {
    fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Linux
        }
    }
}

/// Tauri strips the target-triple suffix when it bundles the binary, so the
/// installed name is just `name[.exe]`; the triple-suffixed names are a fallback.
fn binary_candidates(name: &str, platform: Platform) -> Vec<String> {
    match platform {
        Platform::Windows => vec![format!("{name}.exe"), format!("{name}-x86_64-pc-windows-msvc.exe")],
        Platform::MacOs => vec![
            name.to_string(),
            format!("{name}-aarch64-apple-darwin"),
            format!("{name}-x86_64-apple-darwin"),
        ],
        Platform::Linux => vec![name.to_string(), format!("{name}-x86_64-unknown-linux-gnu")],
    }
}

/// Look for the PyInstaller binary next to the running exe (installed-app path).
fn find_sidecar_binary(name: &str) -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    binary_candidates(name, Platform::current())
        .iter()
        .map(|n| exe_dir.join(n))
        .find(|p| p.exists())
}

/// The venv Python when present, otherwise the system `python`. Used only on the
/// dev / local-build path (when no PyInstaller binary is found).
fn find_python(sidecar_dir: &Path) -> PathBuf {
    let candidates = if cfg!(windows) {
        vec![sidecar_dir.join(".venv/Scripts/python.exe")]
    } else {
        vec![sidecar_dir.join(".venv/bin/python3"), sidecar_dir.join(".venv/bin/python")]
    };
    for p in candidates {
        if p.exists() {
            log::info!("Using venv Python: {}", p.display());
            return p;
        }
    }
    PathBuf::from("python")
}

/// The sidecar source directory containing `main.py`. Used only on the dev /
/// local-build path.
pub fn find_sidecar_dir() -> Result<PathBuf, String> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(target_dir) = exe.parent() {
            let candidates = [
                target_dir.join("../../../sidecar"), // from target/debug/
                target_dir.join("../../sidecar"),    // from target/
                target_dir.join("../sidecar"),       // from src-tauri/
                target_dir.join("sidecar"),          // next to exe
            ];
            for candidate in &candidates {
                let resolved = candidate.canonicalize().unwrap_or_else(|_| candidate.clone());
                if resolved.join("main.py").exists() {
                    return Ok(resolved);
                }
            }
        }
    }

    let cwd = std::env::current_dir().map_err(|e| format!("cwd: {e}"))?;
    for rel in ["sidecar", "../sidecar"] {
        let p = cwd.join(rel);
        if p.join("main.py").exists() {
            return p.canonicalize().map_err(|e| format!("canonicalize: {e}"));
        }
    }

    Err("Could not find sidecar directory".to_string())
}

/// The command that starts the sidecar: `python main.py` from the source tree
/// in a dev run, otherwise the PyInstaller binary of an installed app.
pub fn spawn_command(config: &SidecarConfig) -> Result<Command, String> {
    let mut cmd = if let Ok(sidecar_dir) = find_sidecar_dir() {
        let main_py = sidecar_dir.join("main.py");
        let python = find_python(&sidecar_dir);
        log::info!("Spawning sidecar: {} {}", python.display(), main_py.display());
        let mut c = Command::new(&python);
        c.arg(&main_py).current_dir(&sidecar_dir);
        c
    } else if let Some(binary) = find_sidecar_binary(config.binary_name) {
        log::info!("Spawning sidecar binary: {}", binary.display());
        let mut c = Command::new(&binary);
        if let Some(dir) = binary.parent() {
            c.current_dir(dir);
        }
        c
    } else {
        return Err(format!(
            "Sidecar not found: no main.py in source tree and no {} binary next to exe",
            config.binary_name
        ));
    };

    // Force UTF-8 on the sidecar's stdio. Rust writes the JSON-lines protocol
    // as UTF-8; without this Python decodes stdin using the Windows console
    // codepage (e.g. cp1252), which mangles any non-ASCII character in a file
    // path and makes ffprobe fail with a misleading "ffmpeg was not found".
    cmd.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8");

    // Suppress the console window that would otherwise flash on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    Ok(cmd)
}

fn read_messages(stdout: ChildStdout, tx: mpsc::Sender<SidecarMessage>) {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                log::error!("Sidecar stdout read error: {e}");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<SidecarMessage>(trimmed) {
            Ok(msg) => {
                if tx.send(msg).is_err() {
                    break;
                }
            }
            Err(e) => log::warn!("Sidecar sent unparseable JSON: {trimmed} ({e})"),
        }
    }
    log::info!("Sidecar reader thread exiting");
}

/// Manages the Python sidecar subprocess.
pub struct SidecarManager {
    child: Child,
    stdin: Mutex<ChildStdin>,
    rx: mpsc::Receiver<SidecarMessage>,
}

impl SidecarManager {
    /// Spawn the Python sidecar and wait for the "ready" message.
    pub fn spawn(config: &SidecarConfig) -> Result<Self, String> {
        Self::start(spawn_command(config)?)
    }

    /// Start `cmd` as a sidecar: pipe its stdio, read its replies on a thread
    /// and wait for "ready".
    pub fn start(mut cmd: Command) -> Result<Self, String> {
        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

        let stdout = child.stdout.take().ok_or("No stdout from sidecar")?;
        let child_stdin = child.stdin.take().ok_or("No stdin to sidecar")?;

        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || read_messages(stdout, tx));

        let manager = Self { child, stdin: Mutex::new(child_stdin), rx };
        match manager
            .recv_timeout(READY_TIMEOUT)
            .map_err(|e| format!("Sidecar did not send ready: {e}"))?
        {
            SidecarMessage::Ready { advisory } => {
                log::info!("Sidecar is ready");
                if let Some(advisory) = advisory {
                    log::warn!("{advisory}");
                }
                Ok(manager)
            }
            other => Err(format!("Expected ready, got: {other:?}")),
        }
    }

    /// Send a JSON command to the sidecar's stdin.
    pub fn send_command(&self, cmd: &serde_json::Value) -> Result<(), String> {
        let json = serde_json::to_string(cmd).map_err(|e| format!("JSON serialize: {e}"))?;
        self.send_line(&json)
    }

    /// Send one raw line to the sidecar's stdin, as it is.
    pub fn send_line(&self, line: &str) -> Result<(), String> {
        let mut stdin = self.stdin.lock().map_err(|e| format!("stdin lock: {e}"))?;
        writeln!(stdin, "{line}").map_err(|e| format!("stdin write: {e}"))?;
        stdin.flush().map_err(|e| format!("stdin flush: {e}"))?;
        Ok(())
    }

    /// Receive the next message from the sidecar (blocking with timeout).
    pub fn recv_timeout(&self, timeout: Duration) -> Result<SidecarMessage, String> {
        self.rx.recv_timeout(timeout).map_err(|e| format!("recv: {e}"))
    }

    /// Wait up to `slice` for the next message: `Ok(None)` when none arrived.
    pub fn recv_slice(&self, slice: Duration) -> Result<Option<SidecarMessage>, String> {
        match self.rx.recv_timeout(slice) {
            Ok(m) => Ok(Some(m)),
            Err(mpsc::RecvTimeoutError::Timeout) => Ok(None),
            Err(mpsc::RecvTimeoutError::Disconnected) => Err("recv: the sidecar closed unexpectedly".to_string()),
        }
    }

    /// Gracefully shut down the sidecar.
    pub fn shutdown(&mut self) {
        if let Err(e) = self.send_command(&serde_json::json!({"cmd": "quit"})) {
            log::warn!("Could not ask the sidecar to quit: {e}");
        }
        std::thread::sleep(Duration::from_millis(500));
        if let Err(e) = self.child.kill() {
            log::debug!("Sidecar already stopped: {e}");
        }
        if let Err(e) = self.child.wait() {
            log::warn!("Could not wait for the sidecar to exit: {e}");
        }
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(line: &str) -> Result<SidecarMessage, serde_json::Error> {
        serde_json::from_str(line)
    }

    #[test]
    fn parses_ready_with_and_without_an_advisory() {
        assert!(matches!(parse(r#"{"type":"ready"}"#).unwrap(), SidecarMessage::Ready { advisory: None }));
        assert!(matches!(parse(r#"{"type":"ready","advisory":null}"#).unwrap(), SidecarMessage::Ready { advisory: None }));
        match parse(r#"{"type":"ready","advisory":"yt-dlp is old"}"#).unwrap() {
            SidecarMessage::Ready { advisory } => assert_eq!(advisory.as_deref(), Some("yt-dlp is old")),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parses_progress() {
        match parse(r#"{"type":"progress","cmd":"process","stage":"separating","value":0.25}"#).unwrap() {
            SidecarMessage::Progress { cmd, value, stage } => {
                assert_eq!(cmd.as_deref(), Some("process"));
                assert_eq!(stage, "separating");
                assert!((value - 0.25).abs() < 1e-6);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parses_result_with_arbitrary_data() {
        match parse(r#"{"type":"result","cmd":"analyze","data":{"pitchData":{"f0":[1.0]},"n":3}}"#).unwrap() {
            SidecarMessage::Result { cmd, data } => {
                assert_eq!(cmd, "analyze");
                assert_eq!(data["n"], 3);
                assert_eq!(data["pitchData"]["f0"][0], 1.0);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parses_errors_with_optional_command_and_traceback() {
        match parse(r#"{"type":"error","message":"Invalid JSON: x"}"#).unwrap() {
            SidecarMessage::Error { cmd, message, traceback } => {
                assert!(cmd.is_none() && traceback.is_none());
                assert_eq!(message, "Invalid JSON: x");
            }
            other => panic!("{other:?}"),
        }
        match parse(r#"{"type":"error","cmd":"process","message":"boom","traceback":"Traceback..."}"#).unwrap() {
            SidecarMessage::Error { cmd, traceback, .. } => {
                assert_eq!(cmd.as_deref(), Some("process"));
                assert_eq!(traceback.as_deref(), Some("Traceback..."));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parses_pong_and_bye() {
        assert!(matches!(parse(r#"{"type":"pong"}"#).unwrap(), SidecarMessage::Pong));
        assert!(matches!(parse(r#"{"type":"bye"}"#).unwrap(), SidecarMessage::Bye));
    }

    #[test]
    fn rejects_unknown_types_and_malformed_lines() {
        assert!(parse(r#"{"type":"mystery"}"#).is_err());
        assert!(parse(r#"{"no_type":1}"#).is_err());
        assert!(parse("not json").is_err());
        assert!(parse(r#"{"type":"progress","stage":"x"}"#).is_err(), "value is required");
    }

    #[test]
    fn messages_survive_a_serde_round_trip() {
        let m = SidecarMessage::Progress { cmd: None, value: 0.5, stage: "x".into() };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains(r#""type":"progress""#));
        assert!(matches!(parse(&json).unwrap(), SidecarMessage::Progress { .. }));
    }

    #[test]
    fn an_installed_binary_is_found_by_its_plain_name_or_with_a_target_triple() {
        assert_eq!(
            binary_candidates("demo-sidecar", Platform::Windows),
            vec!["demo-sidecar.exe", "demo-sidecar-x86_64-pc-windows-msvc.exe"]
        );
        assert_eq!(
            binary_candidates("demo-sidecar", Platform::MacOs),
            vec!["demo-sidecar", "demo-sidecar-aarch64-apple-darwin", "demo-sidecar-x86_64-apple-darwin"]
        );
        assert_eq!(
            binary_candidates("demo-sidecar", Platform::Linux),
            vec!["demo-sidecar", "demo-sidecar-x86_64-unknown-linux-gnu"]
        );
    }

    #[test]
    fn find_python_prefers_the_venv_interpreter() {
        let home = tempfile::tempdir().unwrap();
        let bin = if cfg!(windows) { home.path().join(".venv/Scripts") } else { home.path().join(".venv/bin") };
        std::fs::create_dir_all(&bin).unwrap();
        let exe = bin.join(if cfg!(windows) { "python.exe" } else { "python3" });
        std::fs::write(&exe, b"").unwrap();
        assert_eq!(find_python(home.path()), exe);
    }

    #[test]
    fn find_python_falls_back_to_the_system_interpreter() {
        let home = tempfile::tempdir().unwrap();
        assert_eq!(find_python(home.path()), PathBuf::from("python"));
    }

    fn python_script(dir: &Path, body: &str) -> Option<Command> {
        let script = dir.join("fake_sidecar.py");
        std::fs::write(&script, body).unwrap();
        let mut cmd = Command::new("python");
        cmd.arg(&script).env("PYTHONUNBUFFERED", "1");
        match Command::new("python").arg("--version").output() {
            Ok(out) if out.status.success() => Some(cmd),
            _ => {
                eprintln!("python is not on PATH: skipping the live-process test");
                None
            }
        }
    }

    const FAKE: &str = r#"
import json, sys
print(json.dumps({"type": "ready", "advisory": "be careful"}), flush=True)
for line in sys.stdin:
    try:
        msg = json.loads(line)
    except ValueError:
        print(json.dumps({"type": "error", "message": "Invalid JSON"}), flush=True)
        continue
    if msg.get("cmd") == "ping":
        print(json.dumps({"type": "pong"}), flush=True)
    elif msg.get("cmd") == "quit":
        print(json.dumps({"type": "bye"}), flush=True)
        break
"#;

    #[test]
    fn a_started_sidecar_speaks_the_protocol_and_survives_bad_input() {
        let dir = tempfile::tempdir().unwrap();
        let Some(cmd) = python_script(dir.path(), FAKE) else { return };
        let m = SidecarManager::start(cmd).expect("the fake sidecar sends ready");

        m.send_command(&serde_json::json!({"cmd": "ping"})).unwrap();
        assert!(matches!(m.recv_timeout(Duration::from_secs(10)).unwrap(), SidecarMessage::Pong));

        m.send_line("this is not json").unwrap();
        match m.recv_timeout(Duration::from_secs(10)).unwrap() {
            SidecarMessage::Error { message, .. } => assert!(message.contains("Invalid JSON")),
            other => panic!("expected an error, got {other:?}"),
        }

        m.send_command(&serde_json::json!({"cmd": "ping"})).unwrap();
        assert!(matches!(m.recv_timeout(Duration::from_secs(10)).unwrap(), SidecarMessage::Pong), "still alive");

        assert!(m.recv_slice(Duration::from_millis(50)).unwrap().is_none(), "nothing pending is not an error");
    }

    #[test]
    fn a_sidecar_that_does_not_say_ready_first_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let Some(cmd) = python_script(dir.path(), "import json\nprint(json.dumps({'type': 'pong'}), flush=True)\n") else {
            return;
        };
        let Err(err) = SidecarManager::start(cmd) else { panic!("pong is not ready") };
        assert!(err.contains("Expected ready"), "{err}");
    }

    #[test]
    fn a_sidecar_that_exits_before_ready_is_an_error_not_a_hang() {
        let dir = tempfile::tempdir().unwrap();
        let Some(cmd) = python_script(dir.path(), "import sys\nsys.exit(3)\n") else { return };
        let Err(err) = SidecarManager::start(cmd) else { panic!("no ready was sent") };
        assert!(err.contains("did not send ready"), "{err}");
    }

    #[test]
    fn a_missing_interpreter_is_reported_as_a_spawn_failure() {
        let Err(err) = SidecarManager::start(Command::new("definitely-not-a-real-program-mps")) else {
            panic!("cannot spawn")
        };
        assert!(err.contains("Failed to spawn sidecar"), "{err}");
    }

    #[test]
    fn the_error_for_a_missing_sidecar_names_the_binary() {
        if find_sidecar_dir().is_ok() {
            return;
        }
        let err = spawn_command(&SidecarConfig { binary_name: "demo-sidecar" }).expect_err("nothing to run");
        assert!(err.contains("demo-sidecar"), "{err}");
    }
}
