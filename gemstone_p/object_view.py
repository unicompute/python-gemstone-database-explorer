"""
Object-view layer: translates GemStone OOP references into JSON-serialisable
dicts the frontend understands.

This module is now a thin compatibility facade. The public entry points and
private helper names remain stable for route wiring and unit tests, while the
implementation lives in focused helper modules.
"""

from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL

from gemstone_p.object_view_entries import _array_entries, _dict_entries, _named_inst_vars
from gemstone_p.object_view_eval import (
    _behavior_browser_targets,
    _escape_st,
    _eval_str,
    _fallback_browser_target,
    eval_in_context,
)
from gemstone_p.object_view_meta import (
    _ARRAY_CLASS_NAMES,
    _DICT_CLASS_NAMES,
    _LEAF_BASETYPES,
    _basetype_from_cname,
    _fetch_meta,
)
from gemstone_p.object_view_tabs import resolve_tab_metadata


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
    return resolve_tab_metadata(
        session,
        oop,
        basetype,
        inspection,
        superclass_oop,
        entries,
        ranges,
        params,
        _dict_entries,
    )


def object_view(
    session: GemStoneSession,
    oop: int,
    depth: int = 2,
    ranges: dict | None = None,
    params: dict | None = None,
) -> dict:
    if ranges is None:
        ranges = {}
    if params is None:
        params = {}

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
    range_to = int(ranges.get("instVars", [1, 20])[1])

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
