"""The practice pack writer. The manifest it produces is pinned as
fixtures/pack_manifest.json, which tests/pack.test.ts reads with the TypeScript
reader; regenerate with UPDATE_FIXTURES=1."""

import json
import os
import zipfile
from pathlib import Path

import pytest

from mps_core import pack

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def sample_manifest(**over):
    args = dict(
        app="vps",
        song_id="11111111-2222-3333-4444-555555555555",
        title="Practice Song",
        artist="The Fixtures",
        duration_s=201.5,
        created_at="2026-10-15T12:00:00Z",
        bpm=96.0,
        key="A minor",
        metronome_offset_s=0.42,
        tracks={"vocals": "vocals.m4a", "instrumental": "instrumental.m4a"},
        reference_file="reference_pitch.json",
        lyrics_file="lyrics.json",
        loops=[{"name": "Chorus", "start": 62.0, "end": 94.5}],
        variants=[
            {"semitones": -2, "tracks": {"vocals": "pitched/-2/vocals.m4a", "instrumental": "pitched/-2/instrumental.m4a"}},
        ],
        encoder_delay_s=0.0,
    )
    args.update(over)
    return pack.build_manifest(**args)


def check(name: str, actual: dict):
    path = FIXTURES / name
    if os.environ.get("UPDATE_FIXTURES") == "1":
        path.write_text(json.dumps(actual, indent=2) + "\n", encoding="utf8")
    expected = json.loads(path.read_text(encoding="utf8"))
    assert actual == expected, f"{name} is out of date; run with UPDATE_FIXTURES=1 and review the diff"


def test_manifest_matches_the_pinned_wire_format():
    check("pack_manifest.json", sample_manifest())


def test_reference_matches_the_pinned_wire_format():
    times = [i * 0.0116 for i in range(200)]
    f0 = [220.0 if i % 50 < 40 else 0.0 for i in range(200)]
    ref = pack.decimate_reference(times, f0, [v > 0 for v in f0])
    check("pack_reference.json", ref)


def test_decimation_grid_and_unvoiced():
    times = [0.0, 0.01, 0.02, 0.03, 0.04, 0.05]
    f0 = [100.04, 100.0, 0.0, 200.0, 200.0, 200.0]
    voiced = [True, True, False, True, True, True]
    ref = pack.decimate_reference(times, f0, voiced, hop_s=0.02)
    assert ref["hopS"] == 0.02
    assert len(ref["f0"]) == 3
    assert ref["f0"][0] == 100.0
    assert ref["f0"][1] in (0.0, 200.0)
    assert ref["f0"][2] == 200.0


def test_decimation_leaves_gaps_unvoiced_and_rejects_bad_input():
    ref = pack.decimate_reference([0.0, 5.0], [100.0, 100.0], hop_s=0.02, duration_s=5.0)
    assert ref["f0"][0] == 100.0
    assert ref["f0"][100] == 0.0
    assert ref["f0"][-1] == 100.0
    with pytest.raises(pack.PackError):
        pack.decimate_reference([0.0], [1.0, 2.0])
    with pytest.raises(pack.PackError):
        pack.decimate_reference([0.0], [1.0], hop_s=0)


@pytest.mark.parametrize(
    "mutate,match",
    [
        (lambda m: m.update(schema=2), "schema"),
        (lambda m: m.update(durationS=0), "durationS"),
        (lambda m: m.update(rev=0), "rev"),
        (lambda m: m["tracks"][0].update(file="../x.m4a"), "inside the pack"),
        (lambda m: m["tracks"][0].update(file="/abs.m4a"), "relative"),
        (lambda m: m["tracks"][0].update(file="c:/x.m4a"), "relative"),
        (lambda m: m["tracks"][1].update(name="vocals"), "unique"),
        (lambda m: m.update(tracks=[m["tracks"][0]]), "instrumental"),
        (lambda m: m["variants"][0].update(semitones=0), "semitones"),
        (lambda m: m["variants"].append(dict(m["variants"][0])), "semitones"),
        (lambda m: m["variants"][0]["tracks"].pop(), "same tracks"),
        (lambda m: m["loops"][0].update(end=999.0), "inside the song"),
        (lambda m: m["loops"][0].update(name=" "), "name"),
        (lambda m: m["reference"].update(hopS=0), "hopS"),
        (lambda m: m.update(encoderDelayS=2), "encoderDelayS"),
    ],
)
def test_validation_rejects_each_broken_rule(mutate, match):
    m = sample_manifest()
    mutate(m)
    with pytest.raises(pack.PackError, match=match):
        pack.validate_manifest(m)


def test_a_pack_without_reference_lyrics_loops_or_variants_is_valid():
    m = sample_manifest(reference_file=None, lyrics_file=None, loops=[], variants=[])
    assert m["reference"] is None and m["lyrics"] is None
    assert pack.manifest_files(m) == ["vocals.m4a", "instrumental.m4a"]


def test_write_and_read_round_trip(tmp_path):
    files = {
        "vocals.m4a": b"v" * 10,
        "instrumental.m4a": b"i" * 10,
        "pitched/-2/vocals.m4a": b"pv",
        "pitched/-2/instrumental.m4a": b"pi",
        "reference_pitch.json": json.dumps({"hopS": 0.02, "durationS": 1.0, "f0": [0.0] * 50}).encode(),
        "lyrics.json": b"{}",
    }
    m = sample_manifest()
    out = pack.write_pack(tmp_path / "song.vppack", m, files)
    assert out.exists()
    assert not (tmp_path / "song.vppack.part").exists()
    again = pack.read_manifest(out)
    assert again == m
    with zipfile.ZipFile(out) as z:
        assert z.getinfo("vocals.m4a").compress_type == zipfile.ZIP_STORED
        assert z.getinfo("lyrics.json").compress_type == zipfile.ZIP_DEFLATED


def test_write_refuses_missing_and_unnamed_files_and_leaves_nothing_behind(tmp_path):
    m = sample_manifest(variants=[], lyrics_file=None, reference_file=None)
    out = tmp_path / "out"
    with pytest.raises(pack.PackError, match="missing"):
        pack.write_pack(out / "a.vppack", m, {"vocals.m4a": b"x"})
    with pytest.raises(pack.PackError, match="not named"):
        pack.write_pack(out / "b.vppack", m, {"vocals.m4a": b"x", "instrumental.m4a": b"y", "other.bin": b"z"})
    assert not out.exists() or list(out.iterdir()) == []


def test_read_rejects_non_packs_and_incomplete_packs(tmp_path):
    bad = tmp_path / "bad.vppack"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("hello.txt", "hi")
    with pytest.raises(pack.PackError, match="manifest"):
        pack.read_manifest(bad)
    short = tmp_path / "short.vppack"
    m = sample_manifest(variants=[], lyrics_file=None, reference_file=None)
    with zipfile.ZipFile(short, "w") as z:
        z.writestr("manifest.json", json.dumps(m))
        z.writestr("vocals.m4a", b"x")
    with pytest.raises(pack.PackError, match="missing"):
        pack.read_manifest(short)


def test_encode_aac_builds_the_ffmpeg_command_and_reports_failure(tmp_path):
    calls = []

    class Done:
        def __init__(self, code, err=""):
            self.returncode, self.stderr = code, err

    def ok(cmd, **kw):
        calls.append(cmd)
        return Done(0)

    out = pack.encode_aac("in.wav", tmp_path / "x" / "out.m4a", bitrate_kbps=64, mono=True, ffmpeg="ffmpeg", runner=ok)
    cmd = calls[0]
    assert cmd[0] == "ffmpeg" and "-ac" in cmd and "64k" in cmd and cmd[-1] == str(out)
    with pytest.raises(pack.PackError, match="boom"):
        pack.encode_aac("in.wav", tmp_path / "o.m4a", ffmpeg="ffmpeg", runner=lambda c, **k: Done(1, "boom"))


def test_encode_aac_without_ffmpeg_says_so(tmp_path, monkeypatch):
    monkeypatch.setattr(pack, "find_ffmpeg", lambda: None)
    with pytest.raises(pack.PackError, match="not found"):
        pack.encode_aac("in.wav", tmp_path / "o.m4a")


@pytest.mark.skipif(pack.find_ffmpeg() is None, reason="ffmpeg is not installed")
def test_encode_aac_with_real_ffmpeg(tmp_path):
    import numpy as np
    import soundfile as sf

    sr = 44100
    t = np.arange(sr * 2) / sr
    sf.write(tmp_path / "a.wav", (0.3 * np.sin(2 * np.pi * 440 * t)).astype("float32"), sr)
    out = pack.encode_aac(tmp_path / "a.wav", tmp_path / "a.m4a", bitrate_kbps=64, mono=True)
    assert out.exists() and 2000 < out.stat().st_size < 60000
