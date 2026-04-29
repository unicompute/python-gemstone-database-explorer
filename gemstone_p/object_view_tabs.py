from __future__ import annotations

from typing import Any

from gemstone_py import GemStoneSession, OOP_NIL

from gemstone_p.object_view_meta import (
    _CLASS_TABS,
    _SYSTEM_TABS,
    _custom_tab,
    _find_named_entry,
    _range_bounds,
)


def _association_dict_custom_tab(
    session: GemStoneSession,
    value_view: dict[str, Any],
    dict_entries_fn,
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
    entry_count, entry_values = dict_entries_fn(session, int(value_oop), range_from, range_to, 0, params)
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
    dict_entries_fn,
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
        dict_entries_fn,
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


def resolve_tab_metadata(
    session: GemStoneSession,
    oop: int,
    basetype: str,
    inspection: str,
    superclass_oop: int,
    entries: dict[int, Any],
    ranges: dict,
    params: dict,
    dict_entries_fn,
) -> tuple[str, list[str], str, list[dict[str, Any]], dict[str, tuple[int, dict[int, Any]]]]:
    del inspection
    custom_tabs: list[dict[str, Any]] = []
    extra_fields: dict[str, tuple[int, dict[int, Any]]] = {}
    custom_default_tab: str | None = None

    for adapter in _CUSTOM_TAB_ADAPTERS:
        resolved = adapter(session, basetype, entries, ranges, params, dict_entries_fn)
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
