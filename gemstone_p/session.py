"""Shared GemStone session broker for the Flask explorer."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator

from flask import Flask, has_request_context, request

from gemstone_py import GemStoneConfig, GemStoneSession


# GCI uses process-global state, including the active session id. Treat the
# entire request lifecycle as single-threaded inside a Flask process so
# concurrent browser requests cannot switch sessions underneath each other.
_gci_lock = threading.RLock()


@dataclass
class _ManagedSession:
    channel: str
    session: GemStoneSession | None = None


class _SessionBroker:
    def __init__(self) -> None:
        self._config: GemStoneConfig | None = None
        self._managed: dict[str, _ManagedSession] = {}
        self._default_auto_begin: bool | None = None

    def init_app(self, app: Flask) -> None:
        del app
        self._config = GemStoneConfig.from_env(require_credentials=True)

    def remember_persistent_mode(self, enabled: bool) -> None:
        self._default_auto_begin = bool(enabled)

    def _managed_session(self, channel: str) -> _ManagedSession:
        return self._managed.setdefault(channel, _ManagedSession(channel=channel))

    def _drop_session(self, managed: _ManagedSession) -> None:
        session = managed.session
        managed.session = None
        if session is None:
            return
        try:
            session.logout()
        except Exception:
            pass

    def _apply_defaults(self, session: GemStoneSession) -> None:
        if self._default_auto_begin is None:
            return
        flag = "true" if self._default_auto_begin else "false"
        session.eval(f"GemStone session autoBeginTransaction: {flag}")

    def _ensure_session(self, channel: str) -> tuple[_ManagedSession, GemStoneSession]:
        assert self._config is not None, "call init_app() first"
        managed = self._managed_session(channel)
        session = managed.session
        if session is None:
            session = GemStoneSession(config=self._config)
            managed.session = session
        needs_defaults = not getattr(session, "_logged_in", False)
        if needs_defaults:
            session.login()
            self._apply_defaults(session)
        return managed, session

    def _resolve_channel(self, *, read_only: bool, channel: str) -> str:
        explicit = str(channel or "main").strip() or "main"
        if explicit != "main":
            return explicit
        if not has_request_context():
            return f"main-{'r' if read_only else 'w'}"
        path = str(request.path or "")
        if path.startswith("/debug"):
            base = "debug"
        elif path.startswith("/transaction"):
            base = "transaction"
        elif path.startswith("/class-browser"):
            base = "class-browser"
        elif path.startswith("/object/evaluate"):
            base = "eval"
        elif path.startswith("/object/"):
            base = "object"
        elif path.startswith("/symbol-list"):
            base = "symbol-list"
        elif path == "/ids":
            base = "roots"
        elif path == "/version":
            base = "version"
        else:
            base = "main"
        return f"{base}-{'r' if read_only else 'w'}"

    @contextmanager
    def request_session(self, *, read_only: bool = True, channel: str = "main") -> Iterator[GemStoneSession]:
        with _gci_lock:
            managed: _ManagedSession | None = None
            session: GemStoneSession | None = None
            try:
                managed, session = self._ensure_session(self._resolve_channel(read_only=read_only, channel=channel))
                yield session
                if read_only:
                    try:
                        session.abort()
                    except Exception:
                        self._drop_session(managed)
                        raise
            except Exception:
                try:
                    if session is not None:
                        session.abort()
                except Exception:
                    pass
                if managed is not None:
                    self._drop_session(managed)
                raise


_BROKER = _SessionBroker()


def init_app(app: Flask) -> None:
    _BROKER.init_app(app)


def _reset_shared_session() -> None:
    for managed in list(_BROKER._managed.values()):
        _BROKER._drop_session(managed)


def _ensure_shared_session() -> GemStoneSession:
    _, session = _BROKER._ensure_session("main")
    return session


def remember_persistent_mode(enabled: bool) -> None:
    _BROKER.remember_persistent_mode(enabled)


def request_session(*, read_only: bool = True, channel: str = "main") -> Iterator[GemStoneSession]:
    """
    Yield a shared GemStone session, aborting read-only work on exit.

    The debugger depends on halted processes surviving across HTTP requests, so
    requests are still serialized through the global GCI lock, but the session
    lifecycle is brokered explicitly so broken sessions can be dropped and
    future route groups can move to separate channels without changing callers.
    """
    return _BROKER.request_session(read_only=read_only, channel=channel)
