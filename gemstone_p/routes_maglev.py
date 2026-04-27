from __future__ import annotations

from collections.abc import Callable

from flask import jsonify


def register_maglev_routes(
    app,
    *,
    known_report_keys,
    request_session_factory: Callable,
    maglev_report_payload_fn: Callable,
) -> None:
    @app.get("/maglev/report/<report_key>")
    def maglev_report(report_key: str):
        normalized_key = str(report_key or "").strip()
        if normalized_key not in set(known_report_keys or ()):
            title = "MagLev Report"
            return jsonify(
                success=False,
                available=False,
                reportKey=normalized_key,
                title=title,
                text=f"{title}\n\n(unknown report)",
            ), 404
        try:
            with request_session_factory() as session:
                payload = maglev_report_payload_fn(session, normalized_key)
        except Exception as exc:
            title = "MagLev Report"
            payload = {
                "success": False,
                "available": False,
                "reportKey": normalized_key,
                "title": title,
                "text": f"{title}\n\n(not available)\n\n{exc}",
                "exception": str(exc),
            }
        return jsonify(**payload), 200
