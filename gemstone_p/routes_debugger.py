from __future__ import annotations

import re

from flask import jsonify, request
from gemstone_py import OOP_FALSE, OOP_NIL, OOP_TRUE
from gemstone_py.client import OopRef


def register_debugger_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    object_for_oop_expr_fn,
    encode_src: str,
    decode_field_fn,
    int_arg_fn,
    debug_source_hint_fn,
    remember_debug_source_hint_fn,
    forget_debug_source_hint_fn,
    debug_object_ref_fn,
    line_number_for_offset_fn,
) -> None:
    _LINE_RE = re.compile(r"\bline\s+(\d+)\b", re.IGNORECASE)

    def _reported_line_number(summary: str) -> int:
        match = _LINE_RE.search(str(summary or ""))
        if not match:
            return 0
        try:
            return int(match.group(1))
        except Exception:
            return 0

    def _is_true_result(raw) -> bool:
        value = str(raw or "").strip().lower()
        return value not in {"", "0", "false", "nil"} and not value.startswith(("err:", "error:"))

    def _ensure_oop_ref(session, value) -> OopRef | None:
        if isinstance(value, OopRef):
            return value
        try:
            oop = int(value)
        except Exception:
            return None
        if oop <= 0:
            return None
        return OopRef(oop, session)

    def _marshal_to_oop(session, value) -> int | None:
        if isinstance(value, OopRef):
            return int(value.oop)
        if value is None:
            return int(OOP_NIL)
        if value is True:
            return int(OOP_TRUE)
        if value is False:
            return int(OOP_FALSE)
        if isinstance(value, int):
            try:
                return int(session.int_oop(value))
            except Exception:
                return None
        return None

    def _send_safe(session, receiver, selector: str, *args, default=None):
        ref = _ensure_oop_ref(session, receiver)
        if ref is None:
            return default
        try:
            return ref.send(selector, *args)
        except Exception:
            return default

    def _debug_action_succeeded(result) -> bool:
        if result is None or result is False:
            return False
        if isinstance(result, OopRef):
            return int(result.oop) not in {int(OOP_FALSE), int(OOP_NIL)}
        if isinstance(result, str):
            return _is_true_result(result)
        if isinstance(result, int):
            return result not in {0, int(OOP_FALSE), int(OOP_NIL)}
        return True

    def _safe_print_string(session, value, fallback: str = "") -> str:
        if value is None:
            return fallback
        if isinstance(value, str):
            return value
        if isinstance(value, (int, bool)):
            receiver_oop = _marshal_to_oop(session, value)
            rendered = _send_safe(session, receiver_oop, "printString", default=None)
            return str(rendered) if isinstance(rendered, str) else str(value)
        rendered = _send_safe(session, value, "printString", default=None)
        return str(rendered) if isinstance(rendered, str) else fallback

    def _collection_size(session, value) -> int:
        size = _send_safe(session, value, "size", default=0)
        try:
            return max(0, int(size))
        except Exception:
            return 0

    def _collection_at(session, value, index: int, default=None):
        return _send_safe(session, value, "at:", int(index), default=default)

    def _reported_or_offset_line_number(source: str, source_offset: int, summary: str) -> int:
        return _reported_line_number(summary) or line_number_for_offset_fn(source, source_offset) or (1 if source else 0)

    def _source_offset_from_detail(session, detail, step_point: int) -> int:
        if step_point <= 0:
            return 0
        offsets = _collection_at(session, detail, 6, default=None)
        raw_offset = _collection_at(session, offsets, step_point, default=0)
        try:
            return max(0, int(raw_offset))
        except Exception:
            return 0

    def _variable_entries_from_detail(session, detail, debug_object_ref_fn) -> list[dict]:
        names = _collection_at(session, detail, 7, default=None)
        values = _collection_at(session, detail, 8, default=None)
        size = min(_collection_size(session, names), _collection_size(session, values))
        variables: list[dict] = []
        for index in range(1, size + 1):
            raw_name = _collection_at(session, names, index, default="")
            name = str(raw_name or "")
            raw_value = _collection_at(session, values, index, default=None)
            value_oop = _marshal_to_oop(session, raw_value)
            value_text = _safe_print_string(session, raw_value, "")
            value_object = debug_object_ref_fn(session, value_oop, value_text)
            variables.append({
                "name": name,
                "value": value_object.get("inspection", "") or value_text,
                "valueObject": value_object,
            })
        return variables

    def _context_method_name(session, ctx, fallback: str = "unknown") -> str:
        receiver = _send_safe(session, ctx, "receiver", default=None)
        receiver_class = _send_safe(session, receiver, "class", default=None)
        owner_name = _safe_print_string(session, _send_safe(session, receiver_class, "name", default=None), "")
        method = _send_safe(session, ctx, "method", default=None)
        selector_name = _safe_print_string(session, _send_safe(session, method, "selector", default=None), "")
        if owner_name and selector_name:
            return f"{owner_name}>>{selector_name}"
        return _safe_print_string(session, ctx, fallback)

    def _context_chain(session, process_oop: int, max_frames: int = 50) -> list[tuple[int, OopRef]]:
        start = _send_safe(session, process_oop, "suspendedContext", default=None)
        if start is None:
            start = _send_safe(session, process_oop, "topContext", default=None)
        if start is None:
            candidate = _ensure_oop_ref(session, process_oop)
            if candidate is not None and _send_safe(session, candidate, "sender", default=None) is not None:
                start = candidate
        frames: list[tuple[int, OopRef]] = []
        ctx = _ensure_oop_ref(session, start)
        level = 0
        while ctx is not None and level < max_frames:
            frames.append((level, ctx))
            ctx = _ensure_oop_ref(session, _send_safe(session, ctx, "sender", default=None))
            level += 1
        return frames

    def _is_internal_debugger_frame(name: str) -> bool:
        compact = str(name or "").lower().replace(" ", "")
        if ">>" not in compact:
            return False
        owner, selector = compact.split(">>", 1)
        if selector.startswith("_signal"):
            return True
        if selector.startswith("_error"):
            return True
        if selector in {"signal", "defaultaction", "_defaultaction"} and (
            "exception" in owner or "error" in owner or "zerodivide" in owner
        ):
            return True
        return "(abstractexception)>>" in compact

    def _visible_debug_frames(session, process_oop: int) -> list[dict]:
        chain = _context_chain(session, process_oop)
        named = [{"index": level, "name": _context_method_name(session, ctx, f"frame {level}")} for level, ctx in chain]
        while named and _is_internal_debugger_frame(named[0]["name"]):
            named.pop(0)
        return named or [{"index": level, "name": _context_method_name(session, ctx, f"frame {level}")} for level, ctx in chain]

    def _has_live_debugger_process(session, process_oop: int) -> bool:
        if isinstance(_send_safe(session, process_oop, "suspendedContext", default=None), OopRef):
            return True
        ps = _send_safe(session, process_oop, "printString", default="")
        return isinstance(ps, str) and ps.startswith("GsProcess(")

    def _live_debug_frame_payload(session, process_oop: int, frame_index: int, debug_object_ref_fn) -> dict:
        chain = _context_chain(session, process_oop)
        target = next((ctx for level, ctx in chain if level == frame_index), None)
        if target is None:
            return {
                "methodName": "(no frame)",
                "ipOffset": 0,
                "selfPrintString": "",
                "selfObject": debug_object_ref_fn(session, None, ""),
                "source": "",
                "sourceOffset": 0,
                "stepPoint": 0,
                "lineNumber": 0,
                "hasFrame": False,
                "canStep": False,
                "variables": [],
                "frameIndex": frame_index,
            }

        method_name = _context_method_name(session, target, "(no frame)")
        receiver = _send_safe(session, target, "receiver", default=None)
        receiver_oop = _marshal_to_oop(session, receiver)
        self_ps = _safe_print_string(session, receiver, "")
        detail = _send_safe(session, process_oop, "_gsiDebuggerDetailedReportAt:", frame_index + 1, default=None)
        source = (
            _safe_print_string(session, _send_safe(session, target, "sourceCode", default=None), "")
            or _safe_print_string(session, _send_safe(session, target, "sourceString", default=None), "")
            or _safe_print_string(session, _collection_at(session, detail, 9, default=None), "")
            or _safe_print_string(session, _send_safe(session, _send_safe(session, target, "method", default=None), "sourceString", default=None), "")
            or _safe_print_string(session, _send_safe(session, _send_safe(session, target, "homeMethod", default=None), "sourceString", default=None), "")
        )
        step_point = _collection_at(session, detail, 5, default=0)
        try:
            step_point = max(0, int(step_point))
        except Exception:
            step_point = 0
        source_offset = _source_offset_from_detail(session, detail, step_point)
        variables = _variable_entries_from_detail(session, detail, debug_object_ref_fn)
        self_object = debug_object_ref_fn(session, receiver_oop, self_ps)
        line_number = _reported_or_offset_line_number(source, source_offset, method_name)
        return {
            "methodName": method_name,
            "ipOffset": 0,
            "selfPrintString": self_ps,
            "selfObject": self_object,
            "source": source,
            "sourceOffset": source_offset,
            "stepPoint": step_point,
            "lineNumber": line_number,
            "hasFrame": True,
            "canStep": step_point > 0,
            "variables": variables,
            "frameIndex": frame_index,
        }

    def _live_thread_local_entries(session, process_oop: int) -> list[dict]:
        storage = _send_safe(session, process_oop, "threadStorage", default=None)
        size = _collection_size(session, storage)
        entries: list[dict] = []
        for index in range(1, size + 1):
            assoc = _collection_at(session, storage, index, default=None)
            key = _send_safe(session, assoc, "key", default=None)
            value = _send_safe(session, assoc, "value", default=None)
            key_oop = _marshal_to_oop(session, key)
            value_oop = _marshal_to_oop(session, value)
            key_text = _safe_print_string(session, key, "")
            value_text = _safe_print_string(session, value, "")
            entries.append({
                "key": key_text,
                "value": value_text,
                "keyObject": debug_object_ref_fn(session, key_oop, key_text),
                "valueObject": debug_object_ref_fn(session, value_oop, value_text),
            })
        return entries

    def _direct_debug_action(session, process_oop: int, calls: list[tuple[str, list[int]]]) -> bool | None:
        if not _has_live_debugger_process(session, process_oop):
            return None
        for selector, args in calls:
            result = _send_safe(session, process_oop, selector, *args, default=Ellipsis)
            if result is not Ellipsis and _debug_action_succeeded(result):
                return True
        return False

    def _direct_trim_action(session, process_oop: int, frame_index: int) -> bool | None:
        if not _has_live_debugger_process(session, process_oop):
            return None
        chain = _context_chain(session, process_oop)
        target = next((ctx for level, ctx in chain if level == frame_index), None)
        if target is not None:
            result = _send_safe(session, process_oop, "trimTo:", target, default=Ellipsis)
            if result is not Ellipsis and _debug_action_succeeded(result):
                return True
        return _direct_debug_action(
            session,
            process_oop,
            [
                ("trimStackToLevel:", [frame_index + 1]),
                ("_trimStackToLevel:", [frame_index + 1]),
            ],
        )

    def _direct_restart_action(session, process_oop: int, frame_index: int) -> bool | None:
        if not _has_live_debugger_process(session, process_oop):
            return None
        chain = _context_chain(session, process_oop)
        target = next((ctx for level, ctx in chain if level == frame_index), None)
        trim_result = Ellipsis
        if target is not None:
            trim_result = _send_safe(session, process_oop, "trimTo:", target, default=Ellipsis)
        if trim_result is Ellipsis or not _debug_action_succeeded(trim_result):
            for selector in ("trimStackToLevel:", "_trimStackToLevel:"):
                trim_result = _send_safe(session, process_oop, selector, frame_index + 1, default=Ellipsis)
                if trim_result is not Ellipsis and _debug_action_succeeded(trim_result):
                    break
        if trim_result is Ellipsis or not _debug_action_succeeded(trim_result):
            return False
        restart_result = _send_safe(session, process_oop, "restart", default=Ellipsis)
        return restart_result is not Ellipsis and _debug_action_succeeded(restart_result)

    def _debug_process_resolver(oop: int) -> str:
        return (
            f"obj := {object_for_oop_expr_fn(oop)}.\n"
            f"proc := obj.\n"
            f"((proc respondsTo: #_gsiDebuggerDetailedReportAt:) not) ifTrue: [\n"
            f"  (obj respondsTo: #serverProcess) ifTrue: [ proc := [ obj serverProcess ] on: Error do: [:e | proc ] ]\n"
            f"].\n"
            f"((proc respondsTo: #_gsiDebuggerDetailedReportAt:) not and: [ obj respondsTo: #process ]) ifTrue: [\n"
            f"  proc := [ obj process ] on: Error do: [:e | proc ]\n"
            f"].\n"
            f"((proc respondsTo: #_gsiDebuggerDetailedReportAt:) not and: [ obj respondsTo: #topContext ]) ifTrue: [\n"
            f"  | top |\n"
            f"  top := [ obj topContext ] on: Error do: [:e | nil ].\n"
            f"  (top notNil and: [ top respondsTo: #process ]) ifTrue: [ proc := [ top process ] on: Error do: [:e | proc ] ]\n"
            f"].\n"
        )

    def _debug_context_resolver(level_var: str = "frameLevel") -> str:
        return (
            f"contextSkip := {level_var} - 1.\n"
            f"contextSkip < 0 ifTrue: [contextSkip := 0].\n"
            f"ctx := [proc suspendedContext] on: Error do: [:e | nil].\n"
            f"ctx isNil ifTrue: [\n"
            f"  ctx := [obj suspendedContext] on: Error do: [:e | nil]\n"
            f"].\n"
            f"ctx isNil ifTrue: [\n"
            f"  ctx := [obj topContext] on: Error do: [:e | nil]\n"
            f"].\n"
            f"1 to: contextSkip do: [:i |\n"
            f"  ctx notNil ifTrue: [\n"
            f"    ctx := [ctx sender] on: Error do: [:e | nil]\n"
            f"  ]\n"
            f"].\n"
        )

    def _debug_step_script(oop: int, selectors: list[str], level: int) -> str:
        safe_level = max(1, int(level or 1))
        selector_lines = "".join(
            f"(result isNil and: [proc respondsTo: #{selector}]) ifTrue: [\n"
            f"  result := [proc perform: #{selector} with: stepLevel] on: Error do: [:e | nil]\n"
            f"].\n"
            for selector in selectors
        )
        return (
            f"[ | obj proc result stepLevel |\n"
            f"{_debug_process_resolver(oop)}"
            f"stepLevel := {safe_level}.\n"
            f"result := nil.\n"
            f"{selector_lines}"
            f"(result isNil or: [result == false]) ifTrue: ['false'] ifFalse: [result printString]\n"
            f"] value"
        )

    def _debug_restart_script(oop: int, level: int) -> str:
        safe_level = max(1, int(level or 1))
        return (
            f"[ | obj proc result restartLevel ctx idx restarted |\n"
            f"{_debug_process_resolver(oop)}"
            f"restartLevel := {safe_level}.\n"
            f"ctx := [proc suspendedContext] on: Error do: [:e | nil].\n"
            f"idx := 1.\n"
            f"[ctx notNil and: [idx < restartLevel]] whileTrue: [\n"
            f"  ctx := [ctx sender] on: Error do: [:e | nil].\n"
            f"  idx := idx + 1\n"
            f"].\n"
            f"result := nil.\n"
            f"(ctx notNil and: [proc respondsTo: #trimTo:]) ifTrue: [\n"
            f"  result := [proc trimTo: ctx] on: Error do: [:e | nil]\n"
            f"].\n"
            f"(result isNil and: [proc respondsTo: #trimStackToLevel:]) ifTrue: [\n"
            f"  result := [proc trimStackToLevel: restartLevel] on: Error do: [:e | nil]\n"
            f"].\n"
            f"(result isNil and: [proc respondsTo: #_trimStackToLevel:]) ifTrue: [\n"
            f"  result := [proc _trimStackToLevel: restartLevel] on: Error do: [:e | nil]\n"
            f"].\n"
            f"restarted := nil.\n"
            f"(result notNil and: [proc respondsTo: #restart]) ifTrue: [\n"
            f"  restarted := [proc restart] on: Error do: [:e | nil]\n"
            f"].\n"
            f"(result isNil or: [restarted isNil or: [restarted == false]]) ifTrue: ['false'] ifFalse: [restarted printString]\n"
            f"] value"
        )

    @app.get("/debug/threads")
    def debug_threads():
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| result |\n"
                    f"{encode_src}\n"
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
                    if "|" in line:
                        parts = line.split("|", 3)
                        try:
                            oop = int(decode_field_fn(parts[0]).strip())
                        except ValueError:
                            continue
                        print_string = decode_field_fn(parts[1]) if len(parts) > 1 else ""
                        exception_text = decode_field_fn(parts[2]) if len(parts) > 2 else ""
                        source_preview = decode_field_fn(parts[3]) if len(parts) > 3 else ""
                        if not source_preview:
                            source_preview = debug_source_hint_fn(oop)
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
        try:
            with request_session_factory() as session:
                if _has_live_debugger_process(session, oop):
                    frames = _visible_debug_frames(session, oop)
                else:
                    raw = eval_str_fn(
                        session,
                        f"| obj proc result frameLevel maxFrames methodName ctx contextSkip receiver ownerName selectorName |\n"
                        f"{encode_src}\n"
                        f"{_debug_process_resolver(oop)}"
                        f"result := ''.\n"
                        f"maxFrames := 50.\n"
                        f"[\n"
                        f"{_debug_context_resolver('1')}"
                        f"  frameLevel := 0.\n"
                        f"  [ctx notNil and: [frameLevel < maxFrames]] whileTrue: [\n"
                        f"    receiver := [ctx receiver] on: Error do: [:e | nil].\n"
                        f"    ownerName := ''.\n"
                        f"    receiver notNil ifTrue: [\n"
                        f"      ownerName := [[receiver class name asString] on: Error do: [:e | '']] on: Error do: [:e | '']\n"
                        f"    ].\n"
                        f"    selectorName := [[[ctx method] selector asString] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                        f"    methodName := ((ownerName notEmpty) and: [selectorName notEmpty])\n"
                        f"      ifTrue: [ownerName , '>>' , selectorName]\n"
                        f"      ifFalse: [[[ctx printString] on: Error do: [:e | 'unknown']] on: Error do: [:e | 'unknown']].\n"
                        f"    result := result , frameLevel printString , '|'\n"
                        f"      , (encode value: methodName) , String lf asString.\n"
                        f"    ctx := [ctx sender] on: Error do: [:e | nil].\n"
                        f"    frameLevel := frameLevel + 1\n"
                        f"  ]\n"
                        f"] on: Error do: [:e | result := '0|(error: ' , e messageText , ')'].\n"
                        f"result"
                    )
                    frames = []
                    for line in str(raw).splitlines():
                        if "|" in line:
                            idx_s, _, name = line.partition("|")
                            try:
                                frames.append({"index": int(idx_s), "name": decode_field_fn(name)})
                            except ValueError:
                                pass
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, frames=frames)

    @app.get("/debug/frame/<int:oop>")
    def debug_frame(oop: int):
        frame_index = int(request.args.get("index", 0))
        try:
            with request_session_factory() as session:
                if _has_live_debugger_process(session, oop):
                    payload = _live_debug_frame_payload(session, oop, frame_index, debug_object_ref_fn)
                    if not payload.get("source") and frame_index == 0:
                        payload["source"] = debug_source_hint_fn(oop)
                        payload["lineNumber"] = _reported_or_offset_line_number(
                            str(payload.get("source", "")),
                            int(payload.get("sourceOffset", 0) or 0),
                            str(payload.get("methodName", "")),
                        )
                    method_name = payload["methodName"]
                    ip_offset = payload["ipOffset"]
                    self_ps = payload["selfPrintString"]
                    self_object = payload["selfObject"]
                    source = payload["source"]
                    source_offset = payload["sourceOffset"]
                    step_point = payload["stepPoint"]
                    line_number = payload["lineNumber"]
                    variables = payload["variables"]
                    has_frame = bool(payload["hasFrame"])
                    can_step = bool(payload["canStep"])
                else:
                    raw = eval_str_fn(
                        session,
                        f"| obj proc source receiver selfPs selfOop vars methodName ipOffset varLines stepPoint sourceOffset offsets rawOffset stackReport summary detail tempNames tempValues frameLevel ipValue stepValue n encode ctx contextSkip |\n"
                        f"{encode_src}\n"
                        f"{_debug_process_resolver(oop)}"
                        f"frameLevel := {frame_index + 1}.\n"
                        f"{_debug_context_resolver()}"
                        f"stackReport := [proc _gsiStackReportFromLevel: frameLevel toLevel: frameLevel] on: Error do: [:e | nil].\n"
                        f"summary := ((stackReport notNil) and: [stackReport size >= 1])\n"
                        f"  ifTrue: [[stackReport at: 1] on: Error do: [:e | '']]\n"
                        f"  ifFalse: [''].\n"
                        f"detail := [proc _gsiDebuggerDetailedReportAt: frameLevel] on: Error do: [:e | nil].\n"
                        f"((detail isNil) and: [ctx isNil]) ifTrue: [\n"
                        f"  (encode value: '(no frame)') , '|'\n"
                        f"    , (encode value: '0') , '|'\n"
                        f"    , (encode value: '') , '|'\n"
                        f"    , (encode value: '20') , '|'\n"
                        f"    , (encode value: '') , '|'\n"
                        f"    , (encode value: '0') , '|'\n"
                        f"    , (encode value: '0') , '|'\n"
                        f"    , (encode value: '')\n"
                        f"] ifFalse: [\n"
                        f"  methodName := summary.\n"
                        f"  ((methodName isNil) or: [methodName isEmpty]) ifTrue: [\n"
                        f"    methodName := [[detail first printString] on: Error do: [:e | '']] on: Error do: [:e | '']\n"
                        f"  ].\n"
                        f"  ((methodName isNil) or: [methodName isEmpty]) ifTrue: [\n"
                        f"    methodName := (ctx notNil)\n"
                        f"      ifTrue: [[[ctx printString] on: Error do: [:e | 'unknown']] on: Error do: [:e | 'unknown']]\n"
                        f"      ifFalse: ['unknown']\n"
                        f"  ].\n"
                        f"  receiver := [[detail at: 2] on: Error do: [:e | nil]] on: Error do: [:e | nil].\n"
                        f"  receiver isNil ifTrue: [\n"
                        f"    receiver := (ctx notNil)\n"
                        f"      ifTrue: [[ctx receiver] on: Error do: [:e | nil]]\n"
                        f"      ifFalse: [nil]\n"
                        f"  ].\n"
                        f"  selfPs := [receiver printString] on: Error do: [:e | '?'].\n"
                        f"  selfOop := [receiver asOop printString] on: Error do: [:e | '20'].\n"
                        f"  source := [[detail at: 9] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                        f"  source isNil ifTrue: [source := ''].\n"
                        f"  source := source withBlanksTrimmed.\n"
                        f"  (source isEmpty and: [ctx notNil]) ifTrue: [\n"
                        f"    source := [[ctx sourceCode] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                        f"    source isNil ifTrue: [source := ''].\n"
                        f"    source := source withBlanksTrimmed.\n"
                        f"  ].\n"
                        f"  (source isEmpty and: [ctx notNil]) ifTrue: [\n"
                        f"    source := [[ctx sourceString] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                        f"    source isNil ifTrue: [source := ''].\n"
                        f"    source := source withBlanksTrimmed.\n"
                        f"  ].\n"
                        f"  (source isEmpty and: [ctx notNil]) ifTrue: [\n"
                        f"    source := [[[ctx method] sourceString] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                        f"    source isNil ifTrue: [source := ''].\n"
                        f"    source := source withBlanksTrimmed.\n"
                        f"  ].\n"
                        f"  (source isEmpty and: [ctx notNil]) ifTrue: [\n"
                        f"    source := [[[ctx homeMethod] sourceString] on: Error do: [:e | '']] on: Error do: [:e | ''].\n"
                        f"    source isNil ifTrue: [source := ''].\n"
                        f"    source := source withBlanksTrimmed.\n"
                        f"  ].\n"
                        f"  source := source size > 4000\n"
                        f"    ifTrue: [source copyFrom: 1 to: 4000]\n"
                        f"    ifFalse: [source].\n"
                        f"  ipValue := [detail at: 10] on: Error do: [:e | 0].\n"
                        f"  ipOffset := [ipValue printString] on: Error do: [:e | '0'].\n"
                        f"  varLines := OrderedCollection new.\n"
                        f"  tempNames := [[detail at: 7] on: Error do: [:e | #()]] on: Error do: [:e | #()].\n"
                        f"  tempValues := [[detail at: 8] on: Error do: [:e | #()]] on: Error do: [:e | #()].\n"
                        f"  [1 to: tempNames size do: [:i |\n"
                        f"    | v voop |\n"
                        f"    n := [tempNames at: i] on: Error do: [:e | ''].\n"
                        f"    v := [tempValues at: i ifAbsent: [nil]] on: Error do: [:e | nil].\n"
                        f"    voop := [v asOop printString] on: Error do: [:e | '20'].\n"
                        f"    varLines add: ((encode value: n asString) , Character tab asString , (encode value: voop))\n"
                        f"  ]] on: Error do: [:e | ].\n"
                        f"  vars := String streamContents: [:stream |\n"
                        f"    varLines doWithIndex: [:line :lineIndex |\n"
                        f"      lineIndex > 1 ifTrue: [stream nextPut: Character lf].\n"
                        f"      stream nextPutAll: line\n"
                        f"    ]\n"
                        f"  ].\n"
                        f"  stepValue := [detail at: 5] on: Error do: [:e | 0].\n"
                        f"  stepPoint := [stepValue printString] on: Error do: [:e | '0'].\n"
                        f"  offsets := [[detail at: 6] on: Error do: [:e | #()]] on: Error do: [:e | #()].\n"
                        f"  sourceOffset := '0'.\n"
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
                    parts = str(raw).split("|", 7)
                    method_name = decode_field_fn(parts[0]) if len(parts) > 0 else ""
                    ip_offset = decode_field_fn(parts[1]) if len(parts) > 1 else "0"
                    self_ps = decode_field_fn(parts[2]) if len(parts) > 2 else ""
                    self_oop_raw = decode_field_fn(parts[3]) if len(parts) > 3 else ""
                    source = decode_field_fn(parts[4]) if len(parts) > 4 else ""
                    source_offset = int_arg_fn(decode_field_fn(parts[5]) if len(parts) > 5 else "0", 0)
                    step_point = int_arg_fn(decode_field_fn(parts[6]) if len(parts) > 6 else "0", 0)
                    vars_raw = decode_field_fn(parts[7]) if len(parts) > 7 else ""
                    if not source and frame_index == 0:
                        source = debug_source_hint_fn(oop)
                    line_number = _reported_or_offset_line_number(source, source_offset, method_name)
                    self_object = debug_object_ref_fn(session, self_oop_raw, self_ps)
                    variables = []
                    for item in vars_raw.splitlines():
                        if not item.strip():
                            continue
                        fields = item.split("\t", 1)
                        name = decode_field_fn(fields[0]) if len(fields) > 0 else ""
                        value_oop_raw = decode_field_fn(fields[1]) if len(fields) > 1 else ""
                        value_object = debug_object_ref_fn(session, value_oop_raw)
                        variables.append({
                            "name": name,
                            "value": value_object.get("inspection", ""),
                            "valueObject": value_object,
                        })
                    has_frame = method_name != "(no frame)"
                    can_step = method_name != "(no frame)" and step_point > 0
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
            hasFrame=has_frame,
            canStep=can_step,
            variables=variables,
            frameIndex=frame_index,
        )

    @app.post("/debug/proceed/<int:oop>")
    def debug_proceed(oop: int):
        try:
            with request_session_factory(read_only=False) as session:
                direct = _direct_debug_action(session, oop, [("resume", [])])
                if direct is None:
                    session.eval(
                        f"| proc |\n"
                        f"proc := {object_for_oop_expr_fn(oop)}.\n"
                        f"[proc resume] on: Error do: [:e | ]"
                    )
                forget_debug_source_hint_fn(oop)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/step/<int:oop>")
    def debug_step(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                direct = _direct_debug_action(
                    session,
                    oop,
                    [
                        ("step:", [frame_index + 1]),
                        ("stepIntoFromLevel:", [frame_index + 1]),
                        ("_stepIntoInFrame:", [frame_index + 1]),
                        ("gciStepIntoFromLevel:", [frame_index + 1]),
                    ],
                )
                if direct is False:
                    return jsonify(success=False, exception="Debugger step is not supported for this process"), 400
                if direct is None:
                    result = session.eval(_debug_step_script(oop, ["step:", "stepIntoFromLevel:", "_stepIntoInFrame:", "gciStepIntoFromLevel:"], frame_index + 1))
                    if not _is_true_result(result):
                        return jsonify(success=False, exception="Debugger step is not supported for this process"), 400
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/step-into/<int:oop>")
    def debug_step_into(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                direct = _direct_debug_action(
                    session,
                    oop,
                    [
                        ("stepIntoFromLevel:", [frame_index + 1]),
                        ("_stepIntoInFrame:", [frame_index + 1]),
                        ("gciStepIntoFromLevel:", [frame_index + 1]),
                        ("step:", [frame_index + 1]),
                    ],
                )
                if direct is False:
                    return jsonify(success=False, exception="Debugger step-into is not supported for this process"), 400
                if direct is None:
                    result = session.eval(_debug_step_script(oop, ["stepIntoFromLevel:", "_stepIntoInFrame:", "gciStepIntoFromLevel:", "step:"], frame_index + 1))
                    if not _is_true_result(result):
                        return jsonify(success=False, exception="Debugger step-into is not supported for this process"), 400
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/step-over/<int:oop>")
    def debug_step_over(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                direct = _direct_debug_action(
                    session,
                    oop,
                    [
                        ("stepOverFromLevel:", [frame_index + 1]),
                        ("_stepOverInFrame:", [frame_index + 1]),
                        ("gciStepOverFromLevel:", [frame_index + 1]),
                    ],
                )
                if direct is False:
                    return jsonify(success=False, exception="Debugger step-over is not supported for this process"), 400
                if direct is None:
                    result = session.eval(_debug_step_script(oop, ["stepOverFromLevel:", "_stepOverInFrame:", "gciStepOverFromLevel:"], frame_index + 1))
                    if not _is_true_result(result):
                        return jsonify(success=False, exception="Debugger step-over is not supported for this process"), 400
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/restart/<int:oop>")
    def debug_restart(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                direct = _direct_restart_action(session, oop, frame_index)
                if direct is False:
                    return jsonify(success=False, exception="Debugger restart is not supported for this process"), 400
                if direct is None:
                    result = session.eval(_debug_restart_script(oop, frame_index + 1))
                    if not _is_true_result(result):
                        return jsonify(success=False, exception="Debugger restart is not supported for this process"), 400
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.post("/debug/trim/<int:oop>")
    def debug_trim(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                direct = _direct_trim_action(session, oop, frame_index)
                if direct is False:
                    return jsonify(success=False, exception="Debugger trim-stack is not supported for this process"), 400
                if direct is None:
                    result = session.eval(
                        f"| proc ctx idx |\n"
                        f"proc := {object_for_oop_expr_fn(oop)}.\n"
                        f"ctx := proc suspendedContext.\n"
                        f"idx := 0.\n"
                        f"[ctx notNil and: [idx < {frame_index}]] whileTrue: [\n"
                        f"  ctx := ctx sender. idx := idx + 1\n"
                        f"].\n"
                        f"ctx isNil ifFalse: [\n"
                        f"  [proc trimTo: ctx] on: Error do: [:e | false]\n"
                        f"] ifFalse: [false]"
                    )
                    if not _is_true_result(result):
                        return jsonify(success=False, exception="Debugger trim-stack is not supported for this process"), 400
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True)

    @app.get("/debug/thread-local/<int:oop>")
    def debug_thread_local(oop: int):
        try:
            with request_session_factory() as session:
                if _has_live_debugger_process(session, oop):
                    entries = _live_thread_local_entries(session, oop)
                else:
                    raw = eval_str_fn(
                        session,
                        f"| proc result lines |\n"
                        f"{encode_src}\n"
                        f"proc := {object_for_oop_expr_fn(oop)}.\n"
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
                        fields = line.split("\t", 3)
                        key = decode_field_fn(fields[0]) if len(fields) > 0 else ""
                        key_oop_raw = decode_field_fn(fields[1]) if len(fields) > 1 else ""
                        value = decode_field_fn(fields[2]) if len(fields) > 2 else ""
                        value_oop_raw = decode_field_fn(fields[3]) if len(fields) > 3 else ""
                        entries.append({
                            "key": key,
                            "value": value,
                            "keyObject": debug_object_ref_fn(session, key_oop_raw, key),
                            "valueObject": debug_object_ref_fn(session, value_oop_raw, value),
                        })
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, entries=entries)
