"""Session management — one GemStone session per Flask request via gemstone-py pool."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from flask import Flask

from gemstone_py import GemStoneConfig, GemStoneSession, install_flask_request_session
from gemstone_py import session_scope as _session_scope


def init_app(app: Flask) -> None:
    config = GemStoneConfig.from_env(require_credentials=True)
    install_flask_request_session(
        app,
        config=config,
        pool_size=4,
        max_session_age=1800,
        max_session_uses=500,
        warmup_sessions=1,
        close_on_after_serving=True,
    )


@contextmanager
def request_session() -> Iterator[GemStoneSession]:
    """Context manager that yields the GemStone session for the current request."""
    with _session_scope() as session:
        yield session
