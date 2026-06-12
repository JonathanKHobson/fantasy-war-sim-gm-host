import { clamp, toInt } from "./utils.js";
import { normalizeWeatherV2 } from "./weather.js";

export const DEFAULT_APP_SETTINGS = {
  resolutionMode: "risk",
  quickLossPreset: "rulesAsWritten",
  dicePoolMode: "threePool",
  allowOverCap: false,
  overrideDoctrineEligibility: false,
  assistHinderEnabled: true,
  assistHinderDiceCap: 6,
  showWarReportModal: true,
  weatherThemesEnabled: true,
  phenomenaThemesEnabled: true,
  defeatThemesEnabled: true,
  themeStrengthMode: "subtle"
};

export function normalizeThemeStrengthMode(value) {
  return String(value || "").trim().toLowerCase() === "dramatic" ? "dramatic" : "subtle";
}

export function normalizeDicePoolMode(value) {
  return String(value || "").trim() === "legacy" ? "legacy" : "threePool";
}

export function normalizeQuickLossPreset(value) {
  return ["rulesAsWritten", "standard", "flat10", "flat20"].includes(String(value || ""))
    ? String(value)
    : "rulesAsWritten";
}

export function normalizeSettings(settings) {
  const normalized = Object.assign({}, DEFAULT_APP_SETTINGS, settings || {});
  normalized.resolutionMode = normalized.resolutionMode === "quick" ? "quick" : "risk";
  normalized.quickLossPreset = normalizeQuickLossPreset(normalized.quickLossPreset);
  normalized.dicePoolMode = normalizeDicePoolMode(normalized.dicePoolMode);
  normalized.allowOverCap = !!normalized.allowOverCap;
  normalized.overrideDoctrineEligibility = !!normalized.overrideDoctrineEligibility;
  normalized.assistHinderEnabled = normalized.assistHinderEnabled !== false;
  normalized.assistHinderDiceCap = clamp(toInt(normalized.assistHinderDiceCap) ?? 6, 0, 20);
  normalized.showWarReportModal = normalized.showWarReportModal !== false;
  normalized.weatherThemesEnabled = normalized.weatherThemesEnabled !== false;
  normalized.phenomenaThemesEnabled = normalized.phenomenaThemesEnabled !== false;
  normalized.defeatThemesEnabled = normalized.defeatThemesEnabled !== false;
  normalized.themeStrengthMode = normalizeThemeStrengthMode(normalized.themeStrengthMode);
  return normalized;
}

export function applyLegacyThemeSettingsBridge(rawSettings, rawWeather) {
  const settings = Object.assign({}, rawSettings || {});
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(settings, key);
  const weather = normalizeWeatherV2(rawWeather || {});
  if (!hasOwn("weatherThemesEnabled")) settings.weatherThemesEnabled = true;
  if (!hasOwn("phenomenaThemesEnabled")) settings.phenomenaThemesEnabled = weather.enablePhenomenaTheme !== false;
  if (!hasOwn("defeatThemesEnabled")) settings.defeatThemesEnabled = weather.enableDefeatTheme !== false;
  if (!hasOwn("themeStrengthMode")) settings.themeStrengthMode = "subtle";
  return settings;
}
