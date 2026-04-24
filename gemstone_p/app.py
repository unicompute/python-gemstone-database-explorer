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


def _smalltalk_error_text(value) -> str | None:
    text = str(value or "").strip()
    if text.lower().startswith("error:"):
        return text.split(":", 1)[1].strip() or text
    return None


def _as_bool_arg(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _fallback_ref(oop: int | None, inspection: str, basetype: str = "object") -> dict:
    return {
        "oop": oop,
        "inspection": inspection,
        "basetype": basetype,
        "loaded": False,
    }


def _debug_object_ref(session, oop_value: str | int | None, fallback_inspection: str = "") -> dict:
    try:
        oop = int(str(oop_value or "").strip())
    except Exception:
        return _fallback_ref(None, fallback_inspection)

    try:
        ref = object_view(session, oop, depth=0)
    except Exception:
        ref = _fallback_ref(oop, fallback_inspection)

    if fallback_inspection and not str(ref.get("inspection", "")).strip():
        ref["inspection"] = fallback_inspection
    ref["loaded"] = False
    return ref


def _cb_dict_expr(dict_name: str) -> str:
    return f"(System myUserProfile symbolList objectNamed: '{_escape_st(dict_name)}' asSymbol)"


def _cb_class_expr(class_name: str, dictionary: str | None = None) -> str:
    escaped_name = _escape_st(class_name)
    dict_name = str(dictionary or "").strip()
    if dict_name:
        return f"({_cb_dict_expr(dict_name)} at: '{escaped_name}' asSymbol ifAbsent: [nil])"
    return f"(System myUserProfile symbolList objectNamed: '{escaped_name}' asSymbol)"


def _cb_behavior_expr(class_name: str, meta: bool = False, dictionary: str | None = None) -> str:
    expr = _cb_class_expr(class_name, dictionary)
    return f"({expr} ifNil: [nil] ifNotNil: [:cls | cls class])" if meta else expr


def _cb_error_payload_message(payload: object, fallback: str) -> str | None:
    text = str(payload or "")
    if text.startswith("ERROR|"):
        return _decode_field(text.split("|", 1)[1]) or fallback
    return None


_DEBUG_SOURCE_HINTS: dict[int, str] = {}


def _remember_debug_source_hint(thread_oop: object, source: str) -> None:
    try:
        oop = int(thread_oop)
    except Exception:
        return
    text = str(source or "").strip()
    if oop > 20 and text:
        _DEBUG_SOURCE_HINTS[oop] = text


def _debug_source_hint(thread_oop: object) -> str:
    try:
        oop = int(thread_oop)
    except Exception:
        return ""
    return _DEBUG_SOURCE_HINTS.get(oop, "")


def _forget_debug_source_hint(thread_oop: object) -> None:
    try:
        oop = int(thread_oop)
    except Exception:
        return
    _DEBUG_SOURCE_HINTS.pop(oop, None)


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

    @app.route("/object/evaluate/<int:oop>", methods=["GET", "POST"])
    def object_evaluate(oop: int):
        payload = _request_json_dict() if request.method == "POST" else {}
        params = payload if request.method == "POST" else dict(request.args)
        code = str(payload.get("code", "") if request.method == "POST" else request.args.get("code", ""))
        language = str(payload.get("language", "smalltalk") if request.method == "POST" else request.args.get("language", "smalltalk"))
        depth = _int_arg(payload.get("depth", 2) if request.method == "POST" else request.args.get("depth", 2), 2)
        ranges = _request_ranges()
        try:
            with gs_session.request_session(read_only=False) as session:
                eval_result = eval_in_context(session, oop, code, language)
                is_exc = bool(eval_result.get("isException"))
                result_oop = eval_result.get("resultOop")
                if isinstance(result_oop, int):
                    result_view = object_view(
                        session,
                        result_oop,
                        1 if is_exc else depth,
                        ranges,
                        params,
                    )
                else:
                    result_view = {
                        "oop": None,
                        "inspection": str(eval_result.get("errorText") or "Evaluation failed"),
                        "basetype": "object",
                        "loaded": False,
                    }
                if is_exc:
                    exception_text = (
                        result_view.get("inspection")
                        or str(eval_result.get("errorText") or "Exception")
                    )
                    result_view["debugThreadOop"] = eval_result.get("debugThreadOop")
                    result_view["debugExceptionOop"] = eval_result.get("exceptionOop")
                    result_view["exceptionText"] = exception_text
                    result_view["sourcePreview"] = code
                    result_view["autoOpenDebugger"] = bool(eval_result.get("debugThreadOop"))
                    _remember_debug_source_hint(eval_result.get("debugThreadOop"), code)
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

    @app.post("/class-browser/add-dictionary")
    def class_browser_add_dictionary():
        data = request.get_json(force=True) or {}
        name = str(data.get("name", "")).strip()
        if not name:
            return jsonify(success=False, exception="missing dictionary"), 400
        try:
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| sym dictName existing newDict opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"dictName := '{_escape_st(name)}'.\n"
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

        message = _cb_error_payload_message(raw, "Dictionary creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        created_dict = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else name
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| sym oldName newName dict existing opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"oldName := '{_escape_st(dictionary)}'.\n"
                    f"newName := '{_escape_st(target_dictionary)}'.\n"
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

        message = _cb_error_payload_message(raw, "Dictionary rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        renamed_dict = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else target_dictionary
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| sym dictName existing opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"dictName := '{_escape_st(dictionary)}'.\n"
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

        message = _cb_error_payload_message(raw, "Dictionary removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_dict = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else dictionary
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
            expr = _cb_dict_expr(dictionary)
            label = dictionary
        elif mode == "class":
            if not class_name:
                return jsonify(success=False, exception="missing class"), 400
            expr = _cb_behavior_expr(class_name, meta, dictionary)
            label = f"{class_name} class" if meta else class_name
        elif mode == "instances":
            if not class_name:
                return jsonify(success=False, exception="missing class"), 400
            expr = f"({_cb_behavior_expr(class_name, False, dictionary)} allInstances)"
            label = f"{class_name} allInstances"
        elif mode == "method":
            if not class_name or not selector:
                return jsonify(success=False, exception="missing class or selector"), 400
            expr = (
                "[ | cls |\n"
                f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                "cls ifNil: [ nil ] ifNotNil: [\n"
                f"  [cls compiledMethodAt: '{_escape_st(selector)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil]\n"
                "]\n"
                "] value"
            )
            label = f"{class_name} class >> {selector}" if meta else f"{class_name} >> {selector}"
        else:
            return jsonify(success=False, exception="unsupported inspect target"), 400

        try:
            with gs_session.request_session() as session:
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
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | rows encode |\n"
                    f"{_ENCODE_SRC}\n"
                    "rows := OrderedCollection new.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    f"  (dict includesKey: '{_escape_st(class_name)}' asSymbol) ifTrue: [\n"
                    f"    | value dictName |\n"
                    f"    value := dict at: '{_escape_st(class_name)}' asSymbol.\n"
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
                    dictionary = _decode_field(line.strip())
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
        dictionary = request.args.get("dictionary", "").strip()
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | cls stream |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
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
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | cls stream sels |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
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
        dictionary = request.args.get("dictionary", "").strip()
        selector = request.args.get("selector", "").strip()
        meta = _as_bool_arg(request.args.get("meta"))
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                source = _eval_str(
                    session,
                    f"| cls meth |\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
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
        dictionary = request.args.get("dictionary", "").strip()
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(
                    session,
                    "[ | cls rows symbolList encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
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
                        "className": _decode_field(cls_name),
                        "dictionary": _decode_field(dict_name),
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        return jsonify(success=True, hierarchy=hierarchy)

    @app.get("/class-browser/versions")
    def class_browser_versions():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
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
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
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
        root_dictionary = request.args.get("rootDictionary", "").strip()
        query_meta = _as_bool_arg(request.args.get("meta"))
        scope = request.args.get("hierarchyScope", "full").strip() or "full"
        valid_modes = {"implementors", "senders", "references", "methodText", "hierarchyImplementors", "hierarchySenders"}
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
                    "[ | sel token classes stream rootClass scope encode queryMeta |\n"
                    f"{_ENCODE_SRC}\n"
                    f"sel := '{escaped_selector}' asSymbol.\n"
                    f"token := '{escaped_selector}'.\n"
                    f"scope := '{escaped_scope}'.\n"
                    f"queryMeta := {'true' if query_meta else 'false'}.\n"
                    "stream := WriteStream on: String new.\n"
                    "classes := OrderedCollection new.\n"
                    f"rootClass := {'nil' if not root_class_name else _cb_behavior_expr(root_class_name, query_meta, root_dictionary)}.\n"
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
                    dictionary = _decode_field(fields[0])
                    class_name = _decode_field(fields[1])
                    is_meta = _decode_field(fields[2]) == "1"
                    selector_name = _decode_field(fields[3])
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| dict super existing created encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"dict := {_cb_dict_expr(dictionary)}.\n"
                    f"super := {_cb_behavior_expr(superclass_name, False, superclass_dictionary)}.\n"
                    "dict isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'dictionary not found')\n"
                    "] ifFalse: [\n"
                    "  super isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'superclass not found')\n"
                    "  ] ifFalse: [\n"
                    f"    existing := [dict at: '{_escape_st(class_name)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "    existing notNil ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'class already exists')\n"
                    "    ] ifFalse: [\n"
                    "      created := [\n"
                    f"        super subclass: '{_escape_st(class_name)}' asSymbol\n"
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
                    f"        'OK|' , (encode value: '{_escape_st(class_name)}') , '|' , (encode value: '{_escape_st(dictionary)}') , '|' , (encode value: '{_escape_st(superclass_name)}')\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        payload = str(raw or "")
        if payload.startswith("ERROR|"):
            message = _decode_field(payload.split("|", 1)[1]) or "Class creation failed"
            return jsonify(success=False, exception=message), 200

        fields = payload.split("|", 3)
        if len(fields) >= 4 and fields[0] == "OK":
            created_class = _decode_field(fields[1]) or class_name
            created_dict = _decode_field(fields[2]) or dictionary
            created_super = _decode_field(fields[3]) or superclass_name
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls dict existing opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    f"dict := {_cb_dict_expr(dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  dict isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'dictionary not found')\n"
                    "  ] ifFalse: [\n"
                    f"    existing := [dict at: '{_escape_st(target_class_name)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "    ((existing notNil) and: [existing ~~ cls]) ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'target class already exists in dictionary')\n"
                    "    ] ifFalse: [\n"
                    f"      opResult := [cls rename: '{_escape_st(target_class_name)}'. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "      ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "        opResult\n"
                    "      ] ifFalse: [\n"
                    f"        'OK|' , (encode value: '{_escape_st(target_class_name)}') , '|' , (encode value: '{_escape_st(dictionary)}')\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Class rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        renamed_class = _decode_field(fields[1]) if len(fields) > 1 else target_class_name
        renamed_dict = _decode_field(fields[2]) if len(fields) > 2 else dictionary
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls categoryName existing opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"categoryName := '{_escape_st(category)}'.\n"
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

        message = _cb_error_payload_message(raw, "Category creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_category = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else category
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls sels moved targetCategory opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"targetCategory := '{_escape_st(target_category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  sels := [cls selectorsIn: '{_escape_st(category)}' asSymbol] on: Error do: [:e | #()].\n"
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

        message = _cb_error_payload_message(raw, "Category rename failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_count = _decode_field(fields[1]) if len(fields) > 1 else "0"
        moved_category = _decode_field(fields[2]) if len(fields) > 2 else target_category
        return jsonify(
            success=True,
            result=f"Renamed {category} to {moved_category}",
            category=moved_category,
            movedCount=int(moved_count or "0"),
        )

    @app.post("/class-browser/add-instance-variable")
    def class_browser_add_instance_variable():
        data = request.get_json(force=True) or {}
        class_name = str(data.get("className", "")).strip()
        dictionary = str(data.get("dictionary", "")).strip()
        variable_name = str(data.get("variableName", "")).strip()
        if not class_name or not variable_name:
            return jsonify(success=False, exception="missing class or variable name"), 400
        try:
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  opResult := [\n"
                    "    (cls respondsTo: #addInstVarName:) ifFalse: [ Error signal: 'instance variable edits unsupported' ].\n"
                    f"    cls addInstVarName: '{_escape_st(variable_name)}' asSymbol.\n"
                    "    true\n"
                    "  ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    f"    'OK|' , (encode value: '{_escape_st(variable_name)}')\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Instance variable creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_name = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  opResult := [\n"
                    "    (cls respondsTo: #addClassVarName:) ifFalse: [ Error signal: 'class variable edits unsupported' ].\n"
                    f"    cls addClassVarName: '{_escape_st(variable_name)}' asSymbol.\n"
                    "    true\n"
                    "  ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    f"    'OK|' , (encode value: '{_escape_st(variable_name)}')\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Class variable creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_name = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls meta opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "meta := cls ifNil: [nil] ifNotNil: [:base | base class].\n"
                    "meta isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  opResult := [\n"
                    "    (meta respondsTo: #addInstVarName:) ifFalse: [ Error signal: 'class instance variable edits unsupported' ].\n"
                    f"    meta addInstVarName: '{_escape_st(variable_name)}' asSymbol.\n"
                    "    true\n"
                    "  ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    f"    'OK|' , (encode value: '{_escape_st(variable_name)}')\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Class instance variable creation failed")
        if message:
            return jsonify(success=False, exception=message), 200

        added_name = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else variable_name
        return jsonify(
            success=True,
            result=f"Added class instance variable {added_name}",
            variableName=added_name,
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls oldDict newDict existing opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    f"oldDict := {_cb_dict_expr(dictionary)}.\n"
                    f"newDict := {_cb_dict_expr(target_dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  newDict isNil ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'target dictionary not found')\n"
                    "  ] ifFalse: [\n"
                    f"    existing := [newDict at: '{_escape_st(class_name)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    "    ((existing notNil) and: [existing ~~ cls]) ifTrue: [\n"
                    "      'ERROR|' , (encode value: 'target dictionary already contains a different class with that name')\n"
                    "    ] ifFalse: [\n"
                    f"      opResult := [[oldDict removeKey: '{_escape_st(class_name)}' asSymbol ifAbsent: []]. newDict at: '{_escape_st(class_name)}' asSymbol put: cls. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "      ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "        opResult\n"
                    "      ] ifFalse: [\n"
                    f"        'OK|' , (encode value: '{_escape_st(class_name)}') , '|' , (encode value: '{_escape_st(target_dictionary)}')\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Class move failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_class = _decode_field(fields[1]) if len(fields) > 1 else class_name
        moved_dict = _decode_field(fields[2]) if len(fields) > 2 else target_dictionary
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    "  opResult := [cls removeFromSystem. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "  ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "    opResult\n"
                    "  ] ifFalse: [\n"
                    f"    'OK|' , (encode value: '{_escape_st(class_name)}')\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Class removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_class = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else class_name
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls meth src compileResult targetCategory encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"targetCategory := '{_escape_st(category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  meth := [cls compiledMethodAt: '{_escape_st(selector)}' asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
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
                    f"          'OK|' , (encode value: '{_escape_st(selector)}') , '|' , (encode value: targetCategory)\n"
                    "        ]\n"
                    "      ]\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Method move failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_selector = _decode_field(fields[1]) if len(fields) > 1 else selector
        moved_category = _decode_field(fields[2]) if len(fields) > 2 else category
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  (([cls includesSelector: '{_escape_st(selector)}' asSymbol] on: Error do: [:e | false]) not) ifTrue: [\n"
                    "    'ERROR|' , (encode value: 'method not found')\n"
                    "  ] ifFalse: [\n"
                    f"    opResult := [cls removeSelector: '{_escape_st(selector)}' asSymbol. true] on: Error do: [:e | 'ERROR|' , (encode value: e messageText)].\n"
                    "    ((opResult isString) and: [opResult beginsWith: 'ERROR|']) ifTrue: [\n"
                    "      opResult\n"
                    "    ] ifFalse: [\n"
                    f"      'OK|' , (encode value: '{_escape_st(selector)}')\n"
                    "    ]\n"
                    "  ]\n"
                    "]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        message = _cb_error_payload_message(raw, "Method removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        removed_selector = _decode_field(str(raw or "").split("|", 1)[1]) if "|" in str(raw or "") else selector
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
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls sels moved targetCategory opResult encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    f"targetCategory := '{_escape_st(target_category)}'.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  sels := [cls selectorsIn: '{_escape_st(category)}' asSymbol] on: Error do: [:e | #()].\n"
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

        message = _cb_error_payload_message(raw, "Category removal failed")
        if message:
            return jsonify(success=False, exception=message), 200

        fields = str(raw or "").split("|", 2)
        moved_count = _decode_field(fields[1]) if len(fields) > 1 else "0"
        moved_category = _decode_field(fields[2]) if len(fields) > 2 else target_category
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
        old_selector_expr = "nil" if not selector else f"'{_escape_st(selector)}' asSymbol"
        try:
            with gs_session.request_session(read_only=False) as session:
                raw = _eval_str(
                    session,
                    f"| cls source compileResult oldSel newSel protocolName message encode |\n"
                    f"{_ENCODE_SRC}\n"
                    f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls isNil ifTrue: [\n"
                    "  'ERROR|' , (encode value: 'class not found')\n"
                    "] ifFalse: [\n"
                    f"  source := '{_escape_st(clean_source)}'.\n"
                    f"  oldSel := {old_selector_expr}.\n"
                    f"  compileResult := [ cls compileMethod: source category: '{_escape_st(category)}' asSymbol ] on: Error do: [:e | 'ERROR|' , (encode value: e messageText) ].\n"
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
                    f"      protocolName := newSel isNil ifTrue: ['{_escape_st(category)}'] ifFalse: [[ cls categoryOfSelector: newSel ] on: Error do: [:e | '{_escape_st(category)}' ]].\n"
                    f"      protocolName ifNil: [ protocolName := '{_escape_st(category)}' ].\n"
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
            message = _decode_field(payload.split("|", 1)[1]) or "Compilation failed"
            return jsonify(success=False, exception=message), 200

        fields = payload.split("|", 4)
        if len(fields) >= 5 and fields[0] == "OK":
            selector_name = _decode_field(fields[1])
            protocol_name = _decode_field(fields[2]) or category
            previous_selector = _decode_field(fields[3])
            message = _decode_field(fields[4]) or "Success"
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
        meta = _as_bool_arg(request.args.get("meta"))
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
                f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
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
                f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
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
                f"dict := {_cb_dict_expr(dictionary)}.\n"
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
                f"dict := {_cb_dict_expr(dictionary)}.\n"
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
                f"cls := {_cb_behavior_expr(class_name, meta, dictionary)}.\n"
                "cls ifNil: [ '' ] ifNotNil: [\n"
                f"  src := [ (cls compiledMethodAt: '{_escape_st(selector)}' asSymbol) sourceString ] on: Error do: [:e | '' ].\n"
                "  src ifNil: [ '' ] ifNotNil: [ src asString ]\n"
                "]\n"
                "] value"
            )

        try:
            with gs_session.request_session() as session:
                source = _eval_str(session, script)
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
            with gs_session.request_session(read_only=False) as session:
                result = _eval_str(
                    session,
                    f"| cls getter setter |\n"
                    f"cls := {_cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls isNil ifTrue: [ 'Error: class not found' ] ifFalse: [\n"
                    f"  getter := '{_escape_st(getter)}'.\n"
                    f"  setter := '{_escape_st(setter)}'.\n"
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

    # ------------------------------------------------------------------ #
    # Transaction control                                                  #
    # ------------------------------------------------------------------ #

    @app.route("/transaction/commit", methods=["GET", "POST"])
    def transaction_commit():
        try:
            with gs_session.request_session(read_only=False) as session:
                session.commit()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, result="committed")

    @app.route("/transaction/abort", methods=["GET", "POST"])
    def transaction_abort():
        try:
            with gs_session.request_session(read_only=False) as session:
                session.abort()
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, result="aborted")

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
                    f"| result |\n"
                    f"{_ENCODE_SRC}\n"
                    "result := ''.\n"
                    "[\n"
                    "  GsProcess allSubinstances do: [:p |\n"
                    "    | status ps ctx sourcePreview exceptionObj exceptionText |\n"
                    "    status := [p status] on: Error do: [:e | 'unknown'].\n"
                    "    (status = 'suspended' or: [status = 'halted']) ifTrue: [\n"
                    "      ps := [p printString] on: Error do: [:e | 'a GsProcess'].\n"
                    "      ps := ps size > 160 ifTrue: [ps copyFrom: 1 to: 160] ifFalse: [ps].\n"
                    "      ctx := [p suspendedContext] on: Error do: [:e | nil].\n"
                    "      sourcePreview := ''.\n"
                    "      ctx notNil ifTrue: [\n"
                    "        sourcePreview := [[ctx method sourceString] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                    "        sourcePreview isNil ifTrue: [sourcePreview := ''].\n"
                    "        sourcePreview := sourcePreview withBlanksTrimmed.\n"
                    "        (sourcePreview includes: Character lf) ifTrue: [sourcePreview := sourcePreview copyUpTo: Character lf].\n"
                    "        sourcePreview := sourcePreview size > 160 ifTrue: [sourcePreview copyFrom: 1 to: 160] ifFalse: [sourcePreview]\n"
                    "      ].\n"
                    "      exceptionObj := nil.\n"
                    "      exceptionObj isNil ifTrue: [\n"
                    "        exceptionObj := [(p respondsTo: #exception) ifTrue: [p exception] ifFalse: [nil]] on: Error do: [:e | nil]\n"
                    "      ].\n"
                    "      exceptionObj isNil ifTrue: [\n"
                    "        exceptionObj := [(p respondsTo: #lastException) ifTrue: [p lastException] ifFalse: [nil]] on: Error do: [:e | nil]\n"
                    "      ].\n"
                    "      exceptionObj isNil ifTrue: [\n"
                    "        [[p threadStorage do: [:assoc |\n"
                    "          | keyText candidate |\n"
                    "          exceptionObj notNil ifFalse: [\n"
                    "            keyText := [[assoc key asString] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                    "            candidate := [assoc value] on: Error do: [:e | nil].\n"
                    "            ((candidate notNil) and: [keyText asLowercase includesSubstring: 'exception']) ifTrue: [\n"
                    "              exceptionObj := candidate\n"
                    "            ]\n"
                    "          ]\n"
                    "        ]] on: Error do: [:e | nil]\n"
                    "      ].\n"
                    "      exceptionText := ''.\n"
                    "      exceptionObj notNil ifTrue: [\n"
                    "        exceptionText := [[exceptionObj inspect] on: Error do: [:e | [exceptionObj printString] on: Error do: [:e2 | '']]] on: Error do: [:e | ''].\n"
                    "        exceptionText isNil ifTrue: [exceptionText := ''].\n"
                    "        exceptionText := exceptionText withBlanksTrimmed.\n"
                    "        exceptionText := exceptionText size > 240 ifTrue: [exceptionText copyFrom: 1 to: 240] ifFalse: [exceptionText]\n"
                    "      ].\n"
                    "      result := result , (encode value: p asOop printString) , '|'\n"
                    "        , (encode value: ps) , '|'\n"
                    "        , (encode value: exceptionText) , '|'\n"
                    "        , (encode value: sourcePreview)\n"
                    "        , String lf asString\n"
                    "    ]\n"
                    "  ]\n"
                    "] on: Error do: [:e | result := ''].\n"
                    "result"
                )
                threads = []
                for line in str(raw).splitlines():
                    if '|' in line:
                        parts = line.split('|', 3)
                        try:
                            oop = int(_decode_field(parts[0]).strip())
                        except ValueError:
                            continue
                        print_string = _decode_field(parts[1]) if len(parts) > 1 else ''
                        exception_text = _decode_field(parts[2]) if len(parts) > 2 else ''
                        source_preview = _decode_field(parts[3]) if len(parts) > 3 else ''
                        if not source_preview:
                            source_preview = _debug_source_hint(oop)
                        threads.append({
                            "oop": oop,
                            "printString": print_string,
                            "exceptionText": exception_text,
                            "sourcePreview": source_preview,
                            "displayText": source_preview or exception_text or print_string,
                        })
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
                from gemstone_p.object_view import _eval_str, object_for_oop_expr
                raw = _eval_str(session,
                    f"| proc ctx idx source receiver selfPs selfOop vars methodName ipOffset varLines stepPoint sourceOffset offsets rawOffset |\n"
                    f"{_ENCODE_SRC}\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"ctx := proc suspendedContext.\n"
                    f"idx := 0.\n"
                    f"[ctx notNil and: [idx < {frame_index}]] whileTrue: [\n"
                    f"  ctx := ctx sender. idx := idx + 1\n"
                    f"].\n"
                    f"ctx isNil ifTrue: [\n"
                    f"  (encode value: '(no frame)') , '|'\n"
                    f"    , (encode value: '0') , '|'\n"
                    f"    , (encode value: '') , '|'\n"
                    f"    , (encode value: '20') , '|'\n"
                    f"    , (encode value: '') , '|'\n"
                    f"    , (encode value: '')\n"
                    f"] ifFalse: [\n"
                    f"  source := [ctx method sourceString] on: Error do: [:e | ''].\n"
                    f"  source isNil ifTrue: [source := ''].\n"
                    f"  source := source size > 4000\n"
                    f"    ifTrue: [source copyFrom: 1 to: 4000]\n"
                    f"    ifFalse: [source].\n"
                    f"  receiver := [ctx receiver] on: Error do: [:e | nil].\n"
                    f"  selfPs := [receiver printString] on: Error do: [:e | '?'].\n"
                    f"  selfOop := [receiver asOop printString] on: Error do: [:e | '20'].\n"
                    f"  varLines := OrderedCollection new.\n"
                    f"  [ctx tempNames do: [:n |\n"
                    f"    | v voop |\n"
                    f"    v := [ctx tempAt: n] on: Error do: [:e | '?'].\n"
                    f"    voop := [v asOop printString] on: Error do: [:e | '20'].\n"
                    f"    varLines add: ((encode value: n asString) , Character tab asString , (encode value: voop))\n"
                    f"  ]] on: Error do: [:e | ].\n"
                    f"  vars := String streamContents: [:stream |\n"
                    f"    varLines doWithIndex: [:line :lineIndex |\n"
                    f"      lineIndex > 1 ifTrue: [stream nextPut: Character lf].\n"
                    f"      stream nextPutAll: line\n"
                    f"    ]\n"
                    f"  ].\n"
                    f"  | methodName ipOffset |\n"
                    f"  methodName := [ctx method printString] on: Error do: [:e | 'unknown'].\n"
                    f"  ipOffset := [ctx pc printString] on: Error do: [:e | '0'].\n"
                    f"  stepPoint := '0'.\n"
                    f"  sourceOffset := '0'.\n"
                    f"  ((ctx respondsTo: #stepPoint) or: [ctx respondsTo: #quickStepPoint]) ifTrue: [\n"
                    f"    stepPoint := [\n"
                    f"      (((ctx respondsTo: #stepPoint) and: [ctx stepPoint notNil])\n"
                    f"        ifTrue: [ctx stepPoint]\n"
                    f"        ifFalse: [(ctx respondsTo: #quickStepPoint) ifTrue: [ctx quickStepPoint] ifFalse: [0]]) printString\n"
                    f"    ] on: Error do: [:e | '0']\n"
                    f"  ].\n"
                    f"  offsets := ((ctx respondsTo: #sourceOffsets)\n"
                    f"    ifTrue: [[ctx sourceOffsets] on: Error do: [:e | #()]]\n"
                    f"    ifFalse: [#()]).\n"
                    f"  rawOffset := nil.\n"
                    f"  [ | stepInt |\n"
                    f"    stepInt := [stepPoint asInteger] on: Error do: [:e | 0].\n"
                    f"    ((offsets isCollection) and: [stepInt > 0]) ifTrue: [\n"
                    f"      rawOffset := [offsets at: stepInt ifAbsent: [nil]] on: Error do: [:e | nil]\n"
                    f"    ]\n"
                    f"  ] on: Error do: [:e | rawOffset := nil].\n"
                    f"  rawOffset notNil ifTrue: [\n"
                    f"    sourceOffset := [[rawOffset asInteger] on: Error do: [:e | 0]] printString\n"
                    f"  ].\n"
                    f"  (encode value: methodName) , '|'\n"
                    f"    , (encode value: ipOffset) , '|'\n"
                    f"    , (encode value: selfPs) , '|'\n"
                    f"    , (encode value: selfOop) , '|'\n"
                    f"    , (encode value: source) , '|'\n"
                    f"    , (encode value: sourceOffset) , '|'\n"
                    f"    , (encode value: stepPoint) , '|'\n"
                    f"    , (encode value: vars)\n"
                    f"]"
                )
                parts = str(raw).split('|', 7)
                method_name = _decode_field(parts[0]) if len(parts) > 0 else ''
                ip_offset = _decode_field(parts[1]) if len(parts) > 1 else '0'
                self_ps = _decode_field(parts[2]) if len(parts) > 2 else ''
                self_oop_raw = _decode_field(parts[3]) if len(parts) > 3 else ''
                source = _decode_field(parts[4]) if len(parts) > 4 else ''
                source_offset = _int_arg(_decode_field(parts[5]) if len(parts) > 5 else '0', 0)
                step_point = _int_arg(_decode_field(parts[6]) if len(parts) > 6 else '0', 0)
                vars_raw = _decode_field(parts[7]) if len(parts) > 7 else ''
                if not source and frame_index == 0:
                    source = _debug_source_hint(oop)
                line_number = _line_number_for_offset(source, source_offset) or (1 if source else 0)
                self_object = _debug_object_ref(session, self_oop_raw, self_ps)
                variables = []
                for item in vars_raw.splitlines():
                    if not item.strip():
                        continue
                    fields = item.split('\t', 1)
                    name = _decode_field(fields[0]) if len(fields) > 0 else ''
                    value_oop_raw = _decode_field(fields[1]) if len(fields) > 1 else ''
                    value_object = _debug_object_ref(session, value_oop_raw)
                    variables.append({
                        "name": name,
                        "value": value_object.get("inspection", ""),
                        "valueObject": value_object,
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            methodName=method_name,
            ipOffset=ip_offset,
            selfPrintString=self_ps,
            selfObject=self_object,
            source=source,
            sourceOffset=source_offset,
            stepPoint=step_point,
            lineNumber=line_number,
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
                _forget_debug_source_hint(oop)
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
                    f"| proc result lines |\n"
                    f"{_ENCODE_SRC}\n"
                    f"proc := {object_for_oop_expr(oop)}.\n"
                    f"lines := OrderedCollection new.\n"
                    f"[proc threadStorage do: [:assoc |\n"
                    f"  | key value keyPs valuePs keyOop valueOop |\n"
                    f"  key := [assoc key] on: Error do: [:e | nil].\n"
                    f"  value := [assoc value] on: Error do: [:e | nil].\n"
                    f"  keyPs := [key printString] on: Error do: [:e | '?'].\n"
                    f"  valuePs := [value printString] on: Error do: [:e | '?'].\n"
                    f"  keyOop := [key asOop printString] on: Error do: [:e | '20'].\n"
                    f"  valueOop := [value asOop printString] on: Error do: [:e | '20'].\n"
                    f"  lines add: ((encode value: keyPs) , Character tab asString\n"
                    f"    , (encode value: keyOop) , Character tab asString\n"
                    f"    , (encode value: valuePs) , Character tab asString\n"
                    f"    , (encode value: valueOop))\n"
                    f"]] on: Error do: [:e | ].\n"
                    f"result := String streamContents: [:stream |\n"
                    f"  lines doWithIndex: [:line :lineIndex |\n"
                    f"    lineIndex > 1 ifTrue: [stream nextPut: Character lf].\n"
                    f"    stream nextPutAll: line\n"
                    f"  ]\n"
                    f"].\n"
                    f"result"
                )
                entries = []
                for line in str(raw).splitlines():
                    if not line.strip():
                        continue
                    fields = line.split('\t', 3)
                    key = _decode_field(fields[0]) if len(fields) > 0 else ''
                    key_oop_raw = _decode_field(fields[1]) if len(fields) > 1 else ''
                    value = _decode_field(fields[2]) if len(fields) > 2 else ''
                    value_oop_raw = _decode_field(fields[3]) if len(fields) > 3 else ''
                    entries.append({
                        "key": key,
                        "value": value,
                        "keyObject": _debug_object_ref(session, key_oop_raw, key),
                        "valueObject": _debug_object_ref(session, value_oop_raw, value),
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, entries=entries)

    # ------------------------------------------------------------------ #
    # Inspector tabs                                                       #
    # ------------------------------------------------------------------ #

    @app.get("/object/constants/<int:oop>")
    def object_constants(oop: int):
        try:
            limit = max(1, min(500, int(request.args.get("limit", 50))))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(session,
                    f"| obj behavior result rows assocs total start stop |\n"
                    f"{_behavior_prelude(oop)}"
                    f"{_ENCODE_SRC}\n"
                    f"rows := OrderedCollection new.\n"
                    f"[assocs := [behavior classPool associations asArray] on: Error do: [:e | #()].\n"
                    f" assocs := assocs asSortedCollection: [:a :b |\n"
                    f"   (([a key asString] on: Error do: [:e | a key printString])\n"
                    f"     <= ([b key asString] on: Error do: [:e | b key printString]))\n"
                    f" ].\n"
                    f" total := assocs size.\n"
                    f" start := {offset} + 1.\n"
                    f" start < 1 ifTrue: [start := 1].\n"
                    f" stop := total min: ({offset} + {limit}).\n"
                    f" (start <= stop and: [start <= total]) ifTrue: [\n"
                    f"   (assocs copyFrom: start to: stop) do: [:assoc |\n"
                    f"     | key value keyPs valuePs valueOop |\n"
                    f"     key := assoc key.\n"
                    f"     value := assoc value.\n"
                    f"     keyPs := [key asString] on: Error do: [:e | key printString].\n"
                    f"     valuePs := [value printString] on: Error do: [:e | '?'].\n"
                    f"     valueOop := [value asOop printString] on: Error do: [:e | '20'].\n"
                    f"     rows add: ((encode value: keyPs) , Character tab asString\n"
                    f"       , (encode value: valuePs) , Character tab asString\n"
                    f"       , (encode value: valueOop))\n"
                    f"   ]\n"
                    f" ].\n"
                    f"result := String streamContents: [:stream |\n"
                    f"  stream nextPutAll: total printString.\n"
                    f"  rows do: [:line |\n"
                    f"    stream nextPut: Character lf.\n"
                    f"    stream nextPutAll: line\n"
                    f"  ]\n"
                    f"].\n"
                    f"] on: Error do: [:e | result := '0'].\n"
                    f"result"
                )
                lines = str(raw).splitlines()
                total = 0
                if lines:
                    try:
                        total = int(str(lines[0]).strip() or "0")
                    except ValueError:
                        total = 0
                pairs = []
                for line in lines[1:]:
                    if not line.strip():
                        continue
                    fields = line.split('\t', 2)
                    key = _decode_field(fields[0]) if len(fields) > 0 else ''
                    value = _decode_field(fields[1]) if len(fields) > 1 else ''
                    value_oop_raw = _decode_field(fields[2]) if len(fields) > 2 else ''
                    value_object = _debug_object_ref(session, value_oop_raw, value)
                    pairs.append({"key": key, "value": value_object.get("inspection", value), "valueObject": value_object})
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            constants=pairs,
            limit=limit,
            offset=offset,
            total=total,
            hasMore=(offset + len(pairs)) < total,
        )

    @app.get("/object/hierarchy/<int:oop>")
    def object_hierarchy(oop: int):
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(session,
                    f"| obj behavior cls rows result encode |\n"
                    f"{_behavior_prelude(oop)}"
                    f"{_ENCODE_SRC}\n"
                    f"rows := OrderedCollection new.\n"
                    f"cls := behavior.\n"
                    f"[cls notNil] whileTrue: [\n"
                    f"  | clsName clsOop dictName |\n"
                    f"  clsName := [cls name asString] on: Error do: [:e | cls printString].\n"
                    f"  clsOop := [cls asOop printString] on: Error do: [:e | '20'].\n"
                    f"  dictName := ''.\n"
                    f"  [System myUserProfile symbolList do: [:dict |\n"
                    f"    ((dictName isEmpty) and: [[dict includesKey: clsName asSymbol] on: Error do: [:e | false]]) ifTrue: [\n"
                    f"      | value |\n"
                    f"      value := [dict at: clsName asSymbol ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                    f"      value == cls ifTrue: [\n"
                    f"        dictName := ([dict name] on: Error do: [:e | dict printString]) asString\n"
                    f"      ]\n"
                    f"    ]\n"
                    f"  ]] on: Error do: [:e | ].\n"
                    f"  rows addFirst: ((encode value: clsName) , Character tab asString , (encode value: clsOop) , Character tab asString , (encode value: dictName)).\n"
                    f"  cls := cls superclass\n"
                    f"].\n"
                    f"result := String streamContents: [:stream |\n"
                    f"  rows doWithIndex: [:line :index |\n"
                    f"    index > 1 ifTrue: [stream nextPut: Character lf].\n"
                    f"    stream nextPutAll: line\n"
                    f"  ]\n"
                    f"].\n"
                    f"result"
                )
                classes = []
                for line in str(raw).splitlines():
                    if not line.strip():
                        continue
                    fields = line.split('\t', 2)
                    class_name = _decode_field(fields[0]) if len(fields) > 0 else ''
                    class_oop_raw = _decode_field(fields[1]) if len(fields) > 1 else ''
                    dictionary = _decode_field(fields[2]) if len(fields) > 2 else ''
                    try:
                        class_oop = int(class_oop_raw)
                    except ValueError:
                        class_oop = None
                    classes.append({
                        "class": _fallback_ref(class_oop, class_name, "class"),
                        "dictionary": dictionary,
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, hierarchy=classes)

    @app.get("/object/included-modules/<int:oop>")
    def object_included_modules(oop: int):
        try:
            limit = max(1, min(500, int(request.args.get("limit", 50))))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(session,
                    f"| obj behavior result rows total start stop |\n"
                    f"{_behavior_prelude(oop)}"
                    f"{_ENCODE_SRC}\n"
                    f"result := ''.\n"
                    f"[rows := OrderedCollection new.\n"
                    f" behavior withAllSuperclasses do: [:cls |\n"
                    f"  (cls respondsTo: #includedModules) ifTrue: [\n"
                    f"    cls includedModules do: [:m |\n"
                    f"      | clsOop clsName modOop modName |\n"
                    f"      clsOop := [cls asOop printString] on: Error do: [:e | '20'].\n"
                    f"      clsName := [cls name asString] on: Error do: [:e | cls printString].\n"
                    f"      modOop := [m asOop printString] on: Error do: [:e | '20'].\n"
                    f"      modName := [m name asString] on: Error do: [:e | m printString].\n"
                    f"      rows add: ((encode value: clsOop) , Character tab asString\n"
                    f"        , (encode value: clsName) , Character tab asString\n"
                    f"        , (encode value: modOop) , Character tab asString\n"
                    f"        , (encode value: modName))\n"
                    f"    ]\n"
                    f"  ]\n"
                    f" ].\n"
                    f" total := rows size.\n"
                    f" start := {offset} + 1.\n"
                    f" start < 1 ifTrue: [start := 1].\n"
                    f" stop := total min: ({offset} + {limit}).\n"
                    f" result := String streamContents: [:stream |\n"
                    f"   stream nextPutAll: total printString.\n"
                    f"   (start <= stop and: [start <= total]) ifTrue: [\n"
                    f"     (rows copyFrom: start to: stop) do: [:line |\n"
                    f"       stream nextPut: Character lf.\n"
                    f"       stream nextPutAll: line\n"
                    f"     ]\n"
                    f"   ]\n"
                    f" ].\n"
                    f"] on: Error do: [:e | result := '0'].\n"
                    f"result"
                )
                lines = str(raw).splitlines()
                total = 0
                if lines:
                    try:
                        total = int(str(lines[0]).strip() or "0")
                    except ValueError:
                        total = 0
                modules = []
                for line in lines[1:]:
                    if not line.strip():
                        continue
                    fields = line.split('\t', 3)
                    owner_oop_raw = _decode_field(fields[0]) if len(fields) > 0 else ''
                    owner_name = _decode_field(fields[1]) if len(fields) > 1 else ''
                    module_oop_raw = _decode_field(fields[2]) if len(fields) > 2 else ''
                    module_name = _decode_field(fields[3]) if len(fields) > 3 else ''
                    modules.append({
                        "owner": _debug_object_ref(session, owner_oop_raw, owner_name),
                        "module": _debug_object_ref(session, module_oop_raw, module_name),
                    })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            modules=modules,
            limit=limit,
            offset=offset,
            total=total,
            hasMore=(offset + len(modules)) < total,
        )

    @app.get("/object/instances/<int:oop>")
    def object_instances(oop: int):
        try:
            limit = max(1, min(500, int(request.args.get("limit", 50))))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        try:
            with gs_session.request_session() as session:
                raw = _eval_str(session,
                    f"| obj behavior result col lines total start stop |\n"
                    f"{_behavior_prelude(oop)}"
                    f"{_ENCODE_SRC}\n"
                    f"result := ''.\n"
                    f"[col := behavior allInstances.\n"
                    f" total := [col size] on: Error do: [:e | 0].\n"
                    f" start := {offset} + 1.\n"
                    f" start < 1 ifTrue: [start := 1].\n"
                    f" stop := total min: ({offset} + {limit}).\n"
                    f" lines := OrderedCollection new.\n"
                    f" (start <= stop and: [start <= total]) ifTrue: [\n"
                    f"   (col copyFrom: start to: stop) do: [:inst |\n"
                    f"     | instOop instPs |\n"
                    f"     instOop := [inst oop printString] on: Error do: [:e | '20'].\n"
                    f"     instPs := [inst printString] on: Error do: [:e | '?'].\n"
                    f"     lines add: ((encode value: instOop) , Character tab asString , (encode value: instPs))\n"
                    f"   ]\n"
                    f" ].\n"
                    f" result := String streamContents: [:stream |\n"
                    f"   stream nextPutAll: total printString.\n"
                    f"   lines do: [:line |\n"
                    f"     stream nextPut: Character lf.\n"
                    f"     stream nextPutAll: line\n"
                    f"   ]\n"
                    f" ].\n"
                    f"] on: Error do: [:e | result := '0'].\n"
                    f"result"
                )
                lines = str(raw).splitlines()
                total = 0
                if lines:
                    try:
                        total = int(str(lines[0]).strip() or "0")
                    except ValueError:
                        total = 0
                instances = []
                for line in lines[1:]:
                    if not line.strip():
                        continue
                    fields = line.split('\t', 1)
                    oop_s = _decode_field(fields[0]) if len(fields) > 0 else ''
                    ps = _decode_field(fields[1]) if len(fields) > 1 else ''
                    try:
                        instances.append({"oop": int(oop_s), "printString": ps})
                    except ValueError:
                        continue
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            instances=instances,
            limit=limit,
            offset=offset,
            total=total,
            hasMore=(offset + len(instances)) < total,
        )

    # ------------------------------------------------------------------ #
    # Transaction — continue / persistent mode                            #
    # ------------------------------------------------------------------ #

    @app.route("/transaction/continue", methods=["GET", "POST"])
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
        error_text = _smalltalk_error_text(result)
        if error_text:
            return jsonify(success=False, exception=error_text)
        return jsonify(success=True, result=str(result).strip() or "continued")

    @app.get("/transaction/persistent-mode")
    def transaction_persistent_mode():
        try:
            with gs_session.request_session() as session:
                from gemstone_p.object_view import _eval_str
                raw = _eval_str(session,
                    "[GemStone session autoBeginTransaction printString] on: Error do: [:e | 'error: ' , e messageText]"
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        error_text = _smalltalk_error_text(raw)
        if error_text:
            return jsonify(success=False, exception=error_text)
        persistent = str(raw).strip() == 'true'
        gs_session.remember_persistent_mode(persistent)
        return jsonify(success=True, persistent=persistent)

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
        error_text = _smalltalk_error_text(result)
        if error_text:
            return jsonify(success=False, exception=error_text)
        persistent = str(result).strip() == 'true'
        gs_session.remember_persistent_mode(persistent)
        return jsonify(
            success=True,
            persistent=persistent,
            result=f"Persistent mode {'enabled' if persistent else 'disabled'}",
        )

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


def _request_json_dict() -> dict:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _request_ranges() -> dict:
    if request.method == "POST":
        payload = _request_json_dict()
        raw_ranges = payload.get("ranges", {})
        return _parse_ranges(raw_ranges if isinstance(raw_ranges, dict) else {})
    return _parse_ranges(request.args)


def _int_arg(value: object, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _line_number_for_offset(source: str, offset: int) -> int:
    text = str(source or "")
    if not text:
        return 0
    try:
        raw_offset = int(offset)
    except Exception:
        return 0
    if raw_offset <= 0:
        return 0
    limit = min(raw_offset - 1, len(text))
    line = 1
    pos = 0
    while pos < limit:
        ch = text[pos]
        if ch == "\n":
            line += 1
        elif ch == "\r":
            line += 1
            if pos + 1 < limit and text[pos + 1] == "\n":
                pos += 1
        pos += 1
    return line
