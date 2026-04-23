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
from gemstone_p.object_view import object_view, eval_in_context, _escape_st, _eval_str
from gemstone_py._smalltalk_batch import (
    object_for_oop_expr,
    escaped_field_encoder_source,
    decode_escaped_field,
)

def _indent_st(source: str, prefix: str = "  ") -> str:
    return "\n".join(f"{prefix}{line}" if line else line for line in source.splitlines())


def _valid_user_collection_expr(var_name: str) -> str:
    return (
        f"(({var_name} notNil) and: [\n"
        f"  (({var_name} respondsTo: #userId) and: [{var_name} respondsTo: #symbolList])\n"
        f"    ifTrue: [true]\n"
        f"    ifFalse: [\n"
        f"      | foundValidUser |\n"
        f"      foundValidUser := false.\n"
        f"      [{var_name} do: [:each |\n"
        f"        ((each respondsTo: #userId) and: [each respondsTo: #symbolList]) ifTrue: [foundValidUser := true]\n"
        f"      ]] on: Error do: [:e | foundValidUser := false].\n"
        f"      foundValidUser\n"
        f"    ]\n"
        f"])"
    )


def _load_user_collection_expr(source_expr: str) -> str:
    return (
        f"allUsers := [{source_expr}] on: Error do: [:e | nil].\n"
        "((allUsers notNil) and: [(allUsers respondsTo: #userId) and: [allUsers respondsTo: #symbolList]]) ifTrue: [\n"
        "  allUsers := Array with: allUsers\n"
        "].\n"
        f"({_valid_user_collection_expr('allUsers')}) ifFalse: [\n"
        "  allUsers := nil\n"
        "]."
    )


# Smalltalk snippet: find a trustworthy AllUsers collection, bind it to `allUsers`
_ALL_USERS_EXPR = (
    "allUsers := nil.\n"
    "allUsers isNil ifTrue: [\n"
    f"{_indent_st(_load_user_collection_expr('System myUserProfile symbolList objectNamed: #AllUsers'))}\n"
    "].\n"
    "allUsers isNil ifTrue: [\n"
    f"{_indent_st(_load_user_collection_expr('Globals at: #AllUsers ifAbsent: [nil]'))}\n"
    "].\n"
    "allUsers isNil ifTrue: [\n"
    f"{_indent_st(_load_user_collection_expr('UserGlobals at: #AllUsers ifAbsent: [nil]'))}\n"
    "].\n"
    "allUsers isNil ifTrue: [\n"
    f"{_indent_st(_load_user_collection_expr('System myUserProfile'))}\n"
    "]."
)

def _all_users_detect_user_expr(escaped_user: str) -> str:
    return (
        "allUsers isNil ifTrue: [nil] ifFalse: [\n"
        f"  allUsers detect: [:x | (([x userId] on: Error do: [:e | x printString]) asString) = '{escaped_user}'] ifNone: [nil]\n"
        "]"
    )


_ENCODE_SRC = escaped_field_encoder_source("encode")


def _behavior_prelude(oop: int, obj_var: str = "obj", behavior_var: str = "behavior") -> str:
    return (
        f"{obj_var} := {object_for_oop_expr(oop)}.\n"
        f"{behavior_var} := (([{obj_var} isBehavior] on: Error do: [:e | false])\n"
        f"  ifTrue: [{obj_var}]\n"
        f"  ifFalse: [[{obj_var} class] on: Error do: [:e | {obj_var}]]).\n"
    )


def _decode_field(value: str) -> str:
    return decode_escaped_field(value)


def _as_bool_arg(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _cb_dict_expr(dict_name: str) -> str:
    return f"(System myUserProfile symbolList objectNamed: '{_escape_st(dict_name)}' asSymbol)"


def _cb_behavior_expr(class_name: str, meta: bool = False) -> str:
    expr = f"(System myUserProfile symbolList objectNamed: '{_escape_st(class_name)}' asSymbol)"
    return f"({expr} class)" if meta else expr


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
                raw = _eval_str(
                    session,
                    f"| obj behavior encode result |\n"
                    f"{_behavior_prelude(oop)}"
                    f"{_ENCODE_SRC}\n"
                    "result := ''.\n"
                    "[behavior categoryNames do: [:cat |\n"
                    "  | selectors |\n"
                    "  selectors := ([behavior selectorsIn: cat] on: Error do: [:e | #()]).\n"
                    "  selectors ifNil: [selectors := #()].\n"
                    "  selectors do: [:sel |\n"
                    "    result := result , 'C|' , (encode value: cat asString) , '|' , (encode value: sel asString) , String lf asString\n"
                    "  ]\n"
                    "]] on: Error do: [:e | ].\n"
                    "[behavior selectors asArray do: [:sel |\n"
                    "  result := result , 'A|' , (encode value: sel asString) , String lf asString\n"
                    "]] on: Error do: [:e | ].\n"
                    "result"
                )
                categories: dict[str, list[str]] = {}
                all_smalltalk: list[str] = []
                for line in str(raw).splitlines():
                    if line.startswith("C|"):
                        _, cat, selector_name = line.split("|", 2)
                        categories.setdefault(_decode_field(cat), []).append(_decode_field(selector_name))
                    elif line.startswith("A|"):
                        _, selector_name = line.split("|", 1)
                        all_smalltalk.append(_decode_field(selector_name))
                result = {
                    category: sorted(set(selectors))
                    for category, selectors in categories.items()
                }
                if all_smalltalk:
                    result["(all Smalltalk)"] = sorted(set(all_smalltalk))
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
                source = _eval_str(
                    session,
                    f"| obj behavior method |\n"
                    f"{_behavior_prelude(oop)}"
                    f"method := ([behavior compiledMethodAt: '{_escape_st(selector)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil]).\n"
                    "method isNil ifTrue: [\n"
                    f"  method := ([behavior lookupSelector: '{_escape_st(selector)}' asSymbol] on: Error do: [:e | nil])\n"
                    "].\n"
                    "method isNil ifTrue: [''] ifFalse: [[method sourceString] on: Error do: [:e | '']]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, result=source)

    # ------------------------------------------------------------------ #
    # Class Browser                                                       #
    # Mirrors the bridge/browser workflow from GbsBrowser                 #
    # ------------------------------------------------------------------ #

    @app.get("/class-browser/dictionaries")
    def class_browser_dictionaries():
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
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

    @app.get("/class-browser/class-location")
    def class_browser_class_location():
        class_name = request.args.get("class", "").strip()
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | found |\n"
                    "found := ''.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    f"  ((found isEmpty) and: [dict includesKey: '{_escape_st(class_name)}' asSymbol]) ifTrue: [\n"
                    f"    | value |\n"
                    f"    value := dict at: '{_escape_st(class_name)}' asSymbol.\n"
                    "    (value isBehavior) ifTrue: [ found := dict name asString ]\n"
                    "  ]\n"
                    "].\n"
                    "found\n"
                    "] value"
                )
                dictionary = str(raw).strip()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, dictionary=dictionary)

    @app.get("/class-browser/classes")
    def class_browser_classes():
        dictionary = request.args.get("dictionary", "").strip()
        if not dictionary:
            return jsonify(success=False, exception="missing dictionary"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | dict stream classNames |\n"
                    f"dict := {_cb_dict_expr(dictionary)}.\n"
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
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | cls stream |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta)}.\n"
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
        protocol = request.args.get("protocol", "-- all --").strip() or "-- all --"
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | cls stream sels |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta)}.\n"
                    "stream := WriteStream on: String new.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    f"  sels := '{_escape_st(protocol)}' = '-- all --'\n"
                    "    ifTrue: [ cls selectors ]\n"
                    f"    ifFalse: [ cls selectorsIn: '{_escape_st(protocol)}' asSymbol ].\n"
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
        selector = request.args.get("selector", "").strip()
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                source = _eval_str(
                    session,
                    f"| cls meth |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta)}.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    f"  '{_escape_st(selector)}' isEmpty\n"
                    "    ifTrue: [\n"
                    "      (cls respondsTo: #definition)\n"
                    "        ifTrue: [[cls definition asString] on: Error do: [:e | cls printString]]\n"
                    "        ifFalse: [cls printString]\n"
                    "    ]\n"
                    "    ifFalse: [\n"
                    f"      meth := cls compiledMethodAt: '{_escape_st(selector)}' asSymbol ifAbsent: [nil].\n"
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
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | cls stream |\n"
                    f"cls := {_cb_behavior_expr(class_name, False)}.\n"
                    "stream := WriteStream on: String new.\n"
                    "cls ifNotNil: [ cls withAllSuperclasses reverseDo: [:c | stream nextPutAll: c name asString; lf ] ].\n"
                    "stream contents\n"
                    "] value"
                )
                hierarchy = [line.strip() for line in str(raw).splitlines() if line.strip()]
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, hierarchy=hierarchy)

    @app.get("/class-browser/versions")
    def class_browser_versions():
        class_name = request.args.get("class", "").strip()
        selector = request.args.get("selector", "").strip()
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name or not selector:
            return jsonify(success=False, exception="missing class or selector"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    f"| cls sel stream versions src encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta)}.\n"
                    f"sel := '{_escape_st(selector)}' asSymbol.\n"
                    "stream := WriteStream on: String new.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    "  versions := (cls respondsTo: #allVersionsOf:)\n"
                    "    ifTrue: [[cls allVersionsOf: sel] on: Error do: [#()]]\n"
                    "    ifFalse: [#()].\n"
                    "  versions isEmpty\n"
                    "    ifTrue: [\n"
                    "      src := [[(cls compiledMethodAt: sel) sourceString] on: Error do: [:e | '']].\n"
                    "      src isEmpty ifFalse: [\n"
                    "        stream nextPutAll: (encode value: 'version 1'); nextPut: $|; nextPutAll: (encode value: src); lf\n"
                    "      ]\n"
                    "    ]\n"
                    "    ifFalse: [\n"
                    "      1 to: versions size do: [:ix |\n"
                    "        | method |\n"
                    "        method := versions at: ix.\n"
                    "        src := [[method sourceString] on: Error do: [:e | '']].\n"
                    "        stream nextPutAll: (encode value: 'version ', ix printString); nextPut: $|; nextPutAll: (encode value: src); lf\n"
                    "      ]\n"
                    "    ]\n"
                    "].\n"
                    "stream contents"
                )
                versions = []
                for line in str(raw).splitlines():
                    if "|" not in line:
                        continue
                    label, _, source = line.partition("|")
                    versions.append({"label": _decode_field(label), "source": _decode_field(source)})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, versions=versions)

    @app.get("/class-browser/query")
    def class_browser_query():
        selector = request.args.get("selector", "").strip()
        mode = request.args.get("mode", "").strip()
        root_class_name = request.args.get("rootClassName", "").strip()
        scope = request.args.get("hierarchyScope", "full").strip() or "full"
        valid_modes = {"implementors", "senders", "references", "hierarchyImplementors", "hierarchySenders"}
        if not selector:
            return jsonify(success=False, exception="missing selector"), 400
        if mode not in valid_modes:
            return jsonify(success=False, exception="unsupported query mode"), 400

        escaped_selector = _escape_st(selector)
        escaped_scope = _escape_st(scope)
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
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | sel token classes stream rootClass scope |\n"
                    f"sel := '{escaped_selector}' asSymbol.\n"
                    f"token := '{escaped_selector}'.\n"
                    f"scope := '{escaped_scope}'.\n"
                    "stream := WriteStream on: String new.\n"
                    "classes := IdentitySet new.\n"
                    f"rootClass := {'nil' if not root_class_name else _cb_behavior_expr(root_class_name, False)}.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    "  dict keysAndValuesDo: [:k :v | (v isBehavior) ifTrue: [ classes add: v ] ]\n"
                    "].\n"
                    "classes asArray do: [:cls |\n"
                    "  | sels |\n"
                    f"  {selector_expr}\n"
                    f"{class_filter_expr}"
                    "  sels do: [:s | stream nextPutAll: cls name asString; nextPutAll: '>>'; nextPutAll: s asString; lf ]\n"
                    "].\n"
                    "stream contents\n"
                    "] value"
                )
                results = sorted(line.strip() for line in str(raw).splitlines() if line.strip())
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, results=results)

    @app.post("/class-browser/compile")
    def class_browser_compile():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        category = str(data.get("category", "as yet unclassified")).strip() or "as yet unclassified"
        source = str(data.get("source", ""))
        meta = bool(data.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        clean_source = source.replace("\r\n", "\n").replace("\r", "\n")
        try:
            with gs_session.request_session(read_only=False) as session:
                result = _eval_str(
                    session,
                    f"| cls source result |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'Error: class not found'\n"
                    "] ifFalse: [\n"
                    f"  source := '{_escape_st(clean_source)}'.\n"
                    f"  result := [ cls compileMethod: source category: '{_escape_st(category)}' asSymbol ] on: Error do: [:e | 'Error: ' , e messageText ].\n"
                    "  (result isKindOf: Array)\n"
                    "    ifTrue: ['Error: Compilation failed']\n"
                    "    ifFalse: [ result isString ifTrue: [ result ] ifFalse: [ 'Success' ] ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = str(result)
        if message in {"", "None"}:
            message = "Success"
        success = not message.startswith("Error:")
        return jsonify(success=success, result=message if success else None, exception=None if success else message)

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
                    f"    uid := ([u userId] on: Error do: [:e | u printString]) asString.\n"
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
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
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
                    f"{_ALL_USERS_EXPR}\n"
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
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
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
                    f"u isNil ifTrue: [nil] ifFalse: [\n"
                    f"  dict := u symbolList detect: [:d | d name asString = '{escaped_dict}'] ifNone: [nil].\n"
                    f"  dict isNil ifTrue: [nil] ifFalse: [\n"
                    f"    dict at: '{escaped_key}' ifAbsent: [dict at: '{escaped_key}' asSymbol ifAbsent: [nil]]\n"
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
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
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
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
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
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
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
                    f"u := {_all_users_detect_user_expr(escaped_user)}.\n"
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
                    f"      uid := ([u userId] on: Error do: [:e | '(no userId: ', e messageText, ')']) asString.\n"
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
                raw = _eval_str(session,
                    f"| obj behavior result |\n"
                    f"{_behavior_prelude(oop)}"
                    f"result := ''.\n"
                    f"[behavior classPool keysAndValuesDo: [:key :value |\n"
                    f"  result := result , key asString , '|' , value printString , String lf asString\n"
                    f"]] on: Error do: [:e | result := ''].\n"
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
                raw = _eval_str(session,
                    f"| obj behavior cls result |\n"
                    f"{_behavior_prelude(oop)}"
                    f"cls := behavior.\n"
                    f"result := ''.\n"
                    f"[cls notNil] whileTrue: [\n"
                    f"  result := result , cls name asString , String lf asString.\n"
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
                raw = _eval_str(session,
                    f"| obj behavior result |\n"
                    f"{_behavior_prelude(oop)}"
                    f"result := ''.\n"
                    f"[behavior withAllSuperclasses do: [:cls |\n"
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
                raw = _eval_str(session,
                    f"| obj behavior result col |\n"
                    f"{_behavior_prelude(oop)}"
                    f"result := ''.\n"
                    f"[col := behavior allInstances.\n"
                    f" col size > {limit} ifTrue: [col := col copyFrom: 1 to: {limit}].\n"
                    f" col do: [:inst |\n"
                    f"   result := result , inst oop printString , '|' , inst printString , String lf asString\n"
                    f" ]\n"
                    f"] on: Error do: [:e | result := ''].\n"
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
                raw = _eval_str(session,
                    "| result |\n"
                    "result := ''.\n"
                    "[System stoneVersionReport keysAndValuesDo: [:key :value |\n"
                    "  result := result , key asString , '|' , value printString , String lf asString\n"
                    "]] on: Error do: [:e | result := ''].\n"
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
                raw = _eval_str(session,
                    "| result |\n"
                    "result := ''.\n"
                    "[System gemVersionReport keysAndValuesDo: [:key :value |\n"
                    "  result := result , key asString , '|' , value printString , String lf asString\n"
                    "]] on: Error do: [:e | result := ''].\n"
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
                stone_ver = _eval_str(
                    session,
                    "[System stoneVersionReport at: 'gsVersion' ifAbsent: [System stoneVersionReport at: #gsVersion ifAbsent: ['']]] "
                    "on: Error do: [:e | '']"
                )
                gem_ver = _eval_str(
                    session,
                    "[System gemVersionReport at: 'gsVersion' ifAbsent: [System gemVersionReport at: #gsVersion ifAbsent: ['']]] "
                    "on: Error do: [:e | '']"
                )
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
