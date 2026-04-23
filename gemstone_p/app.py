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

# Smalltalk snippet: find AllUsers via several fallback paths, bind to `allUsers`
_ALL_USERS_EXPR = (
    "allUsers := [Globals at: #AllUsers ifAbsent: [nil]] on: Error do: [:e | nil].\n"
    "allUsers isNil ifTrue: [\n"
    "  allUsers := [UserGlobals at: #AllUsers ifAbsent: [nil]] on: Error do: [:e | nil]\n"
    "].\n"
    "allUsers isNil ifTrue: [\n"
    "  allUsers := [System myUserProfile symbolList objectNamed: #AllUsers] on: Error do: [:e | nil]\n"
    "]."
)


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
    # Symbol List Browser                                                  #
    # ------------------------------------------------------------------ #

    @app.get("/symbol-list/users")
    def symlist_users():
        """Return list of user names from AllUsers (tries multiple lookup paths)."""
        try:
            with gs_session.request_session() as session:
                raw = session.eval(
                    f"| allUsers stream |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"stream := ''.\n"
                    f"allUsers isNil ifFalse: [\n"
                    f"  allUsers do: [:u |\n"
                    f"    | uid |\n"
                    f"    uid := [u userId] on: Error do: [:e | u printString].\n"
                    f"    stream := stream , uid , String lf asString\n"
                    f"  ]\n"
                    f"].\n"
                    f"stream"
                )
                text = raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
                users = [u.strip() for u in text.splitlines() if u.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, users=users)

    @app.get("/symbol-list/dictionaries/<user>")
    def symlist_dicts(user: str):
        """Return list of SymbolDictionary names for a given user."""
        try:
            with gs_session.request_session() as session:
                escaped_user = _escape_st(user)
                raw = session.eval(
                    f"| allUsers u stream |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"stream := ''.\n"
                    f"u isNil ifFalse: [\n"
                    f"  u symbolList do: [:d |\n"
                    f"    | dname |\n"
                    f"    dname := [d name] on: Error do: [:e | d printString].\n"
                    f"    stream := stream , dname , String lf asString\n"
                    f"  ]\n"
                    f"].\n"
                    f"stream"
                )
                text = raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
                dicts = [d.strip() for d in text.splitlines() if d.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, dictionaries=dicts)

    @app.get("/symbol-list/entries/<user>/<dictionary>")
    def symlist_entries(user: str, dictionary: str):
        """Return list of entry key names for a user/dictionary pair."""
        try:
            with gs_session.request_session() as session:
                escaped_user = _escape_st(user)
                escaped_dict = _escape_st(dictionary)
                raw = session.eval(
                    f"| allUsers u dict stream |\n"
                    f"allUsers := [Globals at: #AllUsers ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    f"allUsers isNil ifTrue: [\n"
                    f"  allUsers := [UserGlobals at: #AllUsers ifAbsent: [nil]] on: Error do: [:e | nil]\n"
                    f"].\n"
                    f"allUsers isNil ifTrue: [\n"
                    f"  allUsers := [System myUserProfile symbolList objectNamed: #AllUsers] on: Error do: [:e | nil]\n"
                    f"].\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"stream := ''.\n"
                    f"u isNil ifFalse: [\n"
                    f"  dict := u symbolList detect: [:d | d name asString = '{escaped_dict}'] ifNone: [nil].\n"
                    f"  dict isNil ifFalse: [\n"
                    f"    dict keysDo: [:k |\n"
                    f"      stream := stream , k asString , String lf asString\n"
                    f"    ]\n"
                    f"  ]\n"
                    f"].\n"
                    f"stream"
                )
                text = raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
                entries = [e.strip() for e in text.splitlines() if e.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, entries=entries)

    @app.get("/symbol-list/preview/<user>/<dictionary>/<key>")
    def symlist_preview(user: str, dictionary: str, key: str):
        """Return a preview of a single entry value."""
        try:
            with gs_session.request_session() as session:
                escaped_user = _escape_st(user)
                escaped_dict = _escape_st(dictionary)
                escaped_key = _escape_st(key)
                raw_oop = session.eval_oop(
                    f"| allUsers u dict |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"u isNil ifTrue: [nil] ifFalse: [\n"
                    f"  dict := u symbolList detect: [:d | d name asString = '{escaped_dict}'] ifNone: [nil].\n"
                    f"  dict isNil ifTrue: [nil] ifFalse: [\n"
                    f"    dict at: '{escaped_key}' asSymbol ifAbsent: [nil]\n"
                    f"  ]\n"
                    f"]"
                )
                from gemstone_py import OOP_NIL
                if raw_oop == OOP_NIL:
                    return jsonify(success=True, oop=None, inspection="nil", basetype="nilclass",
                                   instVars={}, instVarsSize=0, loaded=True, customTabs=[])
                from gemstone_p.object_view import object_view as _ov
                view = _ov(session, raw_oop, 2, {}, {})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, **view)

    @app.post("/symbol-list/add-dictionary")
    def symlist_add_dict():
        data = request.get_json(force=True) or {}
        user = data.get("user", "")
        name = data.get("name", "")
        if not user or not name:
            return jsonify(success=False, exception="user and name required"), 400
        try:
            with gs_session.request_session(read_only=False) as session:
                escaped_user = _escape_st(user)
                escaped_name = _escape_st(name)
                session.eval(
                    f"| allUsers u newDict |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"u isNil ifFalse: [\n"
                    f"  newDict := SymbolDictionary new.\n"
                    f"  newDict name: '{escaped_name}' asSymbol.\n"
                    f"  u symbolList add: newDict\n"
                    f"]"
                )
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/symbol-list/remove-dictionary")
    def symlist_remove_dict():
        data = request.get_json(force=True) or {}
        user = data.get("user", "")
        name = data.get("name", "")
        if not user or not name:
            return jsonify(success=False, exception="user and name required"), 400
        try:
            with gs_session.request_session(read_only=False) as session:
                escaped_user = _escape_st(user)
                escaped_name = _escape_st(name)
                session.eval(
                    f"| allUsers u |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"u isNil ifFalse: [\n"
                    f"  u symbolList removeKey: '{escaped_name}' asSymbol ifAbsent: []\n"
                    f"]"
                )
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/symbol-list/add-entry")
    def symlist_add_entry():
        data = request.get_json(force=True) or {}
        user = data.get("user", "")
        dictionary = data.get("dictionary", "")
        key = data.get("key", "")
        value_expr = data.get("value", "nil")
        if not user or not dictionary or not key:
            return jsonify(success=False, exception="user, dictionary and key required"), 400
        try:
            with gs_session.request_session(read_only=False) as session:
                escaped_user = _escape_st(user)
                escaped_dict = _escape_st(dictionary)
                escaped_key = _escape_st(key)
                escaped_val = _escape_st(value_expr)
                session.eval(
                    f"| allUsers u dict val |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"u isNil ifFalse: [\n"
                    f"  dict := u symbolList detect: [:d | d name asString = '{escaped_dict}'] ifNone: [nil].\n"
                    f"  dict isNil ifFalse: [\n"
                    f"    val := [{escaped_val}] on: Error do: [:e | e].\n"
                    f"    dict at: '{escaped_key}' asSymbol put: val\n"
                    f"  ]\n"
                    f"]"
                )
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/symbol-list/remove-entry")
    def symlist_remove_entry():
        data = request.get_json(force=True) or {}
        user = data.get("user", "")
        dictionary = data.get("dictionary", "")
        key = data.get("key", "")
        if not user or not dictionary or not key:
            return jsonify(success=False, exception="user, dictionary and key required"), 400
        try:
            with gs_session.request_session(read_only=False) as session:
                escaped_user = _escape_st(user)
                escaped_dict = _escape_st(dictionary)
                escaped_key = _escape_st(key)
                session.eval(
                    f"| allUsers u dict |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := allUsers isNil ifTrue: [nil] ifFalse: [\n"
                    f"  allUsers detect: [:x | x userId = '{escaped_user}'] ifNone: [nil]\n"
                    f"].\n"
                    f"u isNil ifFalse: [\n"
                    f"  dict := u symbolList detect: [:d | d name asString = '{escaped_dict}'] ifNone: [nil].\n"
                    f"  dict isNil ifFalse: [\n"
                    f"    dict removeKey: '{escaped_key}' asSymbol ifAbsent: []\n"
                    f"  ]\n"
                    f"]"
                )
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.get("/symbol-list/debug")
    def symlist_debug():
        """Diagnostic: what does AllUsers resolve to?"""
        try:
            with gs_session.request_session() as session:
                raw = session.eval(
                    f"| allUsers result |\n"
                    f"{_ALL_USERS_EXPR}\n"
                    f"allUsers isNil\n"
                    f"  ifTrue: [ result := 'AllUsers not found in Globals, UserGlobals, or myUserProfile symbolList' ]\n"
                    f"  ifFalse: [\n"
                    f"    | stream |\n"
                    f"    stream := 'Found AllUsers: ', allUsers class name, ' size=', allUsers size printString, String lf asString.\n"
                    f"    allUsers do: [:u |\n"
                    f"      | uid |\n"
                    f"      uid := [u userId] on: Error do: [:e | '(no userId: ', e messageText, ')'].\n"
                    f"      stream := stream , '  user: ' , uid , String lf asString\n"
                    f"    ].\n"
                    f"    result := stream\n"
                    f"  ].\n"
                    f"result"
                )
                text = raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, debug=text)

    # ------------------------------------------------------------------ #
    # Debugger — halted threads                                           #
    # ------------------------------------------------------------------ #

    @app.get("/debug/threads")
    def debug_threads():
        """Return list of halted GsProcess objects."""
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    "| result |\n"
                    "result := ''.\n"
                    "[\n"
                    "  GsProcess allSubinstances do: [:p |\n"
                    "    | status |\n"
                    "    status := [p status] on: Error do: [:e | 'unknown'].\n"
                    "    (status = 'suspended' or: [status = 'halted']) ifTrue: [\n"
                    "      result := result , p asOop printString , '|'\n"
                    "        , (p printString copyFrom: 1 to: (p printString size min: 80))\n"
                    "        , String lf asString\n"
                    "    ]\n"
                    "  ]\n"
                    "] on: Error do: [:e | result := ''].\n"
                    "result"
                )
                threads = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        oop_s, _, ps = line.partition('|')
                        try:
                            threads.append({"oop": int(oop_s.strip()), "printString": ps.strip()})
                        except ValueError:
                            pass
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, threads=threads)

    @app.get("/debug/frames/<int:oop>")
    def debug_frames(oop: int):
        """Return stack frame method names for a halted GsProcess."""
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str, object_for_oop_expr
                raw = _eval_str(session,
                    f"| proc result |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"result := ''.\n"
                    f"[\n"
                    f"  | frames |\n"
                    f"  frames := proc suspendedContext.\n"
                    f"  frames isNil ifFalse: [\n"
                    f"    | idx ctx |\n"
                    f"    idx := 0.\n"
                    f"    ctx := frames.\n"
                    f"    [ctx notNil] whileTrue: [\n"
                    f"      | methodName |\n"
                    f"      methodName := [ctx method printString] on: Error do: [:e | ctx printString].\n"
                    f"      result := result , idx printString , '|' , methodName , String lf asString.\n"
                    f"      idx := idx + 1.\n"
                    f"      ctx := ctx sender.\n"
                    f"      idx >= 50 ifTrue: [ctx := nil]\n"
                    f"    ]\n"
                    f"  ]\n"
                    f"] on: Error do: [:e | result := '0|(error: ' , e messageText , ')'].\n"
                    f"result"
                )
                frames = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        idx_s, _, name = line.partition('|')
                        try:
                            frames.append({"index": int(idx_s), "name": name})
                        except ValueError:
                            pass
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, frames=frames)

    @app.get("/debug/frame/<int:oop>")
    def debug_frame(oop: int):
        """Return detail of one stack frame: source, args/temps, self."""
        frame_index = int(request.args.get("index", 0))
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str, object_for_oop_expr, _escape_st as _esc
                raw = _eval_str(session,
                    f"| proc ctx idx source selfPs vars |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"ctx := proc suspendedContext.\n"
                    f"idx := 0.\n"
                    f"[ctx notNil and: [idx < {frame_index}]] whileTrue: [\n"
                    f"  ctx := ctx sender. idx := idx + 1\n"
                    f"].\n"
                    f"ctx isNil ifTrue: [\n"
                    f"  '(no frame)||()|()'\n"
                    f"] ifFalse: [\n"
                    f"  source := [ctx method sourceString] on: Error do: [:e | ''].\n"
                    f"  source isNil ifTrue: [source := ''].\n"
                    f"  source := source size > 4000\n"
                    f"    ifTrue: [source copyFrom: 1 to: 4000]\n"
                    f"    ifFalse: [source].\n"
                    f"  selfPs := [ctx receiver printString] on: Error do: [:e | '?'].\n"
                    f"  vars := ''.\n"
                    f"  [ctx tempNames do: [:n |\n"
                    f"    | v |\n"
                    f"    v := [ctx tempAt: n] on: Error do: [:e | '?'].\n"
                    f"    vars := vars , n , '=' , v printString , ';'\n"
                    f"  ]] on: Error do: [:e | ].\n"
                    f"  | methodName ipOffset |\n"
                    f"  methodName := [ctx method printString] on: Error do: [:e | 'unknown'].\n"
                    f"  ipOffset := [ctx pc printString] on: Error do: [:e | '0'].\n"
                    f"  methodName , '|' , ipOffset , '|' , selfPs , '|' , source , '|' , vars\n"
                    f"]"
                )
                parts = str(raw).split('|', 4)
                method_name = parts[0] if len(parts) > 0 else ''
                ip_offset   = parts[1] if len(parts) > 1 else '0'
                self_ps     = parts[2] if len(parts) > 2 else ''
                source      = parts[3] if len(parts) > 3 else ''
                vars_raw    = parts[4] if len(parts) > 4 else ''
                variables = []
                for item in vars_raw.split(';'):
                    if '=' in item:
                        n, _, v = item.partition('=')
                        variables.append({"name": n, "value": v})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            methodName=method_name,
            ipOffset=ip_offset,
            selfPrintString=self_ps,
            source=source,
            variables=variables,
            frameIndex=frame_index,
        )

    @app.post("/debug/proceed/<int:oop>")
    def debug_proceed(oop: int):
        try:
            with gs_session.request_session(read_only=False) as session:
                from gemstone_p.object_view import object_for_oop_expr
                session.eval(
                    f"| proc |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"[proc resume] on: Error do: [:e | ]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/step-into/<int:oop>")
    def debug_step_into(oop: int):
        try:
            with gs_session.request_session(read_only=False) as session:
                from gemstone_p.object_view import object_for_oop_expr
                session.eval(
                    f"| proc |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"[proc step] on: Error do: [:e | ]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/step-over/<int:oop>")
    def debug_step_over(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with gs_session.request_session(read_only=False) as session:
                from gemstone_p.object_view import object_for_oop_expr
                session.eval(
                    f"| proc |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"[proc stepOver] on: Error do: [:e | ]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/trim/<int:oop>")
    def debug_trim(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with gs_session.request_session(read_only=False) as session:
                from gemstone_p.object_view import object_for_oop_expr
                session.eval(
                    f"| proc ctx idx |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"ctx := proc suspendedContext.\n"
                    f"idx := 0.\n"
                    f"[ctx notNil and: [idx < {frame_index}]] whileTrue: [\n"
                    f"  ctx := ctx sender. idx := idx + 1\n"
                    f"].\n"
                    f"ctx isNil ifFalse: [\n"
                    f"  [proc trimTo: ctx] on: Error do: [:e | ]\n"
                    f"]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.get("/debug/thread-local/<int:oop>")
    def debug_thread_local(oop: int):
        """Return thread-local storage dictionary for a GsProcess."""
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str, object_for_oop_expr
                raw = _eval_str(session,
                    f"| proc result |\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"result := ''.\n"
                    f"[proc threadStorage do: [:assoc |\n"
                    f"  result := result , assoc key printString , '|'\n"
                    f"    , assoc value printString , String lf asString\n"
                    f"]] on: Error do: [:e | result := ''].\n"
                    f"result"
                )
                entries = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        k, _, v = line.partition('|')
                        entries.append({"key": k, "value": v})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, entries=entries)

    # ------------------------------------------------------------------ #
    # Inspector tabs                                                       #
    # ------------------------------------------------------------------ #

    @app.get("/object/constants/<int:oop>")
    def object_constants(oop: int):
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    f"| obj result |\n"
                    f"obj := ObjectMemory objectForOop: {oop}.\n"
                    f"result := ''.\n"
                    f"[obj class classPool do: [:assoc |\n"
                    f"  result := result , assoc key asString , '|' , assoc value printString , String lf asString\n"
                    f"]] on: Error do: [:e | result := result , '(error: ' , e messageText , ')'].\n"
                    f"result"
                )
                pairs = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        k, _, v = line.partition('|')
                        pairs.append({"key": k, "value": v})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, constants=pairs)

    @app.get("/object/hierarchy/<int:oop>")
    def object_hierarchy(oop: int):
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    f"| obj cls result |\n"
                    f"obj := ObjectMemory objectForOop: {oop}.\n"
                    f"cls := obj class.\n"
                    f"result := ''.\n"
                    f"[cls notNil] whileTrue: [\n"
                    f"  result := result , cls name , String lf asString.\n"
                    f"  cls := cls superclass\n"
                    f"].\n"
                    f"result"
                )
                classes = [c for c in str(raw).splitlines() if c.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, hierarchy=classes)

    @app.get("/object/included-modules/<int:oop>")
    def object_included_modules(oop: int):
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str, object_for_oop_expr
                raw = _eval_str(session,
                    f"| obj result |\n"
                    f"obj := {object_for_oop_expr(oop)}.\n"
                    f"result := ''.\n"
                    f"[obj class withAllSuperclasses do: [:cls |\n"
                    f"  (cls respondsTo: #includedModules) ifTrue: [\n"
                    f"    cls includedModules do: [:m |\n"
                    f"      result := result , m asOop printString , '|' , m name , String lf asString\n"
                    f"    ]\n"
                    f"  ]\n"
                    f"]] on: Error do: [:e | ].\n"
                    f"result"
                )
                modules = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        oop_s, _, name = line.partition('|')
                        try:
                            modules.append({"oop": int(oop_s.strip()), "name": name.strip()})
                        except ValueError:
                            pass
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, modules=modules)

    @app.get("/object/instances/<int:oop>")
    def object_instances(oop: int):
        limit = int(request.args.get("limit", 50))
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    f"| obj result col |\n"
                    f"obj := ObjectMemory objectForOop: {oop}.\n"
                    f"result := ''.\n"
                    f"[col := obj class allInstances.\n"
                    f" col size > {limit} ifTrue: [col := col copyFrom: 1 to: {limit}].\n"
                    f" col do: [:inst |\n"
                    f"   result := result , inst oop printString , '|' , inst printString , String lf asString\n"
                    f" ]\n"
                    f"] on: Error do: [:e | result := '(error: ' , e messageText , ')'].\n"
                    f"result"
                )
                instances = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        oop_s, _, ps = line.partition('|')
                        try:
                            instances.append({"oop": int(oop_s), "printString": ps})
                        except ValueError:
                            pass
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, instances=instances, limit=limit)

    # ------------------------------------------------------------------ #
    # Transaction — continue / persistent mode                            #
    # ------------------------------------------------------------------ #

    @app.get("/transaction/continue")
    def transaction_continue():
        try:
            with gs_session.request_session(read_only=False) as session:
                from gemstone_p.object_view import _eval_str
                result = _eval_str(session,
                    "| ok |\n"
                    "[System continueTransaction. ok := 'continued'] on: Error do: [:e | ok := 'error: ' , e messageText].\n"
                    "ok"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, result=str(result))

    @app.get("/transaction/persistent-mode")
    def transaction_persistent_mode():
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    "[GemStone session autoBeginTransaction printString] on: Error do: [:e | 'false']"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, persistent=str(raw).strip() == 'true')

    @app.post("/transaction/persistent-mode")
    def transaction_set_persistent_mode():
        data = request.get_json(force=True) or {}
        enable = bool(data.get("enable", True))
        try:
            with gs_session.request_session(read_only=False) as session:
                from gemstone_p.object_view import _eval_str
                val = 'true' if enable else 'false'
                result = _eval_str(session,
                    f"[GemStone session autoBeginTransaction: {val}. GemStone session autoBeginTransaction printString]\n"
                    f"on: Error do: [:e | 'error: ' , e messageText]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, persistent=str(result).strip() == 'true')

    # ------------------------------------------------------------------ #
    # Version reports                                                      #
    # ------------------------------------------------------------------ #

    @app.get("/object/stone-version-report")
    def object_stone_version_report():
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    "| result |\n"
                    "result := ''.\n"
                    "[SystemRepository versionReport do: [:assoc |\n"
                    "  result := result , assoc key asString , '|' , assoc value printString , String lf asString\n"
                    "]] on: Error do: [:e | \n"
                    "  result := 'version|' , SystemRepository versionString , String lf asString\n"
                    "].\n"
                    "result"
                )
                pairs = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        k, _, v = line.partition('|')
                        pairs.append({"key": k.strip(), "value": v.strip()})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, report=pairs)

    @app.get("/object/gem-version-report")
    def object_gem_version_report():
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    "| result |\n"
                    "result := ''.\n"
                    "[GemStone versionReport do: [:assoc |\n"
                    "  result := result , assoc key asString , '|' , assoc value printString , String lf asString\n"
                    "]] on: Error do: [:e | \n"
                    "  result := 'version|' , GemStone version , String lf asString\n"
                    "].\n"
                    "result"
                )
                pairs = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        k, _, v = line.partition('|')
                        pairs.append({"key": k.strip(), "value": v.strip()})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, report=pairs)

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
