from __future__ import annotations

from flask import jsonify, request


def register_transaction_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    smalltalk_error_text_fn,
    remember_persistent_mode_fn,
) -> None:
    @app.route("/transaction/commit", methods=["GET", "POST"])
    def transaction_commit():
        try:
            with request_session_factory(read_only=False) as session:
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, result="committed")

    @app.route("/transaction/abort", methods=["GET", "POST"])
    def transaction_abort():
        try:
            with request_session_factory(read_only=False) as session:
                session.abort()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, result="aborted")

    @app.route("/transaction/continue", methods=["GET", "POST"])
    def transaction_continue():
        try:
            with request_session_factory(read_only=False) as session:
                result = eval_str_fn(
                    session,
                    "| ok |\n"
                    "[System continueTransaction. ok := 'continued'] on: Error do: [:e | ok := 'error: ' , e messageText].\n"
                    "ok"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        error_text = smalltalk_error_text_fn(result)
        if error_text:
            return jsonify(success=False, exception=error_text)
        return jsonify(success=True, result=str(result).strip() or "continued")

    @app.get("/transaction/persistent-mode")
    def transaction_persistent_mode():
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    "[GemStone session autoBeginTransaction printString] on: Error do: [:e | 'error: ' , e messageText]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        error_text = smalltalk_error_text_fn(raw)
        if error_text:
            return jsonify(success=False, exception=error_text)
        persistent = str(raw).strip() == "true"
        remember_persistent_mode_fn(persistent)
        return jsonify(success=True, persistent=persistent)

    @app.post("/transaction/persistent-mode")
    def transaction_set_persistent_mode():
        data = request.get_json(force=True) or {}
        enable = bool(data.get("enable", True))
        try:
            with request_session_factory(read_only=False) as session:
                val = "true" if enable else "false"
                result = eval_str_fn(
                    session,
                    f"[GemStone session autoBeginTransaction: {val}. GemStone session autoBeginTransaction printString]\n"
                    f"on: Error do: [:e | 'error: ' , e messageText]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        error_text = smalltalk_error_text_fn(result)
        if error_text:
            return jsonify(success=False, exception=error_text)
        persistent = str(result).strip() == "true"
        remember_persistent_mode_fn(persistent)
        return jsonify(
            success=True,
            persistent=persistent,
            result=f"Persistent mode {'enabled' if persistent else 'disabled'}",
        )
