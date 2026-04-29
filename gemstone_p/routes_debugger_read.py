from __future__ import annotations

import re

from flask import jsonify, request


def register_debugger_read_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    object_for_oop_expr_fn,
    encode_src: str,
    decode_field_fn,
    debug_source_hint_fn,
    debug_executed_frame_state_fn,
    remember_debug_executed_frame_state_fn,
    debug_object_ref_fn,
    int_arg_fn,
    has_live_debugger_process_fn,
    visible_debug_frames_fn,
    live_debug_frame_payload_fn,
    reported_or_offset_line_number_fn,
    live_thread_local_entries_fn,
    debug_process_resolver_fn,
    debug_context_resolver_fn,
    workspace_executed_code_source_fn,
    workspace_executed_code_display_offset_fn,
) -> None:
    def _is_executed_code_method_name(value: object) -> bool:
        return bool(re.match(r"^executed\s+code\s*@", str(value or "").strip(), re.IGNORECASE))

    def _debug_source_hint_text(thread_oop: int) -> str:
        return str(debug_source_hint_fn(thread_oop) or "").strip()

    def _debug_executed_frame_state(thread_oop: int) -> dict:
        raw = debug_executed_frame_state_fn(thread_oop)
        if not isinstance(raw, dict):
            return {}
        source = str(raw.get("source", "") or "").strip()
        try:
            source_offsets = [max(0, int(each or 0)) for each in list(raw.get("sourceOffsets", []) or [])]
        except Exception:
            source_offsets = []
        source_offsets = _workspace_executed_code_display_offsets(source, source_offsets)
        return {
            "source": source,
            "sourceOffsets": source_offsets,
            "className": str(raw.get("className", "") or "").strip(),
            "selectorName": str(raw.get("selectorName", "") or "").strip(),
            "lineNumber": max(0, int(raw.get("lineNumber", 0) or 0)),
            "stepPoint": max(0, int(raw.get("stepPoint", 0) or 0)),
            "frameIndex": int(raw.get("frameIndex", 0) or 0),
        }

    def _remember_workspace_executed_frame_state(thread_oop: int, payload: dict) -> None:
        if not isinstance(payload, dict):
            return
        source_hint = _debug_source_hint_text(thread_oop)
        source = _normalized_debug_source_text(payload.get("source", ""))
        if not source_hint or not source or not _source_matches_debug_hint(source, source_hint):
            return
        try:
            source_offsets = [max(0, int(each or 0)) for each in list(payload.get("sourceOffsets", []) or [])]
        except Exception:
            source_offsets = []
        source_offsets = _workspace_executed_code_display_offsets(source, source_offsets)
        if not source_offsets:
            return
        remember_debug_executed_frame_state_fn(
            thread_oop,
            {
                "source": source,
                "sourceOffsets": source_offsets,
                "className": str(payload.get("className", "") or "").strip(),
                "selectorName": str(payload.get("selectorName", "") or "").strip(),
                "lineNumber": max(0, int(payload.get("lineNumber", 0) or 0)),
                "stepPoint": max(0, int(payload.get("stepPoint", 0) or 0)),
                "frameIndex": max(0, int(payload.get("frameIndex", 0) or 0)),
            },
        )

    def _normalized_debug_source_text(source: object) -> str:
        return "\n".join(str(source or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")).strip()

    def _debug_source_line_count(source: object) -> int:
        normalized = "\n".join(str(source or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"))
        return max(1, len(normalized.split("\n")))

    def _clamp_debug_line_number(line_number: int, source: object) -> int:
        resolved = int(line_number or 0)
        if resolved <= 0:
            return 0
        return max(1, min(_debug_source_line_count(source), resolved))

    def _source_matches_debug_hint(source: object, hint: str) -> bool:
        normalized_hint = _normalized_debug_source_text(hint)
        if not normalized_hint:
            return False

        raw_candidate = _normalized_debug_source_text(source)
        executed_candidate = _normalized_debug_source_text(workspace_executed_code_source_fn(source))
        if raw_candidate and raw_candidate == normalized_hint:
            return True
        if executed_candidate and executed_candidate != raw_candidate:
            return (
                executed_candidate == normalized_hint
                or normalized_hint in executed_candidate
                or executed_candidate in normalized_hint
            )
        return False

    def _executed_code_label(step_point: int, line_number: int) -> str:
        return f"Executed code @{max(1, int(step_point or 1))} line {max(1, int(line_number or 1))}"

    def _split_frame_method_name(method_name: object) -> tuple[str, str]:
        text = str(method_name or "").strip()
        if ">>" not in text:
            return "", ""
        owner_name, selector_name = text.split(">>", 1)
        return owner_name.strip(), selector_name.strip()

    def _frame_identity_for(method_name: object, class_name: object = "", selector_name: object = "") -> tuple[str, bool]:
        method_text = str(method_name or "").strip()
        class_text = str(class_name or "").strip()
        selector_text = str(selector_name or "").strip()
        is_executed_code = _is_executed_code_method_name(method_text)
        if is_executed_code:
            if class_text and selector_text:
                return f"executed:{class_text}>>{selector_text}", True
            return "executed-code", True
        if class_text and selector_text:
            return f"{class_text}>>{selector_text}", False
        if method_text:
            return f"name:{method_text}", False
        return "", False

    def _frame_entry(frame_index: int, method_name: object, *, class_name: object = "", selector_name: object = "") -> dict:
        resolved_class_name = str(class_name or "").strip()
        resolved_selector_name = str(selector_name or "").strip()
        if not resolved_class_name and not resolved_selector_name:
            resolved_class_name, resolved_selector_name = _split_frame_method_name(method_name)
        frame_key, is_executed_code = _frame_identity_for(method_name, resolved_class_name, resolved_selector_name)
        return {
            "index": int(frame_index),
            "name": str(method_name or ""),
            "className": resolved_class_name,
            "selectorName": resolved_selector_name,
            "frameKey": frame_key,
            "isExecutedCode": is_executed_code,
        }

    def _looks_like_workspace_frame(payload: dict) -> bool:
        class_name = str(payload.get("className", "") or "")
        selector_name = str(payload.get("selectorName", "") or "")
        method_name = str(payload.get("methodName", "") or "")
        return (
            _is_executed_code_method_name(method_name)
            or
            (class_name == "SigWorkspaceEvaluator" and selector_name.startswith("sigWorkspace"))
            or "SigWorkspaceEvaluator>>sigWorkspace" in method_name
            or method_name.startswith("[] in SigWorkspaceEvaluator>>sigWorkspace")
        )

    def _workspace_executed_code_body_bounds(source_text: object) -> tuple[int, int] | None:
        text = str(source_text or "")
        lines: list[tuple[int, int, int]] = []
        start = 0
        index = 0
        while index < len(text):
            ch = text[index]
            if ch == "\n":
                lines.append((start + 1, index, index + 1))
                index += 1
                start = index
                continue
            if ch == "\r":
                end = index
                index += 1
                if index < len(text) and text[index] == "\n":
                    index += 1
                lines.append((start + 1, end, index))
                start = index
                continue
            index += 1
        lines.append((start + 1, len(text), len(text)))
        if len(lines) < 4:
            return None
        second_line = text[lines[1][0] - 1:lines[1][1]].strip()
        last_line = text[lines[-1][0] - 1:lines[-1][1]].strip()
        if second_line != "^ [" or last_line != "] value":
            return None
        return (lines[2][0], lines[-2][1])

    def _workspace_executed_code_display_offsets(source_text: object, raw_offsets: object) -> list[int]:
        bounds = _workspace_executed_code_body_bounds(source_text)
        if raw_offsets is None:
            return [1]
        adjusted_offsets: list[int] = []
        last_positive = 1
        try:
            values = list(raw_offsets)
        except Exception:
            values = []
        if bounds is not None:
            body_start, body_end = bounds
            for raw_offset in values:
                try:
                    offset = int(raw_offset or 0)
                except Exception:
                    offset = 0
                if body_start <= offset <= body_end:
                    resolved = offset - body_start + 1
                    if resolved <= 0:
                        resolved = last_positive
                    adjusted_offsets.append(resolved)
                    last_positive = resolved
        else:
            for raw_offset in values:
                try:
                    offset = int(raw_offset or 0)
                except Exception:
                    offset = 0
                if offset <= 0:
                    offset = last_positive
                adjusted_offsets.append(offset)
                last_positive = offset
        if not adjusted_offsets or adjusted_offsets[0] != 1:
            adjusted_offsets.insert(0, 1)
        return adjusted_offsets

    def _workspace_statement_start_offsets(source_text: object) -> list[int]:
        text = str(source_text or "")
        if not text:
            return []

        def find_next_executable(start_index: int) -> int:
            index = max(0, int(start_index or 0))
            size = len(text)
            while index < size:
                ch = text[index]
                if ch.isspace():
                    index += 1
                    continue
                if ch == '"':
                    index += 1
                    while index < size and text[index] != '"':
                        index += 1
                    if index < size:
                        index += 1
                    continue
                return index + 1
            return 0

        offsets: list[int] = []
        first_offset = find_next_executable(0)
        if first_offset > 0:
            offsets.append(first_offset)

        in_comment = False
        in_string = False
        index = 0
        size = len(text)
        while index < size:
            ch = text[index]
            if in_comment:
                if ch == '"':
                    in_comment = False
            elif in_string:
                if ch == "'":
                    in_string = False
            else:
                if ch == '"':
                    in_comment = True
                elif ch == "'":
                    in_string = True
                elif ch == ".":
                    next_offset = find_next_executable(index + 1)
                    if next_offset > 0 and next_offset != offsets[-1]:
                        offsets.append(next_offset)
            index += 1
        return offsets

    def _pad_source_offsets_to_step_point(source_offsets: list[int], step_point: int) -> list[int]:
        adjusted: list[int] = []
        for raw_offset in list(source_offsets or []):
            try:
                offset = int(raw_offset or 0)
            except Exception:
                offset = 0
            if offset > 0:
                adjusted.append(max(1, offset))
        try:
            point = int(step_point or 0)
        except Exception:
            point = 0
        if point <= 0 or not adjusted:
            return adjusted
        while len(adjusted) < point:
            adjusted.append(adjusted[-1])
        return adjusted

    def _source_cursor_location(source_text: object, source_offset: int) -> tuple[int, int] | None:
        text = str(source_text or "")
        try:
            offset = int(source_offset or 0)
        except Exception:
            offset = 0
        if not text or offset <= 0:
            return None
        resolved_offset = min(offset, len(text) + 1)
        line_number = 1
        column_number = 1
        index = 0
        while index < (resolved_offset - 1) and index < len(text):
            ch = text[index]
            if ch == "\n":
                line_number += 1
                column_number = 1
            elif ch == "\r":
                line_number += 1
                column_number = 1
                if (index + 1) < len(text) and text[index + 1] == "\n":
                    index += 1
            else:
                column_number += 1
            index += 1
        return (line_number, column_number)

    def _debugger_statement_boundary_exists(source_text: object, start_offset: int, end_offset: int) -> bool:
        text = str(source_text or "")
        if not text:
            return False
        try:
            start = int(start_offset or 0)
            end = int(end_offset or 0)
        except Exception:
            return False
        if start >= end:
            return False
        in_comment = False
        in_string = False
        current = max(1, start)
        limit = min(end, len(text))
        while current <= limit:
            ch = text[current - 1]
            if in_comment:
                if ch == '"':
                    in_comment = False
            else:
                if in_string:
                    if ch == "'":
                        in_string = False
                else:
                    if ch == '"':
                        in_comment = True
                    elif ch == "'":
                        in_string = True
                    elif ch == ".":
                        return True
            current += 1
        return False

    def _debugger_step_point_starts_new_statement(source_text: object, source_offsets: list[int], step_point: int) -> bool:
        try:
            point = int(step_point or 0)
        except Exception:
            point = 0
        if point <= 1:
            return True
        current_offset = _step_point_source_offset(point, source_offsets)
        previous_offset = _step_point_source_offset(point - 1, source_offsets)
        if current_offset <= 0 or previous_offset <= 0:
            return False
        current_location = _source_cursor_location(source_text, current_offset)
        previous_location = _source_cursor_location(source_text, previous_offset)
        if current_location is None or previous_location is None:
            return False
        if current_location[0] != previous_location[0]:
            return True
        return _debugger_statement_boundary_exists(source_text, previous_offset, current_offset - 1)

    def _debugger_next_statement_line_number(source_text: object, source_offsets: list[int], step_point: int) -> int:
        next_step = int(step_point or 0) + 1
        while next_step <= len(source_offsets):
            if _debugger_step_point_starts_new_statement(source_text, source_offsets, next_step):
                next_offset = _step_point_source_offset(next_step, source_offsets)
                next_location = _source_cursor_location(source_text, next_offset)
                if next_location is not None:
                    return next_location[0]
            next_step += 1
        return 0

    def _debugger_executable_cursor_column_for_line(line_text: object) -> int:
        text = str(line_text or "")
        size = len(text)
        index = 0
        while index < size:
            while index < size and text[index].isspace():
                index += 1
            if index >= size:
                return 0
            if text[index] == '"':
                index += 1
                while index < size and text[index] != '"':
                    index += 1
                if index < size:
                    index += 1
                continue
            return index + 1
        return 0

    def _debugger_executable_line_number_near(line_number: int, source_text: object) -> int:
        lines = str(source_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if not lines:
            return 0
        try:
            start_index = int(line_number or 0)
        except Exception:
            start_index = 0
        if start_index <= 0:
            return 0
        start_index = max(1, min(start_index, len(lines)))
        for index in range(start_index - 1, len(lines)):
            if _debugger_executable_cursor_column_for_line(lines[index]) > 0:
                return index + 1
        for index in range(start_index - 2, -1, -1):
            if _debugger_executable_cursor_column_for_line(lines[index]) > 0:
                return index + 1
        return 0

    def _resolved_workspace_executed_line_number(source_text: object, source_offsets: list[int], step_point: int, fallback_line: int) -> int:
        raw_offset = _step_point_source_offset(step_point, source_offsets)
        cursor_location = _source_cursor_location(source_text, raw_offset)
        if cursor_location is None:
            return _debugger_executable_line_number_near(fallback_line, source_text) or fallback_line
        resolved_line = cursor_location[0]
        return _debugger_executable_line_number_near(resolved_line, source_text) or resolved_line

    def _step_point_source_offset(step_point: int, source_offsets: list[int]) -> int:
        if not source_offsets:
            return 0
        try:
            point = int(step_point or 0)
        except Exception:
            point = 0
        if point <= 0:
            point = 1
        index = min(point, len(source_offsets)) - 1
        try:
            return max(0, int(source_offsets[index] or 0))
        except Exception:
            return 0

    def _normalize_workspace_debug_payload(thread_oop: int, payload: dict, *, is_top_visible: bool) -> dict:
        source_hint = _debug_source_hint_text(thread_oop)
        if not source_hint or not payload.get("hasFrame", False):
            return payload
        normalized = dict(payload)
        raw_source = str(normalized.get("source", "") or "")
        state = _debug_executed_frame_state(thread_oop) if is_top_visible else {}
        if not _looks_like_workspace_frame(normalized):
            if not (is_top_visible and _source_matches_debug_hint(raw_source, source_hint)):
                source = str(state.get("source", "") or "")
                source_offsets = list(state.get("sourceOffsets", []) or [])
                if not source or not source_offsets:
                    return payload
                state_step_point = int_arg_fn(state.get("stepPoint", 0), 0)
                step_point = state_step_point or int_arg_fn(normalized.get("stepPoint", 0), 0) or 1
                step_point = max(1, min(step_point, len(source_offsets)))
                source_offset = _step_point_source_offset(step_point, source_offsets)
                if source_offset <= 0 and step_point <= 1:
                    source_offset = 1
                line_number = _clamp_debug_line_number(
                    reported_or_offset_line_number_fn(source, source_offset, ""),
                    source,
                ) or _clamp_debug_line_number(int(state.get("lineNumber", 0) or 1), source)
                status = str(normalized.get("status", "") or "").strip().lower() or (
                    "suspended" if normalized.get("hasFrame", False) else "terminated"
                )
                can_control = bool(normalized.get("hasFrame", False)) and status != "terminated"
                can_step = (status == "suspended") and (bool(normalized.get("canStep")) or step_point > 0)
                normalized.update(
                    methodName=_executed_code_label(step_point, line_number),
                    className=str(state.get("className", "") or ""),
                    selectorName=str(state.get("selectorName", "") or ""),
                    source=source,
                    sourceOffset=source_offset,
                    sourceOffsets=source_offsets,
                    stepPoint=step_point,
                    lineNumber=line_number,
                    status=status,
                    isLiveSession=bool(normalized.get("isLiveSession", can_control)),
                    canStep=can_step,
                    canProceed=bool(normalized.get("canProceed", status == "suspended")),
                    canRestart=bool(normalized.get("canRestart", status == "suspended")),
                    canTrim=bool(normalized.get("canTrim", status == "suspended")),
                    canTerminate=bool(normalized.get("canTerminate", status in {"suspended", "running"})),
                    canStepInto=bool(normalized.get("canStepInto")) or can_step,
                    canStepOver=bool(normalized.get("canStepOver")) or can_step,
                    canStepReturn=bool(normalized.get("canStepReturn")) or can_step,
                    hasFrame=True,
                )
                return normalized
        executed_source = workspace_executed_code_source_fn(raw_source)
        workspace_source = executed_source or source_hint
        if raw_source and not _source_matches_debug_hint(workspace_source, source_hint):
            return payload
        step_point = int_arg_fn(normalized.get("stepPoint", 0), 0) or 1
        raw_source_offset = int_arg_fn(normalized.get("sourceOffset", 0), 0)
        raw_source_offsets = normalized.get("sourceOffsets")
        source = workspace_source
        source_offsets = _workspace_executed_code_display_offsets(raw_source, raw_source_offsets)
        if len(source_offsets) <= 1 and step_point > 1:
            fallback_offsets = _workspace_statement_start_offsets(source)
            fallback_offsets = _pad_source_offsets_to_step_point(fallback_offsets, step_point)
            if fallback_offsets:
                source_offsets = fallback_offsets
        state_source = str(state.get("source", "") or "")
        state_source_offsets = list(state.get("sourceOffsets", []) or [])
        state_step_point = int_arg_fn(state.get("stepPoint", 0), 0)
        if is_top_visible and state_source and state_source_offsets and _source_matches_debug_hint(state_source, source_hint):
            source = state_source
            source_offsets = state_source_offsets
            if state_step_point > step_point:
                step_point = state_step_point
        if source_offsets:
            step_point = max(1, min(step_point, len(source_offsets)))
        source_offset = _step_point_source_offset(step_point, source_offsets)
        if source_offset <= 0:
            source_offset = workspace_executed_code_display_offset_fn(raw_source, raw_source_offset, step_point)
        if source and source_offset <= 0 and step_point <= 1:
            source_offset = 1
        line_number = _clamp_debug_line_number(
            reported_or_offset_line_number_fn(source, source_offset, ""),
            source,
        )
        if source_offsets and step_point > 0:
            resolved_line_number = _clamp_debug_line_number(
                _resolved_workspace_executed_line_number(source, source_offsets, step_point, line_number or 1),
                source,
            )
            if resolved_line_number > 0:
                line_number = resolved_line_number
        status = str(normalized.get("status", "") or "").strip().lower() or ("suspended" if normalized.get("hasFrame", False) else "terminated")
        can_control = bool(normalized.get("hasFrame", False))
        if status == "terminated":
            can_control = False
        can_step = (status == "suspended") and (bool(normalized.get("canStep")) or step_point > 0)
        if line_number <= 0:
            line_number = _clamp_debug_line_number(
                int_arg_fn(normalized.get("lineNumber", 0), 0) or 1,
                source,
            )
        normalized.update(
            methodName=_executed_code_label(step_point, line_number),
            className=str(state.get("className", normalized.get("className", "")) or ""),
            selectorName=str(state.get("selectorName", normalized.get("selectorName", "")) or ""),
            source=source,
            sourceOffset=source_offset,
            sourceOffsets=source_offsets,
            stepPoint=step_point,
            lineNumber=line_number,
            status=status,
            isLiveSession=bool(normalized.get("isLiveSession", can_control)),
            canStep=can_step,
            canProceed=bool(normalized.get("canProceed", status == "suspended")),
            canRestart=bool(normalized.get("canRestart", status == "suspended")),
            canTrim=bool(normalized.get("canTrim", status == "suspended")),
            canTerminate=bool(normalized.get("canTerminate", status in {"suspended", "running"})),
            canStepInto=bool(normalized.get("canStepInto")) or can_step,
            canStepOver=bool(normalized.get("canStepOver")) or can_step,
            canStepReturn=bool(normalized.get("canStepReturn")) or can_step,
            hasFrame=True,
        )
        _remember_workspace_executed_frame_state(thread_oop, normalized)
        return normalized

    def _preferred_workspace_frame_payload(session, thread_oop: int, frames: list[dict], top_index: int | None) -> dict | None:
        source_hint = _debug_source_hint_text(thread_oop)
        if not source_hint or not frames:
            return None
        candidate_indices: list[int] = []
        state = _debug_executed_frame_state(thread_oop)
        state_source = str(state.get("source", "") or "")
        remembered_index = int_arg_fn(state.get("frameIndex", -1), -1)
        if remembered_index >= 0:
            candidate_indices.append(remembered_index)
        for frame in frames:
            frame_index = int_arg_fn(frame.get("index", -1), -1)
            if frame_index < 0 or frame_index == remembered_index:
                continue
            candidate_indices.append(frame_index)

        best_payload = None
        best_score = None
        for frame_index in candidate_indices:
            try:
                payload = live_debug_frame_payload_fn(session, thread_oop, frame_index, debug_object_ref_fn)
            except Exception:
                payload = None
            if not isinstance(payload, dict) or not payload.get("hasFrame", False):
                continue
            if not _looks_like_workspace_frame(payload):
                continue
            method_name = str(payload.get("methodName", "") or "")
            source = str(payload.get("source", "") or "")
            matches_source = _source_matches_debug_hint(source, source_hint)
            if not matches_source and state_source:
                matches_source = _source_matches_debug_hint(source, state_source)
            if not matches_source and not (not source and _is_executed_code_method_name(method_name)):
                continue
            step_point = int_arg_fn(payload.get("stepPoint", 0), 0)
            line_number = int_arg_fn(payload.get("lineNumber", 0), 0)
            score = (
                int(_is_executed_code_method_name(method_name)),
                step_point,
                line_number,
                frame_index,
            )
            if best_score is None or score > best_score:
                best_score = score
                best_payload = payload
        return best_payload

    @app.get("/debug/threads")
    def debug_threads():
        try:
            with request_session_factory() as session:
                raw = eval_str_fn(
                    session,
                    f"| result encode |\n"
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
                if has_live_debugger_process_fn(session, oop):
                    frames = visible_debug_frames_fn(session, oop)
                    if frames and _debug_source_hint_text(oop):
                        top_index = int_arg_fn(frames[0].get("index", 0), 0)
                        preferred_top_payload = _preferred_workspace_frame_payload(session, oop, frames, top_index)
                        normalized_frames = []
                        for frame in frames:
                            frame_index = int_arg_fn(frame.get("index", 0), 0)
                            payload = None
                            if frame_index == top_index and isinstance(preferred_top_payload, dict):
                                payload = dict(preferred_top_payload)
                            else:
                                try:
                                    payload = live_debug_frame_payload_fn(session, oop, frame_index, debug_object_ref_fn)
                                except Exception:
                                    payload = None
                            if isinstance(payload, dict):
                                if not payload.get("source") and frame_index == top_index:
                                    payload["source"] = _debug_source_hint_text(oop)
                                    payload["lineNumber"] = reported_or_offset_line_number_fn(
                                        str(payload.get("source", "")),
                                        int(payload.get("sourceOffset", 0) or 0),
                                        str(payload.get("methodName", "")),
                                    )
                                payload = _normalize_workspace_debug_payload(
                                    oop,
                                    payload,
                                    is_top_visible=(frame_index == top_index),
                                )
                                rendered_index = 0 if frame_index == top_index else frame_index
                                normalized_frames.append(
                                    _frame_entry(
                                        rendered_index,
                                        str(payload.get("methodName") or frame.get("name") or ""),
                                        class_name=payload.get("className", ""),
                                        selector_name=payload.get("selectorName", ""),
                                    )
                                )
                            else:
                                normalized_frames.append(
                                    _frame_entry(frame_index, frame.get("name") or "", class_name=frame.get("className", ""), selector_name=frame.get("selectorName", ""))
                                )
                        frames = normalized_frames
                else:
                    raw = eval_str_fn(
                        session,
                        f"| obj proc result frameLevel maxFrames methodName ctx contextSkip receiver ownerName selectorName encode |\n"
                        f"{encode_src}\n"
                        f"{debug_process_resolver_fn(oop)}"
                        f"result := ''.\n"
                        f"maxFrames := 50.\n"
                        f"[\n"
                        f"{debug_context_resolver_fn('1')}"
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
                                frame_index = int(idx_s)
                                frames.append(_frame_entry(frame_index, decode_field_fn(name)))
                            except ValueError:
                                pass
                    if frames and _debug_source_hint_text(oop):
                        top_frame = frames[0]
                        frames[0] = _frame_entry(
                            int_arg_fn(top_frame.get("index", 0), 0),
                            _executed_code_label(1, 1),
                            class_name=top_frame.get("className", ""),
                            selector_name=top_frame.get("selectorName", ""),
                        )
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(success=True, frames=frames)

    @app.get("/debug/frame/<int:oop>")
    def debug_frame(oop: int):
        frame_index = int(request.args.get("index", 0))
        try:
            with request_session_factory() as session:
                if has_live_debugger_process_fn(session, oop):
                    top_index = None
                    frames = visible_debug_frames_fn(session, oop)
                    if frames:
                        top_index = int_arg_fn(frames[0].get("index", 0), 0)
                    resolved_frame_index = frame_index
                    if top_index is not None and frame_index == 0:
                        resolved_frame_index = top_index
                    payload = live_debug_frame_payload_fn(session, oop, resolved_frame_index, debug_object_ref_fn)
                    requested_top_visible = top_index is not None and frame_index in {0, top_index}
                    if requested_top_visible:
                        preferred_top_payload = _preferred_workspace_frame_payload(session, oop, frames, top_index)
                        if isinstance(preferred_top_payload, dict):
                            payload = dict(preferred_top_payload)
                    if not payload.get("source") and requested_top_visible:
                        payload["source"] = _debug_source_hint_text(oop)
                        payload["lineNumber"] = reported_or_offset_line_number_fn(
                            str(payload.get("source", "")),
                            int(payload.get("sourceOffset", 0) or 0),
                            str(payload.get("methodName", "")),
                        )
                    payload = _normalize_workspace_debug_payload(
                        oop,
                        payload,
                        is_top_visible=requested_top_visible,
                    )
                    method_name = payload["methodName"]
                    ip_offset = payload["ipOffset"]
                    self_ps = payload["selfPrintString"]
                    self_object = payload["selfObject"]
                    source = payload["source"]
                    source_offset = payload["sourceOffset"]
                    source_offsets = list(payload.get("sourceOffsets", []) or [])
                    step_point = payload["stepPoint"]
                    line_number = payload["lineNumber"]
                    variables = payload["variables"]
                    class_name = str(payload.get("className", "") or "")
                    selector_name = str(payload.get("selectorName", "") or "")
                    status = str(payload.get("status", "terminated") or "terminated")
                    is_live_session = bool(payload.get("isLiveSession", status in {"suspended", "running"}))
                    has_frame = bool(payload["hasFrame"])
                    can_step = bool(payload["canStep"])
                    can_proceed = bool(payload.get("canProceed", has_frame))
                    can_restart = bool(payload.get("canRestart", has_frame))
                    can_trim = bool(payload.get("canTrim", has_frame))
                    can_terminate = bool(payload.get("canTerminate", has_frame))
                    can_step_into = bool(payload.get("canStepInto", can_step))
                    can_step_over = bool(payload.get("canStepOver", can_step))
                    can_step_return = bool(payload.get("canStepReturn", can_step))
                else:
                    raw = eval_str_fn(
                        session,
                        f"| obj proc source receiver selfPs selfOop vars methodName ipOffset varLines stepPoint sourceOffset offsets rawOffset stackReport summary detail tempNames tempValues frameLevel ipValue stepValue n encode ctx contextSkip |\n"
                        f"{encode_src}\n"
                        f"{debug_process_resolver_fn(oop)}"
                        f"frameLevel := {frame_index + 1}.\n"
                        f"{debug_context_resolver_fn()}"
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
                        source = _debug_source_hint_text(oop)
                    line_number = reported_or_offset_line_number_fn(source, source_offset, method_name)
                    top_payload = _normalize_workspace_debug_payload(
                        oop,
                        {
                            "methodName": method_name,
                            "ipOffset": ip_offset,
                            "selfPrintString": self_ps,
                            "source": source,
                            "sourceOffset": source_offset,
                            "stepPoint": step_point,
                            "lineNumber": line_number,
                            "status": "suspended" if method_name != "(no frame)" else "terminated",
                            "isLiveSession": method_name != "(no frame)",
                            "hasFrame": method_name != "(no frame)",
                            "canStep": method_name != "(no frame)" and step_point > 0,
                            "canProceed": method_name != "(no frame)",
                            "canRestart": method_name != "(no frame)",
                            "canTrim": method_name != "(no frame)",
                            "canTerminate": method_name != "(no frame)",
                            "canStepInto": method_name != "(no frame)" and step_point > 0,
                            "canStepOver": method_name != "(no frame)" and step_point > 0,
                            "canStepReturn": method_name != "(no frame)" and step_point > 0,
                        },
                        is_top_visible=(frame_index == 0),
                    )
                    method_name = str(top_payload.get("methodName", method_name))
                    source = str(top_payload.get("source", source))
                    source_offset = int_arg_fn(top_payload.get("sourceOffset", source_offset), source_offset)
                    source_offsets = list(top_payload.get("sourceOffsets", []) or [])
                    step_point = int_arg_fn(top_payload.get("stepPoint", step_point), step_point)
                    line_number = int_arg_fn(top_payload.get("lineNumber", line_number), line_number)
                    class_name, selector_name = _split_frame_method_name(method_name)
                    status = str(top_payload.get("status", "terminated") or "terminated")
                    is_live_session = bool(top_payload.get("isLiveSession", status in {"suspended", "running"}))
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
                    has_frame = bool(top_payload.get("hasFrame", method_name != "(no frame)"))
                    can_step = bool(top_payload.get("canStep", method_name != "(no frame)" and step_point > 0))
                    can_proceed = bool(top_payload.get("canProceed", has_frame))
                    can_restart = bool(top_payload.get("canRestart", has_frame))
                    can_trim = bool(top_payload.get("canTrim", has_frame))
                    can_terminate = bool(top_payload.get("canTerminate", has_frame))
                    can_step_into = bool(top_payload.get("canStepInto", can_step))
                    can_step_over = bool(top_payload.get("canStepOver", can_step))
                    can_step_return = bool(top_payload.get("canStepReturn", can_step))
                frame_key, is_executed_code = _frame_identity_for(method_name, class_name, selector_name)
        except Exception as exc:
            return jsonify(success=False, exception=str(exc)), 500
        return jsonify(
            success=True,
            methodName=method_name,
            className=class_name,
            selectorName=selector_name,
            frameKey=frame_key,
            isExecutedCode=is_executed_code,
            ipOffset=ip_offset,
            selfPrintString=self_ps,
            selfObject=self_object,
            source=source,
            sourceOffset=source_offset,
            sourceOffsets=source_offsets,
            stepPoint=step_point,
            lineNumber=line_number,
            status=status,
            isLiveSession=is_live_session,
            hasFrame=has_frame,
            canStep=can_step,
            canProceed=can_proceed,
            canRestart=can_restart,
            canTrim=can_trim,
            canTerminate=can_terminate,
            canStepInto=can_step_into,
            canStepOver=can_step_over,
            canStepReturn=can_step_return,
            variables=variables,
            frameIndex=frame_index,
        )

    @app.get("/debug/thread-local/<int:oop>")
    def debug_thread_local(oop: int):
        try:
            with request_session_factory() as session:
                if has_live_debugger_process_fn(session, oop):
                    entries = live_thread_local_entries_fn(session, oop)
                else:
                    raw = eval_str_fn(
                        session,
                        f"| proc result lines encode |\n"
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
