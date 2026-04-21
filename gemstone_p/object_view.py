"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts that the frontend understands. Mirrors mdbe's database_views/*.rb files.

The view format is:
    {
        "oop":       <int>,          # GemStone OOP (object identity)
        "loaded":    <bool>,
        "basetype":  <str>,          # "object", "class", "string", …
        "inspection": <str>,         # printString / repr (truncated to 200)
        "classObject": { … },        # recursive view of the class (depth-1)
        "instVars": { … },
        "instVarsSize": <int>,
    }
"""

from __future__ import annotations

import sys
from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL


def _eval(session: GemStoneSession, smalltalk: str) -> Any:
    return session.eval(smalltalk)


def _oop_of(session: GemStoneSession, expr: str) -> int:
    """Return the OOP of a Smalltalk expression result."""
    return int(_eval(session, f"({expr}) basicHash"))


def _inspect(session: GemStoneSession, oop: int, limit: int = 200) -> str:
    """Return a truncated printString for the object at oop."""
    try:
        result = session.eval(
            f"| obj s | obj := ObjectMemory objectForOop: {oop}. "
            f"s := [obj printString] on: Error do: [:e | '(error: ', e messageText, ')']."
            f"s size > {limit} ifTrue: [s := (s copyFrom: 1 to: {limit}), '...']."
            f"s"
        )
        if isinstance(result, (bytes, bytearray)):
            return result.decode("utf-8", errors="replace")
        return str(result)
    except Exception as exc:
        return f"(error: {exc})"


def _class_name(session: GemStoneSession, oop: int) -> str:
    try:
        result = session.eval(
            f"(ObjectMemory objectForOop: {oop}) class name"
        )
        if isinstance(result, (bytes, bytearray)):
            return result.decode("utf-8", errors="replace")
        return str(result)
    except Exception:
        return "(unknown)"


def _basetype(session: GemStoneSession, oop: int) -> str:
    """Classify the object into a broad basetype string."""
    try:
        result = session.eval(
            f"| obj | obj := ObjectMemory objectForOop: {oop}. "
            f"(obj isKindOf: Class) ifTrue: [^'class']. "
            f"(obj isKindOf: String) ifTrue: [^'string']. "
            f"(obj isKindOf: Symbol) ifTrue: [^'symbol']. "
            f"(obj isKindOf: SmallInteger) ifTrue: [^'fixnum']. "
            f"(obj isKindOf: Float) ifTrue: [^'float']. "
            f"(obj isKindOf: Array) ifTrue: [^'array']. "
            f"(obj isKindOf: Dictionary) ifTrue: [^'hash']. "
            f"(obj isKindOf: Boolean) ifTrue: [^'boolean']. "
            f"(obj isNil) ifTrue: [^'nilclass']. "
            f"'object'"
        )
        if isinstance(result, (bytes, bytearray)):
            return result.decode("utf-8", errors="replace")
        return str(result)
    except Exception:
        return "object"


def _class_oop(session: GemStoneSession, oop: int) -> int:
    """Return the OOP of the class of the object at oop."""
    try:
        return int(session.eval(
            f"(ObjectMemory objectForOop: {oop}) class basicHash"
        ))
    except Exception:
        return OOP_NIL


def _inst_vars(
    session: GemStoneSession,
    oop: int,
    depth: int,
    range_from: int,
    range_to: int,
    params: dict,
) -> tuple[int, dict]:
    """Return (total_count, {1-based-index: [name_view, value_view]})."""
    try:
        count_raw = session.eval(
            f"(ObjectMemory objectForOop: {oop}) class instVarNames size"
        )
        count = int(count_raw)
    except Exception:
        return 0, {}

    if count == 0 or depth <= 0:
        return count, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, count)

    for i in range(lo, hi + 1):
        try:
            name_raw = session.eval(
                f"(ObjectMemory objectForOop: {oop}) class instVarNames at: {i}"
            )
            name = name_raw.decode("utf-8", errors="replace") if isinstance(name_raw, (bytes, bytearray)) else str(name_raw)
            val_oop = int(session.eval(
                f"((ObjectMemory objectForOop: {oop}) instVarAt: {i}) basicHash"
            ))
            result[i] = [
                {"oop": None, "inspection": name, "basetype": "symbol", "loaded": False},
                object_view(session, val_oop, depth - 1, {}, params),
            ]
        except Exception as exc:
            result[i] = [
                {"oop": None, "inspection": f"var_{i}", "basetype": "symbol", "loaded": False},
                {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False},
            ]

    return count, result


def object_view(
    session: GemStoneSession,
    oop: int,
    depth: int = 2,
    ranges: dict | None = None,
    params: dict | None = None,
) -> dict:
    """
    Build a JSON-serialisable view dict for the object at `oop`.

    Mirrors Object#to_database_view from mdbe.
    """
    if ranges is None:
        ranges = {}
    if params is None:
        params = {}

    obj: dict[str, Any] = {"oop": oop}

    inspection = _inspect(session, oop)
    obj["inspection"] = inspection
    obj["basetype"] = _basetype(session, oop)

    if depth <= 0:
        obj["loaded"] = False
        return obj

    obj["loaded"] = True
    obj["exception"] = False

    class_oop = _class_oop(session, oop)
    obj["classObject"] = object_view(session, class_oop, depth - 1, {}, params)

    range_from = int(ranges.get("instVars", [1, 10])[0]) if "instVars" in ranges else 1
    range_to = int(ranges.get("instVars", [1, 10])[1]) if "instVars" in ranges else 10

    count, inst_vars = _inst_vars(session, oop, depth, range_from, range_to, params)
    obj["instVarsSize"] = count
    obj["instVars"] = inst_vars
    obj["customTabs"] = []

    return obj


def eval_in_context(session: GemStoneSession, oop: int, code: str, language: str) -> tuple[bool, Any]:
    """
    Evaluate `code` in the context of the object at `oop`.
    Returns (is_exception, result_oop_or_error_string).

    Mirrors CodeEvaluation.wait_for_eval_thread + Object#evaluate routes in mdbe.
    """
    if language == "smalltalk":
        template = (
            f"| obj result | obj := ObjectMemory objectForOop: {oop}. "
            f"result := [obj evaluate: '{_escape_st(code)}'] "
            f"  on: Error do: [:e | Array with: true with: e]. "
            f"(result isKindOf: Array) ifTrue: [result] ifFalse: [Array with: false with: result]"
        )
    else:
        # For non-Smalltalk we just execute as bare Smalltalk for now.
        template = (
            f"[{_escape_st(code)}] "
            f"  on: Error do: [:e | Array with: true with: e]"
        )

    try:
        raw = session.eval(template)
        if isinstance(raw, (list, tuple)) and len(raw) == 2:
            is_exc = bool(raw[0])
            val = raw[1]
        else:
            is_exc = False
            val = raw
        result_oop = int(session.eval(f"({_quote_obj(val)}) basicHash")) if not isinstance(val, int) else val
        return is_exc, result_oop
    except Exception as exc:
        return True, str(exc)


def _escape_st(code: str) -> str:
    """Minimal escaping for embedding code in a Smalltalk string literal."""
    return code.replace("'", "''")


def _quote_obj(val: Any) -> str:
    """Produce a Smalltalk literal for simple Python values."""
    if val is None:
        return "nil"
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, int):
        return str(val)
    if isinstance(val, float):
        return repr(val)
    if isinstance(val, (bytes, bytearray)):
        s = val.decode("utf-8", errors="replace")
        return f"'{_escape_st(s)}'"
    return f"'{_escape_st(str(val))}'"
