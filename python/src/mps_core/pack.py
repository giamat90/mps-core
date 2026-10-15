"""The practice pack: one file per song that carries what a phone needs to
practise it (AAC tracks, the reference melody, lyrics, loops) and nothing it
would have to compute. The laptop writes it with this module; the phone reads
it with `@giamat90/mps-core/pack`. tests/test_pack.py pins the manifest as
fixtures/pack_manifest.json, which tests/pack.test.ts also reads.

A pack is a zip (`.vppack`). `manifest.json` names every other file, relative
to the zip root, with forward slashes.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

PACK_SCHEMA = 1
MANIFEST_NAME = "manifest.json"
REFERENCE_HOP_S = 0.02
MAX_LOOPS = 100


class PackError(ValueError):
    """The manifest or its files break a rule of the format."""


def _safe_path(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value:
        raise PackError(f"{what} must be a non-empty path")
    if value.startswith("/") or "\\" in value or ":" in value:
        raise PackError(f"{what} must be a relative path with forward slashes: {value!r}")
    if any(part in ("", ".", "..") for part in value.split("/")):
        raise PackError(f"{what} must stay inside the pack: {value!r}")
    return value


def decimate_reference(times: Sequence[float], f0: Sequence[float], voiced: Sequence[bool] | None = None, *, hop_s: float = REFERENCE_HOP_S, duration_s: float | None = None) -> dict:
    """The analysis pitch line on a fixed grid: `hop_s` apart, 0 where unvoiced.

    Each grid point takes the nearest analysis frame within one hop; points with
    no voiced frame near them are 0. Values are rounded to 0.1 Hz.
    """
    if hop_s <= 0:
        raise PackError("hop must be positive")
    n = len(times)
    if len(f0) != n or (voiced is not None and len(voiced) != n):
        raise PackError("times, f0 and voiced must be the same length")
    end = duration_s if duration_s is not None else (times[-1] if n else 0.0)
    count = int(math.ceil(end / hop_s)) if end > 0 else 0
    out = [0.0] * count
    j = 0
    for k in range(count):
        t = k * hop_s
        while j + 1 < n and abs(times[j + 1] - t) <= abs(times[j] - t):
            j += 1
        if n and abs(times[j] - t) <= hop_s:
            ok = f0[j] > 0 and (voiced is None or bool(voiced[j]))
            out[k] = round(float(f0[j]), 1) if ok else 0.0
    return {"hopS": hop_s, "durationS": round(end, 3), "f0": out}


def build_manifest(
    *,
    app: str,
    song_id: str,
    title: str,
    duration_s: float,
    tracks: Mapping[str, str],
    created_at: str,
    artist: str | None = None,
    bpm: float | None = None,
    key: str | None = None,
    metronome_offset_s: float | None = None,
    reference_file: str | None = None,
    reference_hop_s: float = REFERENCE_HOP_S,
    lyrics_file: str | None = None,
    loops: Iterable[Mapping[str, Any]] = (),
    variants: Iterable[Mapping[str, Any]] = (),
    rev: int = 1,
    encoder_delay_s: float = 0.0,
) -> dict:
    """Assemble a manifest and validate it. `tracks` maps a track name to its file."""
    manifest: dict[str, Any] = {
        "schema": PACK_SCHEMA,
        "app": app,
        "songId": song_id,
        "rev": rev,
        "createdAt": created_at,
        "title": title,
        "artist": artist,
        "durationS": round(float(duration_s), 3),
        "bpm": bpm,
        "key": key,
        "metronomeOffsetS": metronome_offset_s,
        "encoderDelayS": encoder_delay_s,
        "tracks": [{"name": name, "file": file} for name, file in tracks.items()],
        "variants": [
            {"semitones": int(v["semitones"]), "tracks": [{"name": n, "file": f} for n, f in v["tracks"].items()]}
            for v in variants
        ],
        "reference": {"file": reference_file, "hopS": reference_hop_s} if reference_file else None,
        "lyrics": {"file": lyrics_file} if lyrics_file else None,
        "loops": [{"name": str(l["name"]), "start": float(l["start"]), "end": float(l["end"])} for l in loops],
    }
    validate_manifest(manifest)
    return manifest


def validate_manifest(manifest: Mapping[str, Any]) -> None:
    """Raise PackError for the first rule the manifest breaks."""
    if manifest.get("schema") != PACK_SCHEMA:
        raise PackError(f"unsupported schema {manifest.get('schema')!r}, this module writes {PACK_SCHEMA}")
    for field in ("app", "songId", "title", "createdAt"):
        if not isinstance(manifest.get(field), str) or not manifest[field]:
            raise PackError(f"{field} must be a non-empty string")
    rev = manifest.get("rev")
    if not isinstance(rev, int) or isinstance(rev, bool) or rev < 1:
        raise PackError("rev must be a whole number from 1")
    duration = manifest.get("durationS")
    if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not math.isfinite(duration) or duration <= 0:
        raise PackError("durationS must be a positive number")
    delay = manifest.get("encoderDelayS", 0)
    if not isinstance(delay, (int, float)) or isinstance(delay, bool) or not math.isfinite(delay) or delay < 0 or delay > 1:
        raise PackError("encoderDelayS must be between 0 and 1 second")

    tracks = manifest.get("tracks")
    if not isinstance(tracks, list) or not tracks:
        raise PackError("tracks must list at least one track")
    seen: set[str] = set()
    for t in tracks:
        name = t.get("name") if isinstance(t, dict) else None
        if not isinstance(name, str) or not name or name in seen:
            raise PackError("track names must be unique, non-empty strings")
        seen.add(name)
        _safe_path(t.get("file"), f"track {name} file")
    if "vocals" not in seen or "instrumental" not in seen:
        if manifest["app"] == "vps":
            raise PackError("a VPS pack needs a vocals and an instrumental track")

    semis: set[int] = set()
    for v in manifest.get("variants") or []:
        s = v.get("semitones") if isinstance(v, dict) else None
        if not isinstance(s, int) or isinstance(s, bool) or s == 0 or s in semis or abs(s) > 12:
            raise PackError("variant semitones must be unique whole numbers in -12..12 except 0")
        semis.add(s)
        names = set()
        for t in v.get("tracks") or []:
            _safe_path(t.get("file"), f"variant {s} track file")
            names.add(t.get("name"))
        if names != seen:
            raise PackError(f"variant {s} must carry the same tracks as the pack")

    ref = manifest.get("reference")
    if ref is not None:
        _safe_path(ref.get("file"), "reference file")
        hop = ref.get("hopS")
        if not isinstance(hop, (int, float)) or isinstance(hop, bool) or not hop > 0:
            raise PackError("reference hopS must be positive")
    lyr = manifest.get("lyrics")
    if lyr is not None:
        _safe_path(lyr.get("file"), "lyrics file")

    loops = manifest.get("loops") or []
    if len(loops) > MAX_LOOPS:
        raise PackError(f"at most {MAX_LOOPS} loops")
    for l in loops:
        start, end = l.get("start"), l.get("end")
        if not isinstance(l.get("name"), str) or not l["name"].strip():
            raise PackError("a loop needs a name")
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (start, end)):
            raise PackError("loop times must be numbers")
        if not (0 <= start < end <= duration + 0.5):
            raise PackError(f"loop {l['name']!r} must lie inside the song")


def manifest_files(manifest: Mapping[str, Any]) -> list[str]:
    """Every path the manifest refers to, in a stable order, without duplicates."""
    paths: list[str] = [t["file"] for t in manifest["tracks"]]
    for v in manifest.get("variants") or []:
        paths.extend(t["file"] for t in v["tracks"])
    if manifest.get("reference"):
        paths.append(manifest["reference"]["file"])
    if manifest.get("lyrics"):
        paths.append(manifest["lyrics"]["file"])
    return list(dict.fromkeys(paths))


def write_pack(out_path: str | os.PathLike, manifest: Mapping[str, Any], files: Mapping[str, str | os.PathLike | bytes]) -> Path:
    """Write the pack atomically. `files` maps every path in the manifest to its
    source on disk, or to its bytes (the reference line, for example)."""
    validate_manifest(manifest)
    missing = [p for p in manifest_files(manifest) if p not in files]
    if missing:
        raise PackError(f"files missing for: {', '.join(missing)}")
    extra = [p for p in files if p not in set(manifest_files(manifest)) and p != MANIFEST_NAME]
    if extra:
        raise PackError(f"files not named by the manifest: {', '.join(extra)}")

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".part")
    try:
        with zipfile.ZipFile(tmp, "w") as z:
            z.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", compress_type=zipfile.ZIP_DEFLATED)
            for arc, src in files.items():
                already_compressed = arc.endswith((".m4a", ".mp3", ".ogg"))
                kind = zipfile.ZIP_STORED if already_compressed else zipfile.ZIP_DEFLATED
                if isinstance(src, (bytes, bytearray)):
                    z.writestr(arc, bytes(src), compress_type=kind)
                else:
                    z.write(src, arc, compress_type=kind)
        os.replace(tmp, out)
    finally:
        if tmp.exists():
            tmp.unlink()
    return out


def read_manifest(pack_path: str | os.PathLike) -> dict:
    """Read and validate the manifest of a pack, and check that its files are there."""
    with zipfile.ZipFile(pack_path) as z:
        names = set(z.namelist())
        if MANIFEST_NAME not in names:
            raise PackError("not a practice pack: no manifest.json")
        manifest = json.loads(z.read(MANIFEST_NAME).decode("utf-8"))
    validate_manifest(manifest)
    missing = [p for p in manifest_files(manifest) if p not in names]
    if missing:
        raise PackError(f"pack is missing: {', '.join(missing)}")
    return manifest


def find_ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def encode_aac(src: str | os.PathLike, dst: str | os.PathLike, *, bitrate_kbps: int = 96, mono: bool = False, ffmpeg: str | None = None, runner=subprocess.run) -> Path:
    """Encode an audio file to AAC in an m4a container with ffmpeg."""
    exe = ffmpeg or find_ffmpeg()
    if not exe:
        raise PackError("ffmpeg was not found")
    out = Path(dst)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [exe, "-y", "-v", "error", "-i", str(src), "-vn"]
    if mono:
        cmd += ["-ac", "1"]
    cmd += ["-c:a", "aac", "-b:a", f"{int(bitrate_kbps)}k", "-movflags", "+faststart", str(out)]
    done = runner(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        raise PackError(f"ffmpeg failed: {(done.stderr or '').strip()[:300]}")
    return out
