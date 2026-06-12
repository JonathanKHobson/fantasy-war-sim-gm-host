import test from "node:test";
import assert from "node:assert/strict";

import WebSocket from "ws";

import { LocalHostService } from "../../electron/local-host-service.mjs";

async function readText(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") || ""
  };
}

test("LocalHostService serves a session, tracks view mode, and broadcasts shared simulator state", async () => {
  const service = new LocalHostService({ port: 0 });
  service.updateGmState({
    saved: {
      armies: [{ id: "a1", name: "Vanguard", faction: "Alliance", classId: "cavalry", size: 120, str: 40 }],
      battleHistory: [],
      war: { resources: { cp: 2, supply: 0, morale: 1, influence: 1 } }
    },
    runtime: {
      attacker: { classId: "cavalry", size: 120, str: 40 },
      defender: { classId: "pikes", size: 80, str: 30 }
    }
  });

  const status = await service.start();
  assert.equal(status.status, "running_local");
  assert.match(status.localPlayerUrl, /^http:\/\/127\.0\.0\.1:\d+\/player$/);

  const wsUrl = status.localPlayerUrl.replace(/^http/, "ws").replace(/\/player$/, "/ws");
  const messages = [];
  const socket = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  socket.on("message", (data) => {
    messages.push(JSON.parse(String(data)));
  });

  socket.send(JSON.stringify({
    type: "join_session",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: { playerName: "Dana" }
  }));

  socket.send(JSON.stringify({
    type: "set_ready",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: { ready: true }
  }));

  socket.send(JSON.stringify({
    type: "submit_choice",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: { choice: "Hold the line" }
  }));

  socket.send(JSON.stringify({
    type: "set_view_mode",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: { viewMode: "simulator" }
  }));

  socket.send(JSON.stringify({
    type: "push_sim_state",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: {
      saved: JSON.stringify({
        schemaVersion: 8,
        armies: [{ id: "a1", name: "Vanguard", faction: "Alliance", classId: "cavalry", size: 125, str: 40 }],
        battleHistory: []
      }),
      runtime: {
        attacker: { classId: "cavalry", size: 125, str: 40 },
        defender: { classId: "pikes", size: 80, str: 30 },
        runtimeSession: { sessionLabel: "Dana Session", battleTurn: 4, battleIndexInTurn: 1 }
      }
    }
  }));

  socket.send(JSON.stringify({
    type: "request_refresh",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: {}
  }));

  await new Promise((resolve) => setTimeout(resolve, 300));

  const nextStatus = service.getStatus();
  assert.equal(nextStatus.players[0].playerName, "Dana");
  assert.equal(nextStatus.players[0].ready, true);
  assert.equal(nextStatus.players[0].latestSubmission, "Hold the line");
  assert.equal(nextStatus.players[0].viewMode, "simulator");
  assert.ok(nextStatus.players[0].lastStateAt);
  assert.equal(nextStatus.connectedCount, 1);
  assert.ok(messages.some((message) => message.type === "player_snapshot"));
  assert.ok(messages.some((message) => message.type === "host_status"));
  assert.ok(messages.some((message) => message.type === "sim_state_updated"));
  assert.equal(service.latestGmState.runtime.runtimeSession.sessionLabel, "Dana Session");

  socket.close();
  await service.stop();
});

test("LocalHostService keeps room and simulator tabs under one player identity", async () => {
  const service = new LocalHostService({ port: 0 });
  const status = await service.start();
  const wsUrl = status.localPlayerUrl.replace(/^http/, "ws").replace(/\/player$/, "/ws");

  const roomSocket = new WebSocket(wsUrl);
  const simSocket = new WebSocket(wsUrl);

  await Promise.all([
    new Promise((resolve, reject) => {
      roomSocket.once("open", resolve);
      roomSocket.once("error", reject);
    }),
    new Promise((resolve, reject) => {
      simSocket.once("open", resolve);
      simSocket.once("error", reject);
    })
  ]);

  const joinPayload = {
    type: "join_session",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: { playerName: "Dana" }
  };
  roomSocket.send(JSON.stringify(joinPayload));
  simSocket.send(JSON.stringify(joinPayload));
  simSocket.send(JSON.stringify({
    type: "set_view_mode",
    sessionCode: status.sessionCode,
    playerId: "player-1",
    payload: { viewMode: "simulator" }
  }));

  await new Promise((resolve) => setTimeout(resolve, 200));

  const joined = service.getStatus();
  assert.equal(joined.connectedCount, 1);
  assert.equal(joined.players[0].viewMode, "simulator");

  simSocket.close();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const afterClose = service.getStatus();
  assert.equal(afterClose.connectedCount, 1);
  assert.equal(afterClose.players[0].viewMode, "room");

  roomSocket.close();
  await service.stop();
});

test("LocalHostService serves hosted simulator entry routes before simulator assets", async () => {
  const service = new LocalHostService({ port: 0 });
  const status = await service.start();
  const origin = status.localOrigin;

  const simulatorShell = await readText(`${origin}/player/simulator`);
  const simulatorEntry = await readText(`${origin}/player/simulator/app`);
  const simulatorEntrySlash = await readText(`${origin}/player/simulator/app/`);
  const simulatorAsset = await readText(`${origin}/player/simulator/app/assets/css/war-table-theme.css`);

  assert.equal(simulatorShell.status, 200);
  assert.match(simulatorShell.contentType, /^text\/html\b/);
  assert.match(simulatorShell.body, /Live Shared Simulator/);

  assert.equal(simulatorEntry.status, 200);
  assert.match(simulatorEntry.contentType, /^text\/html\b/);
  assert.match(simulatorEntry.body, /Fantasy War Sim/i);
  assert.doesNotMatch(simulatorEntry.body, /^Not found$/);

  assert.equal(simulatorEntrySlash.status, 200);
  assert.match(simulatorEntrySlash.contentType, /^text\/html\b/);
  assert.match(simulatorEntrySlash.body, /Fantasy War Sim/i);
  assert.doesNotMatch(simulatorEntrySlash.body, /^Not found$/);

  assert.equal(simulatorAsset.status, 200);
  assert.match(simulatorAsset.contentType, /^text\/css\b/);
  assert.match(simulatorAsset.body, /--parchment-|body|:root/);

  await service.stop();
});
