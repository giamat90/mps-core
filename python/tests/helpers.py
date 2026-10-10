"""Synthetic audio for the library tests."""

import numpy as np
import soundfile as sf


def sine(freq, sr, seconds, amp=0.5):
    t = np.arange(int(sr * seconds)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def write_wav(path, audio, sr):
    sf.write(str(path), audio, sr, subtype="PCM_16", format="WAV")
    return str(path)
