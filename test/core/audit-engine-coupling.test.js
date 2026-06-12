import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeFile } from "../../scripts/audit-engine-coupling.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceFile = path.resolve(__dirname, "../../reference/fantasy-war-sim.html");

test("reference app audit captures the known extraction hotspots", () => {
  const report = analyzeFile(sourceFile);

  assert.equal(report.documentReferenceCount, 36);
  assert.equal(report.runBattleRound.sideEffectCounts.domLookup, 5);
  assert.equal(report.runBattleRound.sideEffectCounts.render, 3);
  assert.equal(report.runBattleRound.sideEffectCounts.persistWeather, 2);
  assert.equal(report.runBattleRound.sideEffectCounts.renderResult, 1);
  assert.equal(report.runBattleRound.sideEffectCounts.appendHistory, 1);
  assert.equal(report.runBattleRound.sideEffectCounts.setLiveMessage, 1);
  assert.equal(report.runBattleRound.sideEffectCounts.showToast, 0);
});
