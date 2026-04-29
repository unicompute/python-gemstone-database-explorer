from __future__ import annotations

import copy
import os
import re
from pathlib import Path

from flask import Flask, jsonify, render_template, request


ROOT = Path(__file__).resolve().parents[2]
PORT = int(os.environ.get("PORT", "4173"))

app = Flask(
    __name__,
    template_folder=str(ROOT / "templates"),
    static_folder=str(ROOT / "static"),
)


def _ref(oop: int | None, inspection: str, basetype: str) -> dict:
    return {
        "oop": oop,
        "inspection": inspection,
        "basetype": basetype,
        "loaded": False,
    }


def _browser_target(oop: int | None, class_name: str, dictionary: str, meta: bool = False) -> dict:
    return {
        "oop": oop,
        "className": class_name,
        "dictionary": dictionary,
        "meta": meta,
        "label": f"{class_name} class" if meta else class_name,
    }


def _parse_selector(source: str) -> str:
    lines = [line.strip() for line in str(source or "").replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
    if not lines:
        return ""
    first = lines[0]
    keyword_parts = re.findall(r"([A-Za-z_]\w*:)", first)
    if keyword_parts:
        return "".join(keyword_parts)
    unary = re.match(r"^([A-Za-z_]\w*)\b", first)
    if unary:
        return unary.group(1)
    binary = re.match(r"^([+\-*/\\\\~<>=@,%|&?!]+)", first)
    if binary:
        return binary.group(1)
    return ""


def _record_attribute_entries(start: int = 1, stop: int = 20) -> tuple[int, dict]:
    total = 30
    high = min(total, max(start, stop))
    entries = {}
    for index in range(max(1, start), high + 1):
        value = "'Ada'" if index == 1 else f"'value-{index}'"
        key = "#name" if index == 1 else f"#field{index}"
        entries[index] = [_ref(None, key, "symbol"), _ref(None, value, "string")]
    return total, entries


BASE_OBJECTS = {
    100: {
        "oop": 100,
        "inspection": "aSymbolDictionary()",
        "basetype": "hash",
        "loaded": True,
        "exception": False,
        "classObject": _ref(320, "SymbolDictionary", "class"),
        "superclassObject": _ref(None, "", "object"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, ":DemoRecord", "symbol"), _ref(900, "a DemoRecord", "maglevRecordBase")],
            2: [_ref(None, ":Object", "symbol"), _ref(300, "Object", "class")],
        },
        "classBrowserTarget": _browser_target(320, "SymbolDictionary", "Kernel"),
        "availableTabs": ["instvars"],
        "defaultTab": "instvars",
        "customTabs": [],
    },
    300: {
        "oop": 300,
        "inspection": "Object",
        "basetype": "class",
        "loaded": True,
        "exception": False,
        "classObject": _ref(301, "Metaclass3", "object"),
        "superclassObject": _ref(302, "ProtoObject", "class"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, "@superclass", "symbol"), _ref(302, "ProtoObject", "class")],
            2: [_ref(None, "@name", "symbol"), _ref(None, "Object", "string")],
        },
        "classBrowserTarget": _browser_target(300, "Object", "Globals"),
        "availableTabs": ["instvars", "constants", "modules", "code", "hierarchy", "instances"],
        "defaultTab": "code",
        "customTabs": [],
    },
    310: {
        "oop": 310,
        "inspection": "Behavior",
        "basetype": "class",
        "loaded": True,
        "exception": False,
        "classObject": _ref(311, "Metaclass3", "object"),
        "superclassObject": _ref(300, "Object", "class"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, "@superclass", "symbol"), _ref(300, "Object", "class")],
            2: [_ref(None, "@name", "symbol"), _ref(None, "Behavior", "string")],
        },
        "classBrowserTarget": _browser_target(310, "Behavior", "Globals"),
        "availableTabs": ["instvars", "constants", "modules", "code", "hierarchy", "instances"],
        "defaultTab": "code",
        "customTabs": [],
    },
    330: {
        "oop": 330,
        "inspection": "CompiledMethod",
        "basetype": "class",
        "loaded": True,
        "exception": False,
        "classObject": _ref(301, "Metaclass3", "object"),
        "superclassObject": _ref(300, "Object", "class"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, "@superclass", "symbol"), _ref(300, "Object", "class")],
            2: [_ref(None, "@name", "symbol"), _ref(None, "CompiledMethod", "string")],
        },
        "classBrowserTarget": _browser_target(330, "CompiledMethod", "Globals"),
        "availableTabs": ["instvars", "constants", "modules", "code", "hierarchy", "instances"],
        "defaultTab": "code",
        "customTabs": [],
    },
    410: {
        "oop": 410,
        "inspection": "a HaltedReceiver",
        "basetype": "object",
        "loaded": True,
        "exception": False,
        "classObject": _ref(300, "Object", "class"),
        "superclassObject": _ref(None, "", "object"),
        "instVarsSize": 1,
        "instVars": {
            1: [_ref(None, "@flag", "symbol"), _ref(None, "true", "boolean")],
        },
        "classBrowserTarget": _browser_target(300, "Object", "Globals"),
        "availableTabs": ["instvars"],
        "defaultTab": "instvars",
        "customTabs": [],
    },
    76033: {
        "oop": 76033,
        "inspection": "System",
        "basetype": "systemClass",
        "loaded": True,
        "exception": False,
        "classObject": _ref(301, "Metaclass3", "object"),
        "superclassObject": _ref(300, "Object", "class"),
        "instVarsSize": 0,
        "instVars": {},
        "classBrowserTarget": _browser_target(76033, "System", "Globals"),
        "availableTabs": ["instvars", "constants", "modules", "code", "hierarchy", "instances", "stone-ver", "gem-ver", "control"],
        "defaultTab": "control",
        "customTabs": [],
    },
    930: {
        "oop": 930,
        "inspection": "anArray(2)",
        "basetype": "array",
        "loaded": True,
        "exception": False,
        "classObject": _ref(320, "Array", "class"),
        "superclassObject": _ref(300, "Object", "class"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, "1", "fixnum"), _ref(410, "a HaltedReceiver", "object")],
            2: [_ref(None, "2", "fixnum"), _ref(900, "a DemoRecord", "maglevRecordBase")],
        },
        "classBrowserTarget": _browser_target(320, "Array", "Globals"),
        "availableTabs": ["instvars"],
        "defaultTab": "instvars",
        "customTabs": [],
    },
    940: {
        "oop": 940,
        "inspection": "aCompiledMethod(Object>>printString)",
        "basetype": "object",
        "loaded": True,
        "exception": False,
        "classObject": _ref(330, "CompiledMethod", "class"),
        "superclassObject": _ref(None, "", "object"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, "@selector", "symbol"), _ref(None, "#printString", "symbol")],
            2: [_ref(None, "@methodClass", "symbol"), _ref(300, "Object", "class")],
        },
        "classBrowserTarget": _browser_target(300, "Object", "Globals", "printString"),
        "availableTabs": ["instvars"],
        "defaultTab": "instvars",
        "customTabs": [],
    },
    941: {
        "oop": 941,
        "inspection": "aCompiledMethod(Object>>printString version 1)",
        "basetype": "object",
        "loaded": True,
        "exception": False,
        "classObject": _ref(330, "CompiledMethod", "class"),
        "superclassObject": _ref(None, "", "object"),
        "instVarsSize": 3,
        "instVars": {
            1: [_ref(None, "@selector", "symbol"), _ref(None, "#printString", "symbol")],
            2: [_ref(None, "@methodClass", "symbol"), _ref(300, "Object", "class")],
            3: [_ref(None, "@versionLabel", "symbol"), _ref(None, "version 1", "string")],
        },
        "classBrowserTarget": _browser_target(300, "Object", "Globals", "printString"),
        "availableTabs": ["instvars"],
        "defaultTab": "instvars",
        "customTabs": [],
    },
}

MOCK_MAGLEV_REPORTS = {
    "load-path": {
        "title": "$LOAD_PATH Report",
        "text": "$LOAD_PATH Report\n\n1. lib\n2. app/models\n3. app/services\n",
    },
    "loaded-features": {
        "title": "Loaded Features Report",
        "text": "Loaded Features Report\n\n1. app/models/user.rb\n2. config/environment.rb\n",
    },
    "persistent-features": {
        "title": "Persistent Features Report",
        "text": "Persistent Features Report\n\n1. persisted.rb\n2. bootstrap/runtime.rb\n",
    },
    "finalizer-registry": {
        "title": "MagLev Finalizer Registry Report",
        "text": "MagLev Finalizer Registry Report\n\nprintString: aFinalizerRegistry(2)\n\nsize: 2\n\n1. oop=9201\n2. oop=9202\n",
    },
}


def _record_object(args) -> dict:
    start = int(args.get("range_attributes_from", "1") or "1")
    stop = int(args.get("range_attributes_to", "20") or "20")
    total, entries = _record_attribute_entries(start, stop)
    return {
        "oop": 900,
        "inspection": "a DemoRecord",
        "basetype": "maglevRecordBase",
        "loaded": True,
        "exception": False,
        "classObject": _ref(901, "DemoRecord", "class"),
        "superclassObject": _ref(300, "Object", "class"),
        "instVarsSize": 2,
        "instVars": {
            1: [_ref(None, "@maglev_attributes", "symbol"), _ref(920, "aSymbolDictionary()", "hash")],
            2: [_ref(None, "@id", "symbol"), _ref(None, "1", "fixnum")],
        },
        "classBrowserTarget": _browser_target(901, "DemoRecord", "Globals"),
        "availableTabs": ["instvars", "attributes"],
        "defaultTab": "attributes",
        "customTabs": [
            {
                "id": "attributes",
                "caption": "Attributes",
                "kind": "association-dict",
                "field": "attributes",
                "sizeField": "attributesSize",
                "rangeName": "attributes",
                "pageSize": 20,
            }
        ],
        "attributesSize": total,
        "attributes": entries,
    }

INITIAL_CLASS_DICTIONARIES = {
    "Globals": [
        "AlphaClass01",
        "AlphaClass02",
        "AlphaClass03",
        "AlphaClass04",
        "AlphaClass05",
        "AlphaClass06",
        "AlphaClass07",
        "AlphaClass08",
        "AlphaClass09",
        "AlphaClass10",
        "AlphaClass11",
        "AlphaClass12",
        "AlphaClass13",
        "AlphaClass14",
        "AlphaClass15",
        "AlphaClass16",
        "AlphaClass17",
        "AlphaClass18",
        "AlphaClass19",
        "AlphaClass20",
        "Behavior",
        "DemoRecord",
        "Object",
        "ProtoObject",
    ],
    "Kernel": ["SymbolDictionary"],
    "UserGlobals": ["Object"],
}

INITIAL_CLASS_SUPERCLASSES = {
    "Behavior": "Object",
    "DemoRecord": "Object",
    "Object": "ProtoObject",
    "ProtoObject": "",
    "SymbolDictionary": "Object",
}

INITIAL_CLASS_INSTANCE_VARS = {
    "DemoRecord": ["@maglev_attributes", "id"],
}

INITIAL_CLASS_VARS = {}

INITIAL_CLASS_INST_VARS = {}

INITIAL_CLASS_PROTOCOLS = {
    ("Object", False): {
        "accessing": ["yourself"],
        "printing": ["printString"],
    },
    ("Object", True): {
        "instance creation": ["new"],
    },
    ("Behavior", False): {
        "printing": ["printString"],
    },
    ("DemoRecord", False): {
        "accessing": ["name"],
    },
}

INITIAL_METHOD_SOURCES = {
    ("Object", False, "printString"): "printString\n^ 'Object'",
    ("Object", False, "yourself"): "yourself\n^ self",
    ("Object", True, "new"): "new\n^ super new",
    ("Behavior", False, "printString"): "printString\n^ self name",
    ("DemoRecord", False, "name"): "name\n^ @maglev_attributes at: #name",
}

INITIAL_SYMBOL_LISTS = {
    "DataCurator": {
        "UserGlobals": {
            "DemoRecord": {"kind": "oop", "oop": 900},
            "Object": {"kind": "oop", "oop": 300},
        },
        "Scratch": {
            "TempKey": {"kind": "literal", "inspection": "'temp value'", "basetype": "string"},
        },
    },
    "SystemUser": {
        "Globals": {
            "Object": {"kind": "oop", "oop": 300},
        },
    },
}

INITIAL_DEBUG_THREADS = {
    700: {
        "printString": "a HaltedDemoProcess",
        "status": "suspended",
        "exceptionText": "a ZeroDivide occurred (error 2026), reason:numErrIntDivisionByZero, attempt to divide 1 by zero",
        "sourcePreview": "1/0",
        "sessionChannel": "debug-w",
        "frames": [
            {
                "name": "Executed code @1 line 1",
                "source": "1/0",
                "sourceOffset": 1,
                "lineNumber": 1,
                "stepPoint": 1,
                "selfPrintString": "an Object",
                "selfObject": _ref(410, "a HaltedReceiver", "object"),
                "variables": [
                    {"name": "tempOne", "value": "1", "valueObject": _ref(None, "1", "fixnum")},
                    {"name": "flag", "value": "true", "valueObject": _ref(None, "true", "boolean")},
                ],
            },
            {
                "name": "Behavior>>helper",
                "source": "helper\n  ^ #done",
                "sourceOffset": 10,
                "lineNumber": 2,
                "stepPoint": 2,
                "selfPrintString": "Behavior",
                "selfObject": _ref(310, "Behavior", "class"),
                "variables": [
                    {"name": "result", "value": "#done", "valueObject": _ref(None, "#done", "symbol")},
                ],
            },
            {
                "name": "RubyCaller(Ruby)",
                "source": "puts 'ruby frame'",
                "sourceOffset": 1,
                "lineNumber": 1,
                "stepPoint": 1,
                "selfPrintString": "main",
                "selfObject": _ref(None, "main", "string"),
                "variables": [
                    {"name": "rubyTemp", "value": "'demo'", "valueObject": _ref(None, "'demo'", "string")},
                ],
            },
        ],
        "threadLocal": [
            {
                "key": "#session",
                "value": "'debug-session'",
                "keyObject": _ref(None, "#session", "symbol"),
                "valueObject": _ref(None, "'debug-session'", "string"),
            },
            {
                "key": "#user",
                "value": "'DataCurator'",
                "keyObject": _ref(None, "#user", "symbol"),
                "valueObject": _ref(None, "'DataCurator'", "string"),
            },
        ],
        "stepCount": 0,
    },
}

CLASS_DICTIONARIES = copy.deepcopy(INITIAL_CLASS_DICTIONARIES)
CLASS_SUPERCLASSES = copy.deepcopy(INITIAL_CLASS_SUPERCLASSES)
CLASS_INSTANCE_VARS = copy.deepcopy(INITIAL_CLASS_INSTANCE_VARS)
CLASS_VARS = copy.deepcopy(INITIAL_CLASS_VARS)
CLASS_INST_VARS = copy.deepcopy(INITIAL_CLASS_INST_VARS)
CLASS_PROTOCOLS = copy.deepcopy(INITIAL_CLASS_PROTOCOLS)
METHOD_SOURCES = copy.deepcopy(INITIAL_METHOD_SOURCES)
SYMBOL_LISTS = copy.deepcopy(INITIAL_SYMBOL_LISTS)
DEBUG_THREADS = copy.deepcopy(INITIAL_DEBUG_THREADS)
REQUEST_COUNTS: dict[str, int] = {}
PERSISTENT_MODE = False
FORCE_IDS_FAILURE = False
FORCE_CONNECTION_PREFLIGHT_SUCCESS = False
DEFAULT_CONNECTION_HOST = "localhost"
DEFAULT_CONNECTION_NETLDI = "50377"
DEFAULT_CONNECTION_AVAILABLE_STONES = ["seaside"]
DEFAULT_CONNECTION_AVAILABLE_NETLDIS = [{"name": "gs64ldi", "port": "50377"}]
MOCK_CONNECTION_HOST = DEFAULT_CONNECTION_HOST
MOCK_CONNECTION_NETLDI = DEFAULT_CONNECTION_NETLDI
MOCK_CONNECTION_AVAILABLE_STONES = copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_STONES)
MOCK_CONNECTION_AVAILABLE_NETLDIS = copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_NETLDIS)


def _reset_mock_state() -> None:
    global CLASS_DICTIONARIES, CLASS_SUPERCLASSES, CLASS_INSTANCE_VARS, CLASS_VARS, CLASS_INST_VARS, CLASS_PROTOCOLS, METHOD_SOURCES, SYMBOL_LISTS, DEBUG_THREADS, REQUEST_COUNTS, PERSISTENT_MODE, FORCE_IDS_FAILURE, FORCE_CONNECTION_PREFLIGHT_SUCCESS, MOCK_CONNECTION_HOST, MOCK_CONNECTION_NETLDI, MOCK_CONNECTION_AVAILABLE_STONES, MOCK_CONNECTION_AVAILABLE_NETLDIS
    CLASS_DICTIONARIES = copy.deepcopy(INITIAL_CLASS_DICTIONARIES)
    CLASS_SUPERCLASSES = copy.deepcopy(INITIAL_CLASS_SUPERCLASSES)
    CLASS_INSTANCE_VARS = copy.deepcopy(INITIAL_CLASS_INSTANCE_VARS)
    CLASS_VARS = copy.deepcopy(INITIAL_CLASS_VARS)
    CLASS_INST_VARS = copy.deepcopy(INITIAL_CLASS_INST_VARS)
    CLASS_PROTOCOLS = copy.deepcopy(INITIAL_CLASS_PROTOCOLS)
    METHOD_SOURCES = copy.deepcopy(INITIAL_METHOD_SOURCES)
    SYMBOL_LISTS = copy.deepcopy(INITIAL_SYMBOL_LISTS)
    DEBUG_THREADS = copy.deepcopy(INITIAL_DEBUG_THREADS)
    REQUEST_COUNTS = {}
    PERSISTENT_MODE = False
    FORCE_IDS_FAILURE = False
    FORCE_CONNECTION_PREFLIGHT_SUCCESS = False
    MOCK_CONNECTION_HOST = DEFAULT_CONNECTION_HOST
    MOCK_CONNECTION_NETLDI = DEFAULT_CONNECTION_NETLDI
    MOCK_CONNECTION_AVAILABLE_STONES = copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_STONES)
    MOCK_CONNECTION_AVAILABLE_NETLDIS = copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_NETLDIS)


def _count_request(name: str) -> None:
    REQUEST_COUNTS[name] = REQUEST_COUNTS.get(name, 0) + 1


def _request_session_channel() -> str:
    return str(request.headers.get("X-GS-Channel", "")).strip()


def _normalize_write_session_channel(value: str) -> str:
    channel = str(value or "").strip()
    if not channel:
        return "debug-w"
    if channel.endswith("-w"):
        return channel
    if channel.endswith("-r"):
        return f"{channel[:-2]}-w"
    return f"{channel}-w"


def _debug_thread_for_request(oop: int):
    thread = DEBUG_THREADS.get(oop)
    if thread is None:
        return None
    owner_channel = str(thread.get("sessionChannel", "")).strip()
    request_channel = _normalize_write_session_channel(_request_session_channel())
    if owner_channel and request_channel and owner_channel != request_channel:
        return None
    return thread


def _categories_for(class_name: str, meta: bool) -> list[str]:
    protocols = CLASS_PROTOCOLS.get((class_name, meta), {})
    return ["-- all --", *sorted(protocols.keys())]


def _methods_for(class_name: str, protocol: str, meta: bool) -> list[str]:
    protocols = CLASS_PROTOCOLS.get((class_name, meta), {})
    if protocol == "-- all --":
        methods = sorted({selector for selectors in protocols.values() for selector in selectors})
    else:
        methods = list(protocols.get(protocol, []))
    return methods


def _dictionary_for_class(class_name: str, preferred: str = "") -> str:
    if preferred and class_name in CLASS_DICTIONARIES.get(preferred, []):
        return preferred
    for dictionary, classes in sorted(CLASS_DICTIONARIES.items()):
        if class_name in classes:
            return dictionary
    return preferred


def _remove_selector_from_protocols(class_name: str, meta: bool, selector: str) -> None:
    protocols = CLASS_PROTOCOLS.setdefault((class_name, meta), {})
    empty_protocols = []
    for protocol, selectors in protocols.items():
        while selector in selectors:
            selectors.remove(selector)
        if not selectors:
            empty_protocols.append(protocol)
    for protocol in empty_protocols:
        protocols.pop(protocol, None)


def _assign_selector_to_category(class_name: str, meta: bool, selector: str, category: str) -> None:
    _remove_selector_from_protocols(class_name, meta, selector)
    selectors = CLASS_PROTOCOLS.setdefault((class_name, meta), {}).setdefault(category, [])
    if selector not in selectors:
        selectors.append(selector)
        selectors.sort()


def _rename_class(class_name: str, target_class_name: str, dictionary: str) -> None:
    source_classes = CLASS_DICTIONARIES.setdefault(dictionary, [])
    if class_name in source_classes:
        source_classes[source_classes.index(class_name)] = target_class_name
        source_classes.sort()

    if class_name in CLASS_SUPERCLASSES:
        CLASS_SUPERCLASSES[target_class_name] = CLASS_SUPERCLASSES.pop(class_name)
    for subclass_name, superclass_name in list(CLASS_SUPERCLASSES.items()):
        if superclass_name == class_name:
            CLASS_SUPERCLASSES[subclass_name] = target_class_name

    if class_name in CLASS_INSTANCE_VARS:
        CLASS_INSTANCE_VARS[target_class_name] = CLASS_INSTANCE_VARS.pop(class_name)
    if class_name in CLASS_VARS:
        CLASS_VARS[target_class_name] = CLASS_VARS.pop(class_name)
    if class_name in CLASS_INST_VARS:
        CLASS_INST_VARS[target_class_name] = CLASS_INST_VARS.pop(class_name)

    for meta in (False, True):
        key = (class_name, meta)
        if key in CLASS_PROTOCOLS:
            CLASS_PROTOCOLS[(target_class_name, meta)] = CLASS_PROTOCOLS.pop(key)

    for key in [key for key in list(METHOD_SOURCES.keys()) if key[0] == class_name]:
        METHOD_SOURCES[(target_class_name, key[1], key[2])] = METHOD_SOURCES.pop(key)


def _class_hierarchy(class_name: str, preferred_dictionary: str = "") -> list[dict]:
    if not class_name:
        return []
    chain = []
    seen = set()
    cursor = class_name
    while cursor and cursor not in seen:
        seen.add(cursor)
        chain.append({
            "className": cursor,
            "dictionary": _dictionary_for_class(cursor, preferred_dictionary if cursor == class_name else ""),
        })
        cursor = CLASS_SUPERCLASSES.get(cursor, "")
    chain.reverse()
    return chain


def _class_definition(class_name: str, meta: bool) -> str:
    if meta:
        return f"{class_name} class\n    instanceVariableNames: '{' '.join(CLASS_INST_VARS.get(class_name, []))}'"
    superclass_name = CLASS_SUPERCLASSES.get(class_name, "Object") or "Object"
    instance_vars = " ".join(CLASS_INSTANCE_VARS.get(class_name, []))
    class_vars = " ".join(CLASS_VARS.get(class_name, []))
    class_inst_vars = " ".join(CLASS_INST_VARS.get(class_name, []))
    return (
        f"{superclass_name} subclass: #{class_name}\n"
        f"    instanceVariableNames: '{instance_vars}'\n"
        f"    classVariableNames: '{class_vars}'\n"
        f"    classInstanceVariableNames: '{class_inst_vars}'"
    )


def _class_variable_slots(class_name: str, variable_kind: str) -> list[str]:
    if variable_kind == "instance":
        return CLASS_INSTANCE_VARS.setdefault(class_name, [])
    if variable_kind == "class":
        return CLASS_VARS.setdefault(class_name, [])
    if variable_kind == "class-instance":
        return CLASS_INST_VARS.setdefault(class_name, [])
    raise ValueError(f"unsupported variable kind: {variable_kind}")


def _symbol_preview(value: dict | None) -> dict | None:
    if value is None:
        return None
    if value.get("kind") == "oop":
        oop = int(value.get("oop", 0) or 0)
        payload = _record_object({}) if oop == 900 else BASE_OBJECTS.get(oop)
        return copy.deepcopy(payload) if payload else None
    return {
        "oop": None,
        "inspection": str(value.get("inspection", "nil")),
        "basetype": str(value.get("basetype", "string")),
        "loaded": True,
        "exception": False,
        "classObject": _ref(None, "", "object"),
        "superclassObject": _ref(None, "", "object"),
        "instVarsSize": 0,
        "instVars": {},
        "availableTabs": ["instvars"],
        "defaultTab": "instvars",
        "customTabs": [],
    }


def _parse_symbol_value(value_expr: str) -> dict:
    value = value_expr.strip() or "nil"
    if value == "Object":
        return {"kind": "oop", "oop": 300}
    if value in {"demoRecord", "DemoRecord"}:
        return {"kind": "oop", "oop": 900}
    basetype = "string"
    if value == "nil":
        basetype = "undefinedObject"
    elif value.startswith("#"):
        basetype = "symbol"
    elif value.isdigit():
        basetype = "fixnum"
    return {"kind": "literal", "inspection": value, "basetype": basetype}


@app.get("/")
def index():
    _reset_mock_state()
    global FORCE_IDS_FAILURE, FORCE_CONNECTION_PREFLIGHT_SUCCESS
    FORCE_IDS_FAILURE = str(request.args.get("boot", "")).strip() == "ids-fail"
    FORCE_CONNECTION_PREFLIGHT_SUCCESS = str(request.args.get("preflight", "")).strip() == "success"
    return render_template("index.html")


@app.get("/ids")
def ids():
    override_stone = str(request.headers.get("X-GS-Stone", "")).strip()
    effective_stone = override_stone or "gs64stone"
    if FORCE_IDS_FAILURE and effective_stone != "seaside":
        return jsonify(
            success=False,
            error="mock startup login failed",
            preflight=_mock_connection_preflight(),
        ), 500
    return jsonify(
        persistentRootId=100,
        gemStoneSystemId=76033,
        globalsId=110,
        defaultWorkspaceId=1200,
    )


def _mock_connection_preflight():
    override = {
        "stone": str(request.headers.get("X-GS-Stone", "")).strip(),
        "host": str(request.headers.get("X-GS-Host", "")).strip(),
        "netldi": str(request.headers.get("X-GS-NetLDI", "")).strip(),
        "gemService": str(request.headers.get("X-GS-Gem-Service", "")).strip(),
    }
    override_active = any(override.values())
    effective_stone = override["stone"] or ("seaside" if FORCE_CONNECTION_PREFLIGHT_SUCCESS else "gs64stone")
    effective_host = override["host"] or MOCK_CONNECTION_HOST
    effective_netldi = override["netldi"] or MOCK_CONNECTION_NETLDI
    effective_gem_service = override["gemService"] or "gemnetobject"

    if FORCE_CONNECTION_PREFLIGHT_SUCCESS or effective_stone == "seaside":
        return {
            "success": True,
            "status": "ok",
            "app": "1.0.0",
            "stone": "3.7.5",
            "gem": "3.7.5",
            "connection": {
                "configured": {
                    "configured": True,
                    "stone": effective_stone,
                    "host": effective_host,
                    "netldi": effective_netldi,
                    "gemService": effective_gem_service,
                    "libPath": "/opt/gemstone/product/lib",
                    "username": "tariq",
                    "passwordSet": True,
                    "hostUsernameSet": False,
                    "hostPasswordSet": False,
                    "stoneSource": "request-override" if override_active else "GS_STONE",
                    "mode": "local-stone-name",
                    "effectiveTarget": effective_stone,
                    "overrideActive": override_active,
                    "override": {
                        "stone": override["stone"],
                        "host": override["host"],
                        "netldi": override["netldi"],
                        "gemService": override["gemService"],
                    },
                },
                "probe": {
                    "command": ["gslist", "-lcv"],
                    "available": True,
                    "returnCode": 0,
                    "entries": [
                        {
                            "status": "OK",
                            "version": "3.7.5",
                            "owner": "tariq",
                            "pid": "49597",
                            "port": "50377",
                            "started": "Apr 25 20:38",
                            "type": "Netldi",
                            "name": "gs64ldi",
                        },
                        {
                            "status": "OK",
                            "version": "3.7.5",
                            "owner": "tariq",
                            "pid": "49692",
                            "port": "52185",
                            "started": "Apr 25 20:39",
                            "type": "Stone",
                            "name": "seaside",
                        },
                    ],
                    "availableStones": copy.deepcopy(MOCK_CONNECTION_AVAILABLE_STONES),
                    "availableNetldis": copy.deepcopy(MOCK_CONNECTION_AVAILABLE_NETLDIS),
                    "error": "",
                    "stderr": "",
                },
                "suggestions": [],
            },
        }
    return {
        "success": False,
        "status": "error",
        "app": "1.0.0",
        "exception": (
            "The given Stone Repository monitor cannot be reached, could not find server "
            "'gs64stone' on host 'localhost' because service not found"
        ),
        "connection": {
            "configured": {
                "configured": True,
                "stone": effective_stone,
                "host": effective_host,
                "netldi": effective_netldi,
                "gemService": effective_gem_service,
                "libPath": "/opt/gemstone/product/lib",
                "username": "tariq",
                "passwordSet": True,
                "hostUsernameSet": False,
                "hostPasswordSet": False,
                "stoneSource": "request-override" if override_active else "default",
                "mode": "local-stone-name",
                "effectiveTarget": effective_stone,
                "overrideActive": override_active,
                "override": {
                    "stone": override["stone"],
                    "host": override["host"],
                    "netldi": override["netldi"],
                    "gemService": override["gemService"],
                },
            },
            "probe": {
                "command": ["gslist", "-lcv"],
                "available": True,
                "returnCode": 0,
                "entries": [
                    {
                        "status": "OK",
                        "version": "3.7.5",
                        "owner": "tariq",
                        "pid": "49597",
                        "port": "50377",
                        "started": "Apr 25 20:38",
                        "type": "Netldi",
                        "name": "gs64ldi",
                    },
                    {
                        "status": "OK",
                        "version": "3.7.5",
                        "owner": "tariq",
                        "pid": "49692",
                        "port": "52185",
                        "started": "Apr 25 20:39",
                        "type": "Stone",
                        "name": "seaside",
                    },
                ],
                    "availableStones": copy.deepcopy(MOCK_CONNECTION_AVAILABLE_STONES),
                    "availableNetldis": copy.deepcopy(MOCK_CONNECTION_AVAILABLE_NETLDIS),
                    "error": "",
                    "stderr": "",
                },
                "suggestions": [
                {
                    "kind": "stone-name",
                    "title": 'Configured stone "gs64stone" was not found. Local available stone is "seaside".',
                    "detail": "This client is currently using local stone-name lookup because GS_HOST is local.",
                    "env": {"GS_STONE": "seaside"},
                    "shell": "export GS_STONE=seaside",
                },
                {
                    "kind": "mode-note",
                    "title": "GS_NETLDI is ignored for local stone-name lookup.",
                    "detail": "Set GS_STONE to the local stone name, or use a non-local GS_HOST to force TCP NetLDI login.",
                    "env": {},
                    "shell": "",
                },
            ],
        },
    }


@app.get("/version")
def version():
    return jsonify(success=True, app="1.0.0", stone="3.7.5", gem="3.7.5")


@app.get("/healthz")
def healthz():
    return jsonify(success=True, status="ok", app="1.0.0", stone="3.7.5", gem="3.7.5")


@app.get("/connection/preflight")
def connection_preflight():
    _count_request("connection.preflight")
    return jsonify(_mock_connection_preflight())


@app.get("/diagnostics")
def diagnostics():
    return jsonify(
        success=True,
        status="ok",
        app="1.0.0",
        stone="3.7.5",
        gem="3.7.5",
        runtime={
            "python": "3.12.2",
            "implementation": "CPython",
            "platform": "Darwin-24.0.0-arm64",
        },
        sessionBroker={
            "defaultAutoBegin": None,
            "managedSessionCount": 3,
            "channels": [
                {"name": "object:win-1-r", "hasSession": True, "loggedIn": True},
                {"name": "class-browser:win-2-r", "hasSession": True, "loggedIn": True},
                {"name": "workspace:win-3-w", "hasSession": True, "loggedIn": True},
            ],
        },
        connection=_mock_connection_preflight()["connection"],
    )


@app.get("/maglev/report/<report_key>")
def maglev_report(report_key: str):
    payload = MOCK_MAGLEV_REPORTS.get(str(report_key or "").strip())
    if not payload:
        return jsonify(
            success=False,
            available=False,
            reportKey=str(report_key or "").strip(),
            title="MagLev Report",
            text="MagLev Report\n\n(unknown report)",
        ), 404
    return jsonify(
        success=True,
        available=True,
        reportKey=str(report_key or "").strip(),
        title=payload["title"],
        text=payload["text"],
    )


@app.get("/symbol-list/users")
def symbol_list_users():
    return jsonify(success=True, users=sorted(SYMBOL_LISTS.keys()))


@app.get("/symbol-list/dictionaries/<user>")
def symbol_list_dictionaries(user: str):
    dictionaries = list(SYMBOL_LISTS.get(user, {}).keys())
    return jsonify(success=True, dictionaries=dictionaries)


@app.get("/symbol-list/entries/<user>/<dictionary>")
def symbol_list_entries(user: str, dictionary: str):
    entries = list(SYMBOL_LISTS.get(user, {}).get(dictionary, {}).keys())
    return jsonify(success=True, entries=entries)


@app.get("/symbol-list/preview/<user>/<dictionary>/<key>")
def symbol_list_preview(user: str, dictionary: str, key: str):
    preview = _symbol_preview(SYMBOL_LISTS.get(user, {}).get(dictionary, {}).get(key))
    if preview is None:
        return jsonify(success=False, exception=f"unknown symbol-list entry {user}/{dictionary}/{key}"), 404
    return jsonify(success=True, **preview)


@app.post("/symbol-list/add-dictionary")
def symbol_list_add_dictionary():
    data = request.get_json(force=True) or {}
    user = str(data.get("user", "")).strip()
    name = str(data.get("name", "")).strip()
    if not user or not name:
        return jsonify(success=False, exception="user and name required"), 400
    SYMBOL_LISTS.setdefault(user, {})
    SYMBOL_LISTS[user].setdefault(name, {})
    return jsonify(success=True)


@app.post("/symbol-list/remove-dictionary")
def symbol_list_remove_dictionary():
    data = request.get_json(force=True) or {}
    user = str(data.get("user", "")).strip()
    name = str(data.get("name", "")).strip()
    if not user or not name:
        return jsonify(success=False, exception="user and name required"), 400
    SYMBOL_LISTS.get(user, {}).pop(name, None)
    return jsonify(success=True)


@app.post("/symbol-list/add-entry")
def symbol_list_add_entry():
    data = request.get_json(force=True) or {}
    user = str(data.get("user", "")).strip()
    dictionary = str(data.get("dictionary", "")).strip()
    key = str(data.get("key", "")).strip()
    value = str(data.get("value", "nil"))
    if not user or not dictionary or not key:
        return jsonify(success=False, exception="user, dictionary and key required"), 400
    SYMBOL_LISTS.setdefault(user, {}).setdefault(dictionary, {})[key] = _parse_symbol_value(value)
    return jsonify(success=True)


@app.post("/symbol-list/remove-entry")
def symbol_list_remove_entry():
    data = request.get_json(force=True) or {}
    user = str(data.get("user", "")).strip()
    dictionary = str(data.get("dictionary", "")).strip()
    key = str(data.get("key", "")).strip()
    if not user or not dictionary or not key:
        return jsonify(success=False, exception="user, dictionary and key required"), 400
    SYMBOL_LISTS.get(user, {}).get(dictionary, {}).pop(key, None)
    return jsonify(success=True)


@app.get("/debug/threads")
def debug_threads():
    return jsonify(
        success=True,
        threads=[
            {
                "oop": oop,
                "printString": data["printString"],
                "exceptionText": data.get("exceptionText", ""),
                "sourcePreview": data.get("sourcePreview", ""),
                "displayText": data.get("sourcePreview") or data.get("exceptionText") or data["printString"],
            }
            for oop, data in sorted(DEBUG_THREADS.items())
        ],
    )


@app.get("/debug/frames/<int:oop>")
def debug_frames(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    frames = [
        {
            "index": index,
            "name": frame["name"],
            "className": frame.get("className", ""),
            "selectorName": frame.get("selectorName", ""),
            "frameKey": frame.get("frameKey", ""),
            "isExecutedCode": bool(frame.get("isExecutedCode", False)),
        }
        for index, frame in enumerate(thread.get("frames", []))
    ]
    return jsonify(success=True, frames=frames)


@app.get("/debug/frame/<int:oop>")
def debug_frame(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    index = int(request.args.get("index", "0") or "0")
    frames = thread.get("frames", [])
    if index < 0 or index >= len(frames):
        return jsonify(success=False, exception=f"unknown frame {index}"), 404
    frame = frames[index]
    return jsonify(
        success=True,
        methodName=frame["name"],
        className=frame.get("className", ""),
        selectorName=frame.get("selectorName", ""),
        frameKey=frame.get("frameKey", ""),
        isExecutedCode=bool(frame.get("isExecutedCode", False)),
        ipOffset=str(index),
        sourceOffset=int(frame.get("sourceOffset", 0) or 0),
        stepPoint=int(frame.get("stepPoint", 0) or 0),
        lineNumber=int(frame.get("lineNumber", 0) or 0),
        status=str(thread.get("status", "suspended") or "suspended"),
        isLiveSession=str(thread.get("status", "suspended") or "suspended") in {"suspended", "running"},
        hasFrame=frame["name"] != "(no frame)",
        canStep=frame["name"] != "(no frame)" and int(frame.get("stepPoint", 0) or 0) > 0,
        canProceed=frame["name"] != "(no frame)",
        canRestart=frame["name"] != "(no frame)",
        canTrim=frame["name"] != "(no frame)",
        canTerminate=frame["name"] != "(no frame)",
        canStepInto=frame["name"] != "(no frame)" and int(frame.get("stepPoint", 0) or 0) > 0,
        canStepOver=frame["name"] != "(no frame)" and int(frame.get("stepPoint", 0) or 0) > 0,
        canStepReturn=frame["name"] != "(no frame)" and int(frame.get("stepPoint", 0) or 0) > 0,
        selfPrintString=frame["selfPrintString"],
        selfObject=frame.get("selfObject"),
        source=frame["source"],
        variables=frame.get("variables", []),
        frameIndex=index,
    )


@app.post("/debug/proceed/<int:oop>")
def debug_proceed(oop: int):
    DEBUG_THREADS.pop(oop, None)
    return jsonify(success=True, action="proceed", threadOop=oop, message="resumed", status="running")


@app.post("/debug/step/<int:oop>")
def debug_step(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    frames = thread.setdefault("frames", [])
    if frames:
        current = frames[0]
        next_step = int(current.get("stepPoint", 0) or 0) + 1
        current["stepPoint"] = next_step
        current["name"] = f"Executed code @{next_step} line {int(current.get('lineNumber', 1) or 1)}"
        current["sourceOffset"] = next_step
    return jsonify(success=True, action="step", threadOop=oop, frameIndex=0, message="stepped", status="suspended")


@app.post("/debug/step-into/<int:oop>")
def debug_step_into(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    thread["stepCount"] = int(thread.get("stepCount", 0)) + 1
    thread.setdefault("frames", []).insert(0, {
        "name": f"Object>>stepInto{thread['stepCount']}",
        "source": f"stepInto{thread['stepCount']}\n  ^ self",
        "sourceOffset": 1,
        "lineNumber": 1,
        "stepPoint": 1,
        "selfPrintString": "an Object",
        "selfObject": _ref(410, "a HaltedReceiver", "object"),
        "variables": [
            {
                "name": "stepIndex",
                "value": str(thread["stepCount"]),
                "valueObject": _ref(None, str(thread["stepCount"]), "fixnum"),
            },
        ],
    })
    return jsonify(success=True, action="stepInto", threadOop=oop, frameIndex=0, message="stepped into", status="suspended")


@app.post("/debug/step-over/<int:oop>")
def debug_step_over(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    index = int((request.get_json(force=True) or {}).get("index", 0))
    frames = thread.get("frames", [])
    if 0 <= index < len(frames):
        next_step = int(frames[index].get("stepPoint", 0) or 0) + 1
        frames[index]["stepPoint"] = next_step
        frames[index]["name"] = f"Executed code @{next_step} line {int(frames[index].get('lineNumber', 1) or 1)}"
        frames[index]["sourceOffset"] = next_step
    return jsonify(success=True, action="stepOver", threadOop=oop, frameIndex=index, message="stepped over", status="suspended")


@app.post("/debug/step-return/<int:oop>")
def debug_step_return(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    frames = thread.get("frames", [])
    index = int((request.get_json(force=True) or {}).get("index", 0))
    if len(frames) > 1:
        thread["frames"] = frames[1:]
    return jsonify(success=True, action="stepReturn", threadOop=oop, frameIndex=max(0, index - 1), message="stepped out", status="suspended")


@app.post("/debug/restart/<int:oop>")
def debug_restart(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    initial_thread = INITIAL_DEBUG_THREADS.get(oop, {})
    thread["frames"] = copy.deepcopy(initial_thread.get("frames", []))
    thread["sessionChannel"] = thread.get("sessionChannel") or _request_session_channel() or "debug-w"
    thread["stepCount"] = 0
    return jsonify(success=True, action="restart", threadOop=oop, frameIndex=0, message="restarted", status="suspended", completed=False)


@app.post("/debug/terminate/<int:oop>")
def debug_terminate(oop: int):
    DEBUG_THREADS.pop(oop, None)
    return jsonify(success=True, action="terminate", threadOop=oop, message="terminated", status="terminated")


@app.post("/debug/trim/<int:oop>")
def debug_trim(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    index = int((request.get_json(force=True) or {}).get("index", 0))
    frames = thread.get("frames", [])
    if 0 <= index < len(frames):
        thread["frames"] = frames[index:]
    return jsonify(success=True, action="trim", threadOop=oop, frameIndex=0, message="stack trimmed", status="suspended")


@app.get("/debug/thread-local/<int:oop>")
def debug_thread_local(oop: int):
    thread = _debug_thread_for_request(oop)
    if thread is None:
        return jsonify(success=False, exception=f"unknown thread {oop}"), 404
    return jsonify(success=True, entries=thread.get("threadLocal", []))


@app.get("/debug/request-counts")
def debug_request_counts():
    return jsonify(success=True, counts=REQUEST_COUNTS)


@app.post("/debug/mock/connection-mode")
def debug_mock_connection_mode():
    global FORCE_IDS_FAILURE, FORCE_CONNECTION_PREFLIGHT_SUCCESS, MOCK_CONNECTION_HOST, MOCK_CONNECTION_NETLDI, MOCK_CONNECTION_AVAILABLE_STONES, MOCK_CONNECTION_AVAILABLE_NETLDIS
    payload = request.get_json(force=True) or {}
    FORCE_IDS_FAILURE = bool(payload.get("idsFail", False))
    FORCE_CONNECTION_PREFLIGHT_SUCCESS = bool(payload.get("preflightSuccess", False))
    MOCK_CONNECTION_HOST = str(payload.get("host", DEFAULT_CONNECTION_HOST) or DEFAULT_CONNECTION_HOST).strip() or DEFAULT_CONNECTION_HOST
    MOCK_CONNECTION_NETLDI = str(payload.get("netldi", DEFAULT_CONNECTION_NETLDI) or DEFAULT_CONNECTION_NETLDI).strip() or DEFAULT_CONNECTION_NETLDI
    available_stones = payload.get("availableStones")
    if isinstance(available_stones, list):
        MOCK_CONNECTION_AVAILABLE_STONES = [
            str(item or "").strip()
            for item in available_stones
            if str(item or "").strip()
        ] or copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_STONES)
    else:
        MOCK_CONNECTION_AVAILABLE_STONES = copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_STONES)
    available_netldis = payload.get("availableNetldis")
    if isinstance(available_netldis, list):
        parsed_netldis = []
        for item in available_netldis:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            port = str(item.get("port", "")).strip()
            if not name and not port:
                continue
            parsed_netldis.append({"name": name, "port": port})
        MOCK_CONNECTION_AVAILABLE_NETLDIS = parsed_netldis or copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_NETLDIS)
    else:
        MOCK_CONNECTION_AVAILABLE_NETLDIS = copy.deepcopy(DEFAULT_CONNECTION_AVAILABLE_NETLDIS)
    return jsonify(
        success=True,
        idsFail=FORCE_IDS_FAILURE,
        preflightSuccess=FORCE_CONNECTION_PREFLIGHT_SUCCESS,
        host=MOCK_CONNECTION_HOST,
        netldi=MOCK_CONNECTION_NETLDI,
        availableStones=MOCK_CONNECTION_AVAILABLE_STONES,
        availableNetldis=MOCK_CONNECTION_AVAILABLE_NETLDIS,
    )


@app.route("/transaction/commit", methods=["GET", "POST"])
@app.route("/transaction/abort", methods=["GET", "POST"])
@app.route("/transaction/continue", methods=["GET", "POST"])
@app.get("/transaction/persistent-mode")
@app.post("/transaction/persistent-mode")
def transaction_action():
    global PERSISTENT_MODE
    if request.path.endswith("persistent-mode"):
        _count_request("transaction.persistent-mode")
        if request.method == "POST":
            PERSISTENT_MODE = bool((request.get_json(silent=True) or {}).get("enable"))
            return jsonify(
                success=True,
                persistent=PERSISTENT_MODE,
                result=f"Persistent mode {'enabled' if PERSISTENT_MODE else 'disabled'}",
            )
        return jsonify(success=True, persistent=PERSISTENT_MODE)
    if request.path.endswith("commit"):
        _count_request("transaction.commit")
        return jsonify(success=True, result="committed")
    if request.path.endswith("abort"):
        _count_request("transaction.abort")
        return jsonify(success=True, result="aborted")
    if request.path.endswith("continue"):
        _count_request("transaction.continue")
        return jsonify(success=True, result="continued")
    return jsonify(success=True)


@app.get("/object/index/<int:oop>")
def object_index(oop: int):
    if oop == 900:
        payload = _record_object(request.args)
    else:
        payload = BASE_OBJECTS.get(oop)
    if payload is None:
        return jsonify(success=False, exception=f"unknown oop {oop}"), 404
    return jsonify(success=True, result=copy.deepcopy(payload))


@app.route("/object/evaluate/<int:oop>", methods=["GET", "POST"])
def object_evaluate(oop: int):
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code", "") if request.method == "POST" else request.args.get("code", "")).strip()
    if code == "1/0":
        DEBUG_THREADS[700]["sessionChannel"] = _normalize_write_session_channel(_request_session_channel())
        result = {
            "oop": 555,
            "inspection": "a ZeroDivide occurred (error 2026), reason:numErrIntDivisionByZero, attempt to divide 1 by zero",
            "basetype": "object",
            "loaded": False,
            "debugThreadOop": 700,
            "debugExceptionOop": 555,
            "exceptionText": "a ZeroDivide occurred (error 2026), reason:numErrIntDivisionByZero, attempt to divide 1 by zero",
            "sourcePreview": "1/0",
            "autoOpenDebugger": True,
        }
        return jsonify(success=True, result=[True, result])
    if code == "Object":
        result = _ref(300, "Object", "class")
    elif code == "demoRecord":
        result = _ref(900, "a DemoRecord", "maglevRecordBase")
    else:
        result = _ref(None, code or "nil", "string")
    return jsonify(success=True, result=[False, result])


@app.get("/code/selectors/<int:oop>")
def code_selectors(oop: int):
    _count_request("code.selectors")
    if oop == 310:
        return jsonify(
            success=True,
            result={
                "printing": ["printString"],
                "(all Smalltalk)": ["printString"],
            },
        )
    if oop != 300:
        return jsonify(success=True, result={"(all Smalltalk)": []})
    return jsonify(
        success=True,
        result={
            "accessing": ["yourself"],
            "printing": ["printString"],
            "(all Smalltalk)": ["printString", "yourself"],
        },
    )


@app.get("/code/code/<int:oop>")
def code_code(oop: int):
    _count_request("code.source")
    selector = request.args.get("selector", "").strip()
    if oop == 300 and selector:
        source = METHOD_SOURCES.get(("Object", False, selector), "")
    else:
        source = ""
    return jsonify(success=True, result=source)


@app.get("/object/constants/<int:oop>")
def object_constants(oop: int):
    _count_request("object.constants")
    limit = max(1, int(request.args.get("limit", "20") or "20"))
    offset = max(0, int(request.args.get("offset", "0") or "0"))
    constants = {
        300: [
            {"key": "Behavior", "value": "Behavior", "valueObject": _ref(310, "Behavior", "class")},
            {"key": "DependentsFields", "value": "#()", "valueObject": _ref(None, "#()", "array")},
            *[
                {"key": f"Feature{index:02d}", "value": f"'value-{index:02d}'", "valueObject": _ref(None, f"'value-{index:02d}'", "string")}
                for index in range(1, 24)
            ],
        ],
        76033: [{"key": "GemVersion", "value": "'3.7.5'", "valueObject": _ref(None, "'3.7.5'", "string")}],
    }.get(oop, [])
    page = constants[offset:offset + limit]
    return jsonify(
        success=True,
        constants=page,
        limit=limit,
        offset=offset,
        total=len(constants),
        hasMore=(offset + len(page)) < len(constants),
    )


@app.get("/object/hierarchy/<int:oop>")
def object_hierarchy(oop: int):
    _count_request("object.hierarchy")
    hierarchy = {
        300: [
            {"class": _ref(302, "ProtoObject", "class"), "dictionary": "Globals"},
            {"class": _ref(300, "Object", "class"), "dictionary": "Globals"},
        ],
        76033: [
            {"class": _ref(302, "ProtoObject", "class"), "dictionary": "Globals"},
            {"class": _ref(300, "Object", "class"), "dictionary": "Globals"},
            {"class": _ref(76033, "System", "class"), "dictionary": "Globals"},
        ],
    }.get(oop, [])
    return jsonify(success=True, hierarchy=hierarchy)


@app.get("/object/included-modules/<int:oop>")
def object_included_modules(oop: int):
    _count_request("object.modules")
    limit = max(1, int(request.args.get("limit", "20") or "20"))
    offset = max(0, int(request.args.get("offset", "0") or "0"))
    modules = {
        300: [
            {
                "owner": _ref(300 if index <= 20 else 310, "Object" if index <= 20 else "Behavior", "class"),
                "module": _ref(600 + index, f"Module{index}", "module"),
            }
            for index in range(1, 26)
        ],
        76033: [],
    }.get(oop, [])
    page = modules[offset:offset + limit]
    return jsonify(
        success=True,
        modules=page,
        limit=limit,
        offset=offset,
        total=len(modules),
        hasMore=(offset + len(page)) < len(modules),
    )


@app.get("/object/instances/<int:oop>")
def object_instances(oop: int):
    _count_request("object.instances")
    limit = max(1, int(request.args.get("limit", "20") or "20"))
    offset = max(0, int(request.args.get("offset", "0") or "0"))
    instances = {
        300: [
            {"oop": 500 + index, "printString": f"Object instance #{index}"}
            for index in range(1, 46)
        ],
    }.get(oop, [])
    page = instances[offset:offset + limit]
    return jsonify(
        success=True,
        instances=page,
        limit=limit,
        offset=offset,
        total=len(instances),
        hasMore=(offset + len(page)) < len(instances),
    )


@app.get("/object/stone-version-report")
def object_stone_version_report():
    _count_request("object.stone-ver")
    return jsonify(success=True, report=[{"key": "Version", "value": "3.7.5"}])


@app.get("/object/gem-version-report")
def object_gem_version_report():
    _count_request("object.gem-ver")
    return jsonify(success=True, report=[{"key": "Version", "value": "3.7.5"}])


@app.get("/class-browser/dictionaries")
def class_browser_dictionaries():
    _count_request("class-browser.dictionaries")
    return jsonify(success=True, dictionaries=sorted(CLASS_DICTIONARIES.keys()))


@app.post("/class-browser/add-dictionary")
def class_browser_add_dictionary():
    _count_request("class-browser.add-dictionary")
    data = request.get_json(force=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify(success=False, exception="missing dictionary"), 400
    if name in CLASS_DICTIONARIES:
        return jsonify(success=False, exception="dictionary already exists"), 200
    CLASS_DICTIONARIES[name] = []
    return jsonify(success=True, result=f"Added {name}", dictionary=name)


@app.post("/class-browser/rename-dictionary")
def class_browser_rename_dictionary():
    _count_request("class-browser.rename-dictionary")
    data = request.get_json(force=True) or {}
    dictionary = str(data.get("dictionary", "")).strip()
    target_dictionary = str(data.get("targetDictionary", "")).strip()
    if not dictionary or not target_dictionary:
        return jsonify(success=False, exception="missing dictionary"), 400
    if dictionary not in CLASS_DICTIONARIES:
        return jsonify(success=False, exception="dictionary not found"), 404
    if target_dictionary in CLASS_DICTIONARIES and target_dictionary != dictionary:
        return jsonify(success=False, exception="target dictionary already exists"), 200
    classes = CLASS_DICTIONARIES.pop(dictionary)
    CLASS_DICTIONARIES[target_dictionary] = classes
    return jsonify(success=True, result=f"Renamed {dictionary} to {target_dictionary}", dictionary=target_dictionary)


@app.post("/class-browser/remove-dictionary")
def class_browser_remove_dictionary():
    _count_request("class-browser.remove-dictionary")
    data = request.get_json(force=True) or {}
    dictionary = str(data.get("dictionary", "")).strip()
    if not dictionary:
        return jsonify(success=False, exception="missing dictionary"), 400
    if dictionary not in CLASS_DICTIONARIES:
        return jsonify(success=False, exception="dictionary not found"), 404
    CLASS_DICTIONARIES.pop(dictionary, None)
    return jsonify(success=True, result=f"Removed {dictionary}", dictionary=dictionary)


@app.post("/class-browser/inspect-target")
def class_browser_inspect_target():
    _count_request("class-browser.inspect-target")
    data = request.get_json(force=True) or {}
    mode = str(data.get("mode", "")).strip()
    dictionary = str(data.get("dictionary", "")).strip()
    class_name = str(data.get("className", "")).strip()
    selector = str(data.get("selector", "")).strip()
    meta = bool(data.get("meta"))
    if mode == "dictionary":
        return jsonify(success=True, oop=100, label=dictionary or "dictionary")
    if mode == "class":
        oop = 301 if meta and class_name == "Object" else {"Object": 300, "Behavior": 310, "DemoRecord": 901}.get(class_name, 300)
        label = f"{class_name} class" if meta else class_name
        return jsonify(success=True, oop=oop, label=label)
    if mode == "method":
        if class_name == "Object" and selector == "printString" and not meta:
            return jsonify(success=True, oop=940, label="Object >> printString")
        return jsonify(success=False, exception="nothing to inspect for method"), 200
    if mode == "instances":
        return jsonify(success=True, oop=930, label=f"{class_name} allInstances")
    return jsonify(success=False, exception="unsupported inspect target"), 400


@app.get("/class-browser/class-location")
def class_browser_class_location():
    _count_request("class-browser.class-location")
    class_name = request.args.get("class", "").strip()
    matches = []
    for dictionary, classes in CLASS_DICTIONARIES.items():
        if class_name in classes:
            matches.append({"className": class_name, "dictionary": dictionary})
    dictionary = matches[0]["dictionary"] if len(matches) == 1 else ""
    return jsonify(success=True, dictionary=dictionary, matches=matches)


@app.get("/class-browser/classes")
def class_browser_classes():
    _count_request("class-browser.classes")
    dictionary = request.args.get("dictionary", "").strip()
    return jsonify(success=True, classes=CLASS_DICTIONARIES.get(dictionary, []))


@app.get("/class-browser/categories")
def class_browser_categories():
    _count_request("class-browser.categories")
    class_name = request.args.get("class", "").strip()
    meta = request.args.get("meta") == "1"
    return jsonify(success=True, categories=_categories_for(class_name, meta))


@app.get("/class-browser/methods")
def class_browser_methods():
    _count_request("class-browser.methods")
    class_name = request.args.get("class", "").strip()
    protocol = request.args.get("protocol", "-- all --").strip() or "-- all --"
    meta = request.args.get("meta") == "1"
    return jsonify(success=True, methods=_methods_for(class_name, protocol, meta))


@app.get("/class-browser/source")
def class_browser_source():
    _count_request("class-browser.source")
    class_name = request.args.get("class", "").strip()
    selector = request.args.get("selector", "").strip()
    meta = request.args.get("meta") == "1"
    if selector:
        source = METHOD_SOURCES.get((class_name, meta, selector), "")
    else:
        source = _class_definition(class_name, meta)
    return jsonify(success=True, source=source)


@app.get("/class-browser/hierarchy")
def class_browser_hierarchy():
    _count_request("class-browser.hierarchy")
    class_name = request.args.get("class", "").strip()
    dictionary = request.args.get("dictionary", "").strip()
    hierarchy = _class_hierarchy(class_name, dictionary)
    return jsonify(success=True, hierarchy=hierarchy)


@app.get("/class-browser/versions")
def class_browser_versions():
    _count_request("class-browser.versions")
    selector = request.args.get("selector", "").strip()
    return jsonify(success=True, versions=[{
        "label": "version 1",
        "source": f"{selector}\n^ 'version 1'",
        "methodOop": 941,
    }] if selector else [])


@app.get("/class-browser/query")
def class_browser_query():
    _count_request("class-browser.query")
    mode = request.args.get("mode", "").strip()
    scope = request.args.get("hierarchyScope", "full").strip() or "full"
    selector = request.args.get("selector", "").strip()
    meta = request.args.get("meta") == "1"
    results = []
    if meta and mode == "implementors":
        results = [
            {"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"},
        ]
    elif meta and mode == "hierarchyImplementors":
        results = {
            "full": [{"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"}],
            "super": [],
            "this": [{"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"}],
            "sub": [],
        }.get(scope, [])
    elif meta and mode == "senders":
        results = [{"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"}]
    elif meta and mode == "hierarchySenders":
        results = {
            "full": [{"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"}],
            "super": [],
            "this": [{"label": "Object class>>new", "className": "Object", "selector": "new", "meta": True, "dictionary": "Globals"}],
            "sub": [],
        }.get(scope, [])
    elif meta and mode == "references":
        results = [{
            "label": "Object class>>new",
            "className": "Object",
            "selector": "new",
            "meta": True,
            "dictionary": "Globals",
        }] if selector else []
    elif meta and mode == "methodText":
        results = [{
            "label": "Object class>>new",
            "className": "Object",
            "selector": "new",
            "meta": True,
            "dictionary": "Globals",
        }] if selector else []
    elif mode == "implementors":
        results = [
            {"label": "Behavior>>printString", "className": "Behavior", "selector": "printString", "meta": False, "dictionary": "Globals"},
            {"label": "Object>>printString", "className": "Object", "selector": "printString", "meta": False, "dictionary": "Globals"},
        ]
    elif mode == "hierarchyImplementors":
        results = {
            "full": [
                {"label": "Behavior>>printString", "className": "Behavior", "selector": "printString", "meta": False, "dictionary": "Globals"},
                {"label": "Object>>printString", "className": "Object", "selector": "printString", "meta": False, "dictionary": "Globals"},
            ],
            "super": [],
            "this": [{"label": "Object>>printString", "className": "Object", "selector": "printString", "meta": False, "dictionary": "Globals"}],
            "sub": [{"label": "Behavior>>printString", "className": "Behavior", "selector": "printString", "meta": False, "dictionary": "Globals"}],
        }.get(scope, [])
    elif mode == "senders":
        results = [{"label": "Object>>describeOn:", "className": "Object", "selector": "describeOn:", "meta": False, "dictionary": "Globals"}]
    elif mode == "hierarchySenders":
        results = {
            "full": [{"label": "Object>>describeOn:", "className": "Object", "selector": "describeOn:", "meta": False, "dictionary": "Globals"}],
            "super": [],
            "this": [{"label": "Object>>describeOn:", "className": "Object", "selector": "describeOn:", "meta": False, "dictionary": "Globals"}],
            "sub": [],
        }.get(scope, [])
    elif mode == "references":
        results = [{
            "label": f"Object>>referenceTo{selector.title()}",
            "className": "Object",
            "selector": f"referenceTo{selector.title()}",
            "meta": False,
            "dictionary": "Globals",
        }] if selector else []
    elif mode == "methodText":
        results = [{
            "label": "Object>>printString",
            "className": "Object",
            "selector": "printString",
            "meta": False,
            "dictionary": "Globals",
        }] if selector else []
    return jsonify(success=True, results=results)


@app.post("/class-browser/compile")
def class_browser_compile():
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    category = str(data.get("category", "as yet unclassified")).strip() or "as yet unclassified"
    old_selector = str(data.get("selector", "")).strip()
    source = str(data.get("source", "")).replace("\r\n", "\n").replace("\r", "\n")
    meta = bool(data.get("meta"))
    source_kind = str(data.get("sourceKind", "method")).strip() or "method"
    if source_kind != "method":
        return jsonify(success=False, exception="Class definitions are browse-only here; use Add Class or New Method")
    new_selector = _parse_selector(source) or old_selector
    if not class_name or not new_selector:
        return jsonify(success=False, exception="Compilation failed"), 400

    protocols = CLASS_PROTOCOLS.setdefault((class_name, meta), {})
    if old_selector and old_selector != new_selector:
        for selectors in protocols.values():
            while old_selector in selectors:
                selectors.remove(old_selector)
        METHOD_SOURCES.pop((class_name, meta, old_selector), None)

    selectors = protocols.setdefault(category, [])
    if new_selector not in selectors:
        selectors.append(new_selector)
        selectors.sort()
    METHOD_SOURCES[(class_name, meta, new_selector)] = source

    return jsonify(
        success=True,
        result="Success",
        selector=new_selector,
        category=category,
        previousSelector=old_selector or None,
    )


@app.post("/class-browser/add-class")
def class_browser_add_class():
    _count_request("class-browser.add-class")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    dictionary = str(data.get("dictionary", "")).strip()
    superclass_name = str(data.get("superclassName", "Object")).strip() or "Object"
    if not class_name or not dictionary:
        return jsonify(success=False, exception="missing class or dictionary"), 400
    classes = CLASS_DICTIONARIES.setdefault(dictionary, [])
    if class_name not in classes:
        classes.append(class_name)
        classes.sort()
    CLASS_SUPERCLASSES[class_name] = superclass_name
    CLASS_INSTANCE_VARS.setdefault(class_name, [])
    CLASS_VARS.setdefault(class_name, [])
    CLASS_INST_VARS.setdefault(class_name, [])
    CLASS_PROTOCOLS.setdefault((class_name, False), {})
    CLASS_PROTOCOLS.setdefault((class_name, True), {})
    return jsonify(
        success=True,
        result=f"Created {class_name} in {dictionary}",
        className=class_name,
        dictionary=dictionary,
        superclassName=superclass_name,
    )


@app.post("/class-browser/rename-class")
def class_browser_rename_class():
    _count_request("class-browser.rename-class")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    dictionary = str(data.get("dictionary", "")).strip()
    target_class_name = str(data.get("targetClassName", "")).strip()
    if not class_name or not dictionary or not target_class_name:
        return jsonify(success=False, exception="missing class or dictionary"), 400
    source_classes = CLASS_DICTIONARIES.setdefault(dictionary, [])
    if class_name not in source_classes:
        return jsonify(success=False, exception="class not found"), 404
    if target_class_name in source_classes and target_class_name != class_name:
        return jsonify(success=False, exception="target class already exists in dictionary"), 200
    _rename_class(class_name, target_class_name, dictionary)
    return jsonify(
        success=True,
        result=f"Renamed {class_name} to {target_class_name}",
        className=target_class_name,
        dictionary=dictionary,
    )


@app.post("/class-browser/move-class")
def class_browser_move_class():
    _count_request("class-browser.move-class")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    dictionary = str(data.get("dictionary", "")).strip()
    target_dictionary = str(data.get("targetDictionary", "")).strip()
    if not class_name or not dictionary or not target_dictionary:
        return jsonify(success=False, exception="missing class or dictionary"), 400
    source_classes = CLASS_DICTIONARIES.setdefault(dictionary, [])
    target_classes = CLASS_DICTIONARIES.setdefault(target_dictionary, [])
    if class_name in source_classes:
        source_classes.remove(class_name)
    if class_name not in target_classes:
        target_classes.append(class_name)
        target_classes.sort()
    return jsonify(
        success=True,
        result=f"Moved {class_name} to {target_dictionary}",
        className=class_name,
        dictionary=target_dictionary,
    )


@app.post("/class-browser/remove-class")
def class_browser_remove_class():
    _count_request("class-browser.remove-class")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    if not class_name:
        return jsonify(success=False, exception="missing class"), 400
    for classes in CLASS_DICTIONARIES.values():
        while class_name in classes:
            classes.remove(class_name)
    CLASS_SUPERCLASSES.pop(class_name, None)
    CLASS_PROTOCOLS.pop((class_name, False), None)
    CLASS_PROTOCOLS.pop((class_name, True), None)
    CLASS_INSTANCE_VARS.pop(class_name, None)
    CLASS_VARS.pop(class_name, None)
    CLASS_INST_VARS.pop(class_name, None)
    for key in [key for key in list(METHOD_SOURCES.keys()) if key[0] == class_name]:
        METHOD_SOURCES.pop(key, None)
    return jsonify(
        success=True,
        result=f"Removed {class_name}",
        className=class_name,
    )


@app.post("/class-browser/move-method")
def class_browser_move_method():
    _count_request("class-browser.move-method")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    selector = str(data.get("selector", "")).strip()
    category = str(data.get("category", "")).strip() or "as yet unclassified"
    meta = bool(data.get("meta"))
    if not class_name or not selector:
        return jsonify(success=False, exception="missing class or selector"), 400
    source = METHOD_SOURCES.get((class_name, meta, selector), "")
    if not source:
        return jsonify(success=False, exception="method not found"), 404
    _assign_selector_to_category(class_name, meta, selector, category)
    return jsonify(
        success=True,
        result=f"Moved {selector} to {category}",
        selector=selector,
        category=category,
    )


@app.post("/class-browser/remove-method")
def class_browser_remove_method():
    _count_request("class-browser.remove-method")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    selector = str(data.get("selector", "")).strip()
    meta = bool(data.get("meta"))
    if not class_name or not selector:
        return jsonify(success=False, exception="missing class or selector"), 400
    _remove_selector_from_protocols(class_name, meta, selector)
    METHOD_SOURCES.pop((class_name, meta, selector), None)
    return jsonify(
        success=True,
        result=f"Removed {selector}",
        selector=selector,
    )


@app.post("/class-browser/remove-category")
def class_browser_remove_category():
    _count_request("class-browser.remove-category")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    category = str(data.get("category", "")).strip()
    meta = bool(data.get("meta"))
    if not class_name or not category:
        return jsonify(success=False, exception="missing class or category"), 400
    protocols = CLASS_PROTOCOLS.setdefault((class_name, meta), {})
    selectors = list(protocols.get(category, []))
    if not selectors:
        return jsonify(success=False, exception="category is empty or not found"), 404
    for selector in selectors:
        _assign_selector_to_category(class_name, meta, selector, "as yet unclassified")
    protocols.pop(category, None)
    return jsonify(
        success=True,
        result=f"Moved {len(selectors)} method{'s' if len(selectors) != 1 else ''} to as yet unclassified",
        category="as yet unclassified",
        movedCount=len(selectors),
    )


@app.post("/class-browser/add-category")
def class_browser_add_category():
    _count_request("class-browser.add-category")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    category = str(data.get("category", "")).strip()
    meta = bool(data.get("meta"))
    if not class_name or not category:
        return jsonify(success=False, exception="missing class or category"), 400
    protocols = CLASS_PROTOCOLS.setdefault((class_name, meta), {})
    if category in protocols:
        return jsonify(success=False, exception="category already exists"), 200
    protocols[category] = []
    return jsonify(success=True, result=f"Added category {category}", category=category)


@app.post("/class-browser/rename-category")
def class_browser_rename_category():
    _count_request("class-browser.rename-category")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    category = str(data.get("category", "")).strip()
    target_category = str(data.get("targetCategory", "")).strip()
    meta = bool(data.get("meta"))
    if not class_name or not category or not target_category:
        return jsonify(success=False, exception="missing class or category"), 400
    protocols = CLASS_PROTOCOLS.setdefault((class_name, meta), {})
    selectors = list(protocols.get(category, []))
    if category not in protocols:
        return jsonify(success=False, exception="category is empty or not found"), 404
    protocols[target_category] = selectors
    protocols.pop(category, None)
    return jsonify(
        success=True,
        result=f"Renamed {category} to {target_category}",
        category=target_category,
        movedCount=len(selectors),
    )


@app.post("/class-browser/add-instance-variable")
def class_browser_add_instance_variable():
    _count_request("class-browser.add-instance-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if not class_name or not variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = CLASS_INSTANCE_VARS.setdefault(class_name, [])
    if variable_name not in slots:
        slots.append(variable_name)
    return jsonify(success=True, result=f"Added instance variable {variable_name}", variableName=variable_name)


@app.post("/class-browser/rename-instance-variable")
def class_browser_rename_instance_variable():
    _count_request("class-browser.rename-instance-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    target_variable_name = str(data.get("targetVariableName", "")).strip()
    if not class_name or not variable_name or not target_variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = _class_variable_slots(class_name, "instance")
    if variable_name not in slots:
        return jsonify(success=False, exception="variable not found"), 404
    slots[:] = [name for name in slots if name != variable_name]
    if target_variable_name not in slots:
        slots.append(target_variable_name)
    return jsonify(
        success=True,
        result=f"Renamed instance variable {variable_name} to {target_variable_name}",
        variableName=variable_name,
        targetVariableName=target_variable_name,
    )


@app.post("/class-browser/remove-instance-variable")
def class_browser_remove_instance_variable():
    _count_request("class-browser.remove-instance-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if not class_name or not variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = _class_variable_slots(class_name, "instance")
    if variable_name not in slots:
        return jsonify(success=False, exception="variable not found"), 404
    slots[:] = [name for name in slots if name != variable_name]
    return jsonify(success=True, result=f"Removed instance variable {variable_name}", variableName=variable_name)


@app.post("/class-browser/add-class-variable")
def class_browser_add_class_variable():
    _count_request("class-browser.add-class-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if not class_name or not variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = CLASS_VARS.setdefault(class_name, [])
    if variable_name not in slots:
        slots.append(variable_name)
    return jsonify(success=True, result=f"Added class variable {variable_name}", variableName=variable_name)


@app.post("/class-browser/rename-class-variable")
def class_browser_rename_class_variable():
    _count_request("class-browser.rename-class-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    target_variable_name = str(data.get("targetVariableName", "")).strip()
    if not class_name or not variable_name or not target_variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = _class_variable_slots(class_name, "class")
    if variable_name not in slots:
        return jsonify(success=False, exception="variable not found"), 404
    slots[:] = [name for name in slots if name != variable_name]
    if target_variable_name not in slots:
        slots.append(target_variable_name)
    return jsonify(
        success=True,
        result=f"Renamed class variable {variable_name} to {target_variable_name}",
        variableName=variable_name,
        targetVariableName=target_variable_name,
    )


@app.post("/class-browser/remove-class-variable")
def class_browser_remove_class_variable():
    _count_request("class-browser.remove-class-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if not class_name or not variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = _class_variable_slots(class_name, "class")
    if variable_name not in slots:
        return jsonify(success=False, exception="variable not found"), 404
    slots[:] = [name for name in slots if name != variable_name]
    return jsonify(success=True, result=f"Removed class variable {variable_name}", variableName=variable_name)


@app.post("/class-browser/add-class-instance-variable")
def class_browser_add_class_instance_variable():
    _count_request("class-browser.add-class-instance-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if not class_name or not variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = CLASS_INST_VARS.setdefault(class_name, [])
    if variable_name not in slots:
        slots.append(variable_name)
    return jsonify(success=True, result=f"Added class instance variable {variable_name}", variableName=variable_name)


@app.post("/class-browser/rename-class-instance-variable")
def class_browser_rename_class_instance_variable():
    _count_request("class-browser.rename-class-instance-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    target_variable_name = str(data.get("targetVariableName", "")).strip()
    if not class_name or not variable_name or not target_variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = _class_variable_slots(class_name, "class-instance")
    if variable_name not in slots:
        return jsonify(success=False, exception="variable not found"), 404
    slots[:] = [name for name in slots if name != variable_name]
    if target_variable_name not in slots:
        slots.append(target_variable_name)
    return jsonify(
        success=True,
        result=f"Renamed class instance variable {variable_name} to {target_variable_name}",
        variableName=variable_name,
        targetVariableName=target_variable_name,
    )


@app.post("/class-browser/remove-class-instance-variable")
def class_browser_remove_class_instance_variable():
    _count_request("class-browser.remove-class-instance-variable")
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if not class_name or not variable_name:
        return jsonify(success=False, exception="missing class or variable name"), 400
    slots = _class_variable_slots(class_name, "class-instance")
    if variable_name not in slots:
        return jsonify(success=False, exception="variable not found"), 404
    slots[:] = [name for name in slots if name != variable_name]
    return jsonify(success=True, result=f"Removed class instance variable {variable_name}", variableName=variable_name)


@app.get("/class-browser/file-out")
def class_browser_file_out():
    mode = request.args.get("mode", "class").strip() or "class"
    class_name = request.args.get("class", "").strip()
    dictionary = request.args.get("dictionary", "").strip()
    selector = request.args.get("selector", "").strip()
    meta = request.args.get("meta") == "1"
    meta_suffix = "-class" if meta and mode.startswith("class") else ""
    filename = {
        "class": f"{class_name}{meta_suffix}.st",
        "class-methods": f"{class_name}{meta_suffix}-methods.st",
        "dictionary": f"{dictionary}.st",
        "dictionary-methods": f"{dictionary}-methods.st",
        "method": f"{class_name}{meta_suffix}-{selector}.st",
    }.get(mode, "export.st")
    if mode == "method":
        source = METHOD_SOURCES.get((class_name, meta, selector), "")
    else:
        source = f'"{filename}"\n'
    return jsonify(success=True, filename=filename, source=source)


@app.post("/class-browser/create-accessors")
def class_browser_create_accessors():
    data = request.get_json(force=True) or {}
    class_name = str(data.get("className", "")).strip()
    variable_name = str(data.get("variableName", "")).strip()
    if class_name and variable_name:
        selectors = CLASS_PROTOCOLS.setdefault((class_name, False), {}).setdefault("accessing", [])
        getter = variable_name
        setter = f"{variable_name}:"
        for selector in (getter, setter):
            if selector not in selectors:
                selectors.append(selector)
        METHOD_SOURCES[(class_name, False, getter)] = f"{getter}\n^ {variable_name}"
        METHOD_SOURCES[(class_name, False, setter)] = f"{setter} anObject\n{variable_name} := anObject"
    return jsonify(
        success=True,
        result="Success",
        category="accessing",
        getterSelector=variable_name or None,
        setterSelector=(f"{variable_name}:" if variable_name else None),
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)
