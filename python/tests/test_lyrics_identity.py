"""What the app identity changes in the lyrics engine: who it says it is on the
network, where it keeps the model, and which variable switches the test engine."""

import io
import sys
import types

import numpy as np
import pytest

from mps_core import lyrics
from mps_core.app import AppIdentity


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes):
        super().__init__(body)
        self.headers = {"Content-Length": str(len(body))}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class TestUserAgent:
    def test_model_download_identifies_the_calling_app(self, tmp_path, app):
        seen = {}

        def opener(request, timeout=None):
            seen["ua"] = request.get_header("User-agent")
            return FakeResponse(b"weights")

        lyrics.download_file("http://x/m.pth", str(tmp_path / "m.pth"), None, opener, user_agent=app.user_agent)
        assert seen["ua"] == "TestApp (https://example.invalid/test-app)"

    def test_without_an_app_the_library_still_identifies_itself(self, tmp_path):
        seen = {}

        def opener(request, timeout=None):
            seen["ua"] = request.get_header("User-agent")
            return FakeResponse(b"weights")

        lyrics.download_file("http://x/m.pth", str(tmp_path / "m.pth"), None, opener)
        assert seen["ua"] == lyrics.DEFAULT_USER_AGENT
        assert "mps-core" in seen["ua"]

    def test_lyrics_lookup_identifies_the_calling_app(self, monkeypatch, app):
        seen = {}

        def urlopen(request, timeout=None):
            seen["ua"] = request.get_header("User-agent")
            return FakeResponse(b'[{"trackName": "Song", "duration": 200, "syncedLyrics": "[00:01.00] la"}]')

        monkeypatch.setattr(lyrics.urllib.request, "urlopen", urlopen)
        result = lyrics.find_lyrics("Song", duration=200, app=app)
        assert seen["ua"] == app.user_agent
        assert result["text"] == "la"

    def test_the_model_download_the_aligner_makes_carries_the_apps_user_agent(self, tmp_path, monkeypatch, app):
        seen = {}

        def fake_download(url, dest, on_progress=None, opener=None, user_agent=lyrics.DEFAULT_USER_AGENT):
            seen["ua"] = user_agent
            raise lyrics.LyricsError("stop before inference")

        class Bundle:
            get_labels = staticmethod(lambda: lyrics._W2V2_LABELS)

        fake_torchaudio = types.ModuleType("torchaudio")
        fake_torchaudio.pipelines = types.SimpleNamespace(**{lyrics._W2V2_BUNDLE: Bundle})
        monkeypatch.setitem(sys.modules, "torch", types.ModuleType("torch"))
        monkeypatch.setitem(sys.modules, "torchaudio", fake_torchaudio)
        monkeypatch.setattr(lyrics, "download_file", fake_download)

        aligner = lyrics.default_aligner(str(tmp_path), app=app)
        with pytest.raises(lyrics.LyricsError, match="stop before inference"):
            aligner.emissions(np.zeros(16000, dtype=np.float32), [1])
        assert seen["ua"] == app.user_agent


class TestModelsDirectory:
    def test_the_app_supplies_the_default_location(self, app):
        assert lyrics.default_aligner(None, app=app).models_dir == app.models_dir

    def test_an_explicit_directory_wins(self, app, tmp_path):
        assert lyrics.default_aligner(str(tmp_path), app=app).models_dir == str(tmp_path)

    def test_there_is_no_silent_fallback_that_could_strand_a_360mb_download(self):
        with pytest.raises(ValueError, match="models_dir"):
            lyrics.default_aligner(None)

    def test_the_aligner_itself_needs_a_directory(self):
        with pytest.raises(TypeError):
            lyrics.Wav2Vec2Aligner()


class TestEngineSwitch:
    def test_only_the_calling_apps_variable_switches_the_test_engine(self, monkeypatch):
        vps = AppIdentity(name="V", url="u", data_dir="~/.v", env_prefix="VPS")
        monkeypatch.setenv("SPS_LYRICS_ENGINE", "uniform")
        monkeypatch.delenv("VPS_LYRICS_ENGINE", raising=False)
        assert isinstance(lyrics.default_aligner("m", app=vps), lyrics.Wav2Vec2Aligner)
        monkeypatch.setenv("VPS_LYRICS_ENGINE", "uniform")
        assert isinstance(lyrics.default_aligner("m", app=vps), lyrics.UniformAligner)

    def test_the_test_engine_only_accepts_the_documented_value(self, monkeypatch, app):
        monkeypatch.setenv("TEST_LYRICS_ENGINE", "1")
        assert isinstance(lyrics.default_aligner("m", app=app), lyrics.Wav2Vec2Aligner)
