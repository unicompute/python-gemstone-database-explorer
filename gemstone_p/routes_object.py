from __future__ import annotations

from flask import jsonify, request


def register_object_routes(
    app,
    *,
    request_session_factory,
    connection_preflight_payload,
    default_workspace_id_fn,
    parse_ranges,
    request_json_dict,
    request_ranges,
    int_arg,
    object_view_fn,
    eval_in_context_fn,
    remember_debug_source_hint,
    remember_debug_replay_receiver,
) -> None:
    @app.get("/ids")
    def ids():
        try:
            with request_session_factory() as session:
                persistent_root_oop = session.resolve("UserGlobals")
                system_oop = session.resolve("System")
                globals_oop = session.resolve("Globals")
                default_workspace_oop = default_workspace_id_fn(session)
        except Exception as exc:
            return jsonify(success=False, error=str(exc), preflight=connection_preflight_payload(exc)), 500

        return jsonify(
            persistentRootId=persistent_root_oop,
            gemStoneSystemId=system_oop,
            globalsId=globals_oop,
            defaultWorkspaceId=default_workspace_oop,
        )

    @app.get("/object/index/<int:oop>")
    def object_index(oop: int):
        depth = int(request.args.get("depth", 2))
        ranges = parse_ranges(request.args)
        try:
            with request_session_factory() as session:
                view = object_view_fn(session, oop, depth, ranges, dict(request.args))
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=view)

    @app.route("/object/evaluate/<int:oop>", methods=["GET", "POST"])
    def object_evaluate(oop: int):
        payload = request_json_dict() if request.method == "POST" else {}
        params = payload if request.method == "POST" else dict(request.args)
        code = str(payload.get("code", "") if request.method == "POST" else request.args.get("code", ""))
        language = str(
            payload.get("language", "smalltalk")
            if request.method == "POST"
            else request.args.get("language", "smalltalk")
        )
        depth = int_arg(
            payload.get("depth", 2) if request.method == "POST" else request.args.get("depth", 2),
            2,
        )
        ranges = request_ranges()
        try:
            with request_session_factory(read_only=False) as session:
                eval_result = eval_in_context_fn(session, oop, code, language)
                is_exc = bool(eval_result.get("isException"))
                result_oop = eval_result.get("resultOop")
                if isinstance(result_oop, int):
                    result_view = object_view_fn(
                        session,
                        result_oop,
                        1 if is_exc else depth,
                        ranges,
                        params,
                    )
                else:
                    result_view = {
                        "oop": None,
                        "inspection": str(eval_result.get("errorText") or "Evaluation failed"),
                        "basetype": "object",
                        "loaded": False,
                    }
                if is_exc:
                    exception_text = (
                        result_view.get("inspection")
                        or str(eval_result.get("errorText") or "Exception")
                    )
                    result_view["debugThreadOop"] = eval_result.get("debugThreadOop")
                    result_view["debugExceptionOop"] = eval_result.get("exceptionOop")
                    result_view["exceptionText"] = exception_text
                    result_view["sourcePreview"] = code
                    result_view["autoOpenDebugger"] = bool(eval_result.get("debugThreadOop"))
                    remember_debug_source_hint(eval_result.get("debugThreadOop"), code)
                    remember_debug_replay_receiver(eval_result.get("debugThreadOop"), oop)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=[is_exc, result_view])
