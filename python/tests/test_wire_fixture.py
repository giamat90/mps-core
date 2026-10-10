"""The sidecar's reply shapes, pinned as JSON files that the TypeScript tests
also read (tests/wire.test.ts). If the engine changes what it returns, this test
fails first; regenerate with UPDATE_FIXTURES=1 and the TypeScript side then
shows whether the types and timing code still agree.
"""

import json
import os
from pathlib import Path

import numpy as np
import pytest

from helpers import sine, write_wav
from mps_core import lyrics

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
TEXT = "hello world\nsecond line here\n\n[Chorus]\nla la la"


def check(name: str, actual: dict):
    path = FIXTURES / name
    if os.environ.get("UPDATE_FIXTURES") == "1":
        path.write_text(json.dumps(actual, indent=2) + "\n", encoding="utf8")
    expected = json.loads(path.read_text(encoding="utf8"))
    assert actual == expected, f"{name} is out of date; run with UPDATE_FIXTURES=1 and review the diff"


@pytest.fixture
def vocals(tmp_path):
    audio = np.concatenate([np.zeros(8000, dtype=np.float32), sine(220, 16000, 6.0)])
    return write_wav(tmp_path / "vocals.wav", audio, 16000)


def test_align_result_matches_the_pinned_wire_format(vocals):
    result = lyrics.align_lyrics(vocals, TEXT, aligner=lyrics.UniformAligner())
    check("align_result.json", result)


def test_find_result_matches_the_pinned_wire_format():
    candidates = [
        {
            "trackName": "Practice Song",
            "artistName": "The Fixtures",
            "duration": 201.0,
            "instrumental": False,
            "syncedLyrics": "[00:01.00] hello world\n[00:03.50] second line here",
            "plainLyrics": "hello world\nsecond line here",
        }
    ]
    result = lyrics.find_lyrics("Practice Song (Official Video)", duration=200.0, fetch=lambda url: candidates)
    check("find_result.json", result)
