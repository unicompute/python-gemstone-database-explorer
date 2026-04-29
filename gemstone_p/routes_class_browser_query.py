from __future__ import annotations

from flask import jsonify, request


def register_class_browser_query_routes(
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
                    "[ | cls rows symbolList encode current |\n"
                    f"{encode_src}\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "rows := OrderedCollection new.\n"
                    "symbolList := System myUserProfile symbolList.\n"
                    "current := cls.\n"
                    "[ current notNil ] whileTrue: [\n"
                    "  | c clsName dictName |\n"
                    "  c := current.\n"
                    "  clsName := [c name asString] on: Error do: [:e | c printString].\n"
                    "  dictName := ''.\n"
                    "  symbolList do: [:dict |\n"
                    "    | value |\n"
                    "    dictName isEmpty ifTrue: [\n"
                    "      value := [dict at: clsName asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "      value == c ifTrue: [\n"
                    "        dictName := ([dict name] on: Error do: [:e | dict printString]) asString\n"
                    "      ]\n"
                    "    ]\n"
                    "  ].\n"
                    "  rows add: ((encode value: clsName), Character tab asString, (encode value: dictName)).\n"
                    "  current := [c superclass] on: Error do: [:e | nil]\n"
                    "].\n"
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
