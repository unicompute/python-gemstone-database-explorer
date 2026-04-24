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

import ctypes
from typing import Any

from gemstone_py import (
    GemStoneError,
    GemStoneSession,
    GciErrSType,
    OOP_ILLEGAL,
    OOP_NIL,
    OOP_TRUE,
    OOP_FALSE,
)
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
_CLASS_TABS = ["instvars", "constants", "modules", "code", "hierarchy", "instances"]
_SYSTEM_TABS = [*_CLASS_TABS, "stone-ver", "gem-ver", "control"]


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


def _association_dict_custom_tab(
    session: GemStoneSession,
    value_view: dict[str, Any],
    *,
    tab_id: str,
    caption: str,
    field_name: str,
    size_field: str,
    range_name: str | None = None,
    basetype_override: str | None = None,
    default_tab: str | None = None,
    ranges: dict,
    params: dict,
) -> dict[str, Any] | None:
    if value_view.get("basetype") != "hash":
        return None
    value_oop = value_view.get("oop")
    if value_oop in (None, OOP_NIL):
        return None

    page_size = 20
    range_key = range_name or tab_id
    range_from, range_to = _range_bounds(ranges, range_key, 1, page_size)
    entry_count, entry_values = _dict_entries(session, int(value_oop), range_from, range_to, 0, params)
    return {
        "basetype": basetype_override,
        "defaultTab": default_tab,
        "tabs": [
            _custom_tab(
                tab_id,
                caption,
                "association-dict",
                field_name,
                size_field,
                range_name=range_key,
                page_size=page_size,
            )
        ],
        "fields": {field_name: (entry_count, entry_values)},
    }


def _maglev_record_custom_tabs(
    session: GemStoneSession,
    basetype: str,
    entries: dict[int, Any],
    ranges: dict,
    params: dict,
) -> dict[str, Any] | None:
    if basetype != "object":
        return None

    maglev_attributes = _find_named_entry(entries, "maglev_attributes", "@maglev_attributes")
    if not (
        isinstance(maglev_attributes, list)
        and len(maglev_attributes) > 1
        and isinstance(maglev_attributes[1], dict)
    ):
        return None

    return _association_dict_custom_tab(
        session,
        maglev_attributes[1],
        tab_id="attributes",
        caption="Attributes",
        field_name="attributes",
        size_field="attributesSize",
        basetype_override="maglevRecordBase",
        default_tab="attributes",
        ranges=ranges,
        params=params,
    )


_CUSTOM_TAB_ADAPTERS = [_maglev_record_custom_tabs]


def _tab_metadata(
    session: GemStoneSession,
    oop: int,
    basetype: str,
    inspection: str,
    superclass_oop: int,
    entries: dict[int, Any],
    ranges: dict,
    params: dict,
) -> tuple[str, list[str], str, list[dict[str, Any]], dict[str, tuple[int, dict[int, Any]]]]:
    custom_tabs: list[dict[str, Any]] = []
    extra_fields: dict[str, tuple[int, dict[int, Any]]] = {}
    custom_default_tab: str | None = None

    for adapter in _CUSTOM_TAB_ADAPTERS:
        resolved = adapter(session, basetype, entries, ranges, params)
        if not resolved:
            continue
        resolved_basetype = resolved.get("basetype")
        if resolved_basetype:
            basetype = resolved_basetype
        if custom_default_tab is None and resolved.get("defaultTab"):
            custom_default_tab = str(resolved["defaultTab"])
        custom_tabs.extend(resolved.get("tabs", []))
        extra_fields.update(resolved.get("fields", {}))

    is_behavior = superclass_oop != OOP_NIL
    try:
        system_oop = session.resolve("System") if is_behavior else None
    except Exception:
        system_oop = None

    if oop == system_oop:
        basetype = "systemClass"
        available_tabs = list(_SYSTEM_TABS)
        default_tab = "control"
    elif is_behavior:
        if basetype == "object":
            basetype = "class"
        available_tabs = list(_CLASS_TABS)
        default_tab = "code"
    else:
        available_tabs = ["instvars"]
        default_tab = "instvars"

    if custom_tabs:
        available_tabs = ["instvars", *(tab["id"] for tab in custom_tabs), *[tab for tab in available_tabs if tab != "instvars"]]
        if custom_default_tab:
            default_tab = custom_default_tab

    return basetype, available_tabs, default_tab, custom_tabs, extra_fields


# --------------------------------------------------------------------------- #
# Batched object metadata fetch                                                #
# --------------------------------------------------------------------------- #

# Smalltalk source for our field escape block (backslash, newline, pipe)
_ENCODE_SRC = escaped_field_encoder_source("encode")

# One eval returns 5 pipe-separated fields on one line:
#   className | printString(truncated) | classOop | superclassPrintString | superclassOop
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
    """Return (class_name, print_string, class_oop, superclass_print_string, superclass_oop)."""
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
        ps    = decode_escaped_field(parts[1]) if len(parts) > 1 else ""
        class_oop = int(parts[2]) if len(parts) > 2 and parts[2].strip().isdigit() else OOP_NIL
        super_ps = decode_escaped_field(parts[3]) if len(parts) > 3 else ""
        super_oop = int(parts[4]) if len(parts) > 4 and parts[4].strip().isdigit() else OOP_NIL
        return cname, ps, class_oop, super_ps, super_oop
    except Exception as exc:
        return "Object", f"(error: {exc})", OOP_NIL, "", OOP_NIL


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
    cname, inspection, class_oop, superclass_ps, superclass_oop = _fetch_meta(session, oop)
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
    behavior_targets = _behavior_browser_targets(session, oop, class_oop, superclass_oop)

    def attach_browser_target(view: dict[str, Any], target_oop: int | None, fallback_inspection: str) -> dict[str, Any] | None:
        if target_oop in (None, OOP_NIL):
            return None
        target = behavior_targets.get(int(target_oop)) or _fallback_browser_target(int(target_oop), fallback_inspection)
        if not target:
            return None
        view["className"] = target["className"]
        view["dictionary"] = target["dictionary"]
        view["meta"] = target["meta"]
        return target

    # Class object — one recursive call, depth-1 (stops quickly at depth=0)
    if class_oop != OOP_NIL:
        class_cname, class_ps, _, _, _ = _fetch_meta(session, class_oop)
        obj["classObject"] = {
            "oop": class_oop,
            "inspection": class_ps,
            "basetype": _basetype_from_cname(class_cname),
            "loaded": False,
        }
    else:
        obj["classObject"] = {"oop": None, "inspection": "", "basetype": "object", "loaded": False}
    attach_browser_target(obj["classObject"], class_oop, obj["classObject"]["inspection"])

    if superclass_oop != OOP_NIL:
        obj["superclassObject"] = {
            "oop": superclass_oop,
            "inspection": superclass_ps,
            "basetype": "object",
            "loaded": False,
        }
    else:
        obj["superclassObject"] = {"oop": None, "inspection": "", "basetype": "object", "loaded": False}
    attach_browser_target(obj["superclassObject"], superclass_oop, obj["superclassObject"]["inspection"])

    code_target_oop = oop if superclass_oop != OOP_NIL else class_oop
    code_target_inspection = inspection if superclass_oop != OOP_NIL else obj["classObject"]["inspection"]
    obj["classBrowserTarget"] = (
        behavior_targets.get(int(code_target_oop))
        if code_target_oop not in (None, OOP_NIL)
        else None
    ) or (
        _fallback_browser_target(int(code_target_oop), code_target_inspection)
        if code_target_oop not in (None, OOP_NIL)
        else None
    )

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

    basetype, available_tabs, default_tab, custom_tabs, extra_fields = _tab_metadata(
        session, oop, basetype, inspection, superclass_oop, entries, ranges, params
    )
    obj["basetype"] = basetype
    obj["instVarsSize"] = count
    obj["instVars"] = entries
    obj["availableTabs"] = available_tabs
    obj["defaultTab"] = default_tab
    obj["customTabs"] = custom_tabs
    for field_name, (field_count, field_entries) in extra_fields.items():
        obj[f"{field_name}Size"] = field_count
        obj[field_name] = field_entries
    return obj


def eval_in_context(
    session: GemStoneSession, oop: int, code: str, language: str
) -> dict[str, Any]:
    """Evaluate `code` in the context of the object at `oop`."""
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
