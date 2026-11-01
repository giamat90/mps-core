"""
Pieces of the YouTube import both sidecars share: how download progress is
reported, how fast a failing attempt gives up, and how an attempt is named.

Stdlib-only (no yt_dlp import), like version_check. The attempt loop itself
stays in each app's yt_importer because it calls that app's pipeline.
"""

import time

# The download fills the first slice of the import bar; the pipeline fills the rest.
DOWNLOAD_SHARE = 0.15

# Reported when yt-dlp cannot say how big the file is: the UI shows a moving
# bar instead of a percentage it would have to invent.
INDETERMINATE = -1.0

# yt-dlp's own defaults retry ten times with long waits, so one blocked attempt
# can take minutes and the user sees nothing. Fail an attempt in well under a
# minute instead and let the next one run.
FAST_FAIL_OPTS = {
    "socket_timeout": 15,
    "retries": 2,
    "fragment_retries": 2,
    "extractor_retries": 1,
}

# Total time the attempts may start in; an attempt that began inside it still finishes.
ATTEMPT_BUDGET_SECONDS = 180.0

_BROWSER_NAMES = {"chrome": "Chrome", "firefox": "Firefox", "edge": "Edge", "brave": "Brave", "opera": "Opera"}


def download_hook(on_progress, stage: str = "downloading"):
    """A yt-dlp progress hook that reports into the first DOWNLOAD_SHARE of the bar."""

    def hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if not total:
                on_progress(INDETERMINATE, stage)
                return
            frac = min(d.get("downloaded_bytes", 0) / total, 1.0)
            on_progress(frac * DOWNLOAD_SHARE, stage)
        elif d["status"] == "finished":
            on_progress(DOWNLOAD_SHARE, stage)

    return hook


def attempt_stage(index: int, count: int, extra: dict) -> str:
    """The stage text of attempt `index` (0-based) of `count`: plain for a lone first try, named for the rest."""
    if count <= 1 or index == 0 and "cookiefile" not in extra and "cookiesfrombrowser" not in extra:
        return "downloading"
    return f"downloading (attempt {index + 1} of {count}: {describe_attempt(extra)})"


def describe_attempt(extra: dict) -> str:
    if "cookiefile" in extra:
        return "your YouTube sign-in"
    browser = extra.get("cookiesfrombrowser")
    if browser:
        return f"{_BROWSER_NAMES.get(browser[0], browser[0])} cookies"
    return "without sign-in"


class AttemptBudget:
    """Stops new attempts from starting once `seconds` have passed since construction."""

    def __init__(self, seconds: float = ATTEMPT_BUDGET_SECONDS, clock=time.monotonic):
        self._clock = clock
        self._deadline = clock() + seconds

    def expired(self) -> bool:
        return self._clock() >= self._deadline
