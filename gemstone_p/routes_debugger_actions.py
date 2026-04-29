from __future__ import annotations

import time

from flask import jsonify, request


def register_debugger_action_routes(
    app,
    *,
    request_session_factory,
    object_for_oop_expr_fn,
    forget_debug_source_hint_fn,
    forget_debug_replay_receiver_fn,
    is_true_result_fn,
    direct_debug_action_fn,
    direct_trim_action_fn,
    direct_restart_action_fn,
    effective_debug_action_frame_index_fn,
    restart_frame_index_fn,
    restart_needs_workspace_replay_fn,
    restart_workspace_debug_process_fn,
    debug_process_quick_step_point_fn,
    debug_server_step_script_fn,
    debug_advance_step_point_script_fn,
    debug_step_script_fn,
    debug_restart_script_fn,
    has_live_debugger_process_fn,
    debug_process_status_fn,
) -> None:
    def _caller_frame_index(frame_index: int) -> int:
        return max(0, int(frame_index or 0) - 1)

    def _action_success(
        action: str,
        oop: int,
        *,
        frame_index: int | None = None,
        thread_oop: int | None = None,
        message: str | None = None,
        status: str | None = None,
        completed: bool | None = None,
    ):
        payload = {
            "success": True,
            "action": action,
            "threadOop": int(thread_oop if thread_oop is not None else oop),
        }
        if frame_index is not None:
            payload["frameIndex"] = int(frame_index)
        if message:
            payload["message"] = str(message)
        if status:
            payload["status"] = str(status)
        if completed is not None:
            payload["completed"] = bool(completed)
        return jsonify(**payload)

    def _action_error(
        action: str,
        oop: int,
        exception: object,
        status_code: int,
        *,
        frame_index: int | None = None,
        session=None,
        selectors: list[str] | None = None,
    ):
        payload = {
            "success": False,
            "action": action,
            "threadOop": int(oop),
            "exception": str(exception),
        }
        if frame_index is not None:
            payload["frameIndex"] = int(frame_index)
        if selectors:
            payload["selectors"] = list(selectors)
        if session is not None:
            try:
                payload["status"] = str(debug_process_status_fn(session, oop))
            except Exception:
                pass
            try:
                payload["liveProcess"] = bool(has_live_debugger_process_fn(session, oop))
            except Exception:
                pass
        return jsonify(**payload), status_code

    def _wait_for_debugger_termination(session, oop: int, timeout_ms: int = 3000) -> bool:
        deadline = time.monotonic() + (max(0, int(timeout_ms)) / 1000.0)
        while True:
            try:
                if not has_live_debugger_process_fn(session, oop):
                    return True
            except Exception:
                return True
            try:
                if str(debug_process_status_fn(session, oop)) == "terminated":
                    return True
            except Exception:
                return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.01)

    def _wait_for_debugger_stop(session, oop: int, timeout_ms: int = 1000) -> str:
        deadline = time.monotonic() + (max(0, int(timeout_ms)) / 1000.0)
        last_status = "terminated"
        while True:
            try:
                is_live = bool(has_live_debugger_process_fn(session, oop))
            except Exception:
                is_live = False
            try:
                last_status = str(debug_process_status_fn(session, oop) or "terminated")
            except Exception:
                last_status = "terminated"
            if last_status != "running":
                return last_status
            if not is_live and time.monotonic() >= deadline:
                return last_status
            if time.monotonic() >= deadline:
                return last_status
            time.sleep(0.01)

    def _stopped_action_status(action: str, oop: int, *, frame_index: int | None = None, session=None, selectors: list[str] | None = None) -> str | tuple:
        status = _wait_for_debugger_stop(session, oop)
        if status == "running":
            return _action_error(
                action,
                oop,
                f"Debugger action '{action}' did not settle before timeout",
                409,
                frame_index=frame_index,
                session=session,
                selectors=selectors,
            )
        return status

    @app.post("/debug/proceed/<int:oop>")
    def debug_proceed(oop: int):
        try:
            with request_session_factory(read_only=False) as session:
                direct = direct_debug_action_fn(session, oop, [("resume", [])])
                if direct is None:
                    session.eval(
                        f"| proc |\n"
                        f"proc := {object_for_oop_expr_fn(oop)}.\n"
                        f"[proc resume] on: Error do: [:e | ]"
                    )
                forget_debug_source_hint_fn(oop)
                forget_debug_replay_receiver_fn(oop)
        except Exception as exc:
            return _action_error("proceed", oop, exc, 500)
        return _action_success("proceed", oop, message="resumed", status="running")

    @app.post("/debug/step/<int:oop>")
    def debug_step(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        selectors = ["step:", "stepIntoFromLevel:", "_stepIntoInFrame:", "gciStepIntoFromLevel:"]
        effective_frame_index = frame_index
        try:
            with request_session_factory(read_only=False) as session:
                effective_frame_index = effective_debug_action_frame_index_fn(session, oop, frame_index)
                effective_level = effective_frame_index + 1
                result = session.eval(debug_server_step_script_fn(oop, effective_level))
                if not is_true_result_fn(result):
                    return _action_error(
                        "step",
                        oop,
                        "Debugger step is not supported for this process",
                        400,
                        frame_index=frame_index,
                        session=session,
                        selectors=selectors,
                    )
                status = _stopped_action_status("step", oop, frame_index=frame_index, session=session, selectors=selectors)
                if isinstance(status, tuple):
                    return status
        except Exception as exc:
            return _action_error("step", oop, exc, 500, frame_index=effective_frame_index, selectors=selectors)
        return _action_success("step", oop, frame_index=frame_index, message="stepped", status=status)

    @app.post("/debug/step-into/<int:oop>")
    def debug_step_into(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        selectors = ["stepIntoFromLevel:", "_stepIntoInFrame:", "gciStepIntoFromLevel:", "step:"]
        try:
            with request_session_factory(read_only=False) as session:
                effective_frame_index = effective_debug_action_frame_index_fn(session, oop, frame_index)
                direct = direct_debug_action_fn(
                    session,
                    oop,
                    [(selector, [effective_frame_index + 1]) for selector in selectors],
                )
                if direct is False:
                    return _action_error(
                        "stepInto",
                        oop,
                        "Debugger step-into is not supported for this process",
                        400,
                        frame_index=frame_index,
                        session=session,
                        selectors=selectors,
                    )
                if direct is None:
                    result = session.eval(debug_step_script_fn(oop, selectors, effective_frame_index + 1))
                    if not is_true_result_fn(result):
                        return _action_error(
                            "stepInto",
                            oop,
                            "Debugger step-into is not supported for this process",
                            400,
                            frame_index=frame_index,
                            session=session,
                            selectors=selectors,
                        )
                status = _stopped_action_status("stepInto", oop, frame_index=frame_index, session=session, selectors=selectors)
                if isinstance(status, tuple):
                    return status
        except Exception as exc:
            return _action_error("stepInto", oop, exc, 500, frame_index=frame_index, selectors=selectors)
        return _action_success("stepInto", oop, frame_index=frame_index, message="stepped into", status=status)

    @app.post("/debug/step-over/<int:oop>")
    def debug_step_over(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        selectors = ["stepOverFromLevel:", "_stepOverInFrame:", "gciStepOverFromLevel:"]
        fallback_selectors = ["step:", "stepIntoFromLevel:", "_stepIntoInFrame:", "gciStepIntoFromLevel:"]
        try:
            with request_session_factory(read_only=False) as session:
                effective_frame_index = effective_debug_action_frame_index_fn(session, oop, frame_index)
                effective_level = effective_frame_index + 1
                pre_step_point = debug_process_quick_step_point_fn(session, oop, effective_level)
                direct = direct_debug_action_fn(
                    session,
                    oop,
                    [(selector, [effective_level]) for selector in selectors],
                )
                if direct is False:
                    return _action_error(
                        "stepOver",
                        oop,
                        "Debugger step-over is not supported for this process",
                        400,
                        frame_index=frame_index,
                        session=session,
                        selectors=selectors,
                    )
                if direct is None:
                    result = session.eval(debug_step_script_fn(oop, selectors, effective_level))
                    if not is_true_result_fn(result):
                        return _action_error(
                            "stepOver",
                            oop,
                            "Debugger step-over is not supported for this process",
                            400,
                            frame_index=frame_index,
                            session=session,
                            selectors=selectors,
                        )
                status = _stopped_action_status("stepOver", oop, frame_index=frame_index, session=session, selectors=selectors)
                if isinstance(status, tuple):
                    return status
                post_step_point = debug_process_quick_step_point_fn(session, oop, effective_level)
                if (
                    status != "running"
                    and frame_index == 0
                    and post_step_point <= max(1, pre_step_point)
                ):
                    direct = direct_debug_action_fn(
                        session,
                        oop,
                        [(selector, [effective_level]) for selector in fallback_selectors],
                    )
                    if direct is False:
                        return _action_error(
                            "stepOver",
                            oop,
                            "Debugger step-over is not supported for this process",
                            400,
                            frame_index=frame_index,
                            session=session,
                            selectors=selectors + fallback_selectors,
                        )
                    if direct is None:
                        result = session.eval(debug_step_script_fn(oop, fallback_selectors, effective_level))
                        if not is_true_result_fn(result):
                            return _action_error(
                                "stepOver",
                                oop,
                                "Debugger step-over is not supported for this process",
                                400,
                                frame_index=frame_index,
                                session=session,
                                selectors=selectors + fallback_selectors,
                            )
                    status = _stopped_action_status("stepOver", oop, frame_index=frame_index, session=session, selectors=selectors + fallback_selectors)
                    if isinstance(status, tuple):
                        return status
        except Exception as exc:
            return _action_error("stepOver", oop, exc, 500, frame_index=frame_index, selectors=selectors)
        return _action_success("stepOver", oop, frame_index=frame_index, message="stepped over", status=status)

    @app.post("/debug/step-return/<int:oop>")
    def debug_step_return(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        selectors = ["stepOverFromLevel:", "_stepOverInFrame:", "gciStepOverFromLevel:"]
        try:
            with request_session_factory(read_only=False) as session:
                effective_frame_index = effective_debug_action_frame_index_fn(session, oop, frame_index)
                direct = direct_debug_action_fn(
                    session,
                    oop,
                    [(selector, [effective_frame_index + 1]) for selector in selectors],
                )
                if direct is False:
                    return _action_error(
                        "stepReturn",
                        oop,
                        "Debugger step-out is not supported for this process",
                        400,
                        frame_index=frame_index,
                        session=session,
                        selectors=selectors,
                    )
                if direct is None:
                    result = session.eval(debug_step_script_fn(oop, selectors, effective_frame_index + 1))
                    if not is_true_result_fn(result):
                        return _action_error(
                            "stepReturn",
                            oop,
                            "Debugger step-out is not supported for this process",
                            400,
                            frame_index=frame_index,
                            session=session,
                            selectors=selectors,
                        )
                status = _stopped_action_status("stepReturn", oop, frame_index=frame_index, session=session, selectors=selectors)
                if isinstance(status, tuple):
                    return status
        except Exception as exc:
            return _action_error("stepReturn", oop, exc, 500, frame_index=frame_index, selectors=selectors)
        return _action_success(
            "stepReturn",
            oop,
            frame_index=_caller_frame_index(frame_index),
            message="stepped out",
            status=status,
        )

    @app.post("/debug/restart/<int:oop>")
    def debug_restart(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                is_live = has_live_debugger_process_fn(session, oop)
                effective_frame_index = restart_frame_index_fn(session, oop, frame_index) if is_live else max(0, int(frame_index or 0))
                result = session.eval(debug_restart_script_fn(oop, effective_frame_index + 1))
                if not is_true_result_fn(result):
                    already_at_first_step = False
                    if is_live:
                        try:
                            visible_frame_level = effective_debug_action_frame_index_fn(session, oop, 0) + 1
                            already_at_first_step = debug_process_quick_step_point_fn(session, oop, visible_frame_level) <= 1
                        except Exception:
                            already_at_first_step = False
                    if already_at_first_step:
                        status = _stopped_action_status("restart", oop, frame_index=frame_index, session=session)
                        if isinstance(status, tuple):
                            return status
                        return _action_success(
                            "restart",
                            oop,
                            frame_index=0,
                            message="restarted",
                            status=status,
                            completed=False,
                        )
                    return _action_error(
                        "restart",
                        oop,
                        "Debugger restart is not supported for this process",
                        400,
                        frame_index=frame_index,
                        session=session,
                    )
                if is_live and restart_needs_workspace_replay_fn(session, oop, effective_frame_index):
                    replay = restart_workspace_debug_process_fn(session, oop)
                    if replay is False:
                        return _action_error(
                            "restart",
                            oop,
                            "Debugger restart is not supported for this process",
                            400,
                            frame_index=frame_index,
                            session=session,
                        )
                    if isinstance(replay, dict):
                        try:
                            thread_oop = int(replay.get("thread_oop") or 0)
                        except Exception:
                            thread_oop = 0
                        target_thread_oop = thread_oop if thread_oop > 0 else oop
                        status = "terminated" if replay.get("completed") is True else _wait_for_debugger_stop(session, target_thread_oop)
                        if status == "running":
                            return _action_error(
                                "restart",
                                target_thread_oop,
                                "Debugger action 'restart' did not settle before timeout",
                                409,
                                frame_index=frame_index,
                                session=session,
                            )
                        return _action_success(
                            "restart",
                            oop,
                            frame_index=0,
                            thread_oop=target_thread_oop,
                            message="restarted to completion" if replay.get("completed") is True else "restarted",
                            status=status,
                            completed=replay.get("completed") is True,
                        )
                status = _stopped_action_status("restart", oop, frame_index=frame_index, session=session)
                if isinstance(status, tuple):
                    return status
                return _action_success(
                    "restart",
                    oop,
                    frame_index=0,
                    message="restarted",
                    status=status,
                    completed=False,
                )
        except Exception as exc:
            return _action_error("restart", oop, exc, 500, frame_index=frame_index)
        return _action_success("restart", oop, frame_index=0, message="restarted", status="suspended", completed=False)

    @app.post("/debug/terminate/<int:oop>")
    def debug_terminate(oop: int):
        try:
            with request_session_factory(read_only=False) as session:
                direct = direct_debug_action_fn(
                    session,
                    oop,
                    [
                        ("terminate", []),
                        ("terminateProcess", []),
                    ],
                )
                if direct is not True:
                    session.eval(
                        f"| proc attempted ctx |\n"
                        f"proc := {object_for_oop_expr_fn(oop)}.\n"
                        f"attempted := false.\n"
                        f"(proc respondsTo: #terminate) ifTrue: [\n"
                        f"  attempted := true.\n"
                        f"  [proc terminate] on: Error do: [:e | nil]\n"
                        f"].\n"
                        f"(attempted not and: [proc respondsTo: #terminateProcess]) ifTrue: [\n"
                        f"  attempted := true.\n"
                        f"  [proc terminateProcess] on: Error do: [:e | nil]\n"
                        f"].\n"
                        f"ctx := [proc suspendedContext] on: Error do: [:e | nil].\n"
                        f"(attempted not and: [ctx notNil and: [ctx respondsTo: #terminateProcess]]) ifTrue: [\n"
                        f"  attempted := true.\n"
                        f"  [ctx terminateProcess] on: Error do: [:e | nil]\n"
                        f"].\n"
                        f"attempted ifTrue: ['true'] ifFalse: ['false']"
                    )
                if not _wait_for_debugger_termination(session, oop):
                    if direct is not True:
                        return _action_error(
                            "terminate",
                            oop,
                            "Debugger terminate is not supported for this process",
                            400,
                            session=session,
                            selectors=["terminate", "terminateProcess"],
                        )
                forget_debug_source_hint_fn(oop)
                forget_debug_replay_receiver_fn(oop)
        except Exception as exc:
            return _action_error("terminate", oop, exc, 500, selectors=["terminate", "terminateProcess"])
        return _action_success("terminate", oop, message="terminated", status="terminated")

    @app.post("/debug/trim/<int:oop>")
    def debug_trim(oop: int):
        frame_index = int((request.get_json(force=True) or {}).get("index", 0))
        try:
            with request_session_factory(read_only=False) as session:
                direct = direct_trim_action_fn(session, oop, frame_index)
                if direct is False:
                    return _action_error(
                        "trim",
                        oop,
                        "Debugger trim-stack is not supported for this process",
                        400,
                        frame_index=frame_index,
                        session=session,
                    )
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
                    if not is_true_result_fn(result):
                        return _action_error(
                            "trim",
                            oop,
                            "Debugger trim-stack is not supported for this process",
                            400,
                            frame_index=frame_index,
                            session=session,
                        )
                status = _stopped_action_status("trim", oop, frame_index=frame_index, session=session)
                if isinstance(status, tuple):
                    return status
        except Exception as exc:
            return _action_error("trim", oop, exc, 500, frame_index=frame_index)
        return _action_success("trim", oop, frame_index=0, message="stack trimmed", status=status)
