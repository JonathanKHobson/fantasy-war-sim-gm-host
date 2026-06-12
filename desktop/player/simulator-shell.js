const params = new URLSearchParams(window.location.search);
const storageKey = "fantasy-war-sim-player-session";
const simConnectionState = document.getElementById("simConnectionState");
const simSessionState = document.getElementById("simSessionState");
const simNotice = document.getElementById("simNotice");
const backToRoomButton = document.getElementById("backToRoomButton");
const simulatorFrame = document.getElementById("simulatorFrame");

const savedPlayer = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
const state = {
  ws: null,
  connected: false,
  joined: false,
  playerId: savedPlayer.playerId || "",
  playerName: savedPlayer.playerName || "",
  sessionCode: params.get("code") || savedPlayer.sessionCode || "",
  latestEnvelope: null,
  lastSimPayload: "",
  lastAppliedSimPayload: "",
  syncTimer: null
};

function serializePayload(payload) {
  return JSON.stringify(payload || { saved: null, runtime: null });
}

function setNotice(tone, text) {
  simNotice.textContent = text;
  simNotice.className = `sim-notice ${tone}`;
}

function render() {
  simConnectionState.textContent = state.connected ? "Connected" : "Disconnected";
  simConnectionState.className = `pill ${state.connected ? "" : "muted"}`.trim();
  simSessionState.textContent = state.joined ? `Session ${state.sessionCode}` : "Join required";
  simSessionState.className = `pill ${state.joined ? "" : "muted"}`.trim();
}

function send(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({
    type,
    sessionCode: state.sessionCode.trim().toUpperCase(),
    playerId: state.playerId,
    payload
  }));
}

function readFrameRuntime(child) {
  try {
    const runtimeJson = child.eval(`(() => JSON.stringify({
      attacker: state ? {
        classId: state.attacker.classId,
        size: state.attacker.size,
        str: state.attacker.str,
        loadedArmyId: state.attacker.loadedArmyId,
        setupMode: state.attacker.setupMode,
        armyNameDraft: state.attacker.armyNameDraft
      } : null,
      defender: state ? {
        classId: state.defender.classId,
        size: state.defender.size,
        str: state.defender.str,
        loadedArmyId: state.defender.loadedArmyId,
        setupMode: state.defender.setupMode,
        armyNameDraft: state.defender.armyNameDraft
      } : null,
      weather: state ? state.weather : null,
      conditions: state ? state.conditions : null,
      lastResult: state ? state.lastResult : null,
      runtimeSession: {
        sessionId: typeof runtimeSessionId !== "undefined" ? runtimeSessionId : "",
        sessionStartedAt: typeof runtimeSessionStartedAt !== "undefined" ? runtimeSessionStartedAt : "",
        sessionLabel: typeof runtimeSessionLabel !== "undefined" ? runtimeSessionLabel : "",
        battleTurn: typeof runtimeBattleTurn !== "undefined" ? runtimeBattleTurn : 1,
        battleIndexInTurn: typeof runtimeBattleIndexInTurn !== "undefined" ? runtimeBattleIndexInTurn : 1
      }
    }))()`);
    return runtimeJson ? JSON.parse(runtimeJson) : null;
  } catch {
    return null;
  }
}

function captureSimulatorState() {
  try {
    const child = simulatorFrame.contentWindow;
    if (!child) return null;
    return {
      saved: child.localStorage?.getItem("warTableState") || null,
      runtime: readFrameRuntime(child)
    };
  } catch {
    return null;
  }
}

function applySimulatorState(payload) {
  try {
    const child = simulatorFrame.contentWindow;
    if (!child) return false;
    const serialized = JSON.stringify(payload || { saved: null, runtime: null });
    child.eval(`(() => {
      const incoming = ${serialized};
      if (incoming.saved) {
        try { localStorage.setItem("warTableState", incoming.saved); } catch {}
      }
      const nextSaved = loadPersisted();
      state.saved = nextSaved;
      state.saved.armies = (state.saved.armies || []).map(sanitizeArmyRecord).filter(Boolean);
      state.saved.battleHistory = state.saved.battleHistory || [];
      state.saved.war = normalizeWarState(state.saved.war);
      state.saved.settings = normalizeSettings(applyLegacyThemeSettingsBridge(state.saved.settings, state.saved.weather));
      state.saved.weather = normalizeWeatherV2(state.saved.weather);
      state.saved.battleDraft = normalizeBattleDraft(state.saved.battleDraft);
      recomputeFactions(state.saved);
      state.settings = Object.assign({}, state.saved.settings);
      state.weather = normalizeWeatherV2(state.saved.weather);
      const ahDraft = normalizeAssistHinderDraft(state.saved?.battleDraft?.assistHinder);
      for (const sideKey of ["attacker", "defender"]) {
        state[sideKey].assistNearby = cloneNearbyEntryList(ahDraft[sideKey].assistNearby);
        state[sideKey].hinderNearby = cloneNearbyEntryList(ahDraft[sideKey].hinderNearby);
        state[sideKey].assistContext = normalizeAssistContext(ahDraft[sideKey].context);
        state[sideKey].assistRuntime = normalizeAssistRuntime(ahDraft[sideKey].runtime);
      }
      const runtime = incoming.runtime && typeof incoming.runtime === "object" ? incoming.runtime : {};
      state.attacker.classId = runtime.attacker?.classId || null;
      state.attacker.size = runtime.attacker?.size ?? null;
      state.attacker.str = runtime.attacker?.str ?? null;
      state.attacker.loadedArmyId = runtime.attacker?.loadedArmyId || null;
      state.attacker.setupMode = runtime.attacker?.setupMode || "chooser";
      state.attacker.armyNameDraft = runtime.attacker?.armyNameDraft || "";
      state.defender.classId = runtime.defender?.classId || null;
      state.defender.size = runtime.defender?.size ?? null;
      state.defender.str = runtime.defender?.str ?? null;
      state.defender.loadedArmyId = runtime.defender?.loadedArmyId || null;
      state.defender.setupMode = runtime.defender?.setupMode || "chooser";
      state.defender.armyNameDraft = runtime.defender?.armyNameDraft || "";
      state.conditions = runtime.conditions && typeof runtime.conditions === "object" ? runtime.conditions : { defenderHasStructures: false };
      state.weather = normalizeWeatherV2(runtime.weather || state.saved.weather);
      state.lastResult = runtime.lastResult && typeof runtime.lastResult === "object" ? runtime.lastResult : null;
      runtimeSessionId = String(runtime.runtimeSession?.sessionId || "");
      runtimeSessionStartedAt = String(runtime.runtimeSession?.sessionStartedAt || "");
      runtimeSessionLabel = String(runtime.runtimeSession?.sessionLabel || "");
      runtimeBattleTurn = Math.max(1, toInt(runtime.runtimeSession?.battleTurn) ?? 1);
      runtimeBattleIndexInTurn = Math.max(1, toInt(runtime.runtimeSession?.battleIndexInTurn) ?? 1);
      if (typeof refreshArmyFactionAndLoaders === "function") refreshArmyFactionAndLoaders();
      if (typeof applyHashTabRoute === "function") applyHashTabRoute();
      render();
      if (typeof renderHistoryList === "function") renderHistoryList();
      return true;
    })()`);
    return true;
  } catch {
    return false;
  }
}

async function pushSimulatorState(force = false) {
  const payload = captureSimulatorState();
  if (!payload) return;
  const serialized = serializePayload(payload);
  if (!force && serialized === state.lastSimPayload) return;
  state.lastSimPayload = serialized;
  send("push_sim_state", payload);
}

function startSyncLoop() {
  if (state.syncTimer) window.clearInterval(state.syncTimer);
  state.syncTimer = window.setInterval(() => {
    void pushSimulatorState(false);
  }, 1200);
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  state.ws = new WebSocket(`${protocol}://${window.location.host}/ws`);

  state.ws.addEventListener("open", () => {
    state.connected = true;
    render();
    if (!state.playerId || !state.playerName || !state.sessionCode) {
      setNotice("error", "Player identity is missing. Returning to the room page.");
      setTimeout(() => {
        window.location.href = `${window.location.origin}/player?code=${encodeURIComponent(state.sessionCode || "")}`;
      }, 900);
      return;
    }
    send("join_session", { playerName: state.playerName });
    send("set_view_mode", { viewMode: "simulator" });
    setNotice("info", "Joining the shared simulator…");
  });

  state.ws.addEventListener("close", () => {
    state.connected = false;
    state.joined = false;
    render();
    setNotice("error", "Connection lost. Reconnecting to the session…");
    setTimeout(connect, 1200);
  });

  state.ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "host_status") {
      const me = (message.payload.players || []).find((player) => player.playerId === state.playerId);
      if (me) {
        state.joined = true;
      }
      render();
    }
    if (message.type === "sim_state_updated") {
      state.latestEnvelope = message.payload;
      if (!state.latestEnvelope?.payload) return;
      const serialized = serializePayload(state.latestEnvelope.payload);
      if (message.payload.sourcePlayerId === state.playerId && serialized === state.lastSimPayload) {
        state.lastAppliedSimPayload = serialized;
        return;
      }
      if (serialized !== state.lastAppliedSimPayload) {
        if (applySimulatorState(state.latestEnvelope.payload)) {
          state.lastAppliedSimPayload = serialized;
          state.lastSimPayload = serialized;
        }
      }
    }
    if (message.type === "command_result" && message.payload.type === "join_session") {
      state.joined = true;
      render();
      setNotice("success", "Connected to the live shared simulator.");
    }
    if (message.type === "error") {
      setNotice("error", message.payload.message);
    }
  });
}

simulatorFrame.addEventListener("load", () => {
  if (state.latestEnvelope?.payload) {
    const serialized = serializePayload(state.latestEnvelope.payload);
    if (applySimulatorState(state.latestEnvelope.payload)) {
      state.lastAppliedSimPayload = serialized;
      state.lastSimPayload = serialized;
    }
  }
  startSyncLoop();
  void pushSimulatorState(true);
});

backToRoomButton.addEventListener("click", () => {
  send("set_view_mode", { viewMode: "room" });
  window.location.href = `${window.location.origin}/player?code=${encodeURIComponent(state.sessionCode)}`;
});

window.addEventListener("beforeunload", () => {
  if (state.syncTimer) window.clearInterval(state.syncTimer);
  send("set_view_mode", { viewMode: "room" });
});

simulatorFrame.src = `${window.location.origin}/player/simulator/app/?code=${encodeURIComponent(state.sessionCode)}`;
connect();
render();
