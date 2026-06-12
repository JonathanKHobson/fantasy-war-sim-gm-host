import { normalizeName, nowIso, toInt, uuid, clamp } from "./utils.js";
import {
  battleTurnDisplayLabel,
  weatherEffectSnapshot,
  weatherSnapshotLabel,
  weatherTurnDisplayLabel
} from "./weather.js";

export const WAR_RELATION_TYPES = ["ally", "neutral", "enemy"];

export const DEFAULT_WAR_RESOURCE_STATE = {
  cp: 0,
  supply: 0,
  morale: 0,
  influence: 0
};

export function normalizeWarRelation(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return WAR_RELATION_TYPES.includes(normalized) ? normalized : "neutral";
}

export function normalizeWarResources(resources) {
  const normalized = Object.assign({}, DEFAULT_WAR_RESOURCE_STATE, resources || {});
  normalized.cp = clamp(toInt(normalized.cp) ?? 0, 0, 10);
  normalized.supply = clamp(toInt(normalized.supply) ?? 0, -5, 5);
  normalized.morale = clamp(toInt(normalized.morale) ?? 0, -5, 5);
  normalized.influence = clamp(toInt(normalized.influence) ?? 0, -5, 5);
  return normalized;
}

export function normalizeWarWeatherHistoryEntry(entry, options = {}) {
  const idFactory = options.idFactory || uuid;
  const now = options.now || nowIso;
  const weather = weatherEffectSnapshot(entry?.weather || entry);
  return {
    id: String(entry?.id || "").trim() || idFactory(),
    ts: entry?.ts || now(),
    weather,
    weatherLabel: String(entry?.weatherLabel || weatherSnapshotLabel(weather)).trim() || weatherSnapshotLabel(weather),
    battleTurnLabel: String(entry?.battleTurnLabel || battleTurnDisplayLabel(entry?.battleTurnNumber)).trim()
      || battleTurnDisplayLabel(entry?.battleTurnNumber),
    weatherTurnLabel: String(entry?.weatherTurnLabel || weatherTurnDisplayLabel(weather)).trim()
      || weatherTurnDisplayLabel(weather)
  };
}

export function normalizeWarState(rawWar, options = {}) {
  const raw = rawWar && typeof rawWar === "object" ? rawWar : {};
  const relationBlob = raw.factionRelations && typeof raw.factionRelations === "object" ? raw.factionRelations : {};
  const factionRelations = {};
  for (const [key, value] of Object.entries(relationBlob)) {
    const normalizedKey = normalizeName(key);
    if (!normalizedKey) continue;
    factionRelations[normalizedKey] = normalizeWarRelation(value);
  }
  const weatherHistory = Array.isArray(raw.weatherHistory)
    ? raw.weatherHistory.map((entry) => normalizeWarWeatherHistoryEntry(entry, options)).slice(0, 12)
    : [];
  return {
    factionRelations,
    resources: normalizeWarResources(raw.resources),
    weatherHistory
  };
}
