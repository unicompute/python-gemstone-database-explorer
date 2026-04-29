from __future__ import annotations

import re

from flask import jsonify, request
from gemstone_py import OOP_FALSE, OOP_NIL, OOP_TRUE
from gemstone_py.client import OopRef

from .object_view_eval import eval_in_context
from .routes_debugger_actions import register_debugger_action_routes
from .routes_debugger_read import register_debugger_read_routes


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
    debug_replay_receiver_fn,
    remember_debug_source_hint_fn,
    remember_debug_replay_receiver_fn,
    forget_debug_source_hint_fn,
    forget_debug_replay_receiver_fn,
    debug_object_ref_fn,
    line_number_for_offset_fn,
) -> None:
    _LINE_RE = re.compile(r"\bline\s+(\d+)\b", re.IGNORECASE)
    _PROCESS_STATUS_RE = re.compile(r"\bstatus=([A-Za-z]+)\b")

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

    def _coerce_boolean_result(result, default: bool | None = None) -> bool | None:
        if result is None:
            return default
        if isinstance(result, bool):
            return result
        if isinstance(result, OopRef):
            raw = int(result.oop)
            if raw == int(OOP_TRUE):
                return True
            if raw in {int(OOP_FALSE), int(OOP_NIL)}:
                return False
            return default
        if isinstance(result, int):
            if result == int(OOP_TRUE):
                return True
            if result in {int(OOP_FALSE), int(OOP_NIL)}:
                return False
            return default
        if isinstance(result, str):
            value = result.strip().lower()
            if value in {"true", "1"}:
                return True
            if value in {"false", "0", "nil"}:
                return False
        return default

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

    def _looks_like_debug_process(session, value) -> bool:
        ref = _ensure_oop_ref(session, value)
        if ref is None:
            return False
        ps = _send_safe(session, ref, "printString", default="")
        if isinstance(ps, str) and ps.startswith("GsProcess("):
            return True
        if isinstance(_send_safe(session, ref, "suspendedContext", default=None), OopRef):
            return True
        detail = _send_safe(session, ref, "_gsiDebuggerDetailedReportAt:", 1, default=Ellipsis)
        return detail is not Ellipsis

    def _resolved_debug_process_ref(session, process_oop: int) -> OopRef | None:
        obj = _ensure_oop_ref(session, process_oop)
        if obj is None:
            return None

        def first_process_like(*candidates):
            for candidate in candidates:
                ref = _ensure_oop_ref(session, candidate)
                if ref is not None and _looks_like_debug_process(session, ref):
                    return ref
            return None

        direct = first_process_like(
            _send_safe(session, obj, "serverProcess", default=None),
            _send_safe(session, obj, "process", default=None),
        )
        if direct is not None:
            return direct

        top = _send_safe(session, obj, "topContext", default=None)
        via_top = first_process_like(_send_safe(session, top, "process", default=None))
        if via_top is not None:
            return via_top

        via_sender = first_process_like(_send_safe(session, obj, "process", default=None))
        if via_sender is not None:
            return via_sender

        return obj

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

    def _source_line_spans(source: object) -> list[tuple[int, int, int]]:
        text = str(source or "")
        if not text:
            return []
        spans: list[tuple[int, int, int]] = []
        start = 1
        length = len(text)
        index = 0
        while index < length:
            line_start = start
            content_end = start - 1
            while index < length and text[index] not in "\r\n":
                index += 1
                content_end += 1
                start += 1
            line_end = content_end
            if index < length:
                if text[index] == "\r" and (index + 1) < length and text[index + 1] == "\n":
                    index += 2
                    start += 2
                else:
                    index += 1
                    start += 1
            spans.append((line_start, line_end, start - 1))
        if text.endswith(("\n", "\r")):
            spans.append((start, start - 1, start - 1))
        return spans

    def _workspace_executed_code_body_bounds(source: object) -> tuple[int, int] | None:
        text = str(source or "")
        spans = _source_line_spans(text)
        if len(spans) < 4:
            return None
        second_start, second_end, _ = spans[1]
        last_start, last_end, _ = spans[-1]
        second_line = text[second_start - 1:second_end].strip()
        last_line = text[last_start - 1:last_end].strip()
        if second_line != "^ [" or last_line != "] value":
            return None
        body_start = spans[2][0]
        body_end = spans[-2][1]
        return (body_start, body_end)

    def _workspace_executed_code_source(source: object) -> str:
        text = str(source or "")
        bounds = _workspace_executed_code_body_bounds(text)
        if bounds is None:
            return text
        return text[bounds[0] - 1:bounds[1]]

    def _workspace_executed_code_display_offset(source: object, raw_offset: int, step_point: int) -> int:
        text = str(source or "")
        bounds = _workspace_executed_code_body_bounds(text)
        try:
            offset = int(raw_offset or 0)
        except Exception:
            offset = 0
        try:
            point = int(step_point or 0)
        except Exception:
            point = 0
        if bounds is None:
            return max(0, offset)
        body_start, body_end = bounds
        if body_start <= offset <= body_end:
            return offset - body_start + 1
        if point <= 1:
            return 1
        return 0

    def _source_offset_from_detail(session, detail, step_point: int) -> int:
        if step_point <= 0:
            return 0
        offsets = _collection_at(session, detail, 6, default=None)
        raw_offset = _collection_at(session, offsets, step_point, default=0)
        try:
            return max(0, int(raw_offset))
        except Exception:
            return 0

    def _source_offsets_from_detail(session, detail, step_point: int) -> list[int]:
        offsets = _collection_at(session, detail, 6, default=None)
        total = _collection_size(session, offsets)
        if total <= 0:
            total = max(0, int(step_point or 0))
        if total <= 0:
            return []
        resolved_offsets: list[int] = []
        for index in range(1, total + 1):
            raw_offset = _collection_at(session, offsets, index, default=0)
            try:
                resolved_offsets.append(max(0, int(raw_offset)))
            except Exception:
                resolved_offsets.append(0)
        return resolved_offsets

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

    def _context_method_identity(session, ctx) -> tuple[str, str, object | None]:
        receiver = _send_safe(session, ctx, "receiver", default=None)
        receiver_class = _send_safe(session, receiver, "class", default=None)
        owner_name = _safe_print_string(session, _send_safe(session, receiver_class, "name", default=None), "")
        method = _send_safe(session, ctx, "method", default=None)
        selector_name = _safe_print_string(session, _send_safe(session, method, "selector", default=None), "")
        return owner_name, selector_name, method

    def _context_method_name(session, ctx, fallback: str = "unknown") -> str:
        owner_name, selector_name, _ = _context_method_identity(session, ctx)
        if owner_name and selector_name:
            return f"{owner_name}>>{selector_name}"
        return _safe_print_string(session, ctx, fallback)

    def _context_chain(session, process_oop: int, max_frames: int = 50) -> list[tuple[int, OopRef]]:
        resolved_process = _resolved_debug_process_ref(session, process_oop)
        start = _send_safe(session, resolved_process, "suspendedContext", default=None)
        if start is None:
            start = _send_safe(session, process_oop, "suspendedContext", default=None)
        if start is None:
            start = _send_safe(session, resolved_process, "topContext", default=None)
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

    def _debug_process_print_string_status(print_string: object) -> str:
        text = str(print_string or "").strip()
        if not text.startswith("GsProcess("):
            return ""
        match = _PROCESS_STATUS_RE.search(text)
        if not match:
            return "running"
        status = match.group(1).strip().lower()
        if status == "halted":
            return "suspended"
        if status in {"terminated", "terminationstarted"}:
            return "terminated"
        return status

    def _debug_process_state(session, process_oop: int) -> str:
        process_ref = _resolved_debug_process_ref(session, process_oop)
        terminated = _coerce_boolean_result(_send_safe(session, process_ref, "isTerminated", default=None), None)
        suspended = _coerce_boolean_result(_send_safe(session, process_ref, "isSuspended", default=None), None)
        suspended_context = _send_safe(session, process_ref, "suspendedContext", default=None)
        has_context = isinstance(suspended_context, OopRef)
        if suspended is True or has_context:
            return "suspended"
        detail = _send_safe(session, process_ref, "_gsiDebuggerDetailedReportAt:", 1, default=Ellipsis)
        has_detail = detail is not Ellipsis and detail is not None
        if terminated is True and not has_detail:
            return "terminated"
        status = str(_send_safe(session, process_ref, "status", default="") or "").strip().lower()
        if status == "halted":
            return "suspended"
        if status in {"suspended", "running"}:
            return status
        if status == "terminated" and not has_detail:
            return "terminated"
        ps = _send_safe(session, process_ref, "printString", default="")
        print_status = _debug_process_print_string_status(ps)
        if print_status == "suspended":
            return "suspended"
        if print_status == "terminated" and not has_detail:
            return "terminated"
        if has_detail:
            return "suspended"
        if isinstance(ps, str) and ps.startswith("GsProcess("):
            return "running"
        if terminated is True:
            return "terminated"
        return "terminated"

    def _has_live_debugger_process(session, process_oop: int) -> bool:
        return _debug_process_state(session, process_oop) != "terminated"

    def _debug_process_status(session, process_oop: int) -> str:
        return _debug_process_state(session, process_oop)

    def _live_debug_frame_payload(session, process_oop: int, frame_index: int, debug_object_ref_fn) -> dict:
        chain = _context_chain(session, process_oop)
        target = next((ctx for level, ctx in chain if level == frame_index), None)
        process_ref = _resolved_debug_process_ref(session, process_oop)
        if target is None:
            return {
                "methodName": "(no frame)",
                "className": "",
                "selectorName": "",
                "ipOffset": 0,
                "selfPrintString": "",
                "selfObject": debug_object_ref_fn(session, None, ""),
                "source": "",
                "sourceOffset": 0,
                "sourceOffsets": [],
                "stepPoint": 0,
                "lineNumber": 0,
                "hasFrame": False,
                "canStep": False,
                "canProceed": False,
                "canRestart": False,
                "canTrim": False,
                "canTerminate": False,
                "canStepInto": False,
                "canStepOver": False,
                "canStepReturn": False,
                "variables": [],
                "frameIndex": frame_index,
            }

        class_name, selector_name, method = _context_method_identity(session, target)
        method_name = f"{class_name}>>{selector_name}" if class_name and selector_name else _safe_print_string(session, target, "(no frame)")
        receiver = _send_safe(session, target, "receiver", default=None)
        receiver_oop = _marshal_to_oop(session, receiver)
        self_ps = _safe_print_string(session, receiver, "")
        detail = _send_safe(session, process_ref, "_gsiDebuggerDetailedReportAt:", frame_index + 1, default=None)
        source = (
            _safe_print_string(session, _collection_at(session, detail, 9, default=None), "")
            or
            _safe_print_string(session, _send_safe(session, target, "sourceCode", default=None), "")
            or _safe_print_string(session, _send_safe(session, target, "sourceString", default=None), "")
            or _safe_print_string(session, _send_safe(session, method, "sourceString", default=None), "")
            or _safe_print_string(session, _send_safe(session, _send_safe(session, target, "homeMethod", default=None), "sourceString", default=None), "")
        )
        step_point = _collection_at(session, detail, 5, default=0)
        try:
            step_point = max(0, int(step_point))
        except Exception:
            step_point = 0
        source_offsets = _source_offsets_from_detail(session, detail, step_point)
        source_offset = _source_offset_from_detail(session, detail, step_point)
        variables = _variable_entries_from_detail(session, detail, debug_object_ref_fn)
        self_object = debug_object_ref_fn(session, receiver_oop, self_ps)
        line_number = _reported_or_offset_line_number(source, source_offset, method_name)
        status = _debug_process_status(session, process_oop)
        can_control = status in {"suspended", "running"}
        can_step = status == "suspended" and step_point > 0
        return {
            "methodName": method_name,
            "className": class_name,
            "selectorName": selector_name,
            "ipOffset": 0,
            "selfPrintString": self_ps,
            "selfObject": self_object,
            "source": source,
            "sourceOffset": source_offset,
            "sourceOffsets": source_offsets,
            "stepPoint": step_point,
            "lineNumber": line_number,
            "status": status,
            "isLiveSession": can_control,
            "hasFrame": True,
            "canStep": can_step,
            "canProceed": status == "suspended",
            "canRestart": status == "suspended",
            "canTrim": status == "suspended",
            "canTerminate": can_control,
            "canStepInto": can_step,
            "canStepOver": can_step,
            "canStepReturn": can_step,
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
        process_ref = _resolved_debug_process_ref(session, process_oop)
        for selector, args in calls:
            result = _send_safe(session, process_ref, selector, *args, default=Ellipsis)
            if result is not Ellipsis:
                return _debug_action_succeeded(result)
        return False

    def _fallback_debug_action(session, process_oop: int, calls: list[tuple[str, list[int]]]) -> bool | None:
        if not _has_live_debugger_process(session, process_oop):
            return None
        process_ref = _resolved_debug_process_ref(session, process_oop)
        for selector, args in calls:
            result = _send_safe(session, process_ref, selector, *args, default=Ellipsis)
            if result is Ellipsis:
                continue
            if _debug_action_succeeded(result):
                return True
        return False

    def _direct_trim_action(session, process_oop: int, frame_index: int) -> bool | None:
        chain = _context_chain(session, process_oop)
        if not chain and not _has_live_debugger_process(session, process_oop):
            return None
        process_ref = _resolved_debug_process_ref(session, process_oop)
        target = next((ctx for level, ctx in chain if level == frame_index), None)
        if target is not None:
            result = _send_safe(session, process_ref, "trimTo:", target, default=Ellipsis)
            if result is not Ellipsis and _debug_action_succeeded(result):
                return True
        return _fallback_debug_action(
            session,
            process_oop,
            [
                ("trimStackToLevel:", [frame_index + 1]),
                ("_trimStackToLevel:", [frame_index + 1]),
            ],
        )

    def _normalized_debug_source_text(source: object) -> str:
        text = str(source or "").replace("\r\n", "\n").replace("\r", "\n")
        return "\n".join(line.rstrip() for line in text.split("\n")).strip()

    def _source_matches_debug_hint(source: object, hint: str) -> bool:
        candidate = _normalized_debug_source_text(source)
        normalized_hint = _normalized_debug_source_text(hint)
        if not candidate or not normalized_hint:
            return False
        return (
            candidate == normalized_hint
            or normalized_hint in candidate
            or candidate in normalized_hint
        )

    def _primary_debug_frame_level(session, process_oop: int) -> int:
        frames = _visible_debug_frames(session, process_oop)
        if not frames:
            return 1
        try:
            return max(1, int(frames[0].get("index", 0)) + 1)
        except Exception:
            return 1

    def _debug_process_quick_step_point(session, process_oop: int, frame_level: int) -> int:
        process_ref = _resolved_debug_process_ref(session, process_oop)
        stack_report = _send_safe(
            session,
            process_ref,
            "_gsiStackReportFromLevel:toLevel:",
            int(frame_level),
            int(frame_level),
            default=None,
        )
        full_entry = _collection_at(session, stack_report, 2, default=None)
        step_point = _collection_at(session, full_entry, 5, default=None)
        if step_point is None:
            detail = _send_safe(session, process_ref, "_gsiDebuggerDetailedReportAt:", int(frame_level), default=None)
            step_point = _collection_at(session, detail, 5, default=0)
        try:
            return max(0, int(step_point))
        except Exception:
            return 0

    def _debug_process_context_for_level(session, process_oop: int, frame_level: int) -> OopRef | None:
        zero_based_level = max(0, int(frame_level) - 1)
        return next((ctx for level, ctx in _context_chain(session, process_oop) if level == zero_based_level), None)

    def _rewind_debug_context_to_step_one(session, context) -> None:
        if context is None:
            return
        for selector in ("jumpToStepPoint:", "runToStepPoint:", "jumpTo:"):
            _send_safe(session, context, selector, 1, default=Ellipsis)

    def _rewind_debug_process_to_step_one_if_needed(session, process_oop: int, frame_level: int) -> int:
        process_ref = _resolved_debug_process_ref(session, process_oop)
        quick_step_point = _debug_process_quick_step_point(session, process_oop, frame_level)
        if quick_step_point <= 1:
            return quick_step_point
        _send_safe(session, process_ref, "_gsiStepAtLevel:step:", int(frame_level), 1, default=Ellipsis)
        _send_safe(session, process_ref, "jumpToStepPoint:", 1, default=Ellipsis)
        _send_safe(session, process_ref, "runToStepPoint:", 1, default=Ellipsis)
        _send_safe(session, process_ref, "jumpTo:", 1, default=Ellipsis)
        _rewind_debug_context_to_step_one(session, _debug_process_context_for_level(session, process_oop, frame_level))
        return _debug_process_quick_step_point(session, process_oop, frame_level)

    def _restart_needs_workspace_replay(session, process_oop: int, frame_index: int = 0) -> bool:
        source_hint = str(debug_source_hint_fn(process_oop) or "").strip()
        if not source_hint:
            return False
        primary_level = _primary_debug_frame_level(session, process_oop)
        return _debug_process_quick_step_point(session, process_oop, primary_level) > 1

    def _workspace_selector_name(frame_payload: dict | None) -> str | None:
        if not isinstance(frame_payload, dict):
            return None
        selector_name = str(frame_payload.get("selectorName", "") or "").strip()
        if selector_name.startswith("sigWorkspace"):
            return selector_name
        method_name = str(frame_payload.get("methodName", "") or "")
        marker = "SigWorkspaceEvaluator>>"
        if marker in method_name:
            candidate = method_name.split(marker, 1)[1].strip()
            if candidate.startswith("sigWorkspace"):
                return candidate
        return None

    def _is_workspace_executed_frame(frame_payload: dict | None) -> bool:
        if not isinstance(frame_payload, dict):
            return False
        method_name = str(frame_payload.get("methodName", "") or "")
        if method_name.startswith("[] in SigWorkspaceEvaluator>>sigWorkspace"):
            return True
        class_name = str(frame_payload.get("className", "") or "")
        selector_name = str(frame_payload.get("selectorName", "") or "")
        try:
            line_number = int(frame_payload.get("lineNumber", 0) or 0)
        except Exception:
            line_number = 0
        try:
            step_point = int(frame_payload.get("stepPoint", 0) or 0)
        except Exception:
            step_point = 0
        source = str(frame_payload.get("source", "") or "")
        return (
            class_name == "SigWorkspaceEvaluator"
            and selector_name.startswith("sigWorkspace")
            and (
                line_number == 1
                or step_point == 1
                or _workspace_executed_code_body_bounds(source) is not None
            )
        )

    def _restart_frame_index(session, process_oop: int, selected_frame_index: int) -> int:
        frames = _visible_debug_frames(session, process_oop)
        if not frames:
            return max(0, int(selected_frame_index or 0))
        source_hint = str(debug_source_hint_fn(process_oop) or "").strip()
        selected = next(
            (frame for frame in frames if int(frame.get("index", -1)) == int(selected_frame_index)),
            None,
        )
        if selected is None:
            selected = frames[0]
        resolved_index = int_arg_fn(selected.get("index", selected_frame_index), 0)
        top_visible_index = int_arg_fn(frames[0].get("index", 0), 0)
        payload_cache: dict[int, dict] = {}

        def payload_for(frame_index: int) -> dict:
            cached = payload_cache.get(frame_index)
            if cached is not None:
                return cached
            try:
                cached = _live_debug_frame_payload(session, process_oop, frame_index, debug_object_ref_fn)
            except Exception:
                cached = {}
            payload_cache[frame_index] = cached
            return cached

        executed_index = None
        executed_payload = None
        for frame in frames:
            frame_index = int_arg_fn(frame.get("index", 0), 0)
            payload = payload_for(frame_index)
            if _is_workspace_executed_frame(payload):
                executed_index = frame_index
                executed_payload = payload
                break
            if (
                source_hint
                and str(payload.get("className", "") or "") == "SigWorkspaceEvaluator"
                and str(payload.get("selectorName", "") or "").startswith("sigWorkspace")
                and (
                    frame_index == top_visible_index
                    or _source_matches_debug_hint(payload.get("source", ""), source_hint)
                )
            ):
                executed_index = frame_index
                executed_payload = payload
                break
        if executed_index is None:
            return resolved_index
        workspace_selector = _workspace_selector_name(executed_payload)
        wrapper_candidates: list[int] = []
        for frame in frames:
            frame_index = int_arg_fn(frame.get("index", 0), 0)
            if frame_index <= executed_index:
                continue
            payload = payload_for(frame_index)
            if str(payload.get("className", "") or "") != "SigWorkspaceEvaluator":
                continue
            candidate_selector = _workspace_selector_name(payload)
            candidate_matches_hint = bool(source_hint) and _source_matches_debug_hint(payload.get("source", ""), source_hint)
            if workspace_selector is None:
                if candidate_selector is not None or candidate_matches_hint:
                    wrapper_candidates.append(frame_index)
            elif candidate_selector == workspace_selector or candidate_matches_hint:
                wrapper_candidates.append(frame_index)
        return max(wrapper_candidates) if wrapper_candidates else executed_index

    def _effective_debug_action_frame_index(session, process_oop: int, selected_frame_index: int) -> int:
        frames = _visible_debug_frames(session, process_oop)
        if not frames:
            return max(0, int(selected_frame_index or 0))
        source_hint = str(debug_source_hint_fn(process_oop) or "").strip()
        selected = next(
            (frame for frame in frames if int(frame.get("index", -1)) == int(selected_frame_index)),
            None,
        )
        if selected is None:
            selected = frames[0]
        resolved_index = int_arg_fn(selected.get("index", selected_frame_index), 0)
        if resolved_index != 0:
            return resolved_index
        payload_cache: dict[int, dict] = {}

        def payload_for(frame_index: int) -> dict:
            cached = payload_cache.get(frame_index)
            if cached is not None:
                return cached
            try:
                cached = _live_debug_frame_payload(session, process_oop, frame_index, debug_object_ref_fn)
            except Exception:
                cached = {}
            payload_cache[frame_index] = cached
            return cached

        selected_payload = payload_for(resolved_index)
        if _is_workspace_executed_frame(selected_payload):
            return resolved_index
        for frame in frames:
            frame_index = int_arg_fn(frame.get("index", 0), 0)
            if frame_index <= resolved_index:
                continue
            payload = payload_for(frame_index)
            if _is_workspace_executed_frame(payload):
                return frame_index
            if (
                source_hint
                and str(payload.get("className", "") or "") == "SigWorkspaceEvaluator"
                and str(payload.get("selectorName", "") or "").startswith("sigWorkspace")
                and _source_matches_debug_hint(payload.get("source", ""), source_hint)
            ):
                return frame_index
        return resolved_index

    def _preferred_debugger_frame_index(session, process_oop: int) -> int:
        frames = _visible_debug_frames(session, process_oop)
        if not frames:
            return 0
        source_hint = str(debug_source_hint_fn(process_oop) or "").strip()
        fallback_index = int_arg_fn(frames[0].get("index", 0), 0)
        for frame in frames:
            frame_index = int_arg_fn(frame.get("index", fallback_index), fallback_index)
            try:
                payload = _live_debug_frame_payload(session, process_oop, frame_index, debug_object_ref_fn)
            except Exception:
                payload = {}
            if _is_workspace_executed_frame(payload):
                return frame_index
            if (
                source_hint
                and str(payload.get("className", "") or "") == "SigWorkspaceEvaluator"
                and str(payload.get("selectorName", "") or "").startswith("sigWorkspace")
                and _source_matches_debug_hint(payload.get("source", ""), source_hint)
            ):
                return frame_index
            method_name = str(frame.get("name", "") or "")
            if method_name.lower().startswith("executed code"):
                return frame_index
        return fallback_index

    def _terminate_debug_process(session, process_oop: int) -> None:
        process_ref = _resolved_debug_process_ref(session, process_oop)
        for selector in ("terminate", "terminateProcess"):
            result = _send_safe(session, process_ref, selector, default=Ellipsis)
            if result is not Ellipsis:
                return

    def _restart_replay_receiver_oop(session, process_oop: int) -> int | None:
        remembered_receiver = debug_replay_receiver_fn(process_oop)
        if isinstance(remembered_receiver, int) and remembered_receiver > 20:
            return remembered_receiver
        context = _debug_process_context_for_level(session, process_oop, 1)
        receiver = _send_safe(session, context, "receiver", default=None)
        return _marshal_to_oop(session, receiver)

    def _restart_workspace_debug_process(session, process_oop: int) -> dict | bool:
        source_hint = str(debug_source_hint_fn(process_oop) or "").strip()
        if not source_hint:
            return False
        receiver_oop = _restart_replay_receiver_oop(session, process_oop)
        if receiver_oop is None:
            return False
        _terminate_debug_process(session, process_oop)
        replay = eval_in_context(session, receiver_oop, source_hint, "smalltalk")
        new_process_oop = replay.get("debugThreadOop")
        try:
            new_process_oop = int(new_process_oop)
        except Exception:
            new_process_oop = None
        if not replay.get("isException") or not new_process_oop:
            forget_debug_source_hint_fn(process_oop)
            forget_debug_replay_receiver_fn(process_oop)
            return {"completed": True}
        remember_debug_source_hint_fn(new_process_oop, source_hint)
        remember_debug_replay_receiver_fn(new_process_oop, receiver_oop)
        if new_process_oop != process_oop:
            forget_debug_source_hint_fn(process_oop)
            forget_debug_replay_receiver_fn(process_oop)
        _restart_workspace_process_in_place(
            session,
            new_process_oop,
            _preferred_debugger_frame_index(session, new_process_oop),
        )
        return {"thread_oop": new_process_oop}

    def _restart_workspace_process_in_place(session, process_oop: int, frame_index: int) -> bool:
        chain = _context_chain(session, process_oop)
        if not chain and not _has_live_debugger_process(session, process_oop):
            return False
        process_ref = _resolved_debug_process_ref(session, process_oop)
        restart_frame_index = _restart_frame_index(session, process_oop, frame_index)
        target = next((ctx for level, ctx in chain if level == restart_frame_index), None)
        restart_level = max(1, int(restart_frame_index) + 1)
        trim_result = Ellipsis
        for selector in ("trimStackToLevel:", "_trimStackToLevel:"):
            candidate = _send_safe(session, process_ref, selector, restart_level, default=Ellipsis)
            if candidate is Ellipsis:
                continue
            trim_result = candidate
            if _debug_action_succeeded(candidate):
                break
        if (trim_result is Ellipsis or not _debug_action_succeeded(trim_result)) and target is not None:
            trim_result = _send_safe(session, process_ref, "trimTo:", target, default=Ellipsis)
        if trim_result is Ellipsis or not _debug_action_succeeded(trim_result):
            if restart_level != 1:
                return False
        _rewind_debug_process_to_step_one_if_needed(session, process_oop, restart_level)
        return True

    def _direct_restart_action(session, process_oop: int, frame_index: int) -> dict | bool | None:
        if not _restart_workspace_process_in_place(session, process_oop, frame_index):
            chain = _context_chain(session, process_oop)
            if chain or _has_live_debugger_process(session, process_oop):
                return False
            return None
        if _restart_needs_workspace_replay(session, process_oop, frame_index):
            return _restart_workspace_debug_process(session, process_oop)
        return {"thread_oop": process_oop}

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
            f"(supported not and: [proc respondsTo: #{selector}]) ifTrue: [\n"
            f"  proc perform: #{selector} with: stepLevel.\n"
            f"  supported := true\n"
            f"].\n"
            for selector in selectors
        )
        return (
            f"[ | obj proc stepLevel supported |\n"
            f"{_debug_process_resolver(oop)}"
            f"stepLevel := {safe_level}.\n"
            f"supported := false.\n"
            f"{selector_lines}"
            f"supported ifTrue: ['true'] ifFalse: ['false']\n"
            f"] value"
        )

    def _debug_restart_script(oop: int, level: int) -> str:
        safe_level = max(1, int(level or 1))
        return (
            f"[ | obj proc result restartLevel ctx idx detail quickStep publicResult publicTried |\n"
            f"{_debug_process_resolver(oop)}"
            f"restartLevel := {safe_level}.\n"
            f"ctx := [proc suspendedContext] on: Error do: [:e | nil].\n"
            f"idx := 1.\n"
            f"[ctx notNil and: [idx < restartLevel]] whileTrue: [\n"
            f"  ctx := [ctx sender] on: Error do: [:e | nil].\n"
            f"  idx := idx + 1\n"
            f"].\n"
            f"result := false.\n"
            f"publicResult := nil.\n"
            f"publicTried := false.\n"
            f"(proc respondsTo: #trimStackToLevel:) ifTrue: [\n"
            f"  publicTried := true.\n"
            f"  publicResult := [proc trimStackToLevel: restartLevel] on: Error do: [:e | nil].\n"
            f"  result := true\n"
            f"].\n"
            f"((proc respondsTo: #_trimStackToLevel:) and: [publicTried not or: [publicResult isNil or: [publicResult == false]]]) ifTrue: [\n"
            f"  [proc _trimStackToLevel: restartLevel] on: Error do: [:e | nil].\n"
            f"  result := true\n"
            f"].\n"
            f"quickStep := 0.\n"
            f"result ifTrue: [\n"
            f"  detail := [proc _gsiDebuggerDetailedReportAt: restartLevel] on: Error do: [:e | nil].\n"
            f"  quickStep := [[[detail at: 5] on: Error do: [:e | 0]] asInteger] on: Error do: [:e | 0].\n"
            f"  quickStep > 1 ifTrue: [\n"
            f"    (proc respondsTo: #_gsiStepAtLevel:step:) ifTrue: [ [proc _gsiStepAtLevel: restartLevel step: 1] on: Error do: [:e | nil] ].\n"
            f"    (proc respondsTo: #jumpToStepPoint:) ifTrue: [ [proc jumpToStepPoint: 1] on: Error do: [:e | nil] ].\n"
            f"    (proc respondsTo: #runToStepPoint:) ifTrue: [ [proc runToStepPoint: 1] on: Error do: [:e | nil] ].\n"
            f"    (proc respondsTo: #jumpTo:) ifTrue: [ [proc jumpTo: 1] on: Error do: [:e | nil] ].\n"
            f"    ctx notNil ifTrue: [\n"
            f"      (ctx respondsTo: #jumpToStepPoint:) ifTrue: [ [ctx jumpToStepPoint: 1] on: Error do: [:e | nil] ].\n"
            f"      (ctx respondsTo: #runToStepPoint:) ifTrue: [ [ctx runToStepPoint: 1] on: Error do: [:e | nil] ].\n"
            f"      (ctx respondsTo: #jumpTo:) ifTrue: [ [ctx jumpTo: 1] on: Error do: [:e | nil] ]\n"
            f"    ]\n"
            f"  ]\n"
            f"].\n"
            f"result ifTrue: ['true'] ifFalse: ['false']\n"
            f"] value"
        )

    read_shared = dict(
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        object_for_oop_expr_fn=object_for_oop_expr_fn,
        encode_src=encode_src,
        decode_field_fn=decode_field_fn,
        debug_source_hint_fn=debug_source_hint_fn,
        debug_object_ref_fn=debug_object_ref_fn,
        int_arg_fn=int_arg_fn,
        has_live_debugger_process_fn=_has_live_debugger_process,
        visible_debug_frames_fn=_visible_debug_frames,
        live_debug_frame_payload_fn=_live_debug_frame_payload,
        reported_or_offset_line_number_fn=_reported_or_offset_line_number,
        live_thread_local_entries_fn=_live_thread_local_entries,
        debug_process_resolver_fn=_debug_process_resolver,
        debug_context_resolver_fn=_debug_context_resolver,
        workspace_executed_code_source_fn=_workspace_executed_code_source,
        workspace_executed_code_display_offset_fn=_workspace_executed_code_display_offset,
    )
    action_shared = dict(
        request_session_factory=request_session_factory,
        object_for_oop_expr_fn=object_for_oop_expr_fn,
        forget_debug_source_hint_fn=forget_debug_source_hint_fn,
        forget_debug_replay_receiver_fn=forget_debug_replay_receiver_fn,
        is_true_result_fn=_is_true_result,
        direct_debug_action_fn=_direct_debug_action,
        direct_trim_action_fn=_direct_trim_action,
        effective_debug_action_frame_index_fn=_effective_debug_action_frame_index,
        restart_frame_index_fn=_restart_frame_index,
        restart_needs_workspace_replay_fn=_restart_needs_workspace_replay,
        restart_workspace_debug_process_fn=_restart_workspace_debug_process,
        debug_process_quick_step_point_fn=_debug_process_quick_step_point,
        debug_step_script_fn=_debug_step_script,
        debug_restart_script_fn=_debug_restart_script,
        has_live_debugger_process_fn=_has_live_debugger_process,
        debug_process_status_fn=_debug_process_status,
    )
    register_debugger_read_routes(app, **read_shared)
    register_debugger_action_routes(app, **action_shared)
