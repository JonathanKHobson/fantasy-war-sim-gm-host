# Fantasy War Sim GM Host

This workspace is the active product repo for the macOS GM host version of Fantasy War Sim.

The original browser-only Fantasy War Sim source is now treated as a frozen backup/reference. Ongoing feature work happens only in this GM Host workspace.

## What Exists Now

- A bootable Electron macOS app that wraps the copied Fantasy War Sim reference UI
- A GM shell with:
  - About panel
  - app-data access
  - host status bar
  - collapsible host drawer
- A local session service with HTTP and WebSocket transport
- A player room that supports:
  - join by `name + session code`
  - ready state
  - shared submissions
  - full-page hosted simulator access in a separate browser tab
- Shared simulator synchronization between the GM app and connected player simulator tabs
- A packaged local app build at `dist/mac-arm64/Fantasy War Sim GM Host.app`

## Current Hosting Model

- `Start Public Hosting` uses the simple Quick Tunnel path again.
- Public hosting now:
  - starts the local host service
  - starts a Cloudflare Quick Tunnel
  - exposes the player invite as soon as the tunnel returns a public URL
- The earlier verification-gated and hybrid fallback flow is not part of the active startup path.
- Named-tunnel configuration is still preserved in the drawer as advanced backup setup, but it is inactive for normal hosting.

## Current Runtime Architecture

- `reference/`
  - vendored runtime baseline from the original browser-only app
  - current battle runtime still resolves from this copied monolith, including the shipped War Room battle-integration pass for allied `supply` / `morale` and report-only `influence`
- `desktop/`
  - GM shell renderer and player-facing hosted pages
- `electron/`
  - Electron main process, preload bridge, local host lifecycle, and tunnel management
- `src/game-core/`
  - extracted pure helpers for state normalization, migration, preview shaping, and player-view projection
- `test/core/`
  - Node tests for extracted logic, local host behavior, and hosted simulator routing

## Daily Commands

```bash
npm run audit:engine
npm run test:core
npm run test:desktop
npm run test:reference
npm run desktop:start
npm run desktop:dev
npm run desktop:package
```

## How To Run It

### Development

```bash
npm install
npm run desktop:start
```

### Packaged App

- Build:
  - `npm run desktop:package`
- Output:
  - `dist/mac-arm64/Fantasy War Sim GM Host.app`

## Current User Flow

### GM

1. Open the app.
2. Use the built-in Fantasy War Sim interface as the main GM surface.
3. Click `Start Public Hosting` for a Quick Tunnel invite, or `Start Local Only` for LAN/local testing.
4. Copy the invite from the host bar or host drawer.
5. Watch connected players, ready state, submissions, and room/simulator mode in the drawer.

### Player

1. Open the invite link.
2. Enter a name and session code.
3. Join the shared room.
4. Stay in the room as an observer/collaborator, or open the full hosted simulator in a separate browser tab.

## Maintenance Workflow

- Do not treat the original browser-only source as a live development target.
- Do not dual-maintain both repos feature-by-feature.
- All new product work belongs in this GM Host repo.
- `reference/` should only be refreshed intentionally:
  - copy forward the source baseline
  - rerun regression checks
  - verify the GM Host bridge assumptions still hold

## Current Limitations

- The live gameplay runtime is still the vendored reference app, not a fully extracted `game-core` renderer.
- Shared simulator state still syncs through the temporary bridge around the reference runtime.
- Concurrent player simulator edits are effectively last-write-wins.
- Named tunnel backup setup is stored but not currently used in the primary path.
- Notarization and hardened production distribution are still later milestones.
