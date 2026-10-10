"""Who is calling the library.

The apps share this code but not their identity: each keeps its models and
caches in its own data directory, introduces itself on the network under its
own name, and has its own prefix for test-only environment variables. Nothing
here may be guessed from a default, because a wrong guess is silent (a second
360 MB model download in the wrong folder, or one app's variable switching
another app's engine).
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AppIdentity:
    name: str
    url: str
    data_dir: str
    env_prefix: str

    def __post_init__(self):
        for field in ("name", "url", "data_dir", "env_prefix"):
            if not getattr(self, field).strip():
                raise ValueError(f"AppIdentity.{field} must not be empty")

    @property
    def user_agent(self) -> str:
        return f"{self.name} ({self.url})"

    @property
    def root(self) -> str:
        # Expanded on each use: tests (and users) change HOME after import.
        return os.path.normpath(os.path.expanduser(self.data_dir))

    @property
    def models_dir(self) -> str:
        return os.path.join(self.root, "models")

    @property
    def yt_dlp_check_path(self) -> str:
        return os.path.join(self.root, "yt_dlp_check.json")

    def env(self, suffix: str) -> str:
        return f"{self.env_prefix}_{suffix}"
