"""The artist an import can read from a video's metadata or a file's tags."""

import pytest
import numpy as np
import soundfile as sf
from mutagen.flac import FLAC

from mps_core import identity


class TestCleanChannel:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("Queen - Topic", "Queen"),
            ("QueenVEVO", "Queen"),
            ("Queen Official", "Queen"),
            ("Queen Official Channel", "Queen"),
            ("Queen Music", "Queen"),
            ("  Queen  ", "Queen"),
            ("Queen", "Queen"),
            ("VEVO", None),
            ("   ", None),
            (None, None),
            (42, None),
        ],
    )
    def test_strips_what_a_channel_adds_to_an_artists_name(self, raw, expected):
        assert identity.clean_channel(raw) == expected


class TestArtistFromYtdlp:
    def test_music_metadata_wins_over_the_channel(self):
        info = {"artist": "Queen", "channel": "Some Uploader", "uploader": "x"}
        assert identity.artist_from_ytdlp(info) == "Queen"

    def test_music_metadata_is_kept_as_the_video_gives_it(self):
        assert identity.artist_from_ytdlp({"artist": "Radio Music"}) == "Radio Music"

    def test_falls_back_to_the_cleaned_channel(self):
        assert identity.artist_from_ytdlp({"channel": "Queen Official", "uploader": "x"}) == "Queen"
        assert identity.artist_from_ytdlp({"uploader": "Queen - Topic"}) == "Queen"

    def test_nothing_to_go_on(self):
        assert identity.artist_from_ytdlp({"title": "x"}) is None
        assert identity.artist_from_ytdlp(None) is None


def tagged_flac(path, **tags):
    sf.write(str(path), np.zeros(4410, dtype="float32"), 44100, format="FLAC")
    audio = FLAC(str(path))
    for key, value in tags.items():
        audio[key] = value
    audio.save()
    return str(path)


class TestArtistFromFile:
    def test_reads_the_artist_tag(self, tmp_path):
        assert identity.artist_from_file(tagged_flac(tmp_path / "a.flac", artist="Leonard Cohen")) == "Leonard Cohen"

    def test_falls_back_to_the_album_artist(self, tmp_path):
        assert identity.artist_from_file(tagged_flac(tmp_path / "a.flac", albumartist="Various")) == "Various"

    def test_a_file_without_tags_has_no_artist(self, tmp_path):
        assert identity.artist_from_file(tagged_flac(tmp_path / "a.flac")) is None

    def test_a_file_mutagen_does_not_know_has_no_artist(self, tmp_path):
        path = tmp_path / "a.bin"
        path.write_bytes(b"not audio")
        assert identity.artist_from_file(str(path)) is None

    def test_a_missing_file_is_logged_not_raised(self, tmp_path, capsys):
        assert identity.artist_from_file(str(tmp_path / "gone.mp3")) is None
        assert "could not read the tags" in capsys.readouterr().err
