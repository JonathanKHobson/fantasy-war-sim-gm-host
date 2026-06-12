# Extraction Audit

Date: 2026-03-08

## Summary

This document is the extraction baseline for the vendored reference app. It is still useful, but it is not the current whole-project status.

The copied reference app is not ready to be lifted directly into an authoritative Node/Electron runtime without further refactoring.

- Raw `document.` references in the monolith: `36`
- `runBattleRound` is not pure
- `runBattleRound` currently mixes battle resolution with DOM writes, rendering, persistence, and history mutation

## Confirmed Coupling Inside `runBattleRound`

The reference implementation currently performs these side effects during round execution:

- touches the DOM `5` times inside `runBattleRound` (`validationMsg`, attacker size/STR, defender size/STR)
- writes DOM field values for attacker and defender size/STR
- calls `render()` during validation and weather-advance paths
- calls `setLiveMessage(...)` for validation errors
- calls `persistWeather(...)`
- calls `renderResult(...)`
- calls `appendHistory(...)`

This confirms the extraction milestone is a refactor, not a file move.

## What Has Changed Since This Audit

- The repo now has a working Electron GM host shell.
- The reference app is still the live gameplay/runtime surface.
- Pure helper extraction has already started under `src/game-core/`.
- Hosted player room, hosted simulator routing, and Quick Tunnel-based public invites now exist around the reference runtime.

This means the audit remains the right baseline for future extraction work, especially around `runBattleRound`, but it should be read alongside the current project status in:

- `README.md`
- `progress.md`

## Decision At Audit Time

The new workspace uses ESM for the extraction lane:

- compatible with modern Node tests
- compatible with Electron main/renderer setup
- compatible with future browser bundling if needed

## Ongoing Extraction Direction

1. Move state normalization and schema migration helpers into `src/game-core/` as pure modules.
2. Split `runBattleRound` into:
   - a pure transition function that returns next state plus emitted effects
   - a UI adapter layer that applies DOM, persistence, and toast/render effects
3. Port deterministic battle-resolution cases into Node tests with fixed RNG.
