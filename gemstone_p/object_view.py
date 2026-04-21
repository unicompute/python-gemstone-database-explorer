"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts the frontend understands. Mirrors mdbe's database_views/*.rb files.

Strategy
--------
- Plain objects  → named instance variables via instSize / instVarNameAt: / instVarAt:
- Collections    → key/value or indexed entries via do: / keysAndValuesDo:
- Strings/Symbols/Numbers → leaf nodes, no children
- All objects    → printString for inspection, class name for basetype

Children are always rendered at depth=1 so their printString is always shown.
"""

from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL, OOP_TRUE, OOP_FALSE

# Basetype string constants
_LEAF_BASETYPES = {"string", "symbol", "fixnum", "float", "boolean", "nilclass"}

# GemStone class names that are dictionary-like collections
_DICT_CLASSES = {
    "SymbolDictionary", "Dictionary", "IdentityDictionary",
    "StringKeyValueDictionary", "LookupTable", "MethodDictionary",
}

# GemStone class names that are array-like (indexed) collections
_ARRAY_CLASSES = {
    "Array", "OrderedCollection", "SortedCollection", "Bag",
    "ByteArray", "LargePositiveInteger", "LargeNegativeInteger",
}


# --------------------------------------------------------------------------- #
# Low-level helpers                                                            #
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
    name = _class_name(session, oop)
    if name in ("String",):
        return "string"
    if name in ("Symbol",):
        return "symbol"
    if name in ("SmallInteger", "LargePositiveInteger", "LargeNegativeInteger"):
        return "fixnum"
    if name in ("Float", "FloatD", "FloatE", "FloatQ"):
        return "float"
    if name in _DICT_CLASSES:
        return "hash"
    if name in _ARRAY_CLASSES:
        return "array"
    if name in ("True", "False"):
        return "boolean"
    try:
        # Check if it's a class/metaclass
        is_class = session.perform_oop(oop, "isKindOf:", session.resolve("Class"))
        if is_class == OOP_TRUE:
            return "class"
    except Exception:
        pass
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
    """Named instVars for plain objects. Returns (total, {i: [name_view, val_view]})."""
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
# Dictionary entries                                                           #
# --------------------------------------------------------------------------- #

def _dict_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    """Key/value pairs for dictionary-like objects."""
    try:
        size_raw = session.perform(oop, "size")
        total = int(size_raw) if size_raw is not None else 0
    except Exception:
        return 0, {}

    if total == 0:
        return 0, {}

    # Collect all keys then slice — GemStone dicts don't support indexed access
    try:
        keys_oop = session.eval_oop(
            f"| d keys | d := ObjectMemory objectWithId: {oop}. "
            f"keys := d keys asSortedCollection: [:a :b | a printString <= b printString]. "
            f"keys asArray"
        )
    except Exception:
        # Fallback: use keys directly without sorting
        try:
            keys_oop = session.eval_oop(
                f"(ObjectMemory objectWithId: {oop}) keys asArray"
            )
        except Exception:
            return total, {}

    try:
        keys_size_raw = session.perform(keys_oop, "size")
        keys_size = int(keys_size_raw) if keys_size_raw is not None else 0
    except Exception:
        return total, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, keys_size)

    for i in range(lo, hi + 1):
        try:
            idx_oop = session.int_oop(i)
            key_oop = session.perform_oop(keys_oop, "at:", idx_oop)
            val_oop = session.perform_oop(oop, "at:", key_oop)
            key_view = object_view(session, key_oop, 1, {}, params)
            val_view = object_view(session, val_oop, child_depth, {}, params)
        except Exception as exc:
            key_view = {"oop": None, "inspection": f"key_{i}", "basetype": "symbol", "loaded": False}
            val_view = {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False}
        result[i] = [key_view, val_view]

    return total, result


# --------------------------------------------------------------------------- #
# Array / indexed collection entries                                           #
# --------------------------------------------------------------------------- #

def _array_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    """Indexed entries for array-like objects."""
    try:
        size_raw = session.perform(oop, "size")
        total = int(size_raw) if size_raw is not None else 0
    except Exception:
        return 0, {}

    if total == 0:
        return 0, {}

    result: dict[int, Any] = {}
    lo = max(1, range_from)
    hi = min(range_to, total)

    for i in range(lo, hi + 1):
        try:
            idx_oop = session.int_oop(i)
            val_oop = session.perform_oop(oop, "at:", idx_oop)
            val_view = object_view(session, val_oop, child_depth, {}, params)
        except Exception as exc:
            val_view = {"oop": None, "inspection": f"(error: {exc})", "basetype": "object", "loaded": False}
        name_view = {"oop": None, "inspection": str(i), "basetype": "fixnum", "loaded": False}
        result[i] = [name_view, val_view]

    return total, result


# --------------------------------------------------------------------------- #
# Public API                                                                   #
# --------------------------------------------------------------------------- #

def _eval_oop(session: GemStoneSession, smalltalk: str) -> int:
    return session.eval_oop(smalltalk)


def _eval_str(session: GemStoneSession, smalltalk: str) -> str:
    return _str(session.eval(smalltalk))


def _escape_st(code: str) -> str:
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
    basetype = _basetype(session, oop)
    obj["basetype"] = basetype

    if depth <= 0:
        obj["loaded"] = False
        return obj

    obj["loaded"] = True
    obj["exception"] = False

    class_oop = _class_oop(session, oop)
    obj["classObject"] = object_view(session, class_oop, depth - 1, {}, params)

    # Children always get at least depth=1 so their printString is shown
    child_depth = max(1, depth - 1)

    range_from = int(ranges.get("instVars", [1, 20])[0])
    range_to   = int(ranges.get("instVars", [1, 20])[1])

    # Choose the right child-rendering strategy based on type
    cname = _class_name(session, oop)

    if basetype in _LEAF_BASETYPES:
        count, entries = 0, {}
    elif cname in _DICT_CLASSES:
        count, entries = _dict_entries(session, oop, range_from, range_to, child_depth, params)
    elif cname in _ARRAY_CLASSES:
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
    """
    Evaluate `code` in the context of the object at `oop`.
    Returns (is_exception, result_oop) or (True, error_string).
    """
    escaped = _escape_st(code)
    try:
        result_oop = session.eval_oop(
            f"| receiver | receiver := ObjectMemory objectWithId: {oop}. "
            f"[receiver evaluate: '{escaped}'] on: Error do: [:e | e]"
        )
        is_exc_oop = session.eval_oop(
            f"| receiver | receiver := ObjectMemory objectWithId: {oop}. "
            f"[((receiver evaluate: '{escaped}') isKindOf: Error)] on: Error do: [:e | true]"
        )
        is_exc = (is_exc_oop == OOP_TRUE)
        return is_exc, result_oop
    except Exception as exc:
        return True, str(exc)
