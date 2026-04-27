from __future__ import annotations

from flask import jsonify, request


def register_class_browser_routes(
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
    cb_error_payload_message = cb_error_payload_message_fn

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
        return jsonify(
            success=True,
            result=f"Added {created_dict}",
            dictionary=created_dict,
        )

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
        return jsonify(
            success=True,
            result=f"Renamed {dictionary} to {renamed_dict}",
            dictionary=renamed_dict,
        )

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
        return jsonify(
            success=True,
            result=f"Removed {removed_dict}",
            dictionary=removed_dict,
        )

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

    @app.get("/class-browser/hierarchy")
    def class_browser_hierarchy():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | cls rows symbolList encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "rows := OrderedCollection new.\n"
                    "symbolList := System myUserProfile symbolList.\n"
                    "cls ifNotNil: [ cls withAllSuperclasses reverseDo: [:c |\n"
                    "  | clsName dictName |\n"
                    "  clsName := [c name asString] on: Error do: [:e | c printString].\n"
                    "  dictName := ''.\n"
                    "  symbolList do: [:dict |\n"
                    "    | value |\n"
                    "    dictName isEmpty ifTrue: [\n"
                    "      value := [dict at: clsName asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "      value == c ifTrue: [\n"
                    "        dictName := ([[dict name] on: Error do: [:e | dict printString]] asString)\n"
                    "      ]\n"
                    "    ]\n"
                    "  ].\n"
                    "  rows add: ((encode value: clsName), Character tab asString, (encode value: dictName))\n"
                    "] ].\n"
                    "(String streamContents: [:stream |\n"
                    "  rows do: [:line | stream nextPutAll: line; lf ]\n"
                    "])\n"
                    "] value"
                )
                hierarchy = []
                for line in str(raw).splitlines():
                    if "\t" not in line:
                        continue
                    cls_name, _, dict_name = line.partition("\t")
                    hierarchy.append({
                        "className": decode_field(cls_name),
                        "dictionary": decode_field(dict_name),
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, hierarchy=hierarchy)

    @app.get("/class-browser/versions")
    def class_browser_versions():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        selector = request.args.get("selector", "").strip()
        meta = as_bool_arg(request.args.get("meta"))
        if not class_name or not selector:
            return jsonify(success=False, exception="missing class or selector"), 400
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    f"| cls sel stream versions src oopText encode |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"sel := '{escape_st(selector)}' asSymbol.\n"
                    "stream := WriteStream on: String new.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    "  versions := (cls respondsTo: #allVersionsOf:)\n"
                    "    ifTrue: [[cls allVersionsOf: sel] on: Error do: [#()]]\n"
                    "    ifFalse: [#()].\n"
                    "  versions isEmpty\n"
                    "    ifTrue: [\n"
                    "      | method |\n"
                    "      method := [cls compiledMethodAt: sel ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "      src := [method ifNil: [''] ifNotNil: [[method sourceString] on: Error do: [:e | '']]] on: Error do: [:e | ''].\n"
                    "      oopText := [method ifNil: [''] ifNotNil: [[method asOop printString] on: Error do: [:e | '']]] on: Error do: [:e | ''].\n"
                    "      src isEmpty ifFalse: [\n"
                    "        stream nextPutAll: (encode value: 'version 1');\n"
                    "          nextPut: $|;\n"
                    "          nextPutAll: (encode value: src);\n"
                    "          nextPut: $|;\n"
                    "          nextPutAll: (encode value: oopText);\n"
                    "          lf\n"
                    "      ]\n"
                    "    ]\n"
                    "    ifFalse: [\n"
                    "      1 to: versions size do: [:ix |\n"
                    "        | method |\n"
                    "        method := versions at: ix.\n"
                    "        src := [[method sourceString] on: Error do: [:e | '']].\n"
                    "        oopText := [[method asOop printString] on: Error do: [:e | '']].\n"
                    "        stream nextPutAll: (encode value: 'version ', ix printString);\n"
                    "          nextPut: $|;\n"
                    "          nextPutAll: (encode value: src);\n"
                    "          nextPut: $|;\n"
                    "          nextPutAll: (encode value: oopText);\n"
                    "          lf\n"
                    "      ]\n"
                    "    ]\n"
                    "].\n"
                    "stream contents"
                )
                versions = []
                for line in str(raw).splitlines():
                    if "|" not in line:
                        continue
                    parts = str(line).split("|", 2)
                    label = decode_field(parts[0]) if len(parts) > 0 else ""
                    source = decode_field(parts[1]) if len(parts) > 1 else ""
                    method_oop = decode_field(parts[2]) if len(parts) > 2 else ""
                    versions.append({
                        "label": label,
                        "source": source,
                        "methodOop": int(method_oop) if method_oop.isdigit() else None,
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, versions=versions)

    @app.get("/class-browser/query")
    def class_browser_query():
        selector = request.args.get("selector", "").strip()
        mode = request.args.get("mode", "").strip()
        root_class_name = request.args.get("rootClassName", "").strip()
        root_dictionary = request.args.get("rootDictionary", "").strip()
        query_meta = as_bool_arg(request.args.get("meta"))
        scope = request.args.get("hierarchyScope", "full").strip() or "full"
        valid_modes = {"implementors", "senders", "references", "methodText", "hierarchyImplementors", "hierarchySenders"}
        if not selector:
            return jsonify(success=False, exception="missing selector"), 400
        if mode not in valid_modes:
            return jsonify(success=False, exception="unsupported query mode"), 400

        escaped_selector = escape_st(selector)
        escaped_scope = escape_st(scope)
        selector_expr = (
            "sels := OrderedCollection new.\n"
            "      [ cls selectors do: [:candidate |\n"
            "          (candidate asString = token) ifTrue: [ sels add: candidate ]\n"
            "        ] ] on: Error do: [:e | ]."
            if mode in {"implementors", "hierarchyImplementors"}
            else "sels := OrderedCollection new.\n"
                 "      [ cls selectors do: [:candidate |\n"
                 "          | src |\n"
                 "          src := [ (cls compiledMethodAt: candidate) sourceString ] on: Error do: [:e | '' ].\n"
                 "          (src notNil and: [ src asString includesSubstring: token ]) ifTrue: [ sels add: candidate ]\n"
                 "        ] ] on: Error do: [:e | ]."
        )
        class_filter_expr = (
            "      (rootClass notNil) ifTrue: [\n"
            "        | withinHierarchy isSuper isThis isSub |\n"
            "        withinHierarchy := (cls withAllSuperclasses includes: rootClass)\n"
            "          or: [ rootClass withAllSuperclasses includes: cls ].\n"
            "        isSuper := (cls ~~ rootClass) and: [ rootClass withAllSuperclasses includes: cls ].\n"
            "        isThis := cls == rootClass.\n"
            "        isSub := (cls ~~ rootClass) and: [ cls withAllSuperclasses includes: rootClass ].\n"
            "        withinHierarchy ifFalse: [ sels := #() ].\n"
            "        withinHierarchy ifTrue: [\n"
            "          (scope = 'super' and: [ isSuper not ]) ifTrue: [ sels := #() ].\n"
            "          (scope = 'this' and: [ isThis not ]) ifTrue: [ sels := #() ].\n"
            "          (scope = 'sub' and: [ isSub not ]) ifTrue: [ sels := #() ]\n"
            "        ]\n"
            "      ].\n"
            if mode in {"hierarchyImplementors", "hierarchySenders"}
            else ""
        )
        try:
            with request_session() as session:
                raw = eval_str(
                    session,
                    "[ | sel token classes stream rootClass scope encode queryMeta |\n"
                    f"{encode_src}\n"
                    f"sel := '{escaped_selector}' asSymbol.\n"
                    f"token := '{escaped_selector}'.\n"
                    f"scope := '{escaped_scope}'.\n"
                    f"queryMeta := {'true' if query_meta else 'false'}.\n"
                    "stream := WriteStream on: String new.\n"
                    "classes := OrderedCollection new.\n"
                    f"rootClass := {'nil' if not root_class_name else cb_behavior_expr(root_class_name, query_meta, root_dictionary)}.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    "  | dictName |\n"
                    "  dictName := ([[dict name] on: Error do: [:e | dict printString]] asString).\n"
                    "  dict keysAndValuesDo: [:k :v |\n"
                    "    (v isBehavior) ifTrue: [\n"
                    "      | cls |\n"
                    "      cls := queryMeta ifTrue: [v class] ifFalse: [v].\n"
                    "      classes add: { dictName. k asString. cls }\n"
                    "    ]\n"
                    "  ]\n"
                    "].\n"
                    "classes asArray do: [:entry |\n"
                    "  | cls dictName className sels |\n"
                    "  dictName := entry first.\n"
                    "  className := entry second.\n"
                    "  cls := entry third.\n"
                    f"  {selector_expr}\n"
                    f"{class_filter_expr}"
                    "  sels do: [:s |\n"
                    "    stream nextPutAll: (encode value: dictName); nextPut: $|; nextPutAll: (encode value: className); nextPut: $|; nextPutAll: (encode value: (queryMeta ifTrue: ['1'] ifFalse: ['0'])); nextPut: $|; nextPutAll: (encode value: s asString); lf\n"
                    "  ]\n"
                    "].\n"
                    "stream contents\n"
                    "] value"
                )
                results = []
                for line in str(raw).splitlines():
                    fields = line.split("|")
                    if len(fields) < 4:
                        continue
                    dictionary = decode_field(fields[0])
                    class_name = decode_field(fields[1])
                    is_meta = decode_field(fields[2]) == "1"
                    selector_name = decode_field(fields[3])
                    results.append({
                        "label": f"{class_name}{' class' if is_meta else ''}>>{selector_name}",
                        "className": class_name,
                        "selector": selector_name,
                        "meta": is_meta,
                        "dictionary": dictionary,
                    })
                results.sort(key=lambda item: item["label"])
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, results=results)

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
        return jsonify(
            success=True,
            result=f"Added category {added_category}",
            category=added_category,
        )

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

    def _class_browser_variable_operation(
        *,
        class_name: str,
        dictionary: str,
        variable_name: str,
        target_variable_name: str = "",
        variable_kind: str,
        operation: str,
    ) -> str:
        if variable_kind == "instance":
            target_setup = "target := cls.\n"
            add_selector = "#addInstVarName:"
            remove_selector = "#removeInstVar:"
            unsupported = "instance variable edits unsupported"
            add_stmt = lambda name: f"target addInstVarName: '{escape_st(name)}' asSymbol."
            remove_stmt = lambda name: f"target removeInstVar: '{escape_st(name)}'."
        elif variable_kind == "class":
            target_setup = "target := cls.\n"
            add_selector = "#addClassVarName:"
            remove_selector = "#removeClassVarName:"
            unsupported = "class variable edits unsupported"
            add_stmt = lambda name: f"target addClassVarName: '{escape_st(name)}' asSymbol."
            remove_stmt = lambda name: f"target removeClassVarName: '{escape_st(name)}'."
        elif variable_kind == "class-instance":
            target_setup = "target := cls ifNil: [nil] ifNotNil: [:base | base class].\n"
            add_selector = "#addInstVarName:"
            remove_selector = "#removeInstVar:"
            unsupported = "class instance variable edits unsupported"
            add_stmt = lambda name: f"target addInstVarName: '{escape_st(name)}' asSymbol."
            remove_stmt = lambda name: f"target removeInstVar: '{escape_st(name)}'."
        else:
            raise ValueError(f"unsupported variable kind: {variable_kind}")

        support_lines = []
        action_lines = []
        if operation in {"add", "rename"}:
            support_lines.append(
                f"    (target respondsTo: {add_selector}) ifFalse: [ Error signal: '{unsupported}' ]."
            )
        if operation in {"remove", "rename"}:
            support_lines.append(
                f"    (target respondsTo: {remove_selector}) ifFalse: [ Error signal: '{unsupported}' ]."
            )
        if operation == "add":
            action_lines.append(f"    {add_stmt(variable_name)}")
        elif operation == "remove":
            action_lines.append(f"    {remove_stmt(variable_name)}")
        elif operation == "rename":
            action_lines.append(f"    {add_stmt(target_variable_name)}")
            action_lines.append(f"    {remove_stmt(variable_name)}")
        else:
            raise ValueError(f"unsupported variable operation: {operation}")

        if operation == "rename":
            success_payload = (
                f"'OK|' , (encode value: '{escape_st(variable_name)}') , '|' , "
                f"(encode value: '{escape_st(target_variable_name)}')"
            )
        else:
            success_name = target_variable_name if operation == "add" and target_variable_name else variable_name
            success_payload = f"'OK|' , (encode value: '{escape_st(success_name)}')"

        script = (
            f"| cls target opResult encode |\n"
            f"{encode_src}\n"
            f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
            f"{target_setup}"
            "target isNil ifTrue: [\n"
            "  'ERROR|' , (encode value: 'class not found')\n"
            "] ifFalse: [\n"
            "  opResult := [\n"
            f"{chr(10).join(support_lines)}\n"
            f"{chr(10).join(action_lines)}\n"
            "    true\n"
            "  ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
            "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
            "    opResult\n"
            "  ] ifFalse: [\n"
            f"    {success_payload}\n"
            "  ]\n"
            "]"
        )
        with request_session(read_only=False) as session:
            return eval_str(session, script)

    @app.post("/class-browser/add-instance-variable")
    def class_browser_add_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                variable_kind="instance",
                operation="add",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Instance variable creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_name = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Added instance variable {added_name}",
            variableName=added_name,
        )

    @app.post("/class-browser/add-class-variable")
    def class_browser_add_class_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                variable_kind="class",
                operation="add",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class variable creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_name = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Added class variable {added_name}",
            variableName=added_name,
        )

    @app.post("/class-browser/add-class-instance-variable")
    def class_browser_add_class_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                variable_kind="class-instance",
                operation="add",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class instance variable creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_name = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Added class instance variable {added_name}",
            variableName=added_name,
        )

    @app.post("/class-browser/rename-instance-variable")
    def class_browser_rename_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        target_variable_name = str(data.get("targetVariableName", "")).strip()
        if not class_name or not variable_name or not target_variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                target_variable_name=target_variable_name,
                variable_kind="instance",
                operation="rename",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Instance variable rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        old_name = decode_field(fields[1]) if len(fields) > 1 else variable_name
        new_name = decode_field(fields[2]) if len(fields) > 2 else target_variable_name
        return jsonify(
            success=True,
            result=f"Renamed instance variable {old_name} to {new_name}",
            variableName=old_name,
            targetVariableName=new_name,
        )

    @app.post("/class-browser/remove-instance-variable")
    def class_browser_remove_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                variable_kind="instance",
                operation="remove",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Instance variable removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_name = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Removed instance variable {removed_name}",
            variableName=removed_name,
        )

    @app.post("/class-browser/rename-class-variable")
    def class_browser_rename_class_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        target_variable_name = str(data.get("targetVariableName", "")).strip()
        if not class_name or not variable_name or not target_variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                target_variable_name=target_variable_name,
                variable_kind="class",
                operation="rename",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class variable rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        old_name = decode_field(fields[1]) if len(fields) > 1 else variable_name
        new_name = decode_field(fields[2]) if len(fields) > 2 else target_variable_name
        return jsonify(
            success=True,
            result=f"Renamed class variable {old_name} to {new_name}",
            variableName=old_name,
            targetVariableName=new_name,
        )

    @app.post("/class-browser/remove-class-variable")
    def class_browser_remove_class_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                variable_kind="class",
                operation="remove",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class variable removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_name = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Removed class variable {removed_name}",
            variableName=removed_name,
        )

    @app.post("/class-browser/rename-class-instance-variable")
    def class_browser_rename_class_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        target_variable_name = str(data.get("targetVariableName", "")).strip()
        if not class_name or not variable_name or not target_variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                target_variable_name=target_variable_name,
                variable_kind="class-instance",
                operation="rename",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class instance variable rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        old_name = decode_field(fields[1]) if len(fields) > 1 else variable_name
        new_name = decode_field(fields[2]) if len(fields) > 2 else target_variable_name
        return jsonify(
            success=True,
            result=f"Renamed class instance variable {old_name} to {new_name}",
            variableName=old_name,
            targetVariableName=new_name,
        )

    @app.post("/class-browser/remove-class-instance-variable")
    def class_browser_remove_class_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            raw = _class_browser_variable_operation(
                class_name=class_name,
                dictionary=dictionary,
                variable_name=variable_name,
                variable_kind="class-instance",
                operation="remove",
            )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = cb_error_payload_message(raw, "Class instance variable removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_name = decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Removed class instance variable {removed_name}",
            variableName=removed_name,
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
        return jsonify(
            success=True,
            result=f"Moved {moved_class} to {moved_dict}",
            className=moved_class,
            dictionary=moved_dict,
        )

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
        return jsonify(
            success=True,
            result=f"Removed {removed_class}",
            className=removed_class,
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
        return jsonify(
            success=True,
            result=f"Moved {moved_selector} to {moved_category}",
            selector=moved_selector,
            category=moved_category,
        )

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
        return jsonify(
            success=True,
            result=f"Removed {removed_selector}",
            selector=removed_selector,
        )

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

    @app.get("/class-browser/file-out")
    def class_browser_file_out():
        mode = request.args.get("mode", "class").strip() or "class"
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        selector = request.args.get("selector", "").strip()
        meta = as_bool_arg(request.args.get("meta"))
        valid_modes = {"class", "class-methods", "dictionary", "dictionary-methods", "method"}
        if mode not in valid_modes:
            return jsonify(success=False, exception="unsupported file-out mode"), 400
        if mode in {"class", "class-methods", "method"} and not class_name:
            return jsonify(success=False, exception="missing class"), 400
        if mode.startswith("dictionary") and not dictionary:
            return jsonify(success=False, exception="missing dictionary"), 400
        if mode == "method" and not selector:
            return jsonify(success=False, exception="missing selector"), 400

        meta_suffix = "-class" if meta and mode.startswith("class") else ""
        default_filename = {
            "class": f"{class_name}{meta_suffix}.st",
            "class-methods": f"{class_name}{meta_suffix}-methods.st",
            "dictionary": f"{dictionary}.st",
            "dictionary-methods": f"{dictionary}-methods.st",
            "method": f"{class_name}{meta_suffix}-{selector}.st",
        }[mode]

        if mode == "class":
            script = (
                "[ | cls stream |\n"
                f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                "stream := WriteStream on: String new.\n"
                "cls ifNil: [ '' ] ifNotNil: [\n"
                "  (cls respondsTo: #definition) ifTrue: [ stream nextPutAll: cls definition asString; lf; lf ].\n"
                "  cls selectors asSortedCollection do: [:sel |\n"
                "    | src |\n"
                "    src := [ (cls compiledMethodAt: sel) sourceString ] on: Error do: [:e | '' ].\n"
                "    src isEmpty ifFalse: [ stream nextPutAll: src; lf; lf ]\n"
                "  ].\n"
                "  stream contents\n"
                "]\n"
                "] value"
            )
        elif mode == "class-methods":
            script = (
                "[ | cls stream |\n"
                f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                "stream := WriteStream on: String new.\n"
                "cls ifNil: [ '' ] ifNotNil: [\n"
                "  cls selectors asSortedCollection do: [:sel |\n"
                "    | src |\n"
                "    src := [ (cls compiledMethodAt: sel) sourceString ] on: Error do: [:e | '' ].\n"
                "    src isEmpty ifFalse: [ stream nextPutAll: src; lf; lf ]\n"
                "  ].\n"
                "  stream contents\n"
                "]\n"
                "] value"
            )
        elif mode == "dictionary":
            script = (
                "[ | dict stream classes |\n"
                f"dict := {cb_dict_expr(dictionary)}.\n"
                "stream := WriteStream on: String new.\n"
                "dict ifNil: [ '' ] ifNotNil: [\n"
                "  classes := dict keys select: [:k | (dict at: k) isBehavior].\n"
                "  classes asSortedCollection do: [:nm |\n"
                "    | cls |\n"
                "    cls := dict at: nm.\n"
                "    (cls respondsTo: #definition) ifTrue: [ stream nextPutAll: cls definition asString; lf; lf ].\n"
                "    cls selectors asSortedCollection do: [:sel |\n"
                "      | src |\n"
                "      src := [ (cls compiledMethodAt: sel) sourceString ] on: Error do: [:e | '' ].\n"
                "      src isEmpty ifFalse: [ stream nextPutAll: src; lf; lf ]\n"
                "    ]\n"
                "  ].\n"
                "  stream contents\n"
                "]\n"
                "] value"
            )
        elif mode == "dictionary-methods":
            script = (
                "[ | dict stream classes |\n"
                f"dict := {cb_dict_expr(dictionary)}.\n"
                "stream := WriteStream on: String new.\n"
                "dict ifNil: [ '' ] ifNotNil: [\n"
                "  classes := dict keys select: [:k | (dict at: k) isBehavior].\n"
                "  classes asSortedCollection do: [:nm |\n"
                "    | cls |\n"
                "    cls := dict at: nm.\n"
                "    cls selectors asSortedCollection do: [:sel |\n"
                "      | src |\n"
                "      src := [ (cls compiledMethodAt: sel) sourceString ] on: Error do: [:e | '' ].\n"
                "      src isEmpty ifFalse: [ stream nextPutAll: src; lf; lf ]\n"
                "    ]\n"
                "  ].\n"
                "  stream contents\n"
                "]\n"
                "] value"
            )
        else:
            script = (
                "[ | cls src |\n"
                f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                "cls ifNil: [ '' ] ifNotNil: [\n"
                f"  src := [ (cls compiledMethodAt: '{escape_st(selector)}' asSymbol) sourceString ] on: Error do: [:e | '' ].\n"
                "  src ifNil: [ '' ] ifNotNil: [ src asString ]\n"
                "]\n"
                "] value"
            )

        try:
            with request_session() as session:
                source = eval_str(session, script)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, filename=default_filename, source=str(source))

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
