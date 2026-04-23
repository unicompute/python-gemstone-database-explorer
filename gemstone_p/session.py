"""Session management — direct per-route GemStone sessions via gemstone-py."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator

from flask import Flask

from gemstone_py import GemStoneConfig, GemStoneSession


_config: GemStoneConfig | None = None

# GCI is not thread-safe for concurrent logins from the same process.
# Serialise all session open/close operations with a lock so only one
# GemStone session is being established or torn down at a time.
_gci_lock = threading.Lock()


def init_app(app: Flask) -> None:
    global _config
    _config = GemStoneConfig.from_env(require_credentials=True)


@contextmanager
def request_session(*, read_only: bool = True) -> Iterator[GemStoneSession]:
    """
    Open a GemStone session, yield it, then abort (read-only) or leave the
    caller to commit (read_only=False). Always logs out on exit.

    GCI login/logout are serialised via _gci_lock to prevent the segfault
    that occurs when multiple sessions are opened concurrently in the same
    process.
    """
    assert _config is not None, "call init_app() first"
    session = GemStoneSession(config=_config)
    with _gci_lock:
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
        with _gci_lock:
            session.logout()
