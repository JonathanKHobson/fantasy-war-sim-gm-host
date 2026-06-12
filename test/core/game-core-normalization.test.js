import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLegacyThemeSettingsBridge,
  normalizeSettings
} from "../../src/game-core/settings.js";
import { normalizeDoctrineList } from "../../src/game-core/doctrines.js";
import {
  defaultAssistHinderDraft,
  normalizeBattleDraft
} from "../../src/game-core/battle-draft.js";
import { sanitizeArmyRecord } from "../../src/game-core/armies.js";
import {
  SCHEMA_VERSION,
  createEmptyState,
  loadState,
  migrateState
} from "../../src/game-core/state.js";

const FIXED_NOW = () => "2026-03-08T12:00:00.000Z";
const FIXED_ID = () => "generated-id";
const VALID_CLASS_IDS = new Set(["cavalry", "pikes", "mages"]);

test("state module is aligned to the live source schema version", () => {
  assert.equal(SCHEMA_VERSION, 8);
});

test("normalizeSettings applies defaults and clamps values", () => {
  const normalized = normalizeSettings({
    resolutionMode: "quick",
    quickLossPreset: "flat10",
    dicePoolMode: "legacy",
    allowOverCap: 1,
    overrideDoctrineEligibility: "yes",
    assistHinderEnabled: false,
    assistHinderDiceCap: "99",
    showWarReportModal: false,
    weatherThemesEnabled: false,
    phenomenaThemesEnabled: false,
    defeatThemesEnabled: false,
    themeStrengthMode: "dramatic"
  });

  assert.deepEqual(normalized, {
    resolutionMode: "quick",
    quickLossPreset: "flat10",
    dicePoolMode: "legacy",
    allowOverCap: true,
    overrideDoctrineEligibility: true,
    assistHinderEnabled: false,
    assistHinderDiceCap: 20,
    showWarReportModal: false,
    weatherThemesEnabled: false,
    phenomenaThemesEnabled: false,
    defeatThemesEnabled: false,
    themeStrengthMode: "dramatic"
  });
});

test("legacy theme bridge backfills settings from older weather flags", () => {
  const bridged = applyLegacyThemeSettingsBridge(
    { resolutionMode: "risk" },
    { enablePhenomenaTheme: false, enableDefeatTheme: false }
  );

  assert.equal(bridged.weatherThemesEnabled, true);
  assert.equal(bridged.phenomenaThemesEnabled, false);
  assert.equal(bridged.defeatThemesEnabled, false);
  assert.equal(bridged.themeStrengthMode, "subtle");
});

test("normalizeDoctrineList canonicalizes aliases and removes invalid entries", () => {
  const doctrines = normalizeDoctrineList([
    "Anti Air",
    { doctrineId: "elemental ammunition", choice: { damageType: "Fire" } },
    { doctrineId: "elemental_ammunition", choice: { damageType: "acid" } },
    { doctrineId: "unknown" }
  ]);

  assert.deepEqual(doctrines, [
    { doctrineId: "anti_air" },
    { doctrineId: "elemental_ammunition", choice: { damageType: "fire" } }
  ]);
});

test("sanitizeArmyRecord normalizes numbers, timestamps, and doctrines", () => {
  const army = sanitizeArmyRecord(
    {
      name: "  Silver Lancers ",
      faction: "Alliance",
      classId: "cavalry",
      size: "150",
      str: "40",
      notes: "  Fast flankers ",
      doctrines: ["Anti Air", { doctrineId: "elemental ammunition", damageType: "lightning" }]
    },
    { now: FIXED_NOW, idFactory: FIXED_ID, validClassIds: VALID_CLASS_IDS }
  );

  assert.deepEqual(army, {
    id: "generated-id",
    name: "Silver Lancers",
    faction: "Alliance",
    classId: "cavalry",
    size: 150,
    str: 40,
    originalSize: 150,
    originalStr: 40,
    notes: "Fast flankers",
    doctrines: [
      { doctrineId: "anti_air" },
      { doctrineId: "elemental_ammunition", choice: { damageType: "lightning" } }
    ],
    createdAt: "2026-03-08T12:00:00.000Z",
    updatedAt: "2026-03-08T12:00:00.000Z"
  });
});

test("sanitizeArmyRecord rejects unknown classes when a class index is supplied", () => {
  const army = sanitizeArmyRecord(
    { classId: "dragons", size: 20, str: 10 },
    { validClassIds: VALID_CLASS_IDS }
  );

  assert.equal(army, null);
});

test("normalizeBattleDraft restores the assist/hinder draft shape", () => {
  const draft = normalizeBattleDraft(
    {
      assistHinder: {
        attacker: {
          assistNearby: [
            {
              armyId: "army-1",
              range: "1_space",
              actionId: "battlefield_weavers_zone",
              choice: { weatherTag: "fog" }
            }
          ],
          context: { homeTerritory: 1 },
          runtime: { queuedSiegePrep: "yes" }
        }
      }
    },
    { idFactory: FIXED_ID }
  );

  assert.deepEqual(draft, {
    assistHinder: {
      attacker: {
        assistNearby: [
          {
            id: "generated-id",
            armyId: "army-1",
            range: "one_space",
            actionId: "battlefield_weavers_zone",
            hidden: false,
            notes: "",
            choice: { weatherTag: "FOG" }
          }
        ],
        hinderNearby: [],
        context: {
          homeTerritory: true,
          forestEnvironment: false,
          cityFortChoke: false,
          flankedByTwoEnemies: false,
          enemyHasIntelOnHidden: false,
          selfHiddenOrSurprising: false
        },
        runtime: { queuedSiegePrep: true }
      },
      defender: defaultAssistHinderDraft().defender
    }
  });
});

test("createEmptyState builds the schema-v8 saved-state shell", () => {
  const state = createEmptyState({ now: FIXED_NOW, idFactory: FIXED_ID });

  assert.equal(state.schemaVersion, 8);
  assert.equal(state.updatedAt, "2026-03-08T12:00:00.000Z");
  assert.deepEqual(state.armies, []);
  assert.deepEqual(state.factions, []);
  assert.deepEqual(state.battleHistory, []);
  assert.deepEqual(state.settings.assistHinderDiceCap, 6);
  assert.deepEqual(state.battleDraft.assistHinder.attacker.assistNearby, []);
});

test("migrateState normalizes saved data and repairs faction relations", () => {
  const migrated = migrateState(
    {
      updatedAt: "2025-01-01T00:00:00.000Z",
      armies: [
        {
          id: "army-a",
          name: "North Guard",
          faction: "Alliance",
          classId: "pikes",
          size: "120",
          str: "35"
        },
        {
          id: "army-b",
          name: "Court Mages",
          faction: "alliance",
          classId: "mages",
          size: "90",
          str: "50",
          originalSize: "100",
          originalStr: "55"
        },
        {
          id: "army-c",
          name: "Invalid",
          faction: "Raiders",
          classId: "dragons",
          size: "1",
          str: "1"
        }
      ],
      factions: ["Raiders", "Alliance", "alliance"],
      war: {
        factionRelations: { " Alliance ": "ally", raiders: "hostile" },
        resources: { cp: 99, supply: -9, morale: 3, influence: "2" },
        weatherHistory: [
          { id: "w1", weather: { tag: "PHENOMENA", phenomena: "WILD_MAGIC_STORM", wildMagicEvent: { title: "The Clutch" } } }
        ]
      },
      weather: {
        tag: "PHENOMENA",
        phenomena: "ELEMENTAL_DISTURBANCE",
        elementalSubtype: "Corrosive",
        currentTurn: "3"
      },
      settings: {
        resolutionMode: "quick",
        assistHinderDiceCap: "-1"
      },
      battleDraft: {
        assistHinder: {
          defender: {
            hinderNearby: [{ armyId: "army-a", range: "2_spaces", actionId: "harry", hidden: 1 }]
          }
        }
      },
      battleHistory: [{ id: "h1" }]
    },
    { now: FIXED_NOW, idFactory: FIXED_ID, validClassIds: VALID_CLASS_IDS }
  );

  assert.equal(migrated.schemaVersion, 8);
  assert.equal(migrated.armies.length, 2);
  assert.deepEqual(migrated.factions, ["Alliance", "Raiders"]);
  assert.equal(migrated.war.factionRelations.alliance, "ally");
  assert.equal(migrated.war.factionRelations.raiders, "neutral");
  assert.deepEqual(migrated.war.resources, { cp: 10, supply: -5, morale: 3, influence: 2 });
  assert.equal(migrated.weather.elementalSubtype.subtypeLabel, "Corrosive");
  assert.equal(migrated.weather.currentTurn, 3);
  assert.equal(migrated.settings.assistHinderDiceCap, 0);
  assert.equal(migrated.battleDraft.assistHinder.defender.hinderNearby[0].range, "two_spaces");
  assert.equal(migrated.battleHistory.length, 1);
});

test("loadState returns empty state for invalid input and migrates JSON strings", () => {
  const empty = loadState("not json", { now: FIXED_NOW });
  assert.equal(empty.schemaVersion, 8);
  assert.deepEqual(empty.armies, []);

  const loaded = loadState(
    JSON.stringify({
      armies: [{ classId: "cavalry", size: 20, str: 10 }],
      settings: { assistHinderEnabled: false }
    }),
    { now: FIXED_NOW, idFactory: FIXED_ID, validClassIds: VALID_CLASS_IDS }
  );

  assert.equal(loaded.armies.length, 1);
  assert.equal(loaded.settings.assistHinderEnabled, false);
});
