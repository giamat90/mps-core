import json
import time
from pathlib import Path

import pytest

from mps_core import version_check
from mps_core.app import AppIdentity


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def cache(app):
    path = Path(app.yt_dlp_check_path)
    path.parent.mkdir(parents=True)
    return path


def pypi(monkeypatch, latest, calls=None):
    def fake(url, timeout=None):
        if calls is not None:
            calls.append(url)
        return FakeResponse({"info": {"version": latest}})

    monkeypatch.setattr(version_check.urllib.request, "urlopen", fake)


def offline(monkeypatch, calls=None):
    def fake(url, timeout=None):
        if calls is not None:
            calls.append(url)
        raise OSError("network is unreachable")

    monkeypatch.setattr(version_check.urllib.request, "urlopen", fake)


class TestCalendarDate:
    def test_parses_yt_dlp_calendar_versions(self):
        assert version_check._calendar_date("2026.8.19").isoformat() == "2026-08-19T00:00:00"
        assert version_check._calendar_date("2026.08.19.post1").day == 19

    @pytest.mark.parametrize("bad", ["", "1.2", "not.a.version", "2026.13.40", "2026.8.x"])
    def test_rejects_anything_else(self, bad):
        assert version_check._calendar_date(bad) is None


class TestFreshnessCheck:
    def test_flags_a_floor_three_weeks_or_more_behind(self, app, cache, monkeypatch):
        pypi(monkeypatch, "2026.9.30")
        advisory = version_check.check_yt_dlp_freshness(app)
        assert advisory is not None
        assert version_check.MIN_YT_DLP_VERSION in advisory and "2026.9.30" in advisory and "42d" in advisory

    def test_silent_when_the_floor_is_the_latest(self, app, cache, monkeypatch):
        pypi(monkeypatch, version_check.MIN_YT_DLP_VERSION)
        assert version_check.check_yt_dlp_freshness(app) is None

    def test_silent_when_only_slightly_behind(self, app, cache, monkeypatch):
        pypi(monkeypatch, "2026.9.1")
        assert version_check.check_yt_dlp_freshness(app) is None

    def test_the_threshold_is_21_days(self, app, cache, monkeypatch):
        floor = version_check._calendar_date(version_check.MIN_YT_DLP_VERSION)
        from datetime import timedelta

        for days, expect_advisory in ((20, False), (21, True)):
            cache.unlink(missing_ok=True)
            latest = floor + timedelta(days=days)
            pypi(monkeypatch, f"{latest.year}.{latest.month}.{latest.day}")
            assert (version_check.check_yt_dlp_freshness(app) is not None) is expect_advisory

    def test_the_result_is_cached_for_a_day_without_touching_the_network(self, app, cache, monkeypatch):
        calls = []
        pypi(monkeypatch, "2026.12.1", calls)
        first = version_check.check_yt_dlp_freshness(app)
        second = version_check.check_yt_dlp_freshness(app)
        assert first == second and first is not None
        assert len(calls) == 1
        saved = json.loads(cache.read_text())
        assert saved["advisory"] == first and abs(saved["checked_at"] - time.time()) < 60

    def test_an_expired_cache_is_refreshed(self, app, cache, monkeypatch):
        cache.write_text(json.dumps({"checked_at": time.time() - 3 * 24 * 3600, "advisory": "old advisory"}))
        calls = []
        pypi(monkeypatch, version_check.MIN_YT_DLP_VERSION, calls)
        assert version_check.check_yt_dlp_freshness(app) is None
        assert len(calls) == 1
        assert json.loads(cache.read_text())["advisory"] is None

    def test_offline_falls_back_to_the_last_known_advisory(self, app, cache, monkeypatch):
        cache.write_text(json.dumps({"checked_at": 0, "advisory": "stale but useful"}))
        offline(monkeypatch)
        assert version_check.check_yt_dlp_freshness(app) == "stale but useful"

    def test_offline_with_no_cache_is_none_and_does_not_raise(self, app, cache, monkeypatch):
        offline(monkeypatch)
        assert version_check.check_yt_dlp_freshness(app) is None
        assert not cache.exists(), "a failed check must not be cached as 'all clear'"

    def test_an_unexpected_response_shape_is_treated_like_offline(self, app, cache, monkeypatch):
        monkeypatch.setattr(version_check.urllib.request, "urlopen", lambda *a, **k: FakeResponse({"oops": 1}))
        assert version_check.check_yt_dlp_freshness(app) is None

    def test_an_unparsable_latest_version_gives_no_advisory(self, app, cache, monkeypatch):
        pypi(monkeypatch, "banana")
        assert version_check.check_yt_dlp_freshness(app) is None

    def test_a_corrupt_cache_file_is_ignored(self, app, cache, monkeypatch):
        cache.write_text("{not json")
        pypi(monkeypatch, "2026.12.1")
        assert version_check.check_yt_dlp_freshness(app) is not None

    def test_an_unwritable_cache_location_does_not_break_the_check(self, tmp_path, monkeypatch):
        blocker = tmp_path / "file"
        blocker.write_text("x")
        blocked = AppIdentity(name="T", url="u", data_dir=str(blocker / "sub"), env_prefix="T")
        pypi(monkeypatch, "2026.12.1")
        assert version_check.check_yt_dlp_freshness(blocked) is not None

    def test_uses_a_short_timeout_so_startup_is_never_held_up(self, app, cache, monkeypatch):
        seen = {}

        def fake(url, timeout=None):
            seen["timeout"] = timeout
            return FakeResponse({"info": {"version": version_check.MIN_YT_DLP_VERSION}})

        monkeypatch.setattr(version_check.urllib.request, "urlopen", fake)
        version_check.check_yt_dlp_freshness(app)
        assert seen["timeout"] <= 5
