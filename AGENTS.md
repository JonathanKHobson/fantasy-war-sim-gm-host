# Agent Guide

This is the macOS GM hosting product for Fantasy War Sim. Read `README.md` before changing the host/player workflow.

- `electron/` owns app startup, preload, host lifecycle, and tunnel handling. `desktop/` owns the GM shell and hosted player pages. `src/game-core/` holds extracted pure helpers.
- `reference/` is the vendored browser simulator runtime used by the host. Do not remove or archive it. The separate browser repository does not update this copy automatically; refresh it intentionally and check the bridge.
- Declared checks are `npm run audit:engine`, `npm run test:core`, `npm run test:desktop`, and `npm run test:reference`. Run relevant checks after installing dependencies. `npm run desktop:start` opens the Electron app.
- Keep host and player changes in this repository. Preserve local session state and hosted routing when changing the reference integration.
