# Fantasy War Sim — Architecture Index (Single-File Navigation)

Primary code file:
- `fantasy-war-sim.html`

Notes:
- Line numbers are approximate and should be refreshed after major edits.
- Fast navigation in code is via markers: `// [SECTION] ...` and `// [INDEX] ...`.
- `War_Table_v3.html` is a redirect shim only and should not be treated as the canonical app shell.

## Section Markers

- `DATA_RULES` around line `1223`
- `DATA_WEATHER` around line `2225`
- `UTILS_CORE` around line `3293`
- `DATA_DOCTRINES` around line `3323`
- `PERSISTENCE_STORAGE` around line `3689`
- `ENGINE_INDEX` around line `3829`
- `ENGINE_MATH` around line `3883`
- `STATE_RUNTIME` around line `4613`
- `DOMAIN_ACTIONS` around lines `4780`, `4862`
- `ENGINE_RESOLUTION` around line `4997`
- `UI_RENDER` around lines `5203`, `7277`, `7387`, `7450`, `7480`
- `UI_MODALS` around lines `7810`, `7943`, `8078`
- `IMPORT_EXPORT` around line `8190`
- `UI_HANDLERS` around lines `8999`, `9252`, `9331`

## Function Index (High-Traffic)

Persistence:
- `persistWeather(ws)` around line `3286`
- `loadPersisted()` around line `3772`
- `persist(saved)` around line `3794`

Engine:
- `computeDoctrineEffects(...)` around line `4033`
- `computePool(...)` around line `4485`

Rendering:
- `render()` around line `7172`
- `refreshArmyAndFactionLists()` around line `5210`
- `syncAllSettingsControlsFromState()` around line `5253`

CSV:
- `parseCsv(text)` around line `8264`
- `serializeCsv(rows, headers)` around line `8255`
- `validateArmiesCsv(rows)` around line `8447`
- `upsertArmiesFromCsv(rows)` around line `8518`
- `exportArmiesCsv()` around line `8570`
- `importArmiesCsv(file)` around line `8584`
- `exportFactionsCsv()` around line `8658`
- `importFactionsCsv(file)` around line `8664`
- `exportAllCsvBundle()` around line `8811`
- `importAllCsvBundle(file)` around line `8830`

Import/export:
- `doImportAll(data)` around line `8886`
- `importFactions(file)` (JSON) around line `8947`

Event wiring:
- `bind()` around line `9336`

## Dependency Hotspots

1. `computePool` depends on:
- class index lookups
- weather modifiers/specials
- doctrine effect layer
- state settings cap/override values

2. `render` depends on:
- `computePool`
- doctrine render helpers
- weather render helper
- mutable UI IDs (strict ID contract)

3. `bind` depends on:
- all expected IDs being present
- helper sync methods for settings controls
- globally available inline `onclick` targets

4. Import paths depend on:
- `sanitizeArmyRecord`
- `normalizeSettings`
- `recomputeFactions`
- CSV validators (`validateArmiesCsv`, `prepare*CsvImport`)

5. Bundle import depends on:
- ZIP store reader (`zipReadStore`)
- full validation before mutation
- ordered apply (factions then armies)

## Safe Editing Order

1. Update constants/data contracts.
2. Update sanitizers/normalizers.
3. Update engine math.
4. Update render helpers.
5. Update handlers/wiring.
6. Re-run parity checklist.
