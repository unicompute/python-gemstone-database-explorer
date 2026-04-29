from __future__ import annotations

from .routes_class_browser_write_classes import (
    register_class_browser_write_class_routes,
)
from .routes_class_browser_write_compile import (
    register_class_browser_write_compile_routes,
)
from .routes_class_browser_write_dictionaries import (
    register_class_browser_write_dictionary_routes,
)
from .routes_class_browser_write_organization import (
    register_class_browser_write_organization_routes,
)
from .routes_class_browser_write_variables import (
    register_class_browser_write_variable_routes,
)


def register_class_browser_write_routes(
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
    register_class_browser_write_dictionary_routes(
        app=app,
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        encode_src=encode_src,
        escape_st_fn=escape_st_fn,
        decode_field_fn=decode_field_fn,
        cb_error_payload_message_fn=cb_error_payload_message_fn,
    )
    register_class_browser_write_class_routes(
        app=app,
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        encode_src=encode_src,
        escape_st_fn=escape_st_fn,
        decode_field_fn=decode_field_fn,
        cb_behavior_expr_fn=cb_behavior_expr_fn,
        cb_error_payload_message_fn=cb_error_payload_message_fn,
        cb_dict_expr_fn=cb_dict_expr_fn,
    )
    register_class_browser_write_organization_routes(
        app=app,
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        encode_src=encode_src,
        escape_st_fn=escape_st_fn,
        decode_field_fn=decode_field_fn,
        cb_behavior_expr_fn=cb_behavior_expr_fn,
        cb_error_payload_message_fn=cb_error_payload_message_fn,
    )
    register_class_browser_write_variable_routes(
        app=app,
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        encode_src=encode_src,
        escape_st_fn=escape_st_fn,
        decode_field_fn=decode_field_fn,
        cb_behavior_expr_fn=cb_behavior_expr_fn,
        cb_error_payload_message_fn=cb_error_payload_message_fn,
    )
    register_class_browser_write_compile_routes(
        app=app,
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        encode_src=encode_src,
        escape_st_fn=escape_st_fn,
        decode_field_fn=decode_field_fn,
        cb_behavior_expr_fn=cb_behavior_expr_fn,
    )
