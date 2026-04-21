"""Session management — direct per-route GemStone sessions via gemstone-py."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from flask import Flask

from gemstone_py import GemStoneConfig, GemStoneSession


_config: GemStoneConfig | None = None


def init_app(app: Flask) -> None:
    global _config
    _config = GemStoneConfig.from_env(require_credentials=True)


@contextmanager
def request_session(*, read_only: bool = True) -> Iterator[GemStoneSession]:
    """
    Open a GemStone session, yield it, then abort (read-only) or leave the
    caller to commit (read_only=False). Always logs out on exit.

    We deliberately do NOT use install_flask_request_session / session pools
    because finalize_flask_request_session unconditionally calls commit() on
    teardown, which raises GemStone error #0 when no writes were made.
    """
    assert _config is not None, "call init_app() first"
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
