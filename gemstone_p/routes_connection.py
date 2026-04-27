from __future__ import annotations

import platform
import sys
from collections.abc import Callable

from flask import jsonify


def register_connection_routes(
    app,
    *,
    app_version: str,
    runtime_version_payload: Callable[[], dict],
    connection_preflight_payload: Callable[[Exception | None], dict],
    connection_context_payload: Callable[[], dict],
    broker_snapshot: Callable[[], dict],
) -> None:
    @app.get("/version")
    def version():
        try:
            return jsonify(**runtime_version_payload())
        except Exception as exc:
            return jsonify(**connection_preflight_payload(exc)), 500

    @app.get("/healthz")
    def healthz():
        try:
            payload = runtime_version_payload()
        except Exception as exc:
            return jsonify(**connection_preflight_payload(exc)), 503
        return jsonify(status="ok", **payload)

    @app.get("/connection/preflight")
    def connection_preflight():
        return jsonify(**connection_preflight_payload(None))

    @app.get("/diagnostics")
    def diagnostics():
        runtime = {
            "python": sys.version.split()[0],
            "implementation": platform.python_implementation(),
            "platform": platform.platform(),
        }
        broker = broker_snapshot()
        try:
            payload = runtime_version_payload()
        except Exception as exc:
            preflight = connection_preflight_payload(exc)
            return jsonify(
                success=False,
                status="error",
                app=app_version,
                runtime=runtime,
                sessionBroker=broker,
                connection=preflight["connection"],
                preflight=preflight,
                exception=str(exc),
            ), 503
        return jsonify(
            status="ok",
            runtime=runtime,
            sessionBroker=broker,
            connection=connection_context_payload(),
            **payload,
        )
