"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts the frontend understands. Mirrors mdbe's database_views/*.rb files.

Uses session.perform / perform_oop to send messages directly to objects by
OOP — no need to build objectForOop: Smalltalk strings.

View format:
    {
        "oop":          <int>,
        "loaded":       <bool>,
        "basetype":     <str>,   # "object", "class", "string", …
        "inspection":   <str>,   # printString (truncated)
        "classObject":  { … },
        "instVars":     { … },
        "instVarsSize": <int>,
    }
"""

from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL, OOP_TRUE, OOP_FALSE


# --------------------------------------------------------------------------- #
# Low-level helpers                                                            #
# --------------------------------------------------------------------------- #

def _str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _inspect(session: GemStoneSession, oop: int, limit: int = 200) -> str:
    try:
        raw = session.perform(oop, "printString")
        s = _str(raw)
        return s[:limit] + ("..." if len(s) > limit else "")
    except Exception as exc:
        return f"(error: {exc})"


def _basetype(session: GemStoneSession, oop: int) -> str:
    if oop == OOP_NIL:
        return "nilclass"
    if oop == OOP_TRUE or oop == OOP_FALSE:
        return "boolean"
    try:
        # Ask the object's class for its name
        class_oop = session.perform_oop(oop, "class")
        name = _str(session.perform(class_oop, "name"))
        mapping = {
            "Class":           "class",
            "Metaclass":       "class",
            "String":          "string",
            "Symbol":          "symbol",
            "SmallInteger":    "fixnum",
            "LargePositiveInteger": "fixnum",
            "LargeNegativeInteger": "fixnum",
            "Float":           "float",
            "Array":           "array",
            "SymbolDictionary":"hash",
            "Dictionary":      "hash",
            "IdentityDictionary": "hash",
            "True":            "boolean",
            "False":           "boolean",
        }
        return mapping.get(name, "object")
    except Exception:
        return "object"


def _class_oop(session: GemStoneSession, oop: int) -> int:
    try:
        return session.perform_oop(oop, "class")
    except Exception:
        return OOP_NIL


def _inst_var_names(session: GemStoneSession, oop: int) -> list[str]:
    """Return the instance variable names for the object's class."""
    try:
        class_oop = session.perform_oop(oop, "class")
        count_raw = session.perform(class_oop, "instSize")
        count = int(count_raw) if count_raw is not None else 0
        names = []
        for i in range(1, count + 1):
            idx_oop = session.int_oop(i)
            name_raw = session.perform(class_oop, "instVarNameAt:", idx_oop)
            names.append(_str(name_raw))
        return names
    except Exception:
        return []


def _inst_var_value_oop(session: GemStoneSession, oop: int, index: int) -> int:
    """Return the OOP of instance variable at 1-based index."""
    try:
        idx_oop = session.int_oop(index)
        return session.perform_oop(oop, "instVarAt:", idx_oop)
    except Exception:
        return OOP_NIL


# --------------------------------------------------------------------------- #
# Public API                                                                   #
# --------------------------------------------------------------------------- #

def _eval_oop(session: GemStoneSession, smalltalk: str) -> int:
    """Evaluate Smalltalk and return the raw OOP integer."""
    return session.eval_oop(smalltalk)


def _eval_str(session: GemStoneSession, smalltalk: str) -> str:
    """Evaluate Smalltalk and return result as a Python str."""
    return _str(session.eval(smalltalk))


def _escape_st(code: str) -> str:
    """Escape single quotes for Smalltalk string literals."""
    return code.replace("'", "''")


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
    range_to   = int(ranges["instVars"][1]) if "instVars" in ranges else 10

    names = _inst_var_names(session, oop)
    count = len(names)
    obj["instVarsSize"] = count

    inst_vars: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, count)
    for i in range(lo, hi + 1):
        name = names[i - 1]
        try:
            val_oop = _inst_var_value_oop(session, oop, i)
            val_view = object_view(session, val_oop, depth - 1, {}, params)
        except Exception as exc:
            val_view = {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False}
        inst_vars[i] = [
            {"oop": None, "inspection": name, "basetype": "symbol", "loaded": False},
            val_view,
        ]

    obj["instVars"] = inst_vars
    obj["customTabs"] = []
    return obj


def eval_in_context(
    session: GemStoneSession, oop: int, code: str, language: str
) -> tuple[bool, int | str]:
    """
    Evaluate `code` in the context of the object at `oop`.
    Returns (is_exception, result_oop) or (True, error_string).
    """
    escaped = _escape_st(code)
    try:
        result_oop = session.eval_oop(
            f"[{escaped}] on: Error do: [:e | e]"
        )
        # Detect if result is an Error subclass by checking class hierarchy
        is_exc_oop = session.eval_oop(
            f"[({escaped}) class superclass name = 'Error'] on: Error do: [:e | false]"
        )
        is_exc = (is_exc_oop == OOP_TRUE)
        return is_exc, result_oop
    except Exception as exc:
        return True, str(exc)
