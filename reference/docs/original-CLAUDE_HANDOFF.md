# Claude Handoff — Fantasy War Sim

## What This Project Is

Fantasy War Sim is a local-first fantasy battle simulator. A user can set up two armies, apply doctrines and nearby effects, run a battle, inspect the dice math in detail, auto-resolve repeated rounds in the War Report modal, save reusable armies and factions, and review/export battle history.

The app is intentionally simple at the deployment layer:
- no backend
- no accounts
- no build step for normal use
- no framework runtime
- persistence lives in browser `localStorage`

Most of the real complexity is inside one HTML file with embedded JavaScript, plus a shared theme stylesheet.

## Current Entry Points

- Main app: `fantasy-war-sim.html`
- Help / quick-reference surface: `fantasy-war-sim-help-wiki.html`
- Full rulebook surface: `War_Encounter_Rules_2026_v4.html`
- Legacy compatibility redirect: `War_Table_v3.html` -> redirects to `fantasy-war-sim.html`

Planning lane docs:
- `Fantasy-War-Sim_Three-Pool-Calibration-PRD.md`
- `assets/documentation/FANTASY_WAR_SIM_THREE_POOL_CALIBRATION_ROADMAP.md`
- `assets/documentation/RULEBOOK_SUGGESTIONS_LOG.md`

The redirect file is intentional. Treat `fantasy-war-sim.html` as the only real app shell.

## Architecture Model

- App model: static HTML + shared CSS + in-file JavaScript
- Persistence: browser `localStorage`
- Storage key: `warTableState`
- Schema version: `7`
- Testing: Playwright regression suite
- Local test server: Python `http.server` launched from Playwright config

There is no API boundary or server contract to reason about. The main audit surface is DOM IDs, runtime state, persistence shape, and the order of battle-engine side effects.

## Dependencies and Tooling

Repo dependencies are intentionally light:
- Node package dependency: `@playwright/test`
- Local static server in tests: `python3 -m http.server 4173 --bind 127.0.0.1`

Useful commands:
- `npx playwright test --project=chromium-local`
- `npx playwright test --project=chromium-hosted` if `WAR_TABLE_HOSTED_URL` is set

There is no application bundler, no transpiler, and no production framework dependency.

## File and Folder Map

Top-level files:
- `fantasy-war-sim.html`: main app shell, runtime state, battle engine, rendering, event wiring
- `fantasy-war-sim-help-wiki.html`: help/wiki surface linked from the app
- `War_Encounter_Rules_2026_v4.html`: long-form rulebook
- `War_Table_v3.html`: compatibility redirect only
- `README.md`: front-door orientation
- `CLAUDE_HANDOFF.md`: this handoff

Key folders:
- `assets/css/`: shared theme, state themes, help layout, rulebook layout
- `assets/documentation/`: canonical dev guide, architecture index, stabilization logs, audit supplements
- `assets/templates/`: CSV starter templates for armies and factions
- `assets/pdfs/`: rulebook PDF
- `tests/`: Playwright regression coverage

Important docs inside `assets/documentation/`:
- `README_War_Table_v3_Dev_Guide.md`: canonical implementation contract
- `ARCHITECTURE_INDEX_War_Table_v3.md`: section-marker and function index for the single-file app
- `fantasy-war-sim-class-matchup-logic-guide.md`: plain-English guide to class-vs-class and weather/matchup logic
- `fantasy-war-sim-dice-modifier-logic-guide.md`: plain-English guide to the full modifier pipeline and HTML-added logic
- `FANTASY_WAR_SIM_THREE_POOL_CALIBRATION_ROADMAP.md`: planning-only execution order for the next lane
- `RULEBOOK_SUGGESTIONS_LOG.md`: planning-only simulator-to-rulebook parity suggestions
- `WAR_TABLE_v3_STABILIZATION_TICKET_LOG.md`
- `WAR_TABLE_v3_STABILIZATION_CHANGE_LOG.md`
- `WAR_TABLE_v3_IMPLEMENTATION_DRIFT_LOG.md`
- `tmp/docs/fantasy-war-sim-ux-audit-2026-03-08.md`: March 8 UX audit plus shipped/open remediation status

## How The Product Is Supposed To Work

### Battle
- Users set up attacker and defender through a progressive side setup flow.
- Each side can be loaded from saved armies or created manually.
- Fresh load now uses guidance-first readiness messaging instead of an error-first `Not ready` block, while the Battle action stays disabled until setup is valid.
- Battle math is transparent: size, STR, matchup logic, weather, doctrines, direct context, nearby effects, manual overrides, caps, then resolution.

### War Report
- The default UX is staging-first when the setting is enabled.
- A first click opens the War Report modal before the battle round is executed.
- Auto-battle reuses the same battle engine path as manual runs and should stop cleanly on defeat, manual stop, or runtime error.

### Armies and Factions
- Saved armies and factions are persisted.
- Battle-side setup state is runtime-only until a user explicitly saves or updates an army.
- Dirty-state prompts should trigger only for saveable army fields, not transient tactical controls.

### History
- Persisted history stays flat in `battleHistory`.
- The UI groups it as session -> turn -> battle cards.
- A runtime-only empty current-session placeholder may appear before the first recorded battle, but it is not persisted or exported.

### Settings
- Settings control resolution, dice caps, assist/hinder behavior, War Report staging, and weather/theme behavior.
- Settings changes are dirty-tracked against a canonical save snapshot and guarded on tab leave / refresh.
- The shared dirty guard now opens with initial focus on `Stay` rather than the close icon.

## Intentional Legacy Identifiers

These are legacy-looking on purpose and should not be casually renamed during an audit:
- `warTableState` localStorage key
- `SCHEMA_VERSION = 7`
- CSS filenames beginning with `war-table-`
- internal doc filenames that still say `War_Table_v3`
- `War_Table_v3.html` compatibility redirect
- package metadata that still uses `war-table-v3`

The frontend is rebranded to Fantasy War Sim, but not every internal identifier was renamed. That is intentional risk containment, not necessarily drift.

## High-Risk Audit Hotspots

These are the parts of the code most likely to cause regressions if touched casually:
- `runBattleRound` ordering and side effects
- War Report state machine and auto-battle stop lifecycle
- history grouping and runtime placeholder rendering
- dirty-state guards for army setup and settings
- battle turn vs weather turn labeling
- responsive header/history UX, which was recently touched and regressed before being fixed

## Start Here If You Are Auditing

Read in this order:
1. `README.md`
2. `assets/documentation/README_War_Table_v3_Dev_Guide.md`
3. `assets/documentation/fantasy-war-sim-class-matchup-logic-guide.md`
4. `assets/documentation/fantasy-war-sim-dice-modifier-logic-guide.md`
5. `assets/documentation/ARCHITECTURE_INDEX_War_Table_v3.md`
6. `fantasy-war-sim.html`
7. `assets/css/war-table-theme.css`
8. `tests/war-table.spec.js`

Before trusting a change:
- confirm whether it affects persisted state or only runtime state
- verify whether the same behavior is used by both manual battle and auto-battle
- check whether War Report, History, and Settings rely on the same state transition
- use the two logic guides before diffing the rulebook against the HTML directly
- run the Playwright suite locally

## What Not To Rewrite Blindly

- do not replace the flat `battleHistory` model with a new persisted session model without a migration plan
- do not rename storage keys or schema identifiers in a cleanup pass
- do not rewrite battle math ordering without updating the canonical dev guide and regression coverage
- do not assume old-looking names are dead code; several are compatibility shims or intentionally preserved internals

## Recent Project Context

- A stabilization pass recently touched History, dirty-state guards, auto-battle error handling, header responsiveness, and the frontend rebrand.
- The main app and help wiki were renamed to Fantasy War Sim, but core internal docs and identifiers were deliberately left partially legacy-named.
- `War_Table_v3.html` now exists only as a redirect shim for compatibility with old bookmarks or links.
- The three-pool calibration lane is now partially implemented in the simulator: quality tags, future-facing Supply warnings, and pre-battle class ceiling enforcement are shipped.
- A War Room MVP is now shipped as an additive campaign layer: faction relations, war status cards, overall war signal, allied-army breakdowns, manual war meters, and turn/weather recap all live in the new `War Room` tab.
- Saved armies now persist `originalSize` and `originalStr` separately from current `size` / `str`; battle-side edits only change current values, while Armies-tab edit exposes original values in a collapsed GM-only block.
- Persistence/import/export now include a `war` block with `factionRelations`, `resources` (`cp`, `supply`, `morale`, `influence` only), and session-scoped `weatherHistory`, plus battle-history side snapshots with `armyId` and `faction`.
- A stabilization-safe UX follow-up is also shipped locally: first-run guidance-first messaging, copy cleanup across Battle/Settings/War Report, explicit live-region semantics for key feedback surfaces, dirty-guard focus management, and favicon/head hygiene.
- The root PRD and planning roadmap remain the source for the remaining work in that lane, especially compact terminology cleanup and follow-up rulebook parity decisions.
- The broader UX release lane from the March 8 audit is still open and should be treated separately from the low-risk stabilization-safe slice.

If something looks contradictory, trust the current app shell and regression tests first, then update the docs to match shipped behavior.
