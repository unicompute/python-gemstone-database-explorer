from __future__ import annotations

from flask import jsonify, request


def register_class_browser_write_compile_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    cb_behavior_expr_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    cb_behavior_expr = cb_behavior_expr_fn

    @app.post("/class-browser/compile")
    def class_browser_compile():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        category = str(data.get("category", "as yet unclassified")).strip() or "as yet unclassified"
        selector = str(data.get("selector", "")).strip()
        source = str(data.get("source", ""))
        meta = bool(data.get("meta"))
        source_kind = str(data.get("sourceKind", "method")).strip() or "method"
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        if source_kind != "method":
            return jsonify(
                success=False,
                exception="Class definitions are browse-only here; use Add Class or New Method",
            ), 200
        clean_source = source.replace("\r\n", "\n").replace("\r", "\n")
        old_selector_expr = "nil" if not selector else f"'{escape_st(selector)}' asSymbol"
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls source compileResult oldSel newSel protocolName message encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  source := '{escape_st(clean_source)}'.\n"
                    f"  oldSel := {old_selector_expr}.\n"
                    f"  compileResult := [ cls compileMethod: source category: '{escape_st(category)}' asSymbol ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText) ].\n"
                    "  ((compileResult isString) and: [compileResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    compileResult\n"
                    "  ] ifFalse: [\n"
                    "    (compileResult isKindOf: Array) ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'Compilation failed')\n"
                    "    ] ifFalse: [\n"
                    "      newSel := [ compileResult selector ] on: Error do: [ nil ].\n"
                    "      (newSel isNil and: [ compileResult isSymbol ]) ifTrue: [ newSel := compileResult ].\n"
                    "      newSel isNil ifTrue: [ newSel := oldSel ].\n"
                    "      ((newSel notNil) and: [ (oldSel notNil) and: [ newSel ~= oldSel and: [ cls includesSelector: oldSel ] ] ]) ifTrue: [\n"
                    "        [ cls removeSelector: oldSel ] on: Error do: [:e | ]\n"
                    "      ].\n"
                    f"      protocolName := newSel isNil ifTrue: ['{escape_st(category)}'] ifFalse: [[ cls categoryOfSelector: newSel ] on: Error do: [:e | '{escape_st(category)}' ]].\n"
                    f"      protocolName ifNil: [ protocolName := '{escape_st(category)}' ].\n"
                    "      message := ((compileResult isString) and: [ compileResult beginsWith: 'ERROR|' not ]) ifTrue: [ compileResult asString ] ifFalse: [ 'Success' ].\n"
                    "      'OK|' , (encode value: (newSel ifNil: [''] ifNotNil: [ newSel asString ])) , '|' , (encode value: protocolName asString) , '|' , (encode value: (oldSel ifNil: [''] ifNotNil: [ oldSel asString ])) , '|' , (encode value: message)\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        payload = str(raw or "")
        if payload.startswith("ERROR|"):
            message = decode_field(payload.split("|", 1)[1]) or "Compilation failed"
            return jsonify(success=False, exception=message), 200

        fields = payload.split("|", 4)
        if len(fields) >= 5 and fields[0] == "OK":
            selector_name = decode_field(fields[1])
            protocol_name = decode_field(fields[2]) or category
            previous_selector = decode_field(fields[3])
            message = decode_field(fields[4]) or "Success"
            return jsonify(
                success=True,
                result=message,
                selector=selector_name or None,
                category=protocol_name,
                previousSelector=previous_selector or None,
            )

        message = payload if payload not in {"", "None"} else "Success"
        success = not message.startswith("Error:")
        return jsonify(success=success, result=message if success else None, exception=None if success else message)

    @app.post("/class-browser/create-accessors")
    def class_browser_create_accessors():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400

        getter = f"{variable_name}\n^ {variable_name}"
        setter = f"{variable_name}: anObject\n{variable_name} := anObject"
        try:
            with request_session(read_only=False) as session:
                result = eval_str(
                    session,
                    f"| cls getter setter |\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls isNil ifTrue: [ 'Error: class not found' ] ifFalse: [\n"
                    f"  getter := '{escape_st(getter)}'.\n"
                    f"  setter := '{escape_st(setter)}'.\n"
                    "  [\n"
                    "    cls compileMethod: getter category: 'accessing' asSymbol.\n"
                    "    cls compileMethod: setter category: 'accessing' asSymbol.\n"
                    "    'Success'\n"
                    "  ] on: Error do: [:e | 'Error: ' , e messageText ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = str(result or "Success")
        success = not message.startswith("Error:")
        return jsonify(
            success=success,
            result=message if success else None,
            exception=None if success else message,
            category="accessing" if success else None,
            getterSelector=variable_name if success else None,
            setterSelector=f"{variable_name}:" if success else None,
        )
