import { clamp, toInt } from "./utils.js";
import { normalizeDamageType } from "./doctrines.js";

export const WEATHER_META = {
  CLEAR: { label: "Clear", emoji: "\u2600", group: "clear" },
  CLOUDY: { label: "Cloudy", emoji: "\u26C5", group: "cloud" },
  HEAVY_CLOUDS: { label: "Heavy Clouds", emoji: "\u2601", group: "cloud" },
  FOG: { label: "Fog/Mist", emoji: "\uD83C\uDF2B", group: "fog" },
  RAIN: { label: "Rain", emoji: "\uD83C\uDF27", group: "rain" },
  DOWNPOUR: { label: "Downpour", emoji: "\u26C8", group: "rain" },
  WIND: { label: "High Winds", emoji: "\uD83D\uDCA8", group: "wind" },
  THUNDERSTORM: { label: "Thunderstorm", emoji: "\u26A1", group: "storm" },
  COLD: { label: "Freezing Cold", emoji: "\uD83E\uDD76", group: "cold" },
  SNOW: { label: "Snow", emoji: "\u2744", group: "cold" },
  BLIZZARD: { label: "Blizzard", emoji: "\uD83C\uDF28", group: "cold" },
  DRY: { label: "Dry/Arid", emoji: "\uD83C\uDFDC", group: "dry" },
  HEAT: { label: "Scorching Heat", emoji: "\uD83D\uDD25", group: "dry" },
  SMOG: { label: "Smog/Ash Haze", emoji: "\uD83C\uDF11", group: "smog" },
  PHENOMENA: { label: "Phenomena", emoji: "\u2728", group: "weird" }
};

export const PHENOMENA_META = {
  ASHFALL: { label: "Ashfall", emoji: "\uD83C\uDF0B" },
  SOLAR_ECLIPSE: { label: "Solar Eclipse", emoji: "\uD83C\uDF11" },
  STRANGE_LIGHTS: { label: "Strange Lights", emoji: "\uD83C\uDF20" },
  METEOR_SHOWER: { label: "Meteor Shower", emoji: "\u2604" },
  MALEVOLENT_STORM: { label: "Malevolent Storm", emoji: "\u26A1" },
  WILD_MAGIC_STORM: { label: "Wild Magic Storm", emoji: "\uD83D\uDD2E" },
  MAGNETIC_STORM: { label: "Magnetic Storm", emoji: "\uD83E\uDDF2" },
  ELEMENTAL_DISTURBANCE: { label: "Elemental Disturbance", emoji: "\uD83C\uDF00" }
};

export const ELEMENTAL_SUBTYPE_POOL = [
  { subtypeLabel: "Acid", baseElement: "acid", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Cold", baseElement: "cold", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Fire", baseElement: "fire", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Lightning", baseElement: "lightning", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Thunder", baseElement: "thunder", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Radiant", baseElement: "radiant", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Force", baseElement: "force", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Necrotic", baseElement: "necrotic", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Poison", baseElement: "poison", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Psychic", baseElement: "psychic", multiplier: 1, variantType: "base" },
  { subtypeLabel: "Corrosive", baseElement: "acid", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Cryo", baseElement: "cold", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Inferno", baseElement: "fire", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Storm", baseElement: "lightning", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Shockwave", baseElement: "thunder", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Holy", baseElement: "radiant", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Arcane", baseElement: "force", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Death", baseElement: "necrotic", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Toxic", baseElement: "poison", multiplier: 2, variantType: "alias" },
  { subtypeLabel: "Mind", baseElement: "psychic", multiplier: 2, variantType: "alias" }
];

const ELEMENTAL_SUBTYPE_BY_KEY = Object.fromEntries(
  ELEMENTAL_SUBTYPE_POOL.map((subtype) => [
    subtype.subtypeLabel.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    subtype
  ])
);

export const DEFAULT_WEATHER = {
  tag: "CLEAR",
  intensity: 1,
  phenomena: null,
  elementalSubtype: null,
  wildMagicSubtypeLabel: null,
  wildMagicEvent: null,
  source: "manual",
  hour: 12,
  autoAdvance: true,
  phenomenaEnabled: true,
  phenomenaLockBattles: 2,
  phenomenaLockRemaining: 0,
  intensityDriftMode: "drift",
  intensityDriftWeights: { same: 0.55, up: 0.225, down: 0.225 },
  enablePhenomenaTheme: true,
  enableDefeatTheme: true,
  season: "spring",
  climate: "temperate",
  turnsPerSeason: 6,
  currentTurn: 1,
  lockSeason: false,
  lockWeather: false,
  dayStart: 6,
  nightStart: 18,
  phenomenaBaseChance: 2
};

export function normalizeWildMagicEvent(eventLike) {
  if (!eventLike || typeof eventLike !== "object") return null;
  const out = Object.assign({}, eventLike);
  const title = String(out.title || "").trim();
  const text = String(out.text || "").trim();
  if (!title && !text) return null;
  if (title) out.title = title;
  if (text) out.text = text;
  return out;
}

function wildMagicSubtypeFromEvent(eventLike) {
  if (!eventLike || typeof eventLike !== "object") return "";
  const title = String(eventLike.title || "").trim();
  if (title) return title;
  return String(eventLike.text || "").trim();
}

export function resolveWildMagicSubtypeLabel(options = {}) {
  const weatherUsed = options.weatherUsed || null;
  const fromWeather = String(weatherUsed?.wildMagicSubtypeLabel || "").trim();
  if (fromWeather) return fromWeather;
  const fromWeatherEvent = wildMagicSubtypeFromEvent(weatherUsed?.wildMagicEvent || null);
  if (fromWeatherEvent) return fromWeatherEvent;
  return wildMagicSubtypeFromEvent(options.wildMagicEvent || null);
}

export function normalizeElementalSubtype(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const key = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const match = ELEMENTAL_SUBTYPE_BY_KEY[key];
    return match ? Object.assign({}, match) : null;
  }
  const subtypeLabel = String(value.subtypeLabel || "").trim();
  const baseElement = normalizeDamageType(value.baseElement);
  const multiplier = clamp(toInt(value.multiplier) ?? 1, 1, 2);
  const variantType = multiplier > 1 ? "alias" : "base";
  if (!subtypeLabel || !baseElement) return null;
  return { subtypeLabel, baseElement, multiplier, variantType };
}

export function normalizeIntensityDriftMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return ["drift", "random", "locked"].includes(normalized) ? normalized : "drift";
}

export function normalizeWeatherV2(rawWeather) {
  const weather = Object.assign({}, DEFAULT_WEATHER, rawWeather || {});
  weather.tag = WEATHER_META[weather.tag] ? weather.tag : "CLEAR";
  weather.intensity = clamp(toInt(weather.intensity) ?? 1, 1, 3);
  weather.phenomena = weather.tag === "PHENOMENA" && PHENOMENA_META[String(weather.phenomena || "")]
    ? String(weather.phenomena)
    : null;
  weather.elementalSubtype = normalizeElementalSubtype(weather.elementalSubtype);
  weather.wildMagicEvent = normalizeWildMagicEvent(weather.wildMagicEvent);
  const seedWildLabel = String(weather.wildMagicSubtypeLabel || "").trim();
  weather.phenomenaLockBattles = clamp(toInt(weather.phenomenaLockBattles) ?? 2, 0, 20);
  weather.phenomenaLockRemaining = Math.max(0, toInt(weather.phenomenaLockRemaining) ?? 0);
  weather.intensityDriftMode = normalizeIntensityDriftMode(weather.intensityDriftMode);
  weather.intensityDriftWeights = Object.assign(
    {},
    DEFAULT_WEATHER.intensityDriftWeights,
    weather.intensityDriftWeights || {}
  );
  weather.enablePhenomenaTheme = weather.enablePhenomenaTheme !== false;
  weather.enableDefeatTheme = weather.enableDefeatTheme !== false;
  weather.autoAdvance = weather.autoAdvance !== false;
  weather.phenomenaEnabled = weather.phenomenaEnabled !== false;
  weather.turnsPerSeason = Math.max(1, toInt(weather.turnsPerSeason) || 6);
  weather.currentTurn = Math.max(1, toInt(weather.currentTurn) || 1);
  weather.dayStart = clamp(toInt(weather.dayStart) ?? 6, 0, 23);
  weather.nightStart = clamp(toInt(weather.nightStart) ?? 18, 0, 23);
  weather.phenomenaBaseChance = clamp(toInt(weather.phenomenaBaseChance) ?? 2, 0, 25);
  if (weather.tag === "PHENOMENA" && weather.phenomena === "ELEMENTAL_DISTURBANCE" && !weather.elementalSubtype) {
    weather.elementalSubtype = Object.assign({}, ELEMENTAL_SUBTYPE_POOL[0]);
  }
  if (weather.tag !== "PHENOMENA" || weather.phenomena !== "ELEMENTAL_DISTURBANCE") {
    weather.elementalSubtype = null;
  }
  if (weather.tag === "PHENOMENA" && weather.phenomena === "WILD_MAGIC_STORM") {
    const subtype = resolveWildMagicSubtypeLabel({
      weatherUsed: weather,
      wildMagicEvent: weather.wildMagicEvent || (seedWildLabel ? { title: seedWildLabel } : null)
    });
    if (subtype) weather.wildMagicSubtypeLabel = subtype;
    else delete weather.wildMagicSubtypeLabel;
  } else {
    weather.wildMagicEvent = null;
    delete weather.wildMagicSubtypeLabel;
  }
  return weather;
}

function isDay(weather) {
  return weather.hour >= weather.dayStart && weather.hour < weather.nightStart;
}

function seasonLabel(weather) {
  const season = String(weather?.season || DEFAULT_WEATHER.season);
  return season.charAt(0).toUpperCase() + season.slice(1);
}

function weatherLabel(weatherState) {
  const weather = normalizeWeatherV2(weatherState);
  if (weather.tag === "PHENOMENA" && weather.phenomena) {
    const phenomenon = PHENOMENA_META[weather.phenomena];
    if (!phenomenon) return `${weather.phenomena}`;
    if (weather.phenomena === "ELEMENTAL_DISTURBANCE" && weather.elementalSubtype?.subtypeLabel) {
      return `${phenomenon.emoji} ${phenomenon.label} (${weather.elementalSubtype.subtypeLabel})`;
    }
    if (weather.phenomena === "WILD_MAGIC_STORM") {
      const subtype = resolveWildMagicSubtypeLabel({ weatherUsed: weather });
      return subtype ? `${phenomenon.emoji} ${phenomenon.label} (${subtype})` : `${phenomenon.emoji} ${phenomenon.label}`;
    }
    return `${phenomenon.emoji} ${phenomenon.label}`;
  }
  const meta = WEATHER_META[weather.tag];
  return meta ? `${meta.emoji} ${meta.label}` : weather.tag;
}

export function weatherSnapshotLabel(weatherState) {
  const weather = Object.assign({}, DEFAULT_WEATHER, weatherState || {});
  return `${weatherLabel(weather)} (Intensity ${weather.intensity}) | ${isDay(weather) ? "Day" : "Night"} ${String(weather.hour).padStart(2, "0")}:00`;
}

export function battleTurnDisplayLabel(turnNumber) {
  const turn = Math.max(1, toInt(turnNumber) ?? 1);
  return `Battle Turn ${turn}`;
}

export function weatherTurnDisplayLabel(weatherState) {
  const weather = normalizeWeatherV2(weatherState || DEFAULT_WEATHER);
  return `${seasonLabel(weather)} | Weather Turn ${Math.max(1, toInt(weather.currentTurn) ?? 1)}`;
}

export function weatherEffectSnapshot(weatherState) {
  return normalizeWeatherV2(Object.assign({}, weatherState || {}));
}
