from __future__ import annotations

from flask import jsonify, request


def register_class_browser_write_dictionary_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    cb_error_payload_message_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    cb_error_payload_message = cb_error_payload_message_fn

    @app.post("/class-browser/add-dictionary")
    def class_browser_add_dictionary():
        data = request.get_json(force=True) or {}
        name = str(data.get("name", "")).strip()
        if not name:
            return jsonify(success=False, exception="missing dictionary"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| sym dictName existing newDict opResult encode |\n"
                    f"{encode_src}\n"
                    f"dictName := '{escape_st(name)}'.\n"
                    "sym := System myUserProfile symbolList.\n"
                    "existing := [sym objectNamed: dictName asSymbol] on: Error do: [:e | nil].\n"
                    "existing notNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'dictionary already exists')\n"
                    "] ifFalse: [\n"
                    "  opResult := [\n"
                    "    newDict := SymbolDictionary new.\n"
                    "    newDict name: dictName asString.\n"
                    "    sym add: newDict.\n"
                    "    true\n"
                    "  ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    "    'OK|' , (encode value: dictName)\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Dictionary creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        created_dict = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else name
        return jsonify(success=True, result=f"Added {created_dict}", dictionary=created_dict)

    @app.post("/class-browser/rename-dictionary")
    def class_browser_rename_dictionary():
        data = request.get_json(force=True) or {}
        dictionary = str(data.get("dictionary", "")).strip()
        target_dictionary = str(data.get("targetDictionary", "")).strip()
        if not dictionary or not target_dictionary:
            return jsonify(success=False, exception="missing dictionary"), 400
        if dictionary == target_dictionary:
            return jsonify(success=False, exception="choose a different dictionary name"), 200
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| sym oldName newName dict existing opResult encode |\n"
                    f"{encode_src}\n"
                    f"oldName := '{escape_st(dictionary)}'.\n"
                    f"newName := '{escape_st(target_dictionary)}'.\n"
                    "sym := System myUserProfile symbolList.\n"
                    "dict := [sym objectNamed: oldName asSymbol] on: Error do: [:e | nil].\n"
                    "dict isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'dictionary not found')\n"
                    "] ifFalse: [\n"
                    "  existing := [sym objectNamed: newName asSymbol] on: Error do: [:e | nil].\n"
                    "  ((existing notNil) and: [existing ~~ dict]) ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'target dictionary already exists')\n"
                    "  ] ifFalse: [\n"
                    "    opResult := [\n"
                    "      sym removeKey: oldName asSymbol ifAbsent: [].\n"
                    "      sym at: newName asSymbol put: dict.\n"
                    "      [dict name: newName asString] on: Error do: [:e | ].\n"
                    "      true\n"
                    "    ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "    ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "      opResult\n"
                    "    ] ifFalse: [\n"
                    "      'OK|' , (encode value: newName)\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Dictionary rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        renamed_dict = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else target_dictionary
        return jsonify(success=True, result=f"Renamed {dictionary} to {renamed_dict}", dictionary=renamed_dict)

    @app.post("/class-browser/remove-dictionary")
    def class_browser_remove_dictionary():
        data = request.get_json(force=True) or {}
        dictionary = str(data.get("dictionary", "")).strip()
        if not dictionary:
            return jsonify(success=False, exception="missing dictionary"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| sym dictName existing opResult encode |\n"
                    f"{encode_src}\n"
                    f"dictName := '{escape_st(dictionary)}'.\n"
                    "sym := System myUserProfile symbolList.\n"
                    "existing := [sym objectNamed: dictName asSymbol] on: Error do: [:e | nil].\n"
                    "existing isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'dictionary not found')\n"
                    "] ifFalse: [\n"
                    "  opResult := [\n"
                    "    sym removeKey: dictName asSymbol ifAbsent: [].\n"
                    "    true\n"
                    "  ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    "    'OK|' , (encode value: dictName)\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Dictionary removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_dict = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else dictionary
        return jsonify(success=True, result=f"Removed {removed_dict}", dictionary=removed_dict)
