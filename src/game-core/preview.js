import { loadState } from "./state.js";
import { normalizeWeatherV2, weatherSnapshotLabel } from "./weather.js";
import { toInt } from "./utils.js";

function normalizeRuntimeSide(side) {
  const raw = side && typeof side === "object" ? side : {};
  return {
    classId: String(raw.classId || "").trim() || null,
    size: Math.max(0, toInt(raw.size) ?? 0),
    str: Math.max(0, toInt(raw.str) ?? 0),
    loadedArmyId: String(raw.loadedArmyId || "").trim() || null,
    setupMode: String(raw.setupMode || "").trim() || "chooser",
    armyNameDraft: String(raw.armyNameDraft || "").trim()
  };
}

function normalizeRuntimeBattle(runtime = {}) {
  const source = runtime && typeof runtime === "object" ? runtime : {};
  const session = source.runtimeSession && typeof source.runtimeSession === "object" ? source.runtimeSession : {};
  const weather = normalizeWeatherV2(source.weather);
  const lastResult = source.lastResult && typeof source.lastResult === "object" ? source.lastResult : null;
  return {
    attacker: normalizeRuntimeSide(source.attacker),
    defender: normalizeRuntimeSide(source.defender),
    conditions: source.conditions && typeof source.conditions === "object" ? source.conditions : {},
    weather,
    weatherLabel: weatherSnapshotLabel(weather),
    session: {
      sessionId: String(session.sessionId || "").trim(),
      sessionStartedAt: String(session.sessionStartedAt || "").trim(),
      sessionLabel: String(session.sessionLabel || "").trim(),
      battleTurn: Math.max(1, toInt(session.battleTurn) ?? 1),
      battleIndexInTurn: Math.max(1, toInt(session.battleIndexInTurn) ?? 1)
    },
    lastResult: lastResult
      ? {
          stopReason: String(lastResult.stopReason || "").trim() || null,
          phenomenaTriggered: !!lastResult.phenomenaTriggered,
          result: lastResult.result && typeof lastResult.result === "object" ? lastResult.result : null,
          weatherUsed: lastResult.weatherUsed || null,
          weatherAfter: lastResult.weatherAfter || null,
          triggeredPhenomenon: lastResult.triggeredPhenomenon || null,
          specialEffects: lastResult.specialEffects || null
        }
      : null
  };
}

function summarizeArmies(armies) {
  return armies.map((army) => ({
    id: army.id,
    name: army.name,
    faction: army.faction,
    classId: army.classId,
    size: army.size,
    str: army.str,
    originalSize: army.originalSize,
    originalStr: army.originalStr
  }));
}

function summarizeHistory(history) {
  return history.slice(-8).reverse().map((entry) => ({
    id: String(entry.id || "").trim() || null,
    outcome: String(entry.outcome || "").trim() || null,
    winner: String(entry.winner || "").trim() || null,
    attackerName: String(entry.attacker?.name || entry.attackerName || "Attacker").trim(),
    defenderName: String(entry.defender?.name || entry.defenderName || "Defender").trim(),
    attackerSizeAfter: Math.max(0, toInt(entry.newAtt ?? entry.attacker?.size ?? entry.attackerSizeAfter) ?? 0),
    defenderSizeAfter: Math.max(0, toInt(entry.newDef ?? entry.defender?.size ?? entry.defenderSizeAfter) ?? 0),
    sessionLabel: String(entry.sessionLabel || "").trim(),
    turnNumber: Math.max(1, toInt(entry.turnNumber) ?? 1),
    battleIndexInTurn: Math.max(1, toInt(entry.battleIndexInTurn) ?? 1),
    weatherLabel: entry.weatherUsed ? weatherSnapshotLabel(entry.weatherUsed) : null
  }));
}

function summarizeWar(saved) {
  const war = saved.war || {};
  const factionRelations = war.factionRelations && typeof war.factionRelations === "object" ? war.factionRelations : {};
  return {
    resources: war.resources || {},
    relationCounts: Object.values(factionRelations).reduce(
      (counts, relation) => {
        if (relation === "ally" || relation === "neutral" || relation === "enemy") counts[relation] += 1;
        return counts;
      },
      { ally: 0, neutral: 0, enemy: 0 }
    ),
    weatherHistory: Array.isArray(war.weatherHistory)
      ? war.weatherHistory.slice(0, 6).map((entry) => ({
          id: entry.id,
          weatherLabel: entry.weatherLabel,
          battleTurnLabel: entry.battleTurnLabel,
          weatherTurnLabel: entry.weatherTurnLabel
        }))
      : []
  };
}

export function computePreview(input = {}, options = {}) {
  const rawSaved = Object.prototype.hasOwnProperty.call(input, "saved") ? input.saved : input;
  const saved = loadState(rawSaved, options);
  const runtime = normalizeRuntimeBattle(input.runtime);

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    schemaVersion: saved.schemaVersion,
    updatedAt: saved.updatedAt,
    weather: {
      current: normalizeWeatherV2(saved.weather),
      label: weatherSnapshotLabel(saved.weather)
    },
    battle: runtime,
    armies: summarizeArmies(saved.armies || []),
    history: summarizeHistory(saved.battleHistory || []),
    war: summarizeWar(saved),
    settings: {
      resolutionMode: saved.settings?.resolutionMode || "risk",
      dicePoolMode: saved.settings?.dicePoolMode || "threePool",
      showWarReportModal: saved.settings?.showWarReportModal !== false
    }
  };
}
