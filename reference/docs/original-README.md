# Fantasy War Sim

Fantasy War Sim is a local-first fantasy battle simulator with transparent dice math, War Report staging/auto-battle flows, saved armies and factions, battle history, a War Room campaign dashboard, and browser-only persistence.

## Start Here

- Main app: `fantasy-war-sim.html`
- Help wiki: `fantasy-war-sim-help-wiki.html`
- Full rulebook: `War_Encounter_Rules_2026_v4.html`
- Incoming-dev handoff: `CLAUDE_HANDOFF.md`
- Army logic roadmap: `assets/documentation/FANTASY_WAR_SIM_ARMY_LOGIC_STABILIZATION_ROADMAP.md`
- Three-pool calibration PRD: `Fantasy-War-Sim_Three-Pool-Calibration-PRD.md`
- Three-pool calibration roadmap: `assets/documentation/FANTASY_WAR_SIM_THREE_POOL_CALIBRATION_ROADMAP.md`
- Rulebook suggestions log: `assets/documentation/RULEBOOK_SUGGESTIONS_LOG.md`
- Canonical implementation contract: `assets/documentation/README_War_Table_v3_Dev_Guide.md`
- Matchup logic guide: `assets/documentation/fantasy-war-sim-class-matchup-logic-guide.md`
- Modifier pipeline guide: `assets/documentation/fantasy-war-sim-dice-modifier-logic-guide.md`
- UX audit and remediation tracker: `tmp/docs/fantasy-war-sim-ux-audit-2026-03-08.md`

## Quick Start

1. Open `fantasy-war-sim.html` in a browser.
2. Open `fantasy-war-sim-help-wiki.html` for quick rules/help.
3. Run `npx playwright test --project=chromium-local` for the local regression suite.

No backend or build step is required for normal usage.

## Active Stabilization Lane

- Current build label: `2026-03-08-three-pool-scale-p1`
- Current execution lane: the local army-logic stabilization roadmap is complete through Fire Cult weather lock, the nearby-action audit, and the narrow Shield-Brethren follow-up, and the first three-pool calibration pass is now shipped in the app.
- UX stabilization status: the low-risk Lane A slice from the March 8 audit is now shipped locally under the same build label:
  - guidance-first first-run battle messaging
  - targeted copy cleanup across Battle, Settings, and War Report
  - consistent validation/status live-region semantics
  - dirty-guard initial focus on `Stay`
  - favicon/head asset hygiene
- Remaining open items: hosted parity smoke once `WAR_TABLE_HOSTED_URL` is available, plus the documented Shield-Brethren cavalry-charge deferral.
- Broader UX release lane: the audit's layout / IA / mobile continuity work remains open and should stay separate from the stabilization-safe slice.
- Hosted parity: still blocked in this workspace until `WAR_TABLE_HOSTED_URL` is provided; local continuation remains explicitly waived in the drift log.

## Three-Pool Calibration Lane

- Current scope: quality tags, class ceilings, future-facing Supply warnings, and rulebook-parity logging.
- PRD / dev handoff: `Fantasy-War-Sim_Three-Pool-Calibration-PRD.md`
- Roadmap: `assets/documentation/FANTASY_WAR_SIM_THREE_POOL_CALIBRATION_ROADMAP.md`
- Rulebook parity log: `assets/documentation/RULEBOOK_SUGGESTIONS_LOG.md`
- Status: phase-1/phase-2 simulator work is now shipped for quality tags, warnings, and pre-battle ceiling enforcement. Compact dice-label cleanup and later rulebook parity follow-up remain open.

## War Room MVP

- The app now includes a `War Room` tab immediately left of `Battle`.
- Current shipped scope:
  - faction relationship classification (`ally`, `neutral`, `enemy`)
  - war status cards for ally / neutral / enemy army totals and defeated counts
  - overall war signal derived from defeated-army ratios
  - allied army breakdown with wins / losses, current vs original size/STR, and degradation percentages
  - manual campaign meters for `cp`, `supply`, `morale`, and `influence`
  - allied-only battle integration for War Room `morale` and `supply` through the existing post-usable-cap modifier pipeline
  - report-only War Room `influence` notes in battle breakdown, War Report, and saved battle history
  - battle-turn / season / weather recap with session-scoped weather history
- Persistence now includes a `war` block plus `originalSize` / `originalStr` on saved armies.
- There is no Spy meter in the app or state model.

## Project Shape

- Architecture: static HTML + shared CSS + in-file JavaScript
- Persistence: browser `localStorage` using `warTableState`
- Main app shell: `fantasy-war-sim.html`
- Shared theme: `assets/css/war-table-theme.css`
- Tests: `tests/war-table.spec.js`

## Canonical Docs

- `CLAUDE_HANDOFF.md` for product/repo orientation
- `assets/documentation/README_War_Table_v3_Dev_Guide.md` for shipped behavior contracts
- `assets/documentation/FANTASY_WAR_SIM_ARMY_LOGIC_STABILIZATION_ROADMAP.md` for the current staged execution order
- `Fantasy-War-Sim_Three-Pool-Calibration-PRD.md` for the next planning-only implementation handoff
- `assets/documentation/FANTASY_WAR_SIM_THREE_POOL_CALIBRATION_ROADMAP.md` for the next planning-only staged execution order
- `assets/documentation/RULEBOOK_SUGGESTIONS_LOG.md` for simulator-to-rulebook parity suggestions
- `assets/documentation/ARCHITECTURE_INDEX_War_Table_v3.md` for section markers and high-traffic function anchors
- `assets/documentation/fantasy-war-sim-class-matchup-logic-guide.md` for plain-English class-matchup mapping
- `assets/documentation/fantasy-war-sim-dice-modifier-logic-guide.md` for plain-English modifier-pipeline mapping
- `tmp/docs/fantasy-war-sim-ux-audit-2026-03-08.md` for the March 8 UX findings plus shipped/open remediation status

## Legacy Compatibility Notes

Some internal names intentionally still use legacy `warTable` naming:
- `warTableState` storage key
- `war-table-*` CSS filenames
- `War_Table_v3.html` redirect fallback for old links/bookmarks
- internal doc filenames under `assets/documentation/`

Those identifiers are not a signal that the frontend rebrand is incomplete; most are kept for compatibility and to avoid unnecessary churn.
