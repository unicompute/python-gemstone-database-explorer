from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_FALSE, OOP_NIL, OOP_TRUE
from gemstone_py._smalltalk_batch import (
    decode_escaped_field,
    escaped_field_encoder_source,
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
_CLASS_TABS = ["instvars", "constants", "modules", "code", "hierarchy", "instances"]
_SYSTEM_TABS = [*_CLASS_TABS, "stone-ver", "gem-ver", "control"]


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


def _custom_tab(
    tab_id: str,
    caption: str,
    kind: str,
    field: str,
    size_field: str | None = None,
    range_name: str | None = None,
    page_size: int | None = None,
) -> dict[str, Any]:
    tab = {"id": tab_id, "caption": caption, "kind": kind, "field": field}
    if size_field:
        tab["sizeField"] = size_field
    if range_name:
        tab["rangeName"] = range_name
    if page_size:
        tab["pageSize"] = int(page_size)
    return tab


def _entry_name(entry: Any) -> str:
    if not isinstance(entry, list) or not entry:
        return ""
    name_view = entry[0] if isinstance(entry[0], dict) else {}
    raw = _str(name_view.get("inspection", "")).strip()
    return raw[1:] if raw.startswith("@") else raw


def _find_named_entry(entries: dict[int, Any], *names: str) -> Any | None:
    wanted = {name.strip().lower() for name in names}
    for entry in entries.values():
        if _entry_name(entry).lower() in wanted:
            return entry
    return None


def _range_bounds(
    ranges: dict,
    range_name: str,
    default_from: int = 1,
    default_to: int = 20,
) -> tuple[int, int]:
    raw_range = ranges.get(range_name, [default_from, default_to])
    low = int(raw_range[0]) if raw_range and raw_range[0] is not None else default_from
    high = int(raw_range[1]) if len(raw_range) > 1 and raw_range[1] is not None else default_to
    if low < 1:
        low = 1
    if high < low:
        high = low
    return low, high


_ENCODE_SRC = escaped_field_encoder_source("encode")

_META_SCRIPT = """\
| obj encode cname ps classOop superObj superPs superOop |
obj := {obj_expr}.
{encode_src}
cname := [obj class name] on: Error do: [:e | 'Object'].
ps := [obj printString] on: Error do: [:e | '(error)'].
ps := ps size > 200
  ifTrue: [ps copyFrom: 1 to: 200]
  ifFalse: [ps].
classOop := [obj class asOop printString] on: Error do: [:e | '20'].
superObj := [obj superclass] on: Error do: [:e | nil].
superPs := superObj isNil
  ifTrue: ['']
  ifFalse: [[superObj printString] on: Error do: [:e | '(error)']].
superPs := superPs size > 200
  ifTrue: [superPs copyFrom: 1 to: 200]
  ifFalse: [superPs].
superOop := superObj isNil
  ifTrue: ['']
  ifFalse: [[superObj asOop printString] on: Error do: [:e | '']].
(encode value: cname), '|', (encode value: ps), '|', classOop, '|', (encode value: superPs), '|', superOop
"""


def _fetch_meta(session: GemStoneSession, oop: int) -> tuple[str, str, int, str, int]:
    if oop == OOP_NIL:
        return "UndefinedObject", "nil", OOP_NIL, "", OOP_NIL
    if oop == OOP_TRUE:
        return "True", "true", OOP_NIL, "", OOP_NIL
    if oop == OOP_FALSE:
        return "False", "false", OOP_NIL, "", OOP_NIL
    try:
        script = _META_SCRIPT.format(
            obj_expr=object_for_oop_expr(oop),
            encode_src=_ENCODE_SRC,
        )
        raw = _str(session.eval(script))
        parts = raw.split("|", 4)
        cname = decode_escaped_field(parts[0]) if len(parts) > 0 else "Object"
        ps = decode_escaped_field(parts[1]) if len(parts) > 1 else ""
        class_oop = int(parts[2]) if len(parts) > 2 and parts[2].strip().isdigit() else OOP_NIL
        super_ps = decode_escaped_field(parts[3]) if len(parts) > 3 else ""
        super_oop = int(parts[4]) if len(parts) > 4 and parts[4].strip().isdigit() else OOP_NIL
        return cname, ps, class_oop, super_ps, super_oop
    except Exception as exc:
        return "Object", f"(error: {exc})", OOP_NIL, "", OOP_NIL
