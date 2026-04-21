# API Reference

All responses are JSON. Successful responses include `"success": true`. Errors include `"success": false` and `"exception": "<message>"`.

---

## Object Browser

### `GET /ids`

Returns OOPs for the three well-known root objects.

**Response**
```json
{
  "persistentRootId": 123,
  "globalsId": 456,
  "gemStoneSystemId": 789
}
```

---

### `GET /object/index/<oop>`

Inspect an object by OOP. Returns a nested view dict.

**Query parameters**

| Parameter | Default | Description |
|---|---|---|
| `depth` | `2` | How many levels deep to load children |
| `range_instVars_from` | `1` | First instVar/entry index to return |
| `range_instVars_to` | `20` | Last instVar/entry index to return |

**Response**
```json
{
  "success": true,
  "result": {
    "oop": 12345,
    "inspection": "a Dictionary",
    "basetype": "hash",
    "loaded": true,
    "instVarsSize": 42,
    "instVars": {
      "1": [
        {"oop": null, "inspection": "myKey", "basetype": "symbol", "loaded": false},
        {"oop": 99999, "inspection": "myValue", "basetype": "string", "loaded": false}
      ]
    },
    "classObject": {"oop": 74753, "inspection": "Dictionary", "basetype": "object", "loaded": false},
    "customTabs": []
  }
}
```

---

### `GET /object/evaluate/<oop>`

Evaluate a Smalltalk expression in the context of the object at `<oop>`.

**Query parameters**

| Parameter | Description |
|---|---|
| `code` | Smalltalk expression to evaluate |
| `language` | `smalltalk` (only supported value) |
| `depth` | Depth for the result view (default `2`) |

**Response**
```json
{
  "success": true,
  "result": [false, { ...object_view... }]
}
```

The first element of `result` is `true` if the result is an Error (exception), `false` otherwise.

---

## Symbol List Browser

### `GET /symbol-list/users`

Returns all GemStone user names from the `AllUsers` collection.

**Response**
```json
{"success": true, "users": ["DataCurator", "SystemUser", "..."]}
```

---

### `GET /symbol-list/dictionaries/<user>`

Returns the names of all SymbolDictionaries in a user's symbol list.

**Response**
```json
{"success": true, "dictionaries": ["UserGlobals", "Globals", "SessionMethods", "Published"]}
```

---

### `GET /symbol-list/entries/<user>/<dictionary>`

Returns all keys in the named dictionary, as strings.

**Response**
```json
{"success": true, "entries": ["AllUsers", "Array", "..."]}
```

---

### `GET /symbol-list/preview/<user>/<dictionary>/<key>`

Returns a full `object_view` for the value stored at `key` in the named dictionary.

**Response** — same shape as `/object/index/<oop>` result, plus `"success": true`.

---

### `POST /symbol-list/add-dictionary`

Create a new SymbolDictionary in a user's symbol list. Commits immediately.

**Body**
```json
{"user": "DataCurator", "name": "MyDictionary"}
```

---

### `POST /symbol-list/remove-dictionary`

Remove a SymbolDictionary from a user's symbol list. Commits immediately.

**Body**
```json
{"user": "DataCurator", "name": "MyDictionary"}
```

---

### `POST /symbol-list/add-entry`

Add a key/value entry to a dictionary. The value is a Smalltalk expression that is evaluated server-side. Commits immediately.

**Body**
```json
{"user": "DataCurator", "dictionary": "UserGlobals", "key": "myKey", "value": "OrderedCollection new"}
```

---

### `POST /symbol-list/remove-entry`

Remove an entry from a dictionary. Commits immediately.

**Body**
```json
{"user": "DataCurator", "dictionary": "UserGlobals", "key": "myKey"}
```

---

## Transaction

### `GET /transaction/commit`

Commit the current GemStone transaction.

**Response**
```json
{"success": true}
```

### `GET /transaction/abort`

Abort the current GemStone transaction.

**Response**
```json
{"success": true}
```

---

## Diagnostics

### `GET /symbol-list/debug`

Returns a human-readable string describing what the AllUsers lookup resolved to. Useful for diagnosing Symbol List connectivity issues.

### `GET /version`

Returns GemStone version strings.

**Response**
```json
{"success": true, "stone": "3.7.5", "gem": "3.7.5"}
```
