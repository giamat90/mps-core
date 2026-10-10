import dataclasses
import os

import pytest

from mps_core.app import AppIdentity


def make(**over):
    base = dict(name="Song-Practice", url="https://example.invalid/sps", data_dir="~/.sps-test", env_prefix="SPS")
    base.update(over)
    return AppIdentity(**base)


class TestIdentity:
    def test_user_agent_names_the_app_and_where_to_reach_its_author(self):
        assert make().user_agent == "Song-Practice (https://example.invalid/sps)"

    def test_models_live_under_the_apps_data_directory(self, isolated_home):
        assert make().models_dir == os.path.join(str(isolated_home), ".sps-test", "models")

    def test_the_yt_dlp_check_cache_lives_under_the_data_directory(self, isolated_home):
        assert make().yt_dlp_check_path == os.path.join(str(isolated_home), ".sps-test", "yt_dlp_check.json")

    def test_environment_variables_carry_the_apps_prefix(self):
        assert make().env("LYRICS_ENGINE") == "SPS_LYRICS_ENGINE"
        assert make(env_prefix="VPS").env("LYRICS_ENGINE") == "VPS_LYRICS_ENGINE"

    def test_an_absolute_data_directory_is_used_as_given(self, tmp_path):
        assert make(data_dir=str(tmp_path)).models_dir == os.path.join(str(tmp_path), "models")

    def test_the_home_is_resolved_when_asked_not_when_created(self, tmp_path, monkeypatch):
        ident = make()
        monkeypatch.setenv("HOME", str(tmp_path / "a"))
        monkeypatch.setenv("USERPROFILE", str(tmp_path / "a"))
        first = ident.models_dir
        monkeypatch.setenv("HOME", str(tmp_path / "b"))
        monkeypatch.setenv("USERPROFILE", str(tmp_path / "b"))
        assert ident.models_dir != first

    def test_it_is_immutable(self):
        with pytest.raises(dataclasses.FrozenInstanceError):
            make().name = "other"

    @pytest.mark.parametrize("field", ["name", "url", "data_dir", "env_prefix"])
    def test_every_field_must_be_meaningful(self, field):
        with pytest.raises(ValueError, match=field):
            make(**{field: "  "})

    def test_two_apps_never_share_a_models_directory_or_engine_variable(self):
        vps = make(name="VPS", data_dir="~/.vps", env_prefix="VPS")
        sps = make(name="SPS", data_dir="~/.songpracticestudio", env_prefix="SPS")
        assert vps.models_dir != sps.models_dir
        assert vps.env("LYRICS_ENGINE") != sps.env("LYRICS_ENGINE")
