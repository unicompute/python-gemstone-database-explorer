"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts the frontend understands. Mirrors mdbe's database_views/*.rb files.

All object access goes through session.perform / perform_oop (sending messages
by OOP directly) or the gemstone-py batch helpers (_smalltalk_batch) which use
the correct `Object _objectForOop:` expression internally. We never build
ad-hoc `ObjectMemory objectWithId:` Smalltalk strings — that method does not
exist in GemStone and causes a bus error via GCI.
"""

from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL, OOP_TRUE, OOP_FALSE
from gemstone_py._smalltalk_batch import (
    fetch_mapping_oop_pairs,
    fetch_collection_oops,
    object_for_oop_expr,
)

_LEAF_BASETYPES = {"string", "symbol", "fixnum", "float", "boolean", "nilclass"}

_DICT_CLASS_NAMES = {
    "SymbolDictionary", "Dictionary", "IdentityDictionary",
    "StringKeyValueDictionary", "LookupTable", "MethodDictionary",
}
_ARRAY_CLASS_NAMES = {
    "Array", "OrderedCollection", "SortedCollection", "Bag", "ByteArray",
}


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _class_name(session: GemStoneSession, oop: int) -> str:
    try:
        class_oop = session.perform_oop(oop, "class")
        return _str(session.perform(class_oop, "name"))
    except Exception:
        return "Object"


def _inspect(session: GemStoneSession, oop: int, limit: int = 200) -> str:
    if oop == OOP_NIL:
        return "nil"
    if oop == OOP_TRUE:
        return "true"
    if oop == OOP_FALSE:
        return "false"
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
    cname = _class_name(session, oop)
    if cname == "String":
        return "string"
    if cname == "Symbol":
        return "symbol"
    if cname in ("SmallInteger", "LargePositiveInteger", "LargeNegativeInteger"):
        return "fixnum"
    if cname in ("Float", "FloatD", "FloatE", "FloatQ"):
        return "float"
    if cname in ("True", "False"):
        return "boolean"
    if cname in _DICT_CLASS_NAMES:
        return "hash"
    if cname in _ARRAY_CLASS_NAMES:
        return "array"
    return "object"


def _class_oop(session: GemStoneSession, oop: int) -> int:
    try:
        return session.perform_oop(oop, "class")
    except Exception:
        return OOP_NIL


# --------------------------------------------------------------------------- #
# Named instance variables (plain objects)                                    #
# --------------------------------------------------------------------------- #

def _named_inst_vars(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    try:
        class_oop = session.perform_oop(oop, "class")
        count_raw = session.perform(class_oop, "instSize")
        count = int(count_raw) if count_raw is not None else 0
    except Exception:
        return 0, {}

    if count == 0:
        return 0, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, count)
    for i in range(lo, hi + 1):
        try:
            idx_oop = session.int_oop(i)
            name = _str(session.perform(class_oop, "instVarNameAt:", idx_oop))
            val_oop = session.perform_oop(oop, "instVarAt:", idx_oop)
            val_view = object_view(session, val_oop, child_depth, {}, params)
        except Exception as exc:
            name = f"@{i}"
            val_view = {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False}
        result[i] = [
            {"oop": None, "inspection": name, "basetype": "symbol", "loaded": False},
            val_view,
        ]
    return count, result


# --------------------------------------------------------------------------- #
# Dictionary entries — fetched via batch helper (one eval, correct Smalltalk) #
# --------------------------------------------------------------------------- #

def _dict_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    try:
        # fetch_mapping_oop_pairs uses Object _objectForOop: internally
        pairs = fetch_mapping_oop_pairs(session, oop)
    except Exception:
        return 0, {}

    total = len(pairs)
    if total == 0:
        return 0, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, total)
    for i, (key_oop, val_oop) in enumerate(pairs[lo - 1:hi], start=lo):
        try:
            key_view = object_view(session, key_oop, 1, {}, params)
            val_view = object_view(session, val_oop, child_depth, {}, params)
        except Exception as exc:
            key_view = {"oop": None, "inspection": f"key_{i}", "basetype": "symbol", "loaded": False}
            val_view = {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False}
        result[i] = [key_view, val_view]
    return total, result


# --------------------------------------------------------------------------- #
# Array / indexed collection entries — fetched via batch helper               #
# --------------------------------------------------------------------------- #

def _array_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    try:
        all_oops = fetch_collection_oops(session, oop)
    except Exception:
        return 0, {}

    total = len(all_oops)
    if total == 0:
        return 0, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, total)
    for i, val_oop in enumerate(all_oops[lo - 1:hi], start=lo):
        try:
            val_view = object_view(session, val_oop, child_depth, {}, params)
        except Exception as exc:
            val_view = {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False}
        result[i] = [
            {"oop": None, "inspection": str(i), "basetype": "fixnum", "loaded": False},
            val_view,
        ]
    return total, result


# --------------------------------------------------------------------------- #
# Public API                                                                   #
# --------------------------------------------------------------------------- #

def _escape_st(code: str) -> str:
    return code.replace("'", "''")


def _eval_str(session: GemStoneSession, smalltalk: str) -> str:
    return _str(session.eval(smalltalk))


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
    basetype = _basetype(session, oop)
    obj["basetype"] = basetype

    if depth <= 0:
        obj["loaded"] = False
        return obj

    obj["loaded"] = True
    obj["exception"] = False

    class_oop = _class_oop(session, oop)
    obj["classObject"] = object_view(session, class_oop, depth - 1, {}, params)

    child_depth = max(1, depth - 1)
    range_from = int(ranges.get("instVars", [1, 20])[0])
    range_to   = int(ranges.get("instVars", [1, 20])[1])

    cname = _class_name(session, oop)

    if basetype in _LEAF_BASETYPES:
        count, entries = 0, {}
    elif cname in _DICT_CLASS_NAMES:
        count, entries = _dict_entries(session, oop, range_from, range_to, child_depth, params)
    elif cname in _ARRAY_CLASS_NAMES:
        count, entries = _array_entries(session, oop, range_from, range_to, child_depth, params)
    else:
        count, entries = _named_inst_vars(session, oop, range_from, range_to, child_depth, params)

    obj["instVarsSize"] = count
    obj["instVars"] = entries
    obj["customTabs"] = []
    return obj


def eval_in_context(
    session: GemStoneSession, oop: int, code: str, language: str
) -> tuple[bool, int | str]:
    """Evaluate `code` in the context of the object at `oop`."""
    escaped = _escape_st(code)
    obj_expr = object_for_oop_expr(oop)
    try:
        result_oop = session.eval_oop(
            f"| receiver |\n"
            f"receiver := {obj_expr}.\n"
            f"[receiver evaluate: '{escaped}'] on: Error do: [:e | e]"
        )
        is_exc_oop = session.eval_oop(
            f"| receiver |\n"
            f"receiver := {obj_expr}.\n"
            f"[((receiver evaluate: '{escaped}') isKindOf: Error)] on: Error do: [:e | true]"
        )
        is_exc = (is_exc_oop == OOP_TRUE)
        return is_exc, result_oop
    except Exception as exc:
        return True, str(exc)
