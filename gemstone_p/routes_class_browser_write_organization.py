from __future__ import annotations

from flask import jsonify, request


def register_class_browser_write_organization_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    cb_behavior_expr_fn,
    cb_error_payload_message_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    cb_behavior_expr = cb_behavior_expr_fn
    cb_error_payload_message = cb_error_payload_message_fn

    @app.post("/class-browser/add-category")
    def class_browser_add_category():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        category = str(data.get("category", "")).strip()
        meta = bool(data.get("meta"))
        if not class_name or not category:
            return jsonify(success=False, exception="missing class or category"), 400
        if category == "-- all --":
            return jsonify(success=False, exception="choose a real category name"), 200
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls categoryName existing opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"categoryName := '{escape_st(category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  existing := [[cls categoryNames collect: [:each | each asString]] on: Error do: [:e | #()]].\n"
                    "  (existing includes: categoryName) ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'category already exists')\n"
                    "  ] ifFalse: [\n"
                    "    opResult := [[cls addCategory: categoryName asSymbol. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)]].\n"
                    "    ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "      opResult\n"
                    "    ] ifFalse: [\n"
                    "      'OK|' , (encode value: categoryName)\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Category creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_category = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else category
        return jsonify(success=True, result=f"Added category {added_category}", category=added_category)

    @app.post("/class-browser/rename-category")
    def class_browser_rename_category():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        category = str(data.get("category", "")).strip()
        target_category = str(data.get("targetCategory", "")).strip()
        meta = bool(data.get("meta"))
        if not class_name or not category or not target_category:
            return jsonify(success=False, exception="missing class or category"), 400
        if category == "-- all --":
            return jsonify(success=False, exception="select a category first"), 200
        if category == target_category:
            return jsonify(success=False, exception="choose a different category name"), 200
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls sels moved targetCategory opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"targetCategory := '{escape_st(target_category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  sels := [cls selectorsIn: '{escape_st(category)}' asSymbol] on: Error do: [:e | #()].\n"
                    "  sels isEmpty ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'category is empty or not found')\n"
                    "  ] ifFalse: [\n"
                    "    moved := 0.\n"
                    "    opResult := [sels do: [:sel |\n"
                    "      | src compileResult |\n"
                    "      src := [[(cls compiledMethodAt: sel) sourceString] on: Error do: [:e | '']] ifNil: [''].\n"
                    "      src isEmpty ifTrue: [ Error signal: 'method source unavailable' ].\n"
                    "      compileResult := cls compileMethod: src category: targetCategory asSymbol.\n"
                    "      (compileResult isKindOf: Array) ifTrue: [ Error signal: 'Category rename failed' ].\n"
                    "      moved := moved + 1\n"
                    "    ]] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "    ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "      opResult\n"
                    "    ] ifFalse: [\n"
                    "      'OK|' , (encode value: moved printString) , '|' , (encode value: targetCategory)\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Category rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_count = decode_field(fields[1]) if len(fields) > 1 else "0"
        moved_category = decode_field(fields[2]) if len(fields) > 2 else target_category
        return jsonify(
            success=True,
            result=f"Renamed {category} to {moved_category}",
            category=moved_category,
            movedCount=int(moved_count or "0"),
        )

    @app.post("/class-browser/move-method")
    def class_browser_move_method():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        selector = str(data.get("selector", "")).strip()
        category = str(data.get("category", "")).strip()
        meta = bool(data.get("meta"))
        if not class_name or not selector or not category:
            return jsonify(success=False, exception="missing class, selector, or category"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls meth src compileResult targetCategory encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"targetCategory := '{escape_st(category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  meth := [cls compiledMethodAt: '{escape_st(selector)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "  meth isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'method not found')\n"
                    "  ] ifFalse: [\n"
                    "    src := [[meth sourceString] on: Error do: [:e | '']] ifNil: [''].\n"
                    "    src isEmpty ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'method source unavailable')\n"
                    "    ] ifFalse: [\n"
                    "      compileResult := [cls compileMethod: src category: targetCategory asSymbol] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "      ((compileResult isString) and: [compileResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "        compileResult\n"
                    "      ] ifFalse: [\n"
                    "        (compileResult isKindOf: Array) ifTrue: [\n"
                    "          'ERROR|' , (encode value: 'Method move failed')\n"
                    "        ] ifFalse: [\n"
                    f"          'OK|' , (encode value: '{escape_st(selector)}') , '|' , (encode value: targetCategory)\n"
                    "        ]\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Method move failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_selector = decode_field(fields[1]) if len(fields) > 1 else selector
        moved_category = decode_field(fields[2]) if len(fields) > 2 else category
        return jsonify(success=True, result=f"Moved {moved_selector} to {moved_category}", selector=moved_selector, category=moved_category)

    @app.post("/class-browser/remove-method")
    def class_browser_remove_method():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        selector = str(data.get("selector", "")).strip()
        meta = bool(data.get("meta"))
        if not class_name or not selector:
            return jsonify(success=False, exception="missing class or selector"), 400
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  (([cls includesSelector: '{escape_st(selector)}' asSymbol] on: Error do: [:e | false]) not) ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'method not found')\n"
                    "  ] ifFalse: [\n"
                    f"    opResult := [cls removeSelector: '{escape_st(selector)}' asSymbol. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "    ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "      opResult\n"
                    "    ] ifFalse: [\n"
                    f"      'OK|' , (encode value: '{escape_st(selector)}')\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Method removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_selector = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else selector
        return jsonify(success=True, result=f"Removed {removed_selector}", selector=removed_selector)

    @app.post("/class-browser/remove-category")
    def class_browser_remove_category():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        category = str(data.get("category", "")).strip()
        meta = bool(data.get("meta"))
        if not class_name or not category:
            return jsonify(success=False, exception="missing class or category"), 400
        if category == "-- all --":
            return jsonify(success=False, exception="select a category first"), 200
        target_category = "as yet unclassified"
        try:
            with request_session(read_only=False) as session:
                raw = eval_str(
                    session,
                    f"| cls sels moved targetCategory opResult encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"targetCategory := '{escape_st(target_category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  sels := [cls selectorsIn: '{escape_st(category)}' asSymbol] on: Error do: [:e | #()].\n"
                    "  sels isEmpty ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'category is empty or not found')\n"
                    "  ] ifFalse: [\n"
                    "    moved := 0.\n"
                    "    opResult := [sels do: [:sel |\n"
                    "      | src compileResult |\n"
                    "      src := [[(cls compiledMethodAt: sel) sourceString] on: Error do: [:e | '']] ifNil: [''].\n"
                    "      src isEmpty ifTrue: [ Error signal: 'method source unavailable' ].\n"
                    "      compileResult := cls compileMethod: src category: targetCategory asSymbol.\n"
                    "      (compileResult isKindOf: Array) ifTrue: [ Error signal: 'Category move failed' ].\n"
                    "      moved := moved + 1\n"
                    "    ]] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "    ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "      opResult\n"
                    "    ] ifFalse: [\n"
                    "      'OK|' , (encode value: moved printString) , '|' , (encode value: targetCategory)\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Category removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_count = decode_field(fields[1]) if len(fields) > 1 else "0"
        moved_category = decode_field(fields[2]) if len(fields) > 2 else target_category
        return jsonify(
            success=True,
            result=f"Moved {moved_count} method{'s' if moved_count != '1' else ''} to {moved_category}",
            category=moved_category,
            movedCount=int(moved_count or "0"),
        )
