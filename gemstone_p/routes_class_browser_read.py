from __future__ import annotations

from flask import jsonify, request


def register_class_browser_read_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    as_bool_arg_fn,
    cb_dict_expr_fn,
    cb_behavior_expr_fn,
    cb_error_payload_message_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    as_bool_arg = as_bool_arg_fn
    cb_dict_expr = cb_dict_expr_fn
    cb_behavior_expr = cb_behavior_expr_fn

    @app.get("/class-browser/dictionaries")
    def class_browser_dictionaries():
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | stream |\n"
                    "stream := WriteStream on: String new.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    "  stream nextPutAll: (([dict name] on: Error do: [:e | dict printString]) asString); lf\n"
                    "].\n"
                    "stream contents\n"
                    "] value"
                )
                dictionaries = [line.strip() for line in str(raw).splitlines() if line.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, dictionaries=dictionaries)

    @app.post("/class-browser/inspect-target")
    def class_browser_inspect_target():
        data = request.get_json(force=True) or {}
        mode = str(data.get("mode", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        class_name = str(data.get("className", "")).strip()
        selector = str(data.get("selector", "")).strip()
        meta = bool(data.get("meta"))
        if mode == "dictionary":
            if not dictionary:
                return jsonify(success=False, exception="missing dictionary"), 400
            expr = cb_dict_expr(dictionary)
            label = dictionary
        elif mode == "class":
            if not class_name:
                return jsonify(success=False, exception="missing class"), 400
            expr = cb_behavior_expr(class_name, meta, dictionary)
            label = f"{class_name} class" if meta else class_name
        elif mode == "instances":
            if not class_name:
                return jsonify(success=False, exception="missing class"), 400
            expr = f"({cb_behavior_expr(class_name, False, dictionary)} allInstances)"
            label = f"{class_name} allInstances"
        elif mode == "method":
            if not class_name or not selector:
                return jsonify(success=False, exception="missing class or selector"), 400
            expr = (
                "[ | cls |\n"
                f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                "cls ifNil: [ nil ] ifNotNil: [\n"
                f"  [cls compiledMethodAt: '{escape_st(selector)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil]\n"
                "]\n"
                "] value"
            )
            label = f"{class_name} class >> {selector}" if meta else f"{class_name} >> {selector}"
        else:
            return jsonify(success=False, exception="unsupported inspect target"), 400

        try:
            with request_session() as session:
                oop = int(session.eval_oop(expr))
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        if oop <= 20:
            return jsonify(success=False, exception=f"nothing to inspect for {label}"), 200
        return jsonify(success=True, oop=oop, label=label)

    @app.get("/class-browser/class-location")
    def class_browser_class_location():
        class_name = request.args.get("class", "").strip()
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | rows encode |\n"
                    f"{encode_src}\n"
                    "rows := OrderedCollection new.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    f"  (dict includesKey: '{escape_st(class_name)}' asSymbol) ifTrue: [\n"
                    f"    | value dictName |\n"
                    f"    value := dict at: '{escape_st(class_name)}' asSymbol.\n"
                    "    (value isBehavior) ifTrue: [\n"
                    "      dictName := (([dict name] on: Error do: [:e | dict printString]) asString).\n"
                    "      rows add: (encode value: dictName)\n"
                    "    ]\n"
                    "  ]\n"
                    "].\n"
                    "(String streamContents: [:stream |\n"
                    "  rows asSortedCollection do: [:row | stream nextPutAll: row; lf ]\n"
                    "])\n"
                    "] value"
                )
                matches = []
                for line in str(raw).splitlines():
                    dictionary = decode_field(line.strip())
                    if not dictionary:
                        continue
                    matches.append({"className": class_name, "dictionary": dictionary})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        dictionary = matches[0]["dictionary"] if len(matches) == 1 else ""
        return jsonify(success=True, dictionary=dictionary, matches=matches)

    @app.get("/class-browser/classes")
    def class_browser_classes():
        dictionary = request.args.get("dictionary", "").strip()
        if not dictionary:
            return jsonify(success=False, exception="missing dictionary"), 400
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | dict stream classNames |\n"
                    f"dict := {cb_dict_expr(dictionary)}.\n"
                    "stream := WriteStream on: String new.\n"
                    "dict ifNil: [ '' ] ifNotNil: [\n"
                    "  classNames := dict keys select: [:each | (dict at: each) isBehavior].\n"
                    "  classNames asSortedCollection do: [:cls | stream nextPutAll: cls asString; lf].\n"
                    "  stream contents\n"
                    "]\n"
                    "] value"
                )
                classes = [line.strip() for line in str(raw).splitlines() if line.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, classes=classes)

    @app.get("/class-browser/categories")
    def class_browser_categories():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        meta = as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | cls stream |\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "stream := WriteStream on: String new.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    "  cls categoryNames asSortedCollection do: [:cat | stream nextPutAll: cat asString; lf].\n"
                    "  stream contents\n"
                    "]\n"
                    "] value"
                )
                categories = [line.strip() for line in str(raw).splitlines() if line.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, categories=["-- all --", *categories])

    @app.get("/class-browser/methods")
    def class_browser_methods():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        protocol = request.args.get("protocol", "-- all --").strip() or "-- all --"
        meta = as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | cls stream sels |\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "stream := WriteStream on: String new.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    f"  sels := '{escape_st(protocol)}' = '-- all --'\n"
                    "    ifTrue: [ cls selectors ]\n"
                    f"    ifFalse: [ cls selectorsIn: '{escape_st(protocol)}' asSymbol ].\n"
                    "  sels ifNil: [ sels := #() ].\n"
                    "  sels asSortedCollection do: [:sel | stream nextPutAll: sel asString; lf].\n"
                    "  stream contents\n"
                    "]\n"
                    "] value"
                )
                methods = [line.strip() for line in str(raw).splitlines() if line.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, methods=methods)

    @app.get("/class-browser/source")
    def class_browser_source():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        selector = request.args.get("selector", "").strip()
        meta = as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session() as session:
                source = eval_str(
                    session,
                    f"| cls meth |\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    f"  '{escape_st(selector)}' isEmpty\n"
                    "    ifTrue: [\n"
                    "      (cls respondsTo: #definition)\n"
                    "        ifTrue: [[cls definition asString] on: Error do: [:e | cls printString]]\n"
                    "        ifFalse: [cls printString]\n"
                    "    ]\n"
                    "    ifFalse: [\n"
                    f"      meth := cls compiledMethodAt: '{escape_st(selector)}' asSymbol ifAbsent: [nil].\n"
                    "      meth ifNil: [ '' ] ifNotNil: [[meth sourceString] on: Error do: [:e | '']]\n"
                    "    ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, source=str(source))
