import { uuid } from "./utils.js";
import { WEATHER_META } from "./weather.js";

export const NEARBY_RANGE = ["adjacent", "one_space", "two_spaces", "same_location"];

export function defaultAssistContext() {
  return {
    homeTerritory: false,
    forestEnvironment: false,
    cityFortChoke: false,
    flankedByTwoEnemies: false,
    enemyHasIntelOnHidden: false,
    selfHiddenOrSurprising: false
  };
}

export function normalizeAssistContext(context) {
  const normalized = Object.assign(defaultAssistContext(), context || {});
  normalized.homeTerritory = !!normalized.homeTerritory;
  normalized.forestEnvironment = !!normalized.forestEnvironment;
  normalized.cityFortChoke = !!normalized.cityFortChoke;
  normalized.flankedByTwoEnemies = !!normalized.flankedByTwoEnemies;
  normalized.enemyHasIntelOnHidden = !!normalized.enemyHasIntelOnHidden;
  normalized.selfHiddenOrSurprising = !!normalized.selfHiddenOrSurprising;
  return normalized;
}

export function defaultAssistRuntime() {
  return {
    queuedSiegePrep: false
  };
}

export function normalizeAssistRuntime(runtime) {
  const normalized = Object.assign(defaultAssistRuntime(), runtime || {});
  normalized.queuedSiegePrep = !!normalized.queuedSiegePrep;
  return normalized;
}

export function normalizeNearbyRange(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (NEARBY_RANGE.includes(normalized)) return normalized;
  if (normalized === "1_space") return "one_space";
  if (normalized === "2_spaces") return "two_spaces";
  return "one_space";
}

export function normalizeNearbyEntryChoice(actionId, choice) {
  if (actionId !== "battlefield_weavers_zone") return {};
  const weatherTag = String(choice?.weatherTag || "").trim().toUpperCase();
  return WEATHER_META[weatherTag] ? { weatherTag } : {};
}

export function sanitizeNearbyEntry(rawEntry, options = {}) {
  if (!rawEntry || typeof rawEntry !== "object") return null;
  const armyId = String(rawEntry.armyId || "").trim();
  if (!armyId) return null;
  const idFactory = options.idFactory || uuid;
  const actionId = String(rawEntry.actionId || "").trim();
  return {
    id: String(rawEntry.id || "").trim() || idFactory(),
    armyId,
    range: normalizeNearbyRange(rawEntry.range),
    actionId,
    hidden: !!rawEntry.hidden,
    notes: String(rawEntry.notes || "").trim(),
    choice: normalizeNearbyEntryChoice(actionId, rawEntry.choice || {})
  };
}

export function normalizeNearbyEntryList(list, options = {}) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const entry = sanitizeNearbyEntry(item, options);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    normalized.push(entry);
  }
  return normalized;
}

export function defaultAssistSideDraft() {
  return {
    assistNearby: [],
    hinderNearby: [],
    context: defaultAssistContext(),
    runtime: defaultAssistRuntime()
  };
}

export function normalizeAssistSideDraft(sideDraft, options = {}) {
  const normalized = Object.assign(defaultAssistSideDraft(), sideDraft || {});
  normalized.assistNearby = normalizeNearbyEntryList(normalized.assistNearby, options);
  normalized.hinderNearby = normalizeNearbyEntryList(normalized.hinderNearby, options);
  normalized.context = normalizeAssistContext(normalized.context);
  normalized.runtime = normalizeAssistRuntime(normalized.runtime);
  return normalized;
}

export function defaultAssistHinderDraft() {
  return {
    attacker: defaultAssistSideDraft(),
    defender: defaultAssistSideDraft()
  };
}

export function normalizeAssistHinderDraft(draft, options = {}) {
  const normalized = Object.assign(defaultAssistHinderDraft(), draft || {});
  normalized.attacker = normalizeAssistSideDraft(normalized.attacker, options);
  normalized.defender = normalizeAssistSideDraft(normalized.defender, options);
  return normalized;
}

export function normalizeBattleDraft(draft, options = {}) {
  const normalized = Object.assign({}, draft || {});
  normalized.assistHinder = normalizeAssistHinderDraft(normalized.assistHinder, options);
  return normalized;
}
