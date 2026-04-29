from __future__ import annotations

from flask import jsonify, request


def register_class_browser_write_class_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    cb_dict_expr_fn,
    cb_behavior_expr_fn,
    cb_error_payload_message_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    cb_dict_expr = cb_dict_expr_fn
    cb_behavior_expr = cb_behavior_expr_fn
    cb_error_payload_message = cb_error_payload_message_fn

    @app.post("/class-browser/add-class")
    def class_browser_add_class():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        superclass_name = str(data.get("superclassName", "Object")).strip() or "Object"
        superclass_dictionary = str(data.get("superclassDictionary", "")).strip()
        if not class_name or not dictionary:
            return jsonify(success=False, exception="missing class or dictionary"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| dict super existing created encode |\n"
                    f"{encode_src}\n"
                    f"dict := {cb_dict_expr(dictionary)}.\n"
                    f"super := {cb_behavior_expr(superclass_name, False, superclass_dictionary)}.\n"
                    "dict isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'dictionary not found')\n"
                    "] ifFalse: [\n"
                    "  super isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'superclass not found')\n"
                    "  ] ifFalse: [\n"
                    f"    existing := [dict at: '{escape_st(class_name)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "    existing notNil ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'class already exists')\n"
                    "    ] ifFalse: [\n"
                    "      created := [\n"
                    f"        super subclass: '{escape_st(class_name)}' asSymbol\n"
                    "          instVarNames: #()\n"
                    "          classVars: #()\n"
                    "          classInstVars: #()\n"
                    "          poolDictionaries: #()\n"
                    "          inDictionary: dict\n"
                    "          options: #()\n"
                    "      ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText) ].\n"
                    "      ((created isString) and: [created beginsWith: 'ERROR|']) ifTrue: [\n"
                    "        created\n"
                    "      ] ifFalse: [\n"
                    f"        'OK|' , (encode value: '{escape_st(class_name)}') , '|' , (encode value: '{escape_st(dictionary)}') , '|' , (encode value: '{escape_st(superclass_name)}')\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        payload = str(raw or "")
        if payload.startswith("ERROR|"):
            message = decode_field(payload.split("|", 1)[1]) or "Class creation failed"
            return jsonify(success=False, exception=message), 200

        fields = payload.split("|", 3)
        if len(fields) >= 4 and fields[0] == "OK":
            created_class = decode_field(fields[1]) or class_name
            created_dict = decode_field(fields[2]) or dictionary
            created_super = decode_field(fields[3]) or superclass_name
            return jsonify(
                success=True,
                result=f"Created {created_class} in {created_dict}",
                className=created_class,
                dictionary=created_dict,
                superclassName=created_super,
            )

        message = payload if payload not in {"", "None"} else f"Created {class_name} in {dictionary}"
        return jsonify(
            success=True,
            result=message,
            className=class_name,
            dictionary=dictionary,
            superclassName=superclass_name,
        )

    @app.post("/class-browser/rename-class")
    def class_browser_rename_class():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        target_class_name = str(data.get("targetClassName", "")).strip()
        if not class_name or not dictionary or not target_class_name:
            return jsonify(success=False, exception="missing class or dictionary"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls dict existing opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    f"dict := {cb_dict_expr(dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  dict isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'dictionary not found')\n"
                    "  ] ifFalse: [\n"
                    f"    existing := [dict at: '{escape_st(target_class_name)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "    ((existing notNil) and: [existing ~~ cls]) ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'target class already exists in dictionary')\n"
                    "    ] ifFalse: [\n"
                    f"      opResult := [cls rename: '{escape_st(target_class_name)}'. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "      ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "        opResult\n"
                    "      ] ifFalse: [\n"
                    f"        'OK|' , (encode value: '{escape_st(target_class_name)}') , '|' , (encode value: '{escape_st(dictionary)}')\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        renamed_class = decode_field(fields[1]) if len(fields) > 1 else target_class_name
        renamed_dict = decode_field(fields[2]) if len(fields) > 2 else dictionary
        return jsonify(
            success=True,
            result=f"Renamed {class_name} to {renamed_class}",
            className=renamed_class,
            dictionary=renamed_dict,
        )

    @app.post("/class-browser/move-class")
    def class_browser_move_class():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        target_dictionary = str(data.get("targetDictionary", "")).strip()
        if not class_name or not dictionary or not target_dictionary:
            return jsonify(success=False, exception="missing class or dictionary"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls oldDict newDict existing opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    f"oldDict := {cb_dict_expr(dictionary)}.\n"
                    f"newDict := {cb_dict_expr(target_dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  newDict isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'target dictionary not found')\n"
                    "  ] ifFalse: [\n"
                    f"    existing := [newDict at: '{escape_st(class_name)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "    ((existing notNil) and: [existing ~~ cls]) ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'target dictionary already contains a different class with that name')\n"
                    "    ] ifFalse: [\n"
                    f"      opResult := [[oldDict removeKey: '{escape_st(class_name)}' asSymbol ifAbsent: []]. newDict at: '{escape_st(class_name)}' asSymbol put: cls. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "      ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "        opResult\n"
                    "      ] ifFalse: [\n"
                    f"        'OK|' , (encode value: '{escape_st(class_name)}') , '|' , (encode value: '{escape_st(target_dictionary)}')\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class move failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_class = decode_field(fields[1]) if len(fields) > 1 else class_name
        moved_dict = decode_field(fields[2]) if len(fields) > 2 else target_dictionary
        return jsonify(success=True, result=f"Moved {moved_class} to {moved_dict}", className=moved_class, dictionary=moved_dict)

    @app.post("/class-browser/remove-class")
    def class_browser_remove_class():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        if not class_name or not dictionary:
            return jsonify(success=False, exception="missing class or dictionary"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  opResult := [cls removeFromSystem. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    f"    'OK|' , (encode value: '{escape_st(class_name)}')\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_class = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else class_name
        return jsonify(success=True, result=f"Removed {removed_class}", className=removed_class)
