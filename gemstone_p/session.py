"""Shared GemStone session broker for the Flask explorer."""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from dataclasses import dataclass, replace
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
    config_key: tuple[str, ...] | None = None


class _SessionBroker:
    def __init__(self) -> None:
        self._config: GemStoneConfig | None = None
        self._managed: dict[str, _ManagedSession] = {}
        self._default_auto_begin: bool | None = None

    def init_app(self, app: Flask) -> None:
        del app
        config = GemStoneConfig.from_env(require_credentials=True)
        stone_name_alias = str(os.environ.get("GS_STONE_NAME", "")).strip()
        if stone_name_alias and not str(os.environ.get("GS_STONE", "")).strip():
            config.stone = stone_name_alias
        self._config = config

    def remember_persistent_mode(self, enabled: bool) -> None:
        self._default_auto_begin = bool(enabled)

    def _request_connection_override(self) -> dict[str, str]:
        if not has_request_context():
            return {}
        mapping = {
            "stone": "X-GS-Stone",
            "host": "X-GS-Host",
            "netldi": "X-GS-NetLDI",
            "gem_service": "X-GS-Gem-Service",
        }
        override: dict[str, str] = {}
        for field, header in mapping.items():
            value = str(request.headers.get(header, "")).strip()
            if value:
                override[field] = value
        return override

    def _resolved_config(self) -> GemStoneConfig:
        assert self._config is not None, "call init_app() first"
        override = self._request_connection_override()
        if not override:
            return self._config
        return replace(self._config, **override)

    @staticmethod
    def _config_key(config: GemStoneConfig) -> tuple[str, ...]:
        return (
            str(config.stone or ""),
            str(config.netldi or ""),
            str(config.host or ""),
            str(config.username or ""),
            str(config.password or ""),
            str(config.host_username or ""),
            str(config.host_password or ""),
            str(config.gem_service or ""),
            str(config.lib_path or ""),
        )

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
        config = self._resolved_config()
        config_key = self._config_key(config)
        managed = self._managed_session(channel)
        if managed.config_key is not None and managed.config_key != config_key:
            self._drop_session(managed)
        managed.config_key = config_key
        session = managed.session
        if session is None:
            session = GemStoneSession(config=config)
            managed.session = session
        needs_defaults = not getattr(session, "_logged_in", False)
        if needs_defaults:
            session.login()
            self._apply_defaults(session)
        return managed, session

    def _normalize_explicit_channel(self, channel: str, *, read_only: bool) -> str:
        explicit = str(channel or "").strip()
        if not explicit or explicit == "main":
            return ""
        if explicit.endswith("-r") or explicit.endswith("-w"):
            return explicit
        return f"{explicit}-{'r' if read_only else 'w'}"

    def _request_channel_override(self, *, read_only: bool) -> str:
        if not has_request_context():
            return ""
        override = str(request.headers.get("X-GS-Channel", "")).strip()
        if not override:
            override = str(request.args.get("sessionChannel", "")).strip()
        return self._normalize_explicit_channel(override, read_only=read_only)

    def _resolve_channel(self, *, read_only: bool, channel: str) -> str:
        explicit = self._normalize_explicit_channel(channel, read_only=read_only)
        if explicit:
            return explicit
        override = self._request_channel_override(read_only=read_only)
        if override:
            return override
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

    def snapshot(self) -> dict:
        with _gci_lock:
            channels = []
            for channel_name in sorted(self._managed.keys()):
                managed = self._managed[channel_name]
                session = managed.session
                channels.append({
                    "name": channel_name,
                    "hasSession": session is not None,
                    "loggedIn": bool(getattr(session, "_logged_in", False)) if session is not None else False,
                })
            return {
                "defaultAutoBegin": self._default_auto_begin,
                "managedSessionCount": len(channels),
                "channels": channels,
            }

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
    major UI windows can opt into isolated channel families via `channel=` or
    the `X-GS-Channel` request header without changing the route handlers.
    """
    return _BROKER.request_session(read_only=read_only, channel=channel)


def broker_snapshot() -> dict:
    return _BROKER.snapshot()


def connection_snapshot() -> dict:
    config = _BROKER._resolved_config() if _BROKER._config is not None else None
    if config is None:
        return {
            "configured": False,
            "stone": "",
            "host": "",
            "netldi": "",
            "gemService": "",
            "libPath": "",
            "username": "",
            "passwordSet": False,
            "hostUsernameSet": False,
            "hostPasswordSet": False,
            "stoneSource": "uninitialised",
            "mode": "unknown",
            "effectiveTarget": "",
            "overrideActive": False,
        }

    stone_env = str(os.environ.get("GS_STONE", "")).strip()
    stone_name_alias = str(os.environ.get("GS_STONE_NAME", "")).strip()
    override = _BROKER._request_connection_override()
    host = str(getattr(config, "host", "") or "").strip()
    mode = "netldi" if host and host not in ("localhost", "127.0.0.1") else "local-stone-name"
    effective_target = (
        f"!@{host}!{config.netldi}!{config.stone}"
        if mode == "netldi"
        else str(config.stone or "")
    )
    if override:
        stone_source = "request-override"
    else:
        stone_source = "GS_STONE" if stone_env else ("GS_STONE_NAME" if stone_name_alias else "default")
    return {
        "configured": True,
        "stone": str(getattr(config, "stone", "") or ""),
        "host": host or "localhost",
        "netldi": str(getattr(config, "netldi", "") or ""),
        "gemService": str(getattr(config, "gem_service", "") or ""),
        "libPath": str(getattr(config, "lib_path", "") or ""),
        "username": str(getattr(config, "username", "") or ""),
        "passwordSet": bool(getattr(config, "password", None)),
        "hostUsernameSet": bool(getattr(config, "host_username", "")),
        "hostPasswordSet": bool(getattr(config, "host_password", "")),
        "stoneSource": stone_source,
        "mode": mode,
        "effectiveTarget": effective_target,
        "overrideActive": bool(override),
        "override": {
            "stone": str(override.get("stone", "") or ""),
            "host": str(override.get("host", "") or ""),
            "netldi": str(override.get("netldi", "") or ""),
            "gemService": str(override.get("gem_service", "") or ""),
        },
    }
