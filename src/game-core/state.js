import { defaultAssistHinderDraft, normalizeBattleDraft } from "./battle-draft.js";
import { sanitizeArmyList } from "./armies.js";
import { DEFAULT_APP_SETTINGS, applyLegacyThemeSettingsBridge, normalizeSettings } from "./settings.js";
import { DEFAULT_WEATHER, normalizeWeatherV2 } from "./weather.js";
import { normalizeName, nowIso, safeJsonParse } from "./utils.js";
import { normalizeWarState } from "./war.js";

export const STORAGE_KEY = "warTableState";
export const SCHEMA_VERSION = 8;

function runtimeOptions(options = {}) {
  return {
    now: options.now || nowIso,
    idFactory: options.idFactory,
    validClassIds: options.validClassIds
  };
}

export function createEmptyState(options = {}) {
  const { now } = runtimeOptions(options);
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now(),
    armies: [],
    factions: [],
    battleHistory: [],
    war: normalizeWarState(null, options),
    weather: normalizeWeatherV2(DEFAULT_WEATHER),
    settings: Object.assign({}, DEFAULT_APP_SETTINGS),
    battleDraft: { assistHinder: defaultAssistHinderDraft() }
  };
}

export function recomputeFactions(savedState) {
  const saved = savedState;
  const seen = new Map();
  for (const faction of saved.factions || []) {
    const value = String(faction || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  for (const army of saved.armies || []) {
    const faction = String(army?.faction || "").trim();
    if (!faction) continue;
    const key = faction.toLowerCase();
    if (!seen.has(key)) seen.set(key, faction);
  }
  saved.factions = Array.from(seen.values()).sort((left, right) => left.localeCompare(right));
  saved.war = normalizeWarState(saved.war, saved);
  for (const faction of saved.factions) {
    const key = normalizeName(faction);
    if (!key) continue;
    if (!Object.prototype.hasOwnProperty.call(saved.war.factionRelations, key)) {
      saved.war.factionRelations[key] = "neutral";
    }
  }
  return saved;
}

export function migrateState(rawState, options = {}) {
  const { now, validClassIds, idFactory } = runtimeOptions(options);
  if (!rawState || typeof rawState !== "object") return createEmptyState({ now, validClassIds, idFactory });
  const saved = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: rawState.updatedAt || now(),
    armies: sanitizeArmyList(rawState.armies, { now, validClassIds, idFactory }),
    factions: Array.isArray(rawState.factions) ? rawState.factions : [],
    battleHistory: Array.isArray(rawState.battleHistory) ? rawState.battleHistory : [],
    war: normalizeWarState(rawState.war, { now, idFactory }),
    weather: normalizeWeatherV2(rawState.weather),
    settings: normalizeSettings(applyLegacyThemeSettingsBridge(rawState.settings, rawState.weather)),
    battleDraft: normalizeBattleDraft(rawState.battleDraft, { idFactory })
  };
  return recomputeFactions(saved);
}

export function loadState(input, options = {}) {
  if (input === null || input === undefined || input === "") {
    return createEmptyState(options);
  }
  if (typeof input === "string") {
    const parsed = safeJsonParse(input);
    if (!parsed || typeof parsed !== "object") return createEmptyState(options);
    return migrateState(parsed, options);
  }
  if (typeof input !== "object") return createEmptyState(options);
  return migrateState(input, options);
}
