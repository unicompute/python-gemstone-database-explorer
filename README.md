# GemStone Database Explorer

A Python/Flask web application for browsing and inspecting objects in a [GemStone/S](https://gemtalksystems.com/products/gs64/) object database. Port of [maglev-database-explorer-gem](https://github.com/matthias-springer/maglev-database-explorer-gem) using [gemstone-py](https://github.com/unicompute/gemstone-py) as the backend.

![GemStone Database Explorer](docs/web.png)

## Features

- **Object Browser** — navigate the object graph from well-known roots (UserGlobals, Globals, System); inspect instance variables, dictionary entries, and collection elements; evaluate Smalltalk expressions in the context of any object
- **Symbol List Browser** — browse GemStone symbol lists by user and dictionary; view key/value pairs and printStrings; add and remove dictionaries and entries
- **Transaction control** — Commit and Abort buttons on both tabs
- Batched GCI evaluation for fast object inspection (single `eval()` per view)

## Requirements

- GemStone/S 64 3.x with GCI libraries accessible on `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH`
- Python 3.11+
- [gemstone-py](https://github.com/unicompute/gemstone-py)

## Installation

```bash
git clone https://github.com/unicompute/python-gemstone-database-explorer
cd python-gemstone-database-explorer
python3 -m venv .venv
.venv/bin/pip install -e .
```

## Configuration

Set the following environment variables before starting:

| Variable | Description | Example |
|---|---|---|
| `GEMSTONE` | Path to GemStone installation | `/opt/gemstone/GemStone64Bit3.7.5-arm64.Darwin` |
| `GS_USERNAME` | GemStone login username | `DataCurator` |
| `GS_PASSWORD` | GemStone login password | `swordfish` |
| `GEMSTONE_NRS` | Network Resource String for the Stone | `!tcp@localhost#server!gemstone` |

See [docs/configuration.md](docs/configuration.md) for full details.

## Usage

```bash
.venv/bin/python-gemstone-database-explorer
# → GemStone Database Explorer running at http://127.0.0.1:9292/
```

Options:

```
--host HOST    Bind host (default: 127.0.0.1)
--port PORT    Port (default: 9292)
--debug        Enable Flask debug mode
```

Open `http://127.0.0.1:9292/` in a browser.

## Documentation

- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)

## License

MIT
