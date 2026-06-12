const params = new URLSearchParams(window.location.search);
const storageKey = "fantasy-war-sim-player-session";
const connectionState = document.getElementById("connectionState");
const sessionCodeInput = document.getElementById("sessionCode");
const playerNameInput = document.getElementById("playerName");
const joinButton = document.getElementById("joinButton");
const refreshButton = document.getElementById("refreshButton");
const playerNotice = document.getElementById("playerNotice");
const roomCard = document.getElementById("roomCard");
const readyState = document.getElementById("readyState");
const sessionSummaryText = document.getElementById("sessionSummaryText");
const readyButton = document.getElementById("readyButton");
const choiceText = document.getElementById("choiceText");
const submitChoiceButton = document.getElementById("submitChoiceButton");
const simulatorCard = document.getElementById("simulatorCard");
const simulatorStatusPill = document.getElementById("simulatorStatusPill");
const openSimulatorButton = document.getElementById("openSimulatorButton");
const battleSnapshot = document.getElementById("battleSnapshot");
const warSnapshot = document.getElementById("warSnapshot");
const historySnapshot = document.getElementById("historySnapshot");
const playerList = document.getElementById("playerList");
const playerCountPill = document.getElementById("playerCountPill");
const snapshotMeta = document.getElementById("snapshotMeta");

const savedPlayer = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
const state = {
  ws: null,
  connected: false,
  joined: false,
  playerId: savedPlayer.playerId || crypto.randomUUID(),
  playerName: savedPlayer.playerName || "",
  ready: false,
  hostStatus: null,
  playerSnapshot: null,
  noticeTone: "info",
  noticeText: "Waiting for the host connection.",
  reconnectJoin: false,
  simulatorWindow: null,
  openedSimulatorOnce: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

sessionCodeInput.value = params.get("code") || savedPlayer.sessionCode || "";
playerNameInput.value = state.playerName;

function persistPlayer() {
  window.localStorage.setItem(storageKey, JSON.stringify({
    playerId: state.playerId,
    playerName: playerNameInput.value.trim(),
    sessionCode: sessionCodeInput.value.trim().toUpperCase()
  }));
}

function setNotice(tone, text) {
  state.noticeTone = tone;
  state.noticeText = text;
}

function renderBattleSnapshot(snapshot) {
  const battle = snapshot?.battle;
  if (!battle) {
    battleSnapshot.innerHTML = '<div class="snapshot-card">Waiting for GM state.</div>';
    return;
  }

  battleSnapshot.innerHTML = `
    <div class="snapshot-card">
      <strong>Weather</strong>
      <div>${escapeHtml(battle.weatherLabel)}</div>
      <div>Session: ${escapeHtml(battle.session.sessionLabel || "No active runtime session yet")}</div>
      <div>Battle turn: ${escapeHtml(battle.session.battleTurn)}</div>
    </div>
    <div class="snapshot-card">
      <strong>Attacker</strong>
      <div>Class: ${escapeHtml(battle.attacker.classId || "Unset")}</div>
      <div>Size: ${escapeHtml(battle.attacker.size)}</div>
      <div>STR: ${escapeHtml(battle.attacker.str)}</div>
    </div>
    <div class="snapshot-card">
      <strong>Defender</strong>
      <div>Class: ${escapeHtml(battle.defender.classId || "Unset")}</div>
      <div>Size: ${escapeHtml(battle.defender.size)}</div>
      <div>STR: ${escapeHtml(battle.defender.str)}</div>
    </div>
  `;
}

function renderWarSnapshot(snapshot) {
  const war = snapshot?.war;
  if (!war) {
    warSnapshot.innerHTML = "";
    return;
  }
  warSnapshot.innerHTML = `
    <div class="snapshot-card">
      <strong>War resources</strong>
      <div>CP ${escapeHtml(war.resources.cp)} · Supply ${escapeHtml(war.resources.supply)} · Morale ${escapeHtml(war.resources.morale)} · Influence ${escapeHtml(war.resources.influence)}</div>
      <div>Allies ${escapeHtml(war.relationCounts.ally)} · Neutral ${escapeHtml(war.relationCounts.neutral)} · Enemies ${escapeHtml(war.relationCounts.enemy)}</div>
    </div>
  `;
}

function renderHistorySnapshot(snapshot) {
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  if (!history.length) {
    historySnapshot.innerHTML = '<div class="snapshot-card">No recent battle history.</div>';
    return;
  }
  historySnapshot.innerHTML = history.slice(0, 3).map((entry) => `
    <div class="snapshot-card">
      <strong>${escapeHtml(entry.attackerName)} vs ${escapeHtml(entry.defenderName)}</strong>
      <div>${escapeHtml(entry.outcome || "No outcome yet")} · ${escapeHtml(entry.weatherLabel || "No weather snapshot")}</div>
      <div>${escapeHtml(entry.sessionLabel || "Session")} · Turn ${escapeHtml(entry.turnNumber)}</div>
    </div>
  `).join("");
}

function renderPlayerList(hostStatus) {
  const players = Array.isArray(hostStatus?.players) ? hostStatus.players : [];
  playerCountPill.textContent = `${players.length} connected`;
  if (!players.length) {
    playerList.innerHTML = '<div class="player-row">No players connected yet.</div>';
    return;
  }

  playerList.innerHTML = players.map((player) => `
    <div class="player-row">
      <div class="player-row-top">
        <strong>${escapeHtml(player.playerName)}</strong>
        <span>${escapeHtml(player.viewMode === "simulator" ? "Simulator" : "Room")} · ${player.ready ? "Ready" : "Not ready"}</span>
      </div>
      <div class="player-row-copy">${escapeHtml(player.latestSubmission || "No shared plan yet.")}</div>
    </div>
  `).join("");
}

function render() {
  connectionState.textContent = state.connected ? "Connected" : "Disconnected";
  connectionState.className = `pill ${state.connected ? "" : "muted"}`.trim();
  readyState.textContent = state.ready ? "Ready" : "Not ready";
  readyState.className = `pill ${state.ready ? "" : "muted"}`.trim();
  playerNotice.textContent = state.noticeText;
  playerNotice.className = `notice ${state.noticeTone}`;
  roomCard.hidden = !state.joined;
  simulatorCard.hidden = !state.joined;
  snapshotMeta.textContent = state.playerSnapshot?.generatedAt || "Waiting for host";
  sessionSummaryText.textContent = state.hostStatus?.sessionCode
    ? `Session ${state.hostStatus.sessionCode} · ${state.hostStatus.connectedCount} connected`
    : "Waiting for host session.";

  joinButton.disabled = !state.connected;
  refreshButton.disabled = !state.connected;
  readyButton.disabled = !state.joined;
  submitChoiceButton.disabled = !state.joined;
  openSimulatorButton.disabled = !state.joined;

  const me = (state.hostStatus?.players || []).find((player) => player.playerId === state.playerId);
  const simulatorActive = me?.viewMode === "simulator";
  simulatorStatusPill.textContent = simulatorActive ? "Simulator active" : "Room only";
  simulatorStatusPill.className = `pill ${simulatorActive ? "" : "muted"}`.trim();
  openSimulatorButton.textContent = state.openedSimulatorOnce || simulatorActive ? "Open Another Simulator Tab" : "Open Simulator";

  renderBattleSnapshot(state.playerSnapshot);
  renderWarSnapshot(state.playerSnapshot);
  renderHistorySnapshot(state.playerSnapshot);
  renderPlayerList(state.hostStatus);
}

function send(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    setNotice("error", "The host connection is offline. Wait a moment and try again.");
    render();
    return;
  }
  state.ws.send(JSON.stringify({
    type,
    sessionCode: sessionCodeInput.value.trim().toUpperCase(),
    playerId: state.playerId,
    payload
  }));
}

function submitJoin() {
  persistPlayer();
  setNotice("info", "Joining the shared room…");
  send("join_session", { playerName: playerNameInput.value.trim() || "Player" });
  render();
}

function simulatorUrl() {
  const code = encodeURIComponent(sessionCodeInput.value.trim().toUpperCase());
  return `${window.location.origin}/player/simulator?code=${code}`;
}

function openSimulatorTab() {
  persistPlayer();
  state.openedSimulatorOnce = true;
  state.simulatorWindow = window.open(simulatorUrl(), "_blank", "noopener");
  if (state.simulatorWindow) {
    state.simulatorWindow.focus();
    setNotice("success", "Opened the full simulator in a new browser tab.");
  } else {
    setNotice("error", "The browser blocked the new tab. Allow pop-ups and try again.");
  }
  render();
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  state.ws = new WebSocket(`${protocol}://${window.location.host}/ws`);

  state.ws.addEventListener("open", () => {
    state.connected = true;
    setNotice("info", state.joined ? "Reconnected to the room." : "Connected to the host. Join when ready.");
    render();
    if (state.reconnectJoin && sessionCodeInput.value.trim() && playerNameInput.value.trim()) {
      state.reconnectJoin = false;
      submitJoin();
    }
  });

  state.ws.addEventListener("close", () => {
    state.connected = false;
    state.reconnectJoin = state.joined;
    state.joined = false;
    setNotice("error", "Connection lost. Reconnecting to the host…");
    render();
    setTimeout(connect, 1200);
  });

  state.ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "host_status") {
      state.hostStatus = message.payload;
      const me = (message.payload.players || []).find((player) => player.playerId === state.playerId);
      state.ready = !!me?.ready;
      if (me && document.activeElement !== choiceText) {
        choiceText.value = me.latestSubmission || "";
      }
      if (me && !state.joined) {
        state.joined = true;
      }
      render();
    }
    if (message.type === "player_snapshot") {
      state.playerSnapshot = message.payload;
      render();
    }
    if (message.type === "error") {
      setNotice("error", message.payload.message);
      render();
    }
    if (message.type === "command_result" && message.payload.type === "join_session") {
      state.joined = true;
      setNotice("success", "You joined the shared room. Open the simulator in a new tab whenever you want full control.");
      render();
    }
    if (message.type === "command_result" && message.payload.type === "submit_choice") {
      setNotice("success", "Your update is now on the team board.");
      render();
    }
    if (message.type === "command_result" && message.payload.type === "set_ready") {
      setNotice("success", state.ready ? "You are marked ready." : "You are marked not ready.");
      render();
    }
  });
}

joinButton.addEventListener("click", () => {
  submitJoin();
});

refreshButton.addEventListener("click", () => {
  send("request_refresh");
  setNotice("info", "Requested a fresh snapshot from the host.");
  render();
});

readyButton.addEventListener("click", () => {
  send("set_ready", { ready: !state.ready });
});

submitChoiceButton.addEventListener("click", () => {
  send("submit_choice", { submission: choiceText.value.trim() });
});

openSimulatorButton.addEventListener("click", () => {
  openSimulatorTab();
});

connect();
render();
