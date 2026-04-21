"""Session management — one GemStone session per Flask request via gemstone-py pool."""

from __future__ import annotations

from flask import Flask, g

from gemstone_py import GemStoneConfig, install_flask_request_session


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


def get_session():
    """Return the GemStone session bound to the current request."""
    from gemstone_py import current_flask_request_session
    return current_flask_request_session()
