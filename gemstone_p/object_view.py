"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts the frontend understands. Mirrors mdbe's database_views/*.rb files.

All object access goes through session.perform / perform_oop (sending messages
by OOP directly) or the gemstone-py batch helpers (_smalltalk_batch) which use
the correct `Object _objectForOop:` expression internally. We never build
ad-hoc `ObjectMemory objectWithId:` Smalltalk strings — that method does not
exist in GemStone and causes a bus error via GCI.

Performance: we use single batched eval() calls wherever possible to minimise
GCI round-trips. A single eval that serialises all needed data as a delimited
string is much faster than N individual perform/perform_oop calls.
"""

from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL, OOP_TRUE, OOP_FALSE
from gemstone_py._smalltalk_batch import (
    object_for_oop_expr,
    escaped_field_encoder_source,
    decode_escaped_field,
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


def _decode(raw: Any) -> str:
    return decode_escaped_field(_str(raw))


def _basetype_from_cname(cname: str) -> str:
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
    if cname == "UndefinedObject":
        return "nilclass"
    if cname in _DICT_CLASS_NAMES:
        return "hash"
    if cname in _ARRAY_CLASS_NAMES:
        return "array"
    return "object"


# --------------------------------------------------------------------------- #
# Batched object metadata fetch                                                #
# --------------------------------------------------------------------------- #

# Smalltalk source for our field escape block (backslash, newline, pipe)
_ENCODE_SRC = escaped_field_encoder_source("encode")

# One eval returns 3 pipe-separated fields on one line:
#   className | printString(truncated) | classOop
_META_SCRIPT = """\
| obj encode cname ps classOop |
obj := {obj_expr}.
{encode_src}
cname := [obj class name] on: Error do: [:e | 'Object'].
ps := [obj printString] on: Error do: [:e | '(error)'].
ps := ps size > 200
  ifTrue: [ps copyFrom: 1 to: 200]
  ifFalse: [ps].
classOop := [obj class asOop printString] on: Error do: [:e | '20'].
(encode value: cname), '|', (encode value: ps), '|', classOop
"""


def _fetch_meta(session: GemStoneSession, oop: int) -> tuple[str, str, int]:
    """Return (class_name, print_string, class_oop) in one eval."""
    if oop == OOP_NIL:
        return "UndefinedObject", "nil", OOP_NIL
    if oop == OOP_TRUE:
        return "True", "true", OOP_NIL
    if oop == OOP_FALSE:
        return "False", "false", OOP_NIL
    try:
        script = _META_SCRIPT.format(
            obj_expr=object_for_oop_expr(oop),
            encode_src=_ENCODE_SRC,
        )
        raw = _str(session.eval(script))
        parts = raw.split("|", 2)
        cname = decode_escaped_field(parts[0]) if len(parts) > 0 else "Object"
        ps    = decode_escaped_field(parts[1]) if len(parts) > 1 else ""
        class_oop = int(parts[2]) if len(parts) > 2 and parts[2].strip().isdigit() else OOP_NIL
        return cname, ps, class_oop
    except Exception as exc:
        return "Object", f"(error: {exc})", OOP_NIL


# --------------------------------------------------------------------------- #
# Named instance variables — batched                                           #
# --------------------------------------------------------------------------- #

# Returns lines of: varName|valueOop|className|printString
_INST_VARS_SCRIPT = """\
| obj cls encode stream count lo hi |
obj := {obj_expr}.
cls := obj class.
count := cls instSize.
lo := {lo}.
hi := count min: {hi}.
{encode_src}
stream := count printString, String lf asString.
lo to: hi do: [:i |
  | vname voop vcname vps |
  vname := [cls instVarNameAt: i] on: Error do: [:e | '@', i printString].
  voop  := [obj instVarAt: i] on: Error do: [:e | nil].
  vcname := [voop class name] on: Error do: [:e | 'Object'].
  vps   := [voop printString] on: Error do: [:e | '(error)'].
  vps := vps size > 200
    ifTrue: [vps copyFrom: 1 to: 200]
    ifFalse: [vps].
  stream := stream,
    (encode value: vname), '|',
    (encode value: voop asOop printString), '|',
    (encode value: vcname), '|',
    (encode value: vps), String lf asString
].
stream
"""


def _named_inst_vars(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    try:
        script = _INST_VARS_SCRIPT.format(
            obj_expr=object_for_oop_expr(oop),
            lo=range_from,
            hi=range_to,
            encode_src=_ENCODE_SRC,
        )
        raw = _str(session.eval(script))
        lines = raw.splitlines()
        if not lines:
            return 0, {}
        count = int(lines[0]) if lines[0].strip().isdigit() else 0
    except Exception:
        return 0, {}

    if count == 0:
        return 0, {}

    result: dict[int, Any] = {}
    for i, line in enumerate(lines[1:], start=range_from):
        if not line:
            continue
        parts = line.split("|", 3)
        vname  = decode_escaped_field(parts[0]) if len(parts) > 0 else f"@{i}"
        voop_s = decode_escaped_field(parts[1]) if len(parts) > 1 else "20"
        vcname = decode_escaped_field(parts[2]) if len(parts) > 2 else "Object"
        vps    = decode_escaped_field(parts[3]) if len(parts) > 3 else ""

        try:
            val_oop = int(voop_s)
        except ValueError:
            val_oop = OOP_NIL

        vbasetype = _basetype_from_cname(vcname)
        val_view: dict[str, Any] = {
            "oop": val_oop,
            "inspection": vps,
            "basetype": vbasetype,
            "loaded": False,
        }
        result[i] = [
            {"oop": None, "inspection": vname, "basetype": "symbol", "loaded": False},
            val_view,
        ]
    return count, result


# --------------------------------------------------------------------------- #
# Dictionary entries — batched                                                 #
# --------------------------------------------------------------------------- #

# Returns lines of: keyOop|keyClassName|keyPS|valOop|valClassName|valPS
_DICT_SCRIPT = """\
| d encode stream total lo hi i |
d := {obj_expr}.
total := d size.
lo := {lo}.
hi := total min: {hi}.
{encode_src}
stream := total printString, String lf asString.
i := 0.
d associationsDo: [:assoc |
  | koop kcname kps voop vcname vps |
  i := i + 1.
  (i >= lo and: [i <= hi]) ifTrue: [
    koop  := assoc key asOop.
    kcname := [assoc key class name] on: Error do: [:e | 'Object'].
    kps   := [assoc key printString] on: Error do: [:e | '(error)'].
    kps := kps size > 200 ifTrue: [kps copyFrom: 1 to: 200] ifFalse: [kps].
    voop  := assoc value asOop.
    vcname := [assoc value class name] on: Error do: [:e | 'Object'].
    vps   := [assoc value printString] on: Error do: [:e | '(error)'].
    vps := vps size > 200 ifTrue: [vps copyFrom: 1 to: 200] ifFalse: [vps].
    stream := stream,
      koop printString, '|',
      (encode value: kcname), '|',
      (encode value: kps), '|',
      voop printString, '|',
      (encode value: vcname), '|',
      (encode value: vps), String lf asString
  ]
].
stream
"""


def _dict_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    try:
        script = _DICT_SCRIPT.format(
            obj_expr=object_for_oop_expr(oop),
            lo=range_from,
            hi=range_to,
            encode_src=_ENCODE_SRC,
        )
        raw = _str(session.eval(script))
        lines = raw.splitlines()
        if not lines:
            return 0, {}
        total = int(lines[0]) if lines[0].strip().isdigit() else 0
    except Exception as exc:
        return 0, {1: [
            {"oop": None, "inspection": "(fetch error)", "basetype": "symbol", "loaded": False},
            {"oop": None, "inspection": str(exc), "basetype": "object", "loaded": False},
        ]}

    if total == 0:
        return 0, {}

    result: dict[int, Any] = {}
    for i, line in enumerate(lines[1:], start=range_from):
        if not line:
            continue
        parts = line.split("|", 5)
        try:
            koop   = int(parts[0]) if len(parts) > 0 else OOP_NIL
            kcname = decode_escaped_field(parts[1]) if len(parts) > 1 else "Object"
            kps    = decode_escaped_field(parts[2]) if len(parts) > 2 else ""
            voop   = int(parts[3]) if len(parts) > 3 else OOP_NIL
            vcname = decode_escaped_field(parts[4]) if len(parts) > 4 else "Object"
            vps    = decode_escaped_field(parts[5]) if len(parts) > 5 else ""
        except (ValueError, IndexError):
            continue

        key_view: dict[str, Any] = {
            "oop": koop,
            "inspection": kps,
            "basetype": _basetype_from_cname(kcname),
            "loaded": False,
        }
        val_view: dict[str, Any] = {
            "oop": voop,
            "inspection": vps,
            "basetype": _basetype_from_cname(vcname),
            "loaded": False,
        }
        result[i] = [key_view, val_view]
    return total, result


# --------------------------------------------------------------------------- #
# Array / indexed collection entries — batched                                 #
# --------------------------------------------------------------------------- #

_ARRAY_SCRIPT = """\
| col encode stream total lo hi |
col := {obj_expr}.
total := col size.
lo := {lo}.
hi := total min: {hi}.
{encode_src}
stream := total printString, String lf asString.
lo to: hi do: [:i |
  | voop vcname vps |
  voop  := [col at: i] on: Error do: [:e | nil].
  vcname := [voop class name] on: Error do: [:e | 'Object'].
  vps   := [voop printString] on: Error do: [:e | '(error)'].
  vps := vps size > 200 ifTrue: [vps copyFrom: 1 to: 200] ifFalse: [vps].
  stream := stream,
    i printString, '|',
    (encode value: vcname), '|',
    (encode value: voop asOop printString), '|',
    (encode value: vps), String lf asString
].
stream
"""


def _array_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    try:
        script = _ARRAY_SCRIPT.format(
            obj_expr=object_for_oop_expr(oop),
            lo=range_from,
            hi=range_to,
            encode_src=_ENCODE_SRC,
        )
        raw = _str(session.eval(script))
        lines = raw.splitlines()
        if not lines:
            return 0, {}
        total = int(lines[0]) if lines[0].strip().isdigit() else 0
    except Exception as exc:
        return 0, {1: [
            {"oop": None, "inspection": "(fetch error)", "basetype": "symbol", "loaded": False},
            {"oop": None, "inspection": str(exc), "basetype": "object", "loaded": False},
        ]}

    if total == 0:
        return 0, {}

    result: dict[int, Any] = {}
    for line in lines[1:]:
        if not line:
            continue
        parts = line.split("|", 3)
        try:
            idx    = int(parts[0]) if len(parts) > 0 else 0
            vcname = decode_escaped_field(parts[1]) if len(parts) > 1 else "Object"
            voop_s = decode_escaped_field(parts[2]) if len(parts) > 2 else "20"
            vps    = decode_escaped_field(parts[3]) if len(parts) > 3 else ""
            voop   = int(voop_s)
        except (ValueError, IndexError):
            continue

        val_view: dict[str, Any] = {
            "oop": voop,
            "inspection": vps,
            "basetype": _basetype_from_cname(vcname),
            "loaded": False,
        }
        result[idx] = [
            {"oop": None, "inspection": str(idx), "basetype": "fixnum", "loaded": False},
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

    # Fetch class name, printString, and class OOP in one GCI call.
    cname, inspection, class_oop = _fetch_meta(session, oop)
    basetype = _basetype_from_cname(cname)

    obj: dict[str, Any] = {
        "oop": oop,
        "inspection": inspection,
        "basetype": basetype,
    }

    if depth <= 0:
        obj["loaded"] = False
        return obj

    obj["loaded"] = True
    obj["exception"] = False

    # Class object — one recursive call, depth-1 (stops quickly at depth=0)
    if class_oop != OOP_NIL:
        class_cname, class_ps, _ = _fetch_meta(session, class_oop)
        obj["classObject"] = {
            "oop": class_oop,
            "inspection": class_ps,
            "basetype": _basetype_from_cname(class_cname),
            "loaded": False,
        }
    else:
        obj["classObject"] = {"oop": None, "inspection": "", "basetype": "object", "loaded": False}

    range_from = int(ranges.get("instVars", [1, 20])[0])
    range_to   = int(ranges.get("instVars", [1, 20])[1])

    if basetype in _LEAF_BASETYPES:
        count, entries = 0, {}
    elif cname in _DICT_CLASS_NAMES:
        count, entries = _dict_entries(session, oop, range_from, range_to, depth - 1, params)
    elif cname in _ARRAY_CLASS_NAMES:
        count, entries = _array_entries(session, oop, range_from, range_to, depth - 1, params)
    else:
        count, entries = _named_inst_vars(session, oop, range_from, range_to, depth - 1, params)

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
