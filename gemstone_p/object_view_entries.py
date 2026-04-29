from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL
from gemstone_py._smalltalk_batch import object_for_oop_expr

from gemstone_p.object_view_meta import _ENCODE_SRC, _basetype_from_cname, _decode, _str

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


def _named_inst_vars(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    del child_depth, params
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
        vname = _decode(parts[0]) if len(parts) > 0 else f"@{i}"
        voop_s = _decode(parts[1]) if len(parts) > 1 else "20"
        vcname = _decode(parts[2]) if len(parts) > 2 else "Object"
        vps = _decode(parts[3]) if len(parts) > 3 else ""

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


def _dict_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    del child_depth, params
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
            koop = int(parts[0]) if len(parts) > 0 else OOP_NIL
            kcname = _decode(parts[1]) if len(parts) > 1 else "Object"
            kps = _decode(parts[2]) if len(parts) > 2 else ""
            voop = int(parts[3]) if len(parts) > 3 else OOP_NIL
            vcname = _decode(parts[4]) if len(parts) > 4 else "Object"
            vps = _decode(parts[5]) if len(parts) > 5 else ""
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


def _array_entries(
    session: GemStoneSession,
    oop: int,
    range_from: int,
    range_to: int,
    child_depth: int,
    params: dict,
) -> tuple[int, dict]:
    del child_depth, params
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
            idx = int(parts[0]) if len(parts) > 0 else 0
            vcname = _decode(parts[1]) if len(parts) > 1 else "Object"
            voop_s = _decode(parts[2]) if len(parts) > 2 else "20"
            vps = _decode(parts[3]) if len(parts) > 3 else ""
            voop = int(voop_s)
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
