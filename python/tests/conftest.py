import sys
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from mps_core.app import AppIdentity  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    """Anything that resolves `~` lands in a temp directory, never the real home."""
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.setenv("HOME", str(home))
    return home


@pytest.fixture
def app(isolated_home) -> AppIdentity:
    return AppIdentity(
        name="TestApp",
        url="https://example.invalid/test-app",
        data_dir="~/.testapp",
        env_prefix="TEST",
    )
