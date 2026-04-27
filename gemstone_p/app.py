"""
GemStone Database Explorer — Flask application.

The current app is a window-heavy single-page tool rather than a small
object-browser-only port. `create_app()` serves the UI plus route groups for:

- object inspection, eval, and inspector helper tabs
- Class Browser reads/writes
- Symbol List Browser
- debugger windows
- transaction and persistent-mode control
- root/version/health metadata
"""

from __future__ import annotations

import os
import shlex
import subprocess
from flask import Flask, jsonify, request, render_template

from gemstone_p import __version__
from gemstone_p.routes_connection import register_connection_routes
from gemstone_p.routes_code import register_code_routes
from gemstone_p.routes_class_browser import register_class_browser_routes
from gemstone_p.routes_debugger import register_debugger_routes
from gemstone_p.routes_maglev import register_maglev_routes
from gemstone_p.routes_object import register_object_routes
from gemstone_p.routes_object_tabs import register_object_tab_routes
from gemstone_p.routes_symbol_list import register_symbol_list_routes
from gemstone_p.routes_transaction import register_transaction_routes
from gemstone_p import session as gs_session
from gemstone_p.object_view import object_view, eval_in_context, _escape_st, _eval_str
from gemstone_py import OOP_NIL
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


def _shell_export_line(name: str, value: str) -> str:
    return f"export {name}={shlex.quote(str(value))}"


def _probe_local_gslist() -> dict:
    payload = {
        "command": ["gslist", "-lcv"],
        "available": False,
        "returnCode": None,
        "entries": [],
        "availableStones": [],
        "availableNetldis": [],
        "error": "",
        "stderr": "",
    }
    try:
        completed = subprocess.run(
            payload["command"],
            capture_output=True,
            text=True,
            timeout=3.0,
            check=False,
        )
    except FileNotFoundError:
        payload["error"] = "gslist not found on PATH"
        return payload
    except Exception as exc:
        payload["error"] = str(exc)
        return payload

    payload["returnCode"] = int(completed.returncode)
    payload["stderr"] = (completed.stderr or "").strip()
    stdout = (completed.stdout or "").strip()
    entries = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("Status") or set(line) == {"-"}:
            continue
        tokens = line.split()
        if len(tokens) < 7:
            continue
        entry_type = tokens[-2]
        entry_name = tokens[-1]
        entries.append({
            "status": tokens[0],
            "version": tokens[1],
            "owner": tokens[2],
            "pid": tokens[3],
            "port": tokens[4],
            "started": " ".join(tokens[5:-2]),
            "type": entry_type,
            "name": entry_name,
        })

    payload["entries"] = entries
    payload["available"] = bool(entries)
    payload["availableStones"] = sorted({
        entry["name"]
        for entry in entries
        if str(entry.get("type", "")).lower() == "stone"
    })
    payload["availableNetldis"] = [
        {"name": entry["name"], "port": entry["port"]}
        for entry in entries
        if str(entry.get("type", "")).lower() == "netldi"
    ]
    if completed.returncode != 0 and not entries:
        payload["error"] = payload["stderr"] or f"gslist exited with {completed.returncode}"
    return payload


def _build_connection_suggestions(configured: dict, probe: dict) -> list[dict]:
    suggestions: list[dict] = []
    available_stones = list(probe.get("availableStones") or [])
    available_netldis = list(probe.get("availableNetldis") or [])
    stone = str(configured.get("stone") or "").strip()
    mode = str(configured.get("mode") or "").strip()
    netldi = str(configured.get("netldi") or "").strip()

    if mode == "local-stone-name" and available_stones and stone and stone not in available_stones:
        if len(available_stones) == 1:
            suggested_stone = available_stones[0]
            suggestions.append({
                "kind": "stone-name",
                "title": f'Configured stone "{stone}" was not found. Local available stone is "{suggested_stone}".',
                "detail": "This client is currently using local stone-name lookup because GS_HOST is local.",
                "env": {"GS_STONE": suggested_stone},
                "shell": _shell_export_line("GS_STONE", suggested_stone),
            })
        else:
            suggestions.append({
                "kind": "stone-list",
                "title": f'Configured stone "{stone}" was not found.',
                "detail": "Available local stones: " + ", ".join(available_stones),
                "env": {},
                "shell": "",
            })

    if mode == "local-stone-name" and available_netldis and netldi not in ("", "netldi"):
        suggestions.append({
            "kind": "mode-note",
            "title": "GS_NETLDI is ignored for local stone-name lookup.",
            "detail": "Set GS_STONE to the local stone name, or use a non-local GS_HOST to force TCP NetLDI login.",
            "env": {},
            "shell": "",
        })

    return suggestions


def _connection_context_payload() -> dict:
    configured = gs_session.connection_snapshot()
    probe = _probe_local_gslist()
    return {
        "configured": configured,
        "probe": probe,
        "suggestions": _build_connection_suggestions(configured, probe),
    }


def _runtime_version_payload() -> dict:
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
    return {
        "success": True,
        "app": __version__,
        "stone": str(stone_ver),
        "gem": str(gem_ver),
    }


def _connection_preflight_payload(exc: Exception | None = None) -> dict:
    payload = {
        "app": __version__,
        "connection": _connection_context_payload(),
    }
    if exc is None:
        try:
            runtime = _runtime_version_payload()
        except Exception as inner:
            exc = inner
        else:
            payload.update({"success": True, "status": "ok", **runtime})
            return payload
    payload.update({
        "success": False,
        "status": "error",
        "exception": str(exc) if exc is not None else "connection failed",
    })
    return payload


def _optional_default_workspace_id(session) -> int | None:
    candidates = (
        "[RubyWorkspace default_instance] on: Error do: [:e | nil]",
        "[RubyWorkspace defaultInstance] on: Error do: [:e | nil]",
    )
    for source in candidates:
        try:
            oop = int(session.eval_oop(source))
        except Exception:
            continue
        if oop != OOP_NIL:
            return oop
    return None


_MAGLEV_REPORT_TITLES = {
    "load-path": "$LOAD_PATH Report",
    "loaded-features": "Loaded Features Report",
    "persistent-features": "Persistent Features Report",
    "finalizer-registry": "MagLev Finalizer Registry Report",
}


def _maglev_list_report_script(title: str, expr: str) -> str:
    escaped_title = _escape_st(title)
    return f"""\
| items stream index text |
items := [{expr}] on: Error do: [:e | nil].
items isNil
  ifTrue: ['{escaped_title}', String cr, String cr, '(not available)']
  ifFalse: [
    stream := WriteStream on: String new.
    stream nextPutAll: '{escaped_title}'; cr; cr.
    items isEmpty
      ifTrue: [stream nextPutAll: '(empty)']
      ifFalse: [
        index := 0.
        [items do: [:each |
          index := index + 1.
          text := [each asString] on: Error do: [:e | [each printString] on: Error do: [:ignored | '(error)']].
          stream
            nextPutAll: index printString;
            nextPutAll: '. ';
            nextPutAll: text;
            cr
        ]] on: Error do: [:e |
          stream nextPutAll: '(error rendering entries: ', e printString, ')'
        ]
      ].
    stream contents
  ]
"""


_MAGLEV_REPORT_SCRIPTS = {
    "load-path": _maglev_list_report_script("$LOAD_PATH Report", "RubyFile loadPath: 1"),
    "loaded-features": _maglev_list_report_script(
        "Loaded Features Report",
        "RubyContext default transientLoadedFeatures: 1",
    ),
    "persistent-features": _maglev_list_report_script(
        "Persistent Features Report",
        "RubyContext default persistentLoadedFeatures: 1",
    ),
    "finalizer-registry": """\
| registry stream index wrote |
registry := [System sessionStateAt: 19] on: Error do: [:e | nil].
registry isNil
  ifTrue: ['MagLev Finalizer Registry Report', String cr, String cr, '(not available)']
  ifFalse: [
    stream := WriteStream on: String new.
    stream nextPutAll: 'MagLev Finalizer Registry Report'; cr; cr.
    [stream nextPutAll: 'printString: '; nextPutAll: registry printString; cr; cr] on: Error do: [:e | nil].
    [stream nextPutAll: 'size: '; nextPutAll: registry size printString; cr; cr] on: Error do: [:e | nil].
    index := 0.
    wrote := false.
    [registry associationsDo: [:assoc |
      index := index + 1.
      index <= 100 ifTrue: [
        wrote := true.
        stream
          nextPutAll: assoc key printString;
          nextPutAll: ' => ';
          nextPutAll: assoc value printString;
          cr
      ]
    ]] on: Error do: [:assocErr |
      [registry do: [:each |
        index := index + 1.
        index <= 100 ifTrue: [
          wrote := true.
          stream
            nextPutAll: index printString;
            nextPutAll: '. ';
            nextPutAll: each printString;
            cr
        ]
      ]] on: Error do: [:eachErr | nil]
    ].
    wrote ifFalse: [stream nextPutAll: '(no enumerable entries)'].
    index > 100 ifTrue: [
      stream cr; nextPutAll: '... truncated after 100 entries'
    ].
    stream contents
  ]
""",
}


def _maglev_report_payload(session, report_key: str) -> dict:
    title = _MAGLEV_REPORT_TITLES.get(report_key, "MagLev Report")
    script = _MAGLEV_REPORT_SCRIPTS.get(report_key)
    if not script:
        return {
            "success": False,
            "available": False,
            "reportKey": report_key,
            "title": title,
            "text": f"{title}\n\n(unknown report)",
        }
    try:
        text = str(session.eval(script) or "")
        return {
            "success": True,
            "available": True,
            "reportKey": report_key,
            "title": title,
            "text": text or f"{title}\n\n(empty)",
        }
    except Exception as exc:
        return {
            "success": False,
            "available": False,
            "reportKey": report_key,
            "title": title,
            "text": f"{title}\n\n(not available)\n\n{exc}",
            "exception": str(exc),
        }


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

    register_object_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        connection_preflight_payload=_connection_preflight_payload,
        default_workspace_id_fn=_optional_default_workspace_id,
        parse_ranges=_parse_ranges,
        request_json_dict=_request_json_dict,
        request_ranges=_request_ranges,
        int_arg=_int_arg,
        object_view_fn=lambda *args, **kwargs: object_view(*args, **kwargs),
        eval_in_context_fn=lambda *args, **kwargs: eval_in_context(*args, **kwargs),
        remember_debug_source_hint=_remember_debug_source_hint,
    )

    # ------------------------------------------------------------------ #
    # Selectors by category                                                #
    # Mirrors GET /code/selectors/:id in mdbe/app.rb                      #
    # ------------------------------------------------------------------ #

    register_code_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        eval_str_fn=_eval_str,
        behavior_prelude_fn=_behavior_prelude,
        encode_src=_ENCODE_SRC,
        escape_st_fn=_escape_st,
        decode_field_fn=_decode_field,
    )

    # ------------------------------------------------------------------ #
    # Class Browser                                                       #
    # Mirrors the bridge/browser workflow from GbsBrowser                 #
    # ------------------------------------------------------------------ #

    register_class_browser_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        eval_str_fn=_eval_str,
        encode_src=_ENCODE_SRC,
        escape_st_fn=_escape_st,
        decode_field_fn=_decode_field,
        as_bool_arg_fn=_as_bool_arg,
        cb_dict_expr_fn=_cb_dict_expr,
        cb_behavior_expr_fn=_cb_behavior_expr,
        cb_error_payload_message_fn=_cb_error_payload_message,
    )

    register_transaction_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        eval_str_fn=_eval_str,
        smalltalk_error_text_fn=_smalltalk_error_text,
        remember_persistent_mode_fn=gs_session.remember_persistent_mode,
    )

    # ------------------------------------------------------------------ #
    # Symbol List Browser                                                  #
    # ------------------------------------------------------------------ #

    register_symbol_list_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        all_users_expr=_ALL_USERS_EXPR,
        all_users_detect_user_expr_fn=_all_users_detect_user_expr,
        escape_st_fn=_escape_st,
        object_view_fn=lambda *args, **kwargs: object_view(*args, **kwargs),
        nil_oop=OOP_NIL,
    )

    register_debugger_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        eval_str_fn=_eval_str,
        object_for_oop_expr_fn=object_for_oop_expr,
        encode_src=_ENCODE_SRC,
        decode_field_fn=_decode_field,
        int_arg_fn=_int_arg,
        debug_source_hint_fn=_debug_source_hint,
        remember_debug_source_hint_fn=_remember_debug_source_hint,
        forget_debug_source_hint_fn=_forget_debug_source_hint,
        debug_object_ref_fn=lambda *args, **kwargs: _debug_object_ref(*args, **kwargs),
        line_number_for_offset_fn=_line_number_for_offset,
    )

    register_object_tab_routes(
        app,
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        eval_str_fn=_eval_str,
        behavior_prelude_fn=_behavior_prelude,
        encode_src=_ENCODE_SRC,
        decode_field_fn=_decode_field,
        debug_object_ref_fn=lambda *args, **kwargs: _debug_object_ref(*args, **kwargs),
        fallback_ref_fn=_fallback_ref,
    )

    register_connection_routes(
        app,
        app_version=__version__,
        runtime_version_payload=_runtime_version_payload,
        connection_preflight_payload=_connection_preflight_payload,
        connection_context_payload=_connection_context_payload,
        broker_snapshot=lambda: gs_session.broker_snapshot(),
    )

    register_maglev_routes(
        app,
        known_report_keys=_MAGLEV_REPORT_TITLES.keys(),
        request_session_factory=lambda **kwargs: gs_session.request_session(**kwargs),
        maglev_report_payload_fn=_maglev_report_payload,
    )

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
