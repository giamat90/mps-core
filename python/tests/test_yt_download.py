from mps_core import yt_download as yd


def collect():
    events = []
    return events, lambda v, s: events.append((round(v, 4), s))


class TestDownloadHook:
    def test_known_size_fills_the_download_share(self):
        events, on_progress = collect()
        hook = yd.download_hook(on_progress)
        hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100})
        hook({"status": "downloading", "downloaded_bytes": 10, "total_bytes_estimate": 100})
        hook({"status": "finished"})
        assert events == [(0.075, "downloading"), (0.015, "downloading"), (0.15, "downloading")]

    def test_an_unknown_size_is_indeterminate_not_a_full_bar(self):
        events, on_progress = collect()
        yd.download_hook(on_progress)({"status": "downloading", "downloaded_bytes": 500})
        assert events == [(yd.INDETERMINATE, "downloading")]

    def test_an_estimate_smaller_than_the_data_never_passes_the_share(self):
        events, on_progress = collect()
        yd.download_hook(on_progress)({"status": "downloading", "downloaded_bytes": 900, "total_bytes_estimate": 100})
        assert events == [(0.15, "downloading")]

    def test_other_statuses_are_ignored_and_the_stage_is_the_callers(self):
        events, on_progress = collect()
        hook = yd.download_hook(on_progress, "downloading (attempt 2 of 3: Chrome cookies)")
        hook({"status": "error"})
        hook({"status": "finished"})
        assert events == [(0.15, "downloading (attempt 2 of 3: Chrome cookies)")]


class TestAttemptStage:
    def test_a_lone_plain_attempt_keeps_the_plain_stage(self):
        assert yd.attempt_stage(0, 1, {}) == "downloading"
        assert yd.attempt_stage(0, 6, {}) == "downloading"

    def test_later_attempts_are_named(self):
        assert yd.attempt_stage(1, 6, {}) == "downloading (attempt 2 of 6: without sign-in)"
        assert yd.attempt_stage(2, 6, {"cookiesfrombrowser": ("chrome",)}) == "downloading (attempt 3 of 6: Chrome cookies)"

    def test_a_first_attempt_with_a_sign_in_says_so(self):
        assert yd.attempt_stage(0, 7, {"cookiefile": "/c.txt"}) == "downloading (attempt 1 of 7: your YouTube sign-in)"

    def test_an_unknown_browser_is_named_as_given(self):
        assert yd.describe_attempt({"cookiesfrombrowser": ("vivaldi",)}) == "vivaldi cookies"


class TestAttemptBudget:
    def test_expires_once_the_time_is_up(self):
        now = [100.0]
        budget = yd.AttemptBudget(30, clock=lambda: now[0])
        assert not budget.expired()
        now[0] = 129.9
        assert not budget.expired()
        now[0] = 130.0
        assert budget.expired()


def test_the_fast_fail_options_are_yt_dlp_options():
    assert set(yd.FAST_FAIL_OPTS) == {"socket_timeout", "retries", "fragment_retries", "extractor_retries"}
