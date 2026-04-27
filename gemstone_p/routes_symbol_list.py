from __future__ import annotations

from flask import jsonify, request


def _text_from_eval_result(raw) -> str:
    return raw.decode("utf-8", errors="replace") if isinstance(raw, (bytes, bytearray)) else str(raw)


def register_symbol_list_routes(
    app,
    *,
    request_session_factory,
    all_users_expr: str,
    all_users_detect_user_expr_fn,
    escape_st_fn,
    object_view_fn,
    nil_oop,
) -> None:
    @app.get("/symbol-list/users")
    def symlist_users():
        try:
            with request_session_factory() as session:
                raw = session.eval(
                    f"| allUsers stream |\n"
                    f"{all_users_expr}\n"
                    f"stream := ''.\n"
                    f"allUsers isNil ifFalse: [\n"
                    f"  allUsers do: [:u |\n"
                    f"    | uid |\n"
                    f"    uid := ([u userId] on: Error do: [:e | u printString]) asString.\n"
                    f"    stream := stream , uid , String lf asString\n"
                    f"  ]\n"
                    f"].\n"
                    f"stream"
                )
                users = [u.strip() for u in _text_from_eval_result(raw).splitlines() if u.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, users=users)

    @app.get("/symbol-list/dictionaries/<user>")
    def symlist_dicts(user: str):
        try:
            with request_session_factory() as session:
                escaped_user = escape_st_fn(user)
                raw = session.eval(
                    f"| allUsers u stream |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
                    f"stream := ''.\n"
                    f"u isNil ifFalse: [\n"
                    f"  u symbolList do: [:d |\n"
                    f"    | dname |\n"
                    f"    dname := ([d name] on: Error do: [:e | d printString]) asString.\n"
                    f"    stream := stream , dname , String lf asString\n"
                    f"  ]\n"
                    f"].\n"
                    f"stream"
                )
                dictionaries = [d.strip() for d in _text_from_eval_result(raw).splitlines() if d.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, dictionaries=dictionaries)

    @app.get("/symbol-list/entries/<user>/<dictionary>")
    def symlist_entries(user: str, dictionary: str):
        try:
            with request_session_factory() as session:
                escaped_user = escape_st_fn(user)
                escaped_dict = escape_st_fn(dictionary)
                raw = session.eval(
                    f"| allUsers u dict stream |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
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
                entries = [e.strip() for e in _text_from_eval_result(raw).splitlines() if e.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, entries=entries)

    @app.get("/symbol-list/preview/<user>/<dictionary>/<key>")
    def symlist_preview(user: str, dictionary: str, key: str):
        try:
            with request_session_factory() as session:
                escaped_user = escape_st_fn(user)
                escaped_dict = escape_st_fn(dictionary)
                escaped_key = escape_st_fn(key)
                raw_oop = session.eval_oop(
                    f"| allUsers u dict |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
                    f"u isNil ifTrue: [nil] ifFalse: [\n"
                    f"  dict := u symbolList detect: [:d | d name asString = '{escaped_dict}'] ifNone: [nil].\n"
                    f"  dict isNil ifTrue: [nil] ifFalse: [\n"
                    f"    dict at: '{escaped_key}' ifAbsent: [dict at: '{escaped_key}' asSymbol ifAbsent: [nil]]\n"
                    f"  ]\n"
                    f"]"
                )
                if raw_oop == nil_oop:
                    return jsonify(
                        success=True,
                        oop=None,
                        inspection="nil",
                        basetype="nilclass",
                        instVars={},
                        instVarsSize=0,
                        loaded=True,
                        classObject={"oop": None, "inspection": "", "basetype": "object", "loaded": False},
                        superclassObject={"oop": None, "inspection": "", "basetype": "object", "loaded": False},
                        availableTabs=["instvars"],
                        defaultTab="instvars",
                        customTabs=[],
                    )
                view = object_view_fn(session, raw_oop, 2, {}, {})
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
            with request_session_factory(read_only=False) as session:
                escaped_user = escape_st_fn(user)
                escaped_name = escape_st_fn(name)
                session.eval(
                    f"| allUsers u newDict |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
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
            with request_session_factory(read_only=False) as session:
                escaped_user = escape_st_fn(user)
                escaped_name = escape_st_fn(name)
                session.eval(
                    f"| allUsers u |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
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
            with request_session_factory(read_only=False) as session:
                escaped_user = escape_st_fn(user)
                escaped_dict = escape_st_fn(dictionary)
                escaped_key = escape_st_fn(key)
                escaped_val = escape_st_fn(value_expr)
                session.eval(
                    f"| allUsers u dict val |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
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
            with request_session_factory(read_only=False) as session:
                escaped_user = escape_st_fn(user)
                escaped_dict = escape_st_fn(dictionary)
                escaped_key = escape_st_fn(key)
                session.eval(
                    f"| allUsers u dict |\n"
                    f"{all_users_expr}\n"
                    f"u := {all_users_detect_user_expr_fn(escaped_user)}.\n"
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
        try:
            with request_session_factory() as session:
                raw = session.eval(
                    f"| allUsers result |\n"
                    f"{all_users_expr}\n"
                    f"allUsers isNil\n"
                    f"  ifTrue: [ result := 'AllUsers not found in Globals, UserGlobals, or myUserProfile symbolList' ]\n"
                    f"  ifFalse: [\n"
                    f"    | stream |\n"
                    f"    stream := 'Found AllUsers: ', allUsers class name, ' size=', allUsers size printString, String lf asString.\n"
                    f"    allUsers do: [:u |\n"
                    f"      | uid |\n"
                    f"      uid := ([u userId] on: Error do: [:e | '(no userId: ', e messageText, ')']) asString.\n"
                    f"      stream := stream , '  user: ' , uid , String lf asString\n"
                    f"    ].\n"
                    f"    result := stream\n"
                    f"  ].\n"
                    f"result"
                )
                text = _text_from_eval_result(raw)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, debug=text)
