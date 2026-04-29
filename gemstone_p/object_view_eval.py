from __future__ import annotations

import ctypes
from typing import Any

from gemstone_py import GemStoneError, GemStoneSession, GciErrSType, OOP_ILLEGAL, OOP_NIL
from gemstone_py._smalltalk_batch import object_for_oop_expr

from gemstone_p.object_view_meta import _ENCODE_SRC, _decode, _str


def _escape_st(code: str) -> str:
    return code.replace("'", "''")


def _eval_str(session: GemStoneSession, smalltalk: str) -> str:
    return _str(session.eval(smalltalk))


def _browser_target_label(class_name: str, meta: bool) -> str:
    return f"{class_name} class" if meta else class_name


def _fallback_browser_target(oop: int, inspection: str) -> dict[str, Any] | None:
    label = _str(inspection).strip()
    if not label:
        return None
    meta = False
    class_name = label
    if label.endswith(" class"):
        meta = True
        class_name = label[:-6].strip()
    if not class_name:
        return None
    return {
        "oop": oop,
        "className": class_name,
        "dictionary": "",
        "meta": meta,
        "label": _browser_target_label(class_name, meta),
    }


def _behavior_browser_targets(session: GemStoneSession, *oops: int) -> dict[int, dict[str, Any]]:
    target_oops = sorted({int(oop) for oop in oops if oop not in (None, OOP_NIL)})
    if not target_oops:
        return {}

    try:
        raw = _eval_str(
            session,
            "[ | targets rows encode |\n"
            f"{_ENCODE_SRC}\n"
            f"targets := Set withAll: #({' '.join(str(oop) for oop in target_oops)}).\n"
            "rows := OrderedCollection new.\n"
            "System myUserProfile symbolList do: [:dict |\n"
            "  | dictName |\n"
            "  dictName := (([dict name] on: Error do: [:e | dict printString]) asString).\n"
            "  dict keysAndValuesDo: [:key :value |\n"
            "    ([value isBehavior] on: Error do: [:e | false]) ifTrue: [\n"
            "      | valueOop metaOop |\n"
            "      valueOop := value asOop.\n"
            "      (targets includes: valueOop) ifTrue: [\n"
            "        rows add: ((encode value: valueOop printString), '|', (encode value: dictName), '|', (encode value: key asString), '|0')\n"
            "      ].\n"
            "      metaOop := ([value class asOop] on: Error do: [:e | nil]).\n"
            "      (metaOop notNil and: [targets includes: metaOop]) ifTrue: [\n"
            "        rows add: ((encode value: metaOop printString), '|', (encode value: dictName), '|', (encode value: key asString), '|1')\n"
            "      ]\n"
            "    ]\n"
            "  ]\n"
            "].\n"
            "String streamContents: [:stream |\n"
            "  rows do: [:row | stream nextPutAll: row; lf ]\n"
            "]\n"
            "] value"
        )
    except Exception:
        return {}

    result: dict[int, dict[str, Any]] = {}
    for line in _str(raw).splitlines():
        if not line:
            continue
        parts = line.split("|", 3)
        if len(parts) != 4:
            continue
        try:
            target_oop = int(_decode(parts[0]))
        except Exception:
            continue
        if target_oop in result:
            continue
        dictionary = _decode(parts[1]).strip()
        class_name = _decode(parts[2]).strip()
        meta = _decode(parts[3]).strip() == "1"
        if not class_name:
            continue
        result[target_oop] = {
            "oop": target_oop,
            "className": class_name,
            "dictionary": dictionary,
            "meta": meta,
            "label": _browser_target_label(class_name, meta),
        }
    return result


def eval_in_context(
    session: GemStoneSession, oop: int, code: str, language: str
) -> dict[str, Any]:
    def valid_remote_oop(raw: object) -> int | None:
        try:
            value = int(raw)
        except Exception:
            return None
        return value if value > OOP_NIL else None

    escaped = _escape_st(code)
    obj_expr = object_for_oop_expr(oop)
    source = (
        f"| receiver |\n"
        f"receiver := {obj_expr}.\n"
        f"receiver evaluate: '{escaped}'"
    )
    try:
        if language != "smalltalk":
            return {
                "isException": False,
                "resultOop": session.eval_oop(source),
                "errorText": "",
                "debugThreadOop": None,
                "exceptionOop": None,
            }

        lib = session._require_login()
        result_oop = int(lib.GciExecuteStr(source.encode("utf-8"), ctypes.c_uint64(OOP_NIL)))
        err = GciErrSType()
        lib.GciErr(ctypes.byref(err))
        exception_oop = valid_remote_oop(err.exceptionObj)
        debug_thread_oop = valid_remote_oop(err.context)
        has_pending_error = bool(err.number) or debug_thread_oop is not None or exception_oop is not None
        if not has_pending_error and result_oop != OOP_ILLEGAL:
            return {
                "isException": False,
                "resultOop": result_oop,
                "errorText": "",
                "debugThreadOop": None,
                "exceptionOop": None,
            }
        return {
            "isException": True,
            "resultOop": exception_oop,
            "errorText": (
                str(GemStoneError.from_err_struct(err))
                if has_pending_error and err.number
                else "GemStone execution failed"
            ),
            "debugThreadOop": debug_thread_oop,
            "exceptionOop": exception_oop,
        }
    except Exception as exc:
        return {
            "isException": True,
            "resultOop": None,
            "errorText": str(exc),
            "debugThreadOop": None,
            "exceptionOop": None,
        }
