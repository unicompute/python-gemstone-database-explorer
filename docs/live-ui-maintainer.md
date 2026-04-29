# Live UI Maintainer Notes

The live Playwright suite is wired through [`.github/workflows/live-ui.yml`](../.github/workflows/live-ui.yml) and [tests/ui/live.spec.js](../tests/ui/live.spec.js).

## When To Run It

- Use `workflow_dispatch` after changing debugger, transaction, session, or live GemStone integration behavior.
- Let the nightly run catch drift in the real Stone/runtime environment.
- Prefer the mock UI suite for ordinary window/render behavior. The live suite is for real-stone semantics, not for broad UI coverage.

## Required Runner Environment

The workflow is intentionally `self-hosted`. The runner must have:

- a reachable GemStone installation and native libraries
- a working Stone/NetLDI target
- Playwright Chromium dependencies
- these secrets configured:
  - `GEMSTONE`
  - `GS_USERNAME`
  - `GS_PASSWORD`
  - `GS_STONE`
  - `GS_HOST`
  - `GS_NETLDI`
  - optionally `GS_LIB`

Local repro uses the same env:

```bash
export GEMSTONE=/opt/gemstone/GemStone64Bit3.7.5-arm64.Darwin
export GS_USERNAME=DataCurator
export GS_PASSWORD=swordfish
export GS_STONE=gs64stone
export GS_HOST=localhost
export GS_NETLDI=50377

npm run test:ui:live
```

## Scope Discipline

Keep `live.spec.js` narrow.

- Add a live test when a bug depends on real GemStone behavior: debugger frame/source behavior, transaction semantics, session/channel isolation, class-browser writes against a real dictionary, or startup/login integration.
- Do not mirror the whole mock suite in live form.
- If a flow can be proven with the mock server, keep it in the normal UI suite instead.

## Operational Follow-Ups

- When the live suite fails before tests start, check runner env and `playwright.live.config.js` first.
- When it fails inside the app, capture the exact route/response pair from the Flask output before widening coverage.
- If session stability is the concern, run `python -m gemstone_p.session_soak` separately before adding more live-browser coverage.
