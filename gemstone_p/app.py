"""
GemStone Database Explorer — Flask application.

Mirrors the Sinatra routes in mdbe/app.rb using gemstone-py as the backend
instead of the MagLev runtime primitives.

Routes
------
GET  /                          — serve the explorer UI
GET  /ids                       — return well-known root OOPs
GET  /object/index/<id>         — view an object by OOP
GET  /object/evaluate/<id>      — evaluate code in the context of an object
GET  /code/selectors/<id>       — list selectors by category for an object
GET  /code/code/<id>            — return source for a selector
GET  /transaction/commit        — commit the current transaction
GET  /transaction/abort         — abort the current transaction
"""

from __future__ import annotations

import os
from flask import Flask, jsonify, request, render_template

from gemstone_p import session as gs_session
from gemstone_p.object_view import object_view, eval_in_context, _escape_st


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(__file__), "..", "static"),
        template_folder=os.path.join(os.path.dirname(__file__), "..", "templates"),
    )

    gs_session.init_app(app)

    # ------------------------------------------------------------------ #
    # UI                                                                   #
    # ------------------------------------------------------------------ #

    @app.get("/")
    def index():
        return render_template("index.html")

    # ------------------------------------------------------------------ #
    # Well-known root OOPs                                                 #
    # Mirrors GET /ids in mdbe/app.rb                                      #
    # ------------------------------------------------------------------ #

    @app.get("/ids")
    def ids():
        try:
            with gs_session.request_session() as session:
                persistent_root_oop = session.resolve("UserGlobals")
                system_oop = session.resolve("System")
                globals_oop = session.resolve("Globals")
        except Exception as exc:
            return jsonify(success=False, error=str(exc)), 500

        return jsonify(
            persistentRootId=persistent_root_oop,
            gemStoneSystemId=system_oop,
            globalsId=globals_oop,
        )

    # ------------------------------------------------------------------ #
    # Object inspection                                                    #
    # Mirrors GET /object/index/:id in mdbe/app.rb                        #
    # ------------------------------------------------------------------ #

    @app.get("/object/index/<int:oop>")
    def object_index(oop: int):
        depth = int(request.args.get("depth", 2))
        ranges = _parse_ranges(request.args)
        try:
            with gs_session.request_session() as session:
                view = object_view(session, oop, depth, ranges, dict(request.args))
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=view)

    # ------------------------------------------------------------------ #
    # Code evaluation                                                      #
    # Mirrors GET /object/evaluate/:id in mdbe/app.rb                     #
    # ------------------------------------------------------------------ #

    @app.get("/object/evaluate/<int:oop>")
    def object_evaluate(oop: int):
        code = request.args.get("code", "")
        language = request.args.get("language", "smalltalk")
        depth = int(request.args.get("depth", 2))
        ranges = _parse_ranges(request.args)
        try:
            with gs_session.request_session() as session:
                is_exc, result_oop_or_err = eval_in_context(session, oop, code, language)
                if isinstance(result_oop_or_err, int):
                    result_view = object_view(session, result_oop_or_err, 1 if is_exc else depth, ranges, dict(request.args))
                else:
                    result_view = {"oop": None, "inspection": str(result_oop_or_err), "basetype": "object", "loaded": False}
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=[is_exc, result_view])

    # ------------------------------------------------------------------ #
    # Selectors by category                                                #
    # Mirrors GET /code/selectors/:id in mdbe/app.rb                      #
    # ------------------------------------------------------------------ #

    @app.get("/code/selectors/<int:oop>")
    def code_selectors(oop: int):
        try:
            with gs_session.request_session() as session:
                raw = session.eval(
                    f"| obj dict |"
                    f"obj := ObjectMemory objectForOop: {oop}."
                    f"dict := Dictionary new."
                    f"obj class methodDictionary keysDo: [:sel |"
                    f"  | cat | cat := (obj class compiledMethodAt: sel) category."
                    f"  (dict includesKey: cat) ifFalse: [dict at: cat put: OrderedCollection new]."
                    f"  (dict at: cat) add: sel asString]."
                    f"dict"
                )
                result = {str(k): list(v) for k, v in raw.items()} if hasattr(raw, "items") else {}
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=result)

    # ------------------------------------------------------------------ #
    # Method source                                                        #
    # Mirrors GET /code/code/:id in mdbe/app.rb                           #
    # ------------------------------------------------------------------ #

    @app.get("/code/code/<int:oop>")
    def code_source(oop: int):
        selector = request.args.get("selector", "")
        try:
            with gs_session.request_session() as session:
                raw = session.eval(
                    f"| obj method |"
                    f"obj := ObjectMemory objectForOop: {oop}."
                    f"method := obj class compiledMethodAt: '{_escape_st(selector)}' ifAbsent: [nil]."
                    f"method isNil ifTrue: [''] ifFalse: [method sourceString]"
                )
                source = raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=source)

    # ------------------------------------------------------------------ #
    # Transaction control                                                  #
    # ------------------------------------------------------------------ #

    @app.get("/transaction/commit")
    def transaction_commit():
        try:
            with gs_session.request_session(read_only=False) as session:
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.get("/transaction/abort")
    def transaction_abort():
        try:
            with gs_session.request_session(read_only=False) as session:
                session.abort()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    # ------------------------------------------------------------------ #
    # Version / health                                                     #
    # ------------------------------------------------------------------ #

    @app.get("/version")
    def version():
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                stone_ver = _eval_str(session, "SystemRepository versionString")
                gem_ver = _eval_str(session, "GemStone version")
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, stone=str(stone_ver), gem=str(gem_ver))

    return app


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _parse_ranges(args) -> dict:
    """
    Parse range_<name>_from / range_<name>_to query params into:
        {"instVars": ["1", "10"], "elements": ["1", "20"], ...}
    Mirrors the range parsing in mdbe/app.rb.
    """
    ranges: dict = {}
    for key, value in args.items():
        parts = key.split("_")
        if len(parts) >= 3 and parts[0] == "range":
            name = parts[1]
            side = parts[2]
            if name not in ranges:
                ranges[name] = [None, None]
            if side == "from":
                ranges[name][0] = value
            elif side == "to":
                ranges[name][1] = value
    return ranges
