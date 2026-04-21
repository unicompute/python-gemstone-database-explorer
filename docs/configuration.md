# Configuration

GemStone Database Explorer is configured entirely through environment variables, read at startup by `gemstone-py`.

## Required variables

| Variable | Description |
|---|---|
| `GEMSTONE` | Absolute path to your GemStone installation directory |
| `GS_USERNAME` | GemStone user to log in as (e.g. `DataCurator`) |
| `GS_PASSWORD` | Password for that user |

## Optional variables

| Variable | Description | Default |
|---|---|---|
| `GEMSTONE_NRS` | Network Resource String identifying the Stone process | local shared-memory login |
| `GS_STONE_NAME` | Stone name (alternative to a full NRS) | `gs64stone` |

## Example

```bash
export GEMSTONE=/opt/gemstone/GemStone64Bit3.7.5-arm64.Darwin
export GS_USERNAME=DataCurator
export GS_PASSWORD=swordfish
export GEMSTONE_NRS='!tcp@localhost#server!gemstone'

.venv/bin/python-gemstone-database-explorer
```

## GCI library path

The GemStone GCI shared library must be on the dynamic linker path:

```bash
# macOS
export DYLD_LIBRARY_PATH=$GEMSTONE/lib:$DYLD_LIBRARY_PATH

# Linux
export LD_LIBRARY_PATH=$GEMSTONE/lib:$LD_LIBRARY_PATH
```

## Session management

Each HTTP request opens a new GemStone session (login), performs its work, then logs out. Read-only requests abort before logout to release any implicit transaction. Write requests (add/remove dictionary or entry, commit, abort) use `read_only=False` and commit explicitly.

This per-request model avoids the teardown-commit problem that arises when using Flask session pools with GemStone (GemStone error #0 when committing with no open transaction).
