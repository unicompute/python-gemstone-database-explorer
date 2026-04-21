"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts that the frontend understands. Mirrors mdbe's database_views/*.rb files.

The view format is:
    {
        "oop":        <int>,          # GemStone OOP (object identity)
        "loaded":     <bool>,
        "basetype":   <str>,          # "object", "class", "string", …
        "inspection": <str>,          # printString (truncated to 200 chars)
        "classObject": { … },         # recursive view of the class (depth-1)
        "instVars":   { … },
        "instVarsSize": <int>,
    }
"""

from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL


def _eval_oop(session: GemStoneSession, smalltalk: str) -> int:
    """Evaluate Smalltalk and return the raw OOP integer (never None)."""
    return session.eval_oop(smalltalk)


def _eval_str(session: GemStoneSession, smalltalk: str) -> str:
    """Evaluate Smalltalk and coerce the result to a Python str."""
    result = session.eval(smalltalk)
    if result is None:
        return ""
    if isinstance(result, (bytes, bytearray)):
        return result.decode("utf-8", errors="replace")
    return str(result)


def _eval(session: GemStoneSession, smalltalk: str) -> Any:
    """Evaluate Smalltalk and return the marshalled Python value."""
    return session.eval(smalltalk)


def _inspect(session: GemStoneSession, oop: int, limit: int = 200) -> str:
    """Return a truncated printString for the object at oop."""
    try:
        return _eval_str(
            session,
            f"| obj s |"
            f"obj := ObjectMemory objectForOop: {oop}."
            f"s := [obj printString] on: Error do: [:e | '(error: ', e messageText, ')']."
            f"s size > {limit} ifTrue: [s := (s copyFrom: 1 to: {limit}), '...']."
            f"s"
        )
    except Exception as exc:
        return f"(error: {exc})"


def _basetype(session: GemStoneSession, oop: int) -> str:
    """Classify the object into a broad basetype string."""
    try:
        return _eval_str(
            session,
            f"| obj |"
            f"obj := ObjectMemory objectForOop: {oop}."
            f"obj isNil ifTrue: ['nilclass'] ifFalse: ["
            f"(obj isKindOf: Class) ifTrue: ['class'] ifFalse: ["
            f"(obj isKindOf: Symbol) ifTrue: ['symbol'] ifFalse: ["
            f"(obj isKindOf: String) ifTrue: ['string'] ifFalse: ["
            f"(obj isKindOf: SmallInteger) ifTrue: ['fixnum'] ifFalse: ["
            f"(obj isKindOf: Float) ifTrue: ['float'] ifFalse: ["
            f"(obj isKindOf: Array) ifTrue: ['array'] ifFalse: ["
            f"(obj isKindOf: Dictionary) ifTrue: ['hash'] ifFalse: ["
            f"(obj isKindOf: Boolean) ifTrue: ['boolean'] ifFalse: ["
            f"'object']]]]]]]]]]"
        )
    except Exception:
        return "object"


def _class_oop(session: GemStoneSession, oop: int) -> int:
    """Return the OOP of the class of the object at oop."""
    try:
        return _eval_oop(session, f"(ObjectMemory objectForOop: {oop}) class")
    except Exception:
        return OOP_NIL


def _inst_var_count(session: GemStoneSession, oop: int) -> int:
    try:
        result = session.eval(
            f"(ObjectMemory objectForOop: {oop}) class instVarNames size"
        )
        return int(result) if result is not None else 0
    except Exception:
        return 0


def _inst_vars(
    session: GemStoneSession,
    oop: int,
    depth: int,
    range_from: int,
    range_to: int,
    params: dict,
) -> tuple[int, dict]:
    """Return (total_count, {1-based-index: [name_view, value_view]})."""
    count = _inst_var_count(session, oop)
    if count == 0 or depth <= 0:
        return count, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, count)

    for i in range(lo, hi + 1):
        try:
            name = _eval_str(
                session,
                f"(ObjectMemory objectForOop: {oop}) class instVarNames at: {i}"
            )
            val_oop = _eval_oop(
                session,
                f"(ObjectMemory objectForOop: {oop}) instVarAt: {i}"
            )
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
    """Build a JSON-serialisable view dict for the object at `oop`."""
    if ranges is None:
        ranges = {}
    if params is None:
        params = {}

    obj: dict[str, Any] = {"oop": oop}
    obj["inspection"] = _inspect(session, oop)
    obj["basetype"] = _basetype(session, oop)

    if depth <= 0:
        obj["loaded"] = False
        return obj

    obj["loaded"] = True
    obj["exception"] = False

    class_oop = _class_oop(session, oop)
    obj["classObject"] = object_view(session, class_oop, depth - 1, {}, params)

    range_from = int(ranges["instVars"][0]) if "instVars" in ranges else 1
    range_to = int(ranges["instVars"][1]) if "instVars" in ranges else 10

    count, inst_vars = _inst_vars(session, oop, depth, range_from, range_to, params)
    obj["instVarsSize"] = count
    obj["instVars"] = inst_vars
    obj["customTabs"] = []

    return obj


def eval_in_context(session: GemStoneSession, oop: int, code: str, language: str) -> tuple[bool, int | str]:
    """
    Evaluate `code` in the context of the object at `oop`.
    Returns (is_exception, result_oop) or (True, error_string).
    """
    escaped = _escape_st(code)
    try:
        is_exc_oop = _eval_oop(
            session,
            f"| obj result isExc |"
            f"obj := ObjectMemory objectForOop: {oop}."
            f"isExc := false."
            f"result := [obj evaluate: '{escaped}'] on: Error do: [:e | isExc := true. e]."
            f"isExc"
        )
        from gemstone_py import OOP_TRUE
        is_exc = (is_exc_oop == OOP_TRUE)

        result_oop = _eval_oop(
            session,
            f"| obj result |"
            f"obj := ObjectMemory objectForOop: {oop}."
            f"[obj evaluate: '{escaped}'] on: Error do: [:e | e]"
        )
        return is_exc, result_oop
    except Exception as exc:
        return True, str(exc)


def _escape_st(code: str) -> str:
    """Escape single quotes for embedding in a Smalltalk string literal."""
    return code.replace("'", "''")
