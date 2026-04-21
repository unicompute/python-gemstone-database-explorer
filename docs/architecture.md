# Architecture

## Overview

```
Browser  ──HTTP──►  Flask (gemstone_p/app.py)
                        │
                        ▼
                   object_view.py   ← batched Smalltalk eval
                        │
                        ▼
                   session.py       ← per-request login/logout
                        │
                        ▼
                   gemstone-py      ← GCI C library bridge
                        │
                        ▼
                   GemStone/S Stone
```

## Modules

### `gemstone_p/app.py`

Flask application factory (`create_app()`). Defines all routes:

| Route | Description |
|---|---|
| `GET /` | Serve the single-page UI |
| `GET /ids` | Return OOPs for UserGlobals, Globals, System |
| `GET /object/index/<oop>` | Inspect an object by OOP |
| `GET /object/evaluate/<oop>` | Evaluate Smalltalk in context of an object |
| `GET /symbol-list/users` | List GemStone users from AllUsers |
| `GET /symbol-list/dictionaries/<user>` | List SymbolDictionaries for a user |
| `GET /symbol-list/entries/<user>/<dict>` | List keys in a dictionary |
| `GET /symbol-list/preview/<user>/<dict>/<key>` | Full object view for an entry value |
| `POST /symbol-list/add-dictionary` | Create a new SymbolDictionary |
| `POST /symbol-list/remove-dictionary` | Remove a SymbolDictionary |
| `POST /symbol-list/add-entry` | Add a key/value entry |
| `POST /symbol-list/remove-entry` | Remove an entry |
| `GET /transaction/commit` | Commit current transaction |
| `GET /transaction/abort` | Abort current transaction |
| `GET /symbol-list/debug` | Diagnostic: show AllUsers lookup result |
| `GET /version` | GemStone version strings |

### `gemstone_p/object_view.py`

Translates GemStone OOP references into JSON-serialisable dicts. All data is fetched in **batched `session.eval()` calls** to minimise GCI round-trips:

- `_fetch_meta(session, oop)` — returns `(class_name, printString, class_oop)` in one eval
- `_named_inst_vars(...)` — fetches all instance variable names + values + their class/printString in one eval
- `_dict_entries(...)` — fetches all key/value pairs + metadata in one eval
- `_array_entries(...)` — fetches all indexed elements + metadata in one eval

A 20-entry object requires ~3 GCI calls instead of ~80 with the naive per-slot approach.

Object classification uses `_basetype_from_cname()` which maps GemStone class names to frontend basetypes: `string`, `symbol`, `fixnum`, `float`, `boolean`, `nilclass`, `hash`, `array`, `object`.

### `gemstone_p/session.py`

Provides `request_session(read_only=True)` — a context manager that opens a GemStone session, yields it, aborts (if read-only), and logs out. No session pooling is used.

### `templates/index.html`

Self-contained single-page application. No external CDN dependencies. Two tabs:

- **Object Browser** — breadcrumb navigation, object card with instVars table, Smalltalk eval panel
- **Symbol List Browser** — user dropdown, dictionaries/entries two-column pane, Keys/Values table, PrintString box

## AllUsers lookup

The Symbol List browser needs to find the `AllUsers` collection. Three fallback paths are tried in order:

1. `Globals at: #AllUsers`
2. `UserGlobals at: #AllUsers`
3. `System myUserProfile symbolList objectNamed: #AllUsers`

Each is wrapped in `on: Error do:` so a missing path silently falls through to the next.
