from __future__ import annotations

from flask import jsonify, request


def register_class_browser_write_variable_routes(
    app,
    *,
    request_session_factory,
    eval_str_fn,
    encode_src,
    escape_st_fn,
    decode_field_fn,
    cb_behavior_expr_fn,
    cb_error_payload_message_fn,
) -> None:
    request_session = request_session_factory
    eval_str = eval_str_fn
    escape_st = escape_st_fn
    decode_field = decode_field_fn
    cb_behavior_expr = cb_behavior_expr_fn
    cb_error_payload_message = cb_error_payload_message_fn

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
        return jsonify(success=True, result=f"Added instance variable {added_name}", variableName=added_name)

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
        return jsonify(success=True, result=f"Added class variable {added_name}", variableName=added_name)

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
        return jsonify(success=True, result=f"Added class instance variable {added_name}", variableName=added_name)

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
        return jsonify(success=True, result=f"Removed instance variable {removed_name}", variableName=removed_name)

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
        return jsonify(success=True, result=f"Removed class variable {removed_name}", variableName=removed_name)

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
        return jsonify(success=True, result=f"Removed class instance variable {removed_name}", variableName=removed_name)
