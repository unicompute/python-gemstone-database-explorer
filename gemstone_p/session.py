"""Session management — direct per-route GemStone sessions via gemstone-py."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator

from flask import Flask

from gemstone_py import GemStoneConfig, GemStoneSession


_config: GemStoneConfig | None = None

# GCI uses process-global state, including the active session id. Treat the
# entire request lifecycle as single-threaded inside a Flask process so
# concurrent browser requests cannot switch sessions underneath each other.
_gci_lock = threading.Lock()


def init_app(app: Flask) -> None:
    global _config
    _config = GemStoneConfig.from_env(require_credentials=True)


@contextmanager
def request_session(*, read_only: bool = True) -> Iterator[GemStoneSession]:
    """
    Open a GemStone session, yield it, then abort (read-only) or leave the
    caller to commit (read_only=False). Always logs out on exit.

    Hold the global GCI lock for the full request so no other thread can
    activate a different GemStone session while this one is in use.
    """
    assert _config is not None, "call init_app() first"
    with _gci_lock:
        session = GemStoneSession(config=_config)
        session.login()
        try:
            yield session
            if read_only:
                try:
                    session.abort()
                except Exception:
                    pass
        except Exception:
            try:
                session.abort()
            except Exception:
                pass
            raise
        finally:
            session.logout()
