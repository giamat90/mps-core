"""Who a song is by, as far as its file or its video says.

An import used to leave the artist empty, so the online lyrics lookup searched
the title alone and a common title found other bands' songs. These helpers read
the artist at import time; the user can still correct it in the lyrics panel.
"""

import re
import sys

import mutagen

_TOPIC = re.compile(r"\s*-\s*topic$", re.IGNORECASE)
_VEVO = re.compile(r"\s*vevo$", re.IGNORECASE)
_CHANNEL_SUFFIX = re.compile(r"\s+(official(\s+(channel|music|artist))?|music|channel)$", re.IGNORECASE)


def _log(msg: str):
    print(f"[identity] {msg}", file=sys.stderr, flush=True)


def _tidy(name) -> str | None:
    if not isinstance(name, str):
        return None
    return " ".join(name.split()).strip(" -") or None


def clean_channel(name) -> str | None:
    """The artist a channel name stands for, without the decoration a channel adds
    ('Queen - Topic', 'QueenVEVO', 'Queen Official'). None when nothing is left."""
    cleaned = _tidy(name)
    if cleaned is None:
        return None
    cleaned = _TOPIC.sub("", cleaned)
    cleaned = _VEVO.sub("", cleaned)
    cleaned = _CHANNEL_SUFFIX.sub("", cleaned)
    return _tidy(cleaned)


def artist_from_ytdlp(info: dict) -> str | None:
    """The artist of a yt-dlp `info` dict: the music metadata YouTube carries when
    it has any, else the channel the video was published on."""
    if not isinstance(info, dict):
        return None
    for key in ("artist", "creator"):
        artist = _tidy(info.get(key))
        if artist:
            return artist
    for key in ("channel", "uploader"):
        artist = clean_channel(info.get(key))
        if artist:
            return artist
    return None


def artist_from_file(path: str) -> str | None:
    """The artist in an audio file's tags (ID3, MP4, Vorbis...), or None when the
    file has none or its format carries no tags."""
    try:
        audio = mutagen.File(path, easy=True)
    except (mutagen.MutagenError, OSError) as e:
        _log(f"could not read the tags of {path}: {e}")
        return None
    if audio is None or audio.tags is None:
        return None
    for key in ("artist", "albumartist"):
        for value in audio.tags.get(key) or []:
            artist = _tidy(value)
            if artist:
                return artist
    return None
