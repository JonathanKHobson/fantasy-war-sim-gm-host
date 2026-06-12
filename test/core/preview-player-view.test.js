import test from "node:test";
import assert from "node:assert/strict";

import { computePreview } from "../../src/game-core/preview.js";
import { toPlayerView } from "../../src/game-core/player-view.js";

test("computePreview projects normalized saved and runtime state into a concise summary", () => {
  const preview = computePreview({
    saved: {
      schemaVersion: 8,
      armies: [{ id: "a1", name: "Vanguard", faction: "Alliance", classId: "cavalry", size: 120, str: 40 }],
      battleHistory: [{ id: "h1", attacker: { name: "Vanguard" }, defender: { name: "Raiders" }, outcome: "attacker_win", turnNumber: 2, battleIndexInTurn: 1 }],
      war: { resources: { cp: 3, supply: 1, morale: -1, influence: 2 }, factionRelations: { alliance: "ally", raiders: "enemy" } },
      weather: { tag: "CLEAR", intensity: 1 },
      settings: { resolutionMode: "risk", dicePoolMode: "threePool" }
    },
    runtime: {
      attacker: { classId: "cavalry", size: 120, str: 40 },
      defender: { classId: "pikes", size: 100, str: 30 },
      weather: { tag: "RAIN", intensity: 2 },
      runtimeSession: { sessionLabel: "Battle Session", battleTurn: 3, battleIndexInTurn: 1 }
    }
  });

  assert.equal(preview.armies.length, 1);
  assert.equal(preview.battle.attacker.classId, "cavalry");
  assert.equal(preview.battle.session.battleTurn, 3);
  assert.equal(preview.war.relationCounts.enemy, 1);
});

test("toPlayerView strips the snapshot down to player-safe data plus session state", () => {
  const snapshot = toPlayerView({
    saved: {
      armies: [{ id: "a1", name: "Vanguard", faction: "Alliance", classId: "cavalry", size: 120, str: 40, notes: "GM note" }],
      battleHistory: [],
      war: { resources: { cp: 2, supply: 0, morale: 1, influence: 1 }, factionRelations: { alliance: "ally" } }
    },
    runtime: {
      attacker: { classId: "cavalry", size: 120, str: 40 },
      defender: { classId: "pikes", size: 80, str: 30 }
    },
    session: {
      sessionId: "host-1",
      sessionCode: "ABC123",
      status: "running_public",
      verificationStatus: "verified",
      mode: "public",
      connectedCount: 1,
      localOrigin: "http://127.0.0.1:4000",
      localPlayerUrl: "http://127.0.0.1:4000/player",
      publicOrigin: "https://sample.trycloudflare.com",
      publicPlayerUrl: "https://sample.trycloudflare.com/player",
      publicConfigured: true,
      configuredHostname: "sample.trycloudflare.com",
      setupStatus: "configured",
      tunnelStatus: "running",
      players: [{ playerId: "p1", playerName: "Dana", ready: true, latestSubmission: "Charge", viewMode: "simulator", lastStateAt: "2026-03-08T12:00:00.000Z" }]
    }
  });

  assert.equal(snapshot.session.sessionCode, "ABC123");
  assert.equal(snapshot.session.status, "running_public");
  assert.equal(snapshot.session.verificationStatus, "verified");
  assert.equal(snapshot.session.mode, "public");
  assert.equal(snapshot.session.publicConfigured, true);
  assert.equal(snapshot.session.configuredHostname, "sample.trycloudflare.com");
  assert.equal(snapshot.session.players[0].playerName, "Dana");
  assert.equal(snapshot.session.players[0].latestSubmission, "Charge");
  assert.equal(snapshot.session.players[0].viewMode, "simulator");
  assert.equal(snapshot.armies[0].name, "Vanguard");
  assert.equal(snapshot.armies[0].notes, undefined);
});
