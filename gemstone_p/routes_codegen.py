from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path
from types import ModuleType
from typing import Any

from flask import jsonify, request


def register_codegen_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    cb_dict_expr_fn,
    cb_behavior_expr_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    cb_dict_expr = cb_dict_expr_fn
    cb_behavior_expr = cb_behavior_expr_fn

    @app.get("/codegen/dictionaries")
    def codegen_dictionaries():
        try:
            with request_session(read_only=True) as session:
                raw = eval_str(
                    session,
                    "[ | stream |\n"
                    "stream := WriteStream on: String new.\n"
                    "System myUserProfile symbolList do: [:dict |\n"
                    "  stream nextPutAll: (([dict name] on: Error do: [:e | dict printString]) asString); lf\n"
                    "].\n"
                    "stream contents\n"
                    "] value",
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        dictionaries = [line.strip() for line in str(raw).splitlines() if line.strip()]
        return jsonify(success=True, dictionaries=dictionaries)

    @app.get("/codegen/classes")
    def codegen_classes():
        dictionary = request.args.get("dictionary", "").strip()
        if not dictionary:
            return jsonify(success=False, exception="missing dictionary"), 400
        try:
            with request_session(read_only=True) as session:
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
                    "] value",
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        classes = [
            {"className": line.strip(), "dictionary": dictionary}
            for line in str(raw).splitlines()
            if line.strip()
        ]
        return jsonify(success=True, dictionary=dictionary, classes=classes)

    @app.get("/codegen/class")
    def codegen_class_details():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session(read_only=True) as session:
                raw = eval_str(
                    session,
                    "[ | cls meta encode rows addMethod |\n"
                    f"{encode_src}\n"
                    "rows := OrderedCollection new.\n"
                    f"cls := {cb_behavior_expr(class_name, False, dictionary)}.\n"
                    "cls ifNotNil: [\n"
                    "  [cls instVarNames do: [:name | rows add: ('I|', (encode value: name asString))]] on: Error do: [:e | nil].\n"
                    "  addMethod := [:side :behavior |\n"
                    "    [behavior categoryNames asSortedCollection do: [:cat |\n"
                    "      | selectors |\n"
                    "      selectors := ([behavior selectorsIn: cat] on: Error do: [:e | #()]).\n"
                    "      selectors ifNil: [selectors := #()].\n"
                    "      selectors asSortedCollection do: [:sel |\n"
                    "        rows add: ('M|', side, '|', (encode value: cat asString), '|', (encode value: sel asString))\n"
                    "      ]\n"
                    "    ]] on: Error do: [:e | nil]\n"
                    "  ].\n"
                    "  addMethod value: 'instance' value: cls.\n"
                    "  meta := [cls class] on: Error do: [:e | nil].\n"
                    "  meta ifNotNil: [addMethod value: 'class' value: meta].\n"
                    "].\n"
                    "(String streamContents: [:stream | rows do: [:row | stream nextPutAll: row; lf]])\n"
                    "] value",
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500

        instvars: list[str] = []
        instance_methods: list[dict[str, Any]] = []
        class_methods: list[dict[str, Any]] = []
        for line in str(raw).splitlines():
            if line.startswith("I|"):
                instvars.append(decode_field(line.split("|", 1)[1]))
                continue
            if not line.startswith("M|"):
                continue
            parts = line.split("|", 3)
            if len(parts) != 4:
                continue
            _, side, category, selector = parts
            decoded_selector = decode_field(selector)
            item = {
                "selector": decoded_selector,
                "category": decode_field(category),
                "argCount": decoded_selector.count(":"),
                "pythonName": _selector_to_python_name(decoded_selector),
                "propertyCandidate": side == "instance" and ":" not in decoded_selector,
            }
            if side == "class":
                class_methods.append(item)
            else:
                instance_methods.append(item)
        return jsonify(
            success=True,
            dictionary=dictionary,
            className=class_name,
            instvars=sorted(set(instvars)),
            instanceMethods=instance_methods,
            classMethods=class_methods,
        )

    @app.get("/codegen/protocols")
    def codegen_protocols():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        meta = str(request.args.get("meta", "")).strip().lower() in {"1", "true", "yes", "on"}
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session(read_only=True) as session:
                raw = eval_str(
                    session,
                    "[ | cls encode rows |\n"
                    f"{encode_src}\n"
                    "rows := OrderedCollection new.\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls ifNotNil: [\n"
                    "  [cls categoryNames asSortedCollection do: [:cat |\n"
                    "    rows add: (encode value: cat asString)\n"
                    "  ]] on: Error do: [:e | nil]\n"
                    "].\n"
                    "(String streamContents: [:stream | rows do: [:row | stream nextPutAll: row; lf]])\n"
                    "] value",
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        protocols = [decode_field(line.strip()) for line in str(raw).splitlines() if line.strip()]
        return jsonify(
            success=True,
            dictionary=dictionary,
            className=class_name,
            meta=meta,
            protocols=protocols,
        )

    @app.get("/codegen/methods")
    def codegen_methods():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        protocol = request.args.get("protocol", "").strip()
        if protocol == "-- all --":
            protocol = ""
        meta = str(request.args.get("meta", "")).strip().lower() in {"1", "true", "yes", "on"}
        if not class_name:
            return jsonify(success=False, exception="missing class"), 400
        try:
            with request_session(read_only=True) as session:
                raw = eval_str(
                    session,
                    "[ | cls encode rows categories |\n"
                    f"{encode_src}\n"
                    "rows := OrderedCollection new.\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls ifNotNil: [\n"
                    f"  categories := '{escape_st(protocol)}' isEmpty\n"
                    "    ifTrue: [cls categoryNames]\n"
                    f"    ifFalse: [Array with: '{escape_st(protocol)}'].\n"
                    "  [categories asSortedCollection do: [:cat |\n"
                    "    | selectors |\n"
                    "    selectors := ([cls selectorsIn: cat] on: Error do: [:e | #()]).\n"
                    "    selectors ifNil: [selectors := #()].\n"
                    "    selectors asSortedCollection do: [:sel |\n"
                    "      rows add: ((encode value: cat asString), '|', (encode value: sel asString))\n"
                    "    ]\n"
                    "  ]] on: Error do: [:e | nil]\n"
                    "].\n"
                    "(String streamContents: [:stream | rows do: [:row | stream nextPutAll: row; lf]])\n"
                    "] value",
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        methods = []
        for line in str(raw).splitlines():
            if "|" not in line:
                continue
            category, selector = line.split("|", 1)
            decoded_selector = decode_field(selector)
            methods.append({
                "selector": decoded_selector,
                "category": decode_field(category),
                "argCount": decoded_selector.count(":"),
                "pythonName": _selector_to_python_name(decoded_selector),
                "propertyCandidate": not meta and ":" not in decoded_selector,
            })
        return jsonify(
            success=True,
            dictionary=dictionary,
            className=class_name,
            meta=meta,
            protocol=protocol,
            methods=methods,
        )

    @app.get("/codegen/source")
    def codegen_source():
        class_name = request.args.get("class", "").strip()
        dictionary = request.args.get("dictionary", "").strip()
        selector = request.args.get("selector", "").strip()
        meta = str(request.args.get("meta", "")).strip().lower() in {"1", "true", "yes", "on"}
        if not class_name or not selector:
            return jsonify(success=False, exception="missing class or selector"), 400
        try:
            with request_session(read_only=True) as session:
                source = eval_str(
                    session,
                    f"| cls meth |\n"
                    f"cls := {cb_behavior_expr(class_name, meta, dictionary)}.\n"
                    "cls ifNil: [ '' ] ifNotNil: [\n"
                    f"  meth := cls compiledMethodAt: '{escape_st(selector)}' asSymbol ifAbsent: [nil].\n"
                    "  meth ifNil: [ '' ] ifNotNil: [[meth sourceString] on: Error do: [:e | '']]\n"
                    "]",
                )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, source=str(source), className=class_name, selector=selector, meta=meta)

    @app.post("/codegen/preview")
    def codegen_preview():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(success=False, exception="expected JSON object"), 400
        try:
            selection = _normalize_selection(payload)
            protocol_source = _render_protocol_source(selection)
            files = _generate_preview_files(selection["moduleName"], protocol_source)
        except ValueError as exc:
            return jsonify(success=False, exception=str(exc)), 400
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            selection=selection,
            protocolSource=protocol_source,
            files=files,
            warnings=sorted({
                warning
                for file in files
                for warning in file.get("warnings", [])
            }),
        )

    @app.post("/codegen/export-selection")
    def codegen_export_selection():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(success=False, exception="expected JSON object"), 400
        try:
            selection = _normalize_selection(payload)
        except ValueError as exc:
            return jsonify(success=False, exception=str(exc)), 400
        return jsonify(success=True, selection=selection, json=json.dumps(selection, indent=2, sort_keys=True))


def _normalize_selection(payload: dict[str, Any]) -> dict[str, Any]:
    module_name = str(payload.get("moduleName") or "gemstone_codegen_preview_protocols").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*", module_name):
        raise ValueError("moduleName must be a valid Python module path")
    classes = payload.get("classes")
    if not isinstance(classes, list) or not classes:
        raise ValueError("select at least one class")
    normalized_classes = [_normalize_class_selection(item) for item in classes]
    return {
        "schemaVersion": 1,
        "moduleName": module_name,
        "async": bool(payload.get("async", True)),
        "classes": normalized_classes,
    }


def _normalize_class_selection(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("class selection must be an object")
    class_name = str(raw.get("className") or "").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", class_name):
        raise ValueError(f"invalid className {class_name!r}")
    protocol_name = str(raw.get("protocolName") or f"{class_name}Proto").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", protocol_name):
        raise ValueError(f"invalid protocolName {protocol_name!r}")
    fields = sorted({
        _python_identifier(str(field or "").strip(), "field")
        for field in raw.get("fields", [])
        if str(field or "").strip()
    })
    methods = _normalize_methods(raw.get("methods", []), class_side=False)
    class_methods = _normalize_methods(raw.get("classMethods", []), class_side=True)
    if not fields and not methods and not class_methods:
        raise ValueError(f"{class_name} has no selected fields or methods")
    return {
        "className": class_name,
        "protocolName": protocol_name,
        "dictionary": str(raw.get("dictionary") or "").strip(),
        "fields": fields,
        "methods": methods,
        "classMethods": class_methods,
    }


def _normalize_methods(raw_methods: Any, *, class_side: bool) -> list[dict[str, Any]]:
    if not isinstance(raw_methods, list):
        return []
    normalized: list[dict[str, Any]] = []
    seen: set[tuple[str, bool]] = set()
    for raw in raw_methods:
        if not isinstance(raw, dict):
            continue
        selector = str(raw.get("selector") or "").strip()
        if not selector:
            continue
        key = (selector, class_side)
        if key in seen:
            continue
        seen.add(key)
        arg_count = selector.count(":")
        arg_names = raw.get("argNames")
        if not isinstance(arg_names, list) or len(arg_names) != arg_count:
            arg_names = [f"arg{index + 1}" for index in range(arg_count)]
        arg_names = [
            _python_identifier(str(name or "").strip(), f"arg{index + 1}")
            for index, name in enumerate(arg_names)
        ]
        python_name = _python_identifier(
            str(raw.get("pythonName") or _selector_to_python_name(selector)).strip(),
            "method",
        )
        normalized.append({
            "selector": selector,
            "pythonName": python_name,
            "argNames": arg_names,
            "returnAnnotation": _python_annotation(str(raw.get("returnAnnotation") or "Any").strip() or "Any"),
        })
    return normalized


def _python_annotation(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_., \[\]\|]+", value):
        raise ValueError(f"unsafe returnAnnotation {value!r}")
    if "\n" in value or "\r" in value:
        raise ValueError(f"unsafe returnAnnotation {value!r}")
    return value


def _render_protocol_source(selection: dict[str, Any]) -> str:
    lines = [
        '"""Generated Protocol draft from python-gemstone-database-explorer.',
        "",
        "Review this file, check it into your application, then run gemstone-codegen.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "from typing import Any, Protocol",
        "",
        "from gemstone_py import gemstone_class, gemstone_selector",
        "",
        "",
    ]
    include_async = bool(selection.get("async", True))
    for class_spec in selection["classes"]:
        async_arg = ", async_=True" if include_async else ""
        lines.append(f"@gemstone_class({class_spec['className']!r}{async_arg})")
        lines.append(f"class {class_spec['protocolName']}(Protocol):")
        body: list[str] = []
        for field in class_spec["fields"]:
            body.append(f"    {field}: Any")
        for method in class_spec["classMethods"]:
            body.extend(_render_protocol_method(method, class_side=True))
        for method in class_spec["methods"]:
            body.extend(_render_protocol_method(method, class_side=False))
        if not body:
            body.append("    pass")
        lines.extend(body)
        lines.extend(["", ""])
    return "\n".join(lines).rstrip() + "\n"


def _render_protocol_method(method: dict[str, Any], *, class_side: bool) -> list[str]:
    args = ["cls" if class_side else "self", *method["argNames"]]
    typed_args = [args[0], *(f"{name}: Any" for name in args[1:])]
    lines = [
        f"    @gemstone_selector({method['selector']!r})",
    ]
    if class_side:
        lines.insert(0, "    @classmethod")
    lines.append(
        f"    def {method['pythonName']}({', '.join(typed_args)}) -> {method['returnAnnotation']}: ..."
    )
    return lines


def _generate_preview_files(module_name: str, protocol_source: str) -> list[dict[str, Any]]:
    from gemstone_py.codegen import generate_package

    module = ModuleType(module_name)
    module.__file__ = f"<{module_name}>"
    sys.modules[module_name] = module
    try:
        exec(compile(protocol_source, module.__file__, "exec"), module.__dict__)
        with tempfile.TemporaryDirectory(prefix="gemstone-codegen-preview-") as temp_dir:
            output_dir = Path(temp_dir) / "generated"
            generated = generate_package(module_name, output_dir, check=False, clean=True)
            files = []
            for file in generated:
                files.append({
                    "path": str(file.path.relative_to(output_dir)),
                    "source": file.source,
                    "className": file.class_name,
                    "protocolName": file.protocol_name,
                    "warnings": list(file.warnings),
                })
            return files
    finally:
        sys.modules.pop(module_name, None)


def _selector_to_python_name(selector: str) -> str:
    parts = [part for part in selector.split(":") if part]
    if not parts:
        base = selector
    elif len(parts) == 1 and ":" not in selector:
        base = parts[0]
    else:
        base = "_".join(parts)
    name = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", base)
    name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    name = re.sub(r"[^0-9A-Za-z_]+", "_", name).strip("_").lower()
    return _python_identifier(name or "method", "method")


def _python_identifier(value: str, fallback: str) -> str:
    name = re.sub(r"[^0-9A-Za-z_]+", "_", value).strip("_")
    if not name:
        name = fallback
    if name[0].isdigit():
        name = f"_{name}"
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        name = fallback
    return name
