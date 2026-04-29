from __future__ import annotations

from .routes_class_browser_query import register_class_browser_query_routes
from .routes_class_browser_read import register_class_browser_read_routes
from .routes_class_browser_write import register_class_browser_write_routes


def register_class_browser_routes(
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
    shared = dict(
        request_session_factory=request_session_factory,
        eval_str_fn=eval_str_fn,
        encode_src=encode_src,
        escape_st_fn=escape_st_fn,
        decode_field_fn=decode_field_fn,
        as_bool_arg_fn=as_bool_arg_fn,
        cb_dict_expr_fn=cb_dict_expr_fn,
        cb_behavior_expr_fn=cb_behavior_expr_fn,
        cb_error_payload_message_fn=cb_error_payload_message_fn,
    )
    register_class_browser_read_routes(app, **shared)
    register_class_browser_query_routes(app, **shared)
    register_class_browser_write_routes(app, **shared)
