const frame = document.getElementById("gmAppFrame");
const aboutToggle = document.getElementById("aboutToggle");
const aboutPanel = document.getElementById("aboutPanel");
const openDataFolderButton = document.getElementById("openDataFolder");
const appVersion = document.getElementById("appVersion");
const appMode = document.getElementById("appMode");
const userDataPath = document.getElementById("userDataPath");
const startPublicHostButton = document.getElementById("startPublicHostButton");
const startHostButton = document.getElementById("startHostButton");
const stopHostButton = document.getElementById("stopHostButton");
const refreshHostButton = document.getElementById("refreshHostButton");
const copyInviteButton = document.getElementById("copyInviteButton");
const openPublicInviteButton = document.getElementById("openPublicInviteButton");
const hostPanelToggle = document.getElementById("hostPanelToggle");
const closeHostDrawerButton = document.getElementById("closeHostDrawerButton");
const hostDrawer = document.getElementById("hostDrawer");
const hostDrawerBackdrop = document.getElementById("hostDrawerBackdrop");
const hostStatusPill = document.getElementById("hostStatusPill");
const hostModeBadge = document.getElementById("hostModeBadge");
const hostSummaryText = document.getElementById("hostSummaryText");
const sessionCodeValue = document.getElementById("sessionCodeValue");
const publicUrlValue = document.getElementById("publicUrlValue");
const publicOriginValue = document.getElementById("publicOriginValue");
const localUrlValue = document.getElementById("localUrlValue");
const lanUrlValue = document.getElementById("lanUrlValue");
const tunnelStatusValue = document.getElementById("tunnelStatusValue");
const publicSetupStatusValue = document.getElementById("publicSetupStatusValue");
const configuredHostnameValue = document.getElementById("configuredHostnameValue");
const publicAccountIdInput = document.getElementById("publicAccountIdInput");
const publicTunnelIdInput = document.getElementById("publicTunnelIdInput");
const publicHostnameInput = document.getElementById("publicHostnameInput");
const publicCredentialsPathInput = document.getElementById("publicCredentialsPathInput");
const pickCredentialsButton = document.getElementById("pickCredentialsButton");
const savePublicConfigButton = document.getElementById("savePublicConfigButton");
const clearPublicConfigButton = document.getElementById("clearPublicConfigButton");
const publicConfigMessageValue = document.getElementById("publicConfigMessageValue");
const snapshotSyncValue = document.getElementById("snapshotSyncValue");
const connectedPlayersValue = document.getElementById("connectedPlayersValue");
const hostErrorValue = document.getElementById("hostErrorValue");
const hostPlayerList = document.getElementById("hostPlayerList");

let lastSyncPayload = "";
let syncTimer = null;
let unsubscribeHostEvents = null;
let unsubscribeSharedState = null;
let hostDrawerOpen = false;
let publicHostConfigState = {
  accountId: "",
  tunnelId: "",
  hostname: "",
  credentialsPath: "",
  publicConfigured: false,
  setupStatus: "missing",
  message: "Public hosting is not configured."
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function serializePayload(payload) {
  return JSON.stringify(payload || { saved: null, runtime: null });
}

function renderPublicConfig(config = publicHostConfigState) {
  publicAccountIdInput.value = config.accountId || "";
  publicTunnelIdInput.value = config.tunnelId || "";
  publicHostnameInput.value = config.hostname || "";
  publicCredentialsPathInput.value = config.credentialsPath || "";
  publicSetupStatusValue.textContent = config.setupStatus || "missing";
  configuredHostnameValue.textContent = config.hostname || "Not configured";
  publicConfigMessageValue.textContent = config.publicConfigured
    ? "Named tunnel backup is saved, but Quick Tunnel is still the default public-host path."
    : "Quick Tunnel starts immediately. Named setup is saved only as an advanced backup.";
}

function readPublicConfigForm() {
  return {
    accountId: publicAccountIdInput.value.trim(),
    tunnelId: publicTunnelIdInput.value.trim(),
    hostname: publicHostnameInput.value.trim(),
    credentialsPath: publicCredentialsPathInput.value.trim()
  };
}

function formatInviteUrl(playerUrl = "", sessionCode = "") {
  const baseUrl = String(playerUrl || "").trim();
  if (!baseUrl) return "";
  return `${baseUrl}?code=${encodeURIComponent(sessionCode || "")}`;
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
    const child = frame.contentWindow;
    if (!child) return null;
    const saved = child.localStorage?.getItem("warTableState") || null;
    return {
      saved,
      runtime: readFrameRuntime(child)
    };
  } catch {
    return null;
  }
}

function applySimulatorStateToFrame(payload) {
  try {
    const child = frame.contentWindow;
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

function setDrawerOpen(nextOpen) {
  hostDrawerOpen = !!nextOpen;
  hostDrawer.hidden = !hostDrawerOpen;
  hostDrawerBackdrop.hidden = !hostDrawerOpen;
  hostPanelToggle.setAttribute("aria-expanded", String(hostDrawerOpen));
  scheduleLayoutCheck();
}

function updateHostPanel(status = {}) {
  const rawStatus = status.status || "off";
  const tone = rawStatus === "running_public" || rawStatus === "running_local"
    ? "running"
    : rawStatus === "starting_local" || rawStatus === "starting_tunnel"
      ? "starting"
      : rawStatus === "error"
        ? "error"
        : "off";

  const statusLabels = {
    off: "Host Off",
    starting_local: "Starting Local Room",
    starting_tunnel: "Starting Public Tunnel",
    running_public: "Public Host Running",
    running_local: "Local Host Running",
    stopped: "Host Stopped",
    error: "Host Error"
  };
  hostStatusPill.textContent = statusLabels[rawStatus] || "Host Off";
  hostStatusPill.className = `status-pill status-${tone}`;

  const mode = status.mode === "public" ? "public" : "local";
  hostModeBadge.textContent = mode === "public" ? "Public" : "Local";
  hostModeBadge.className = `mode-badge mode-${mode}`;

  if (rawStatus === "running_public") {
    hostSummaryText.textContent = `Public room live for ${status.connectedCount || 0} players via Quick Tunnel.`;
  } else if (rawStatus === "running_local") {
    hostSummaryText.textContent = `Local room live for ${status.connectedCount || 0} players. Public hosting is off.`;
  } else if (rawStatus === "starting_local") {
    hostSummaryText.textContent = "Starting the local room service.";
  } else if (rawStatus === "starting_tunnel") {
    hostSummaryText.textContent = "Local room is up. Opening a public Quick Tunnel.";
  } else if (rawStatus === "error") {
    hostSummaryText.textContent = status.lastError || "Public hosting failed to start.";
  } else {
    hostSummaryText.textContent = "Hosting is off.";
  }

  sessionCodeValue.textContent = status.sessionCode || "Not started";
  publicUrlValue.textContent = rawStatus === "running_public"
    ? formatInviteUrl(status.publicPlayerUrl, status.sessionCode)
    : rawStatus === "starting_tunnel"
      ? "Opening Quick Tunnel"
      : "Not available";
  publicOriginValue.textContent = status.publicOrigin || status.candidatePublicOrigin || "Not available";
  localUrlValue.textContent = status.localPlayerUrl ? formatInviteUrl(status.localPlayerUrl, status.sessionCode) : "Not running";
  lanUrlValue.textContent = status.lanPlayerUrl ? formatInviteUrl(status.lanPlayerUrl, status.sessionCode) : "Not running";
  tunnelStatusValue.textContent = status.tunnelStatus || "Idle";
  publicSetupStatusValue.textContent = status.setupStatus || publicHostConfigState.setupStatus || "missing";
  configuredHostnameValue.textContent = status.configuredHostname || publicHostConfigState.hostname || "Not configured";
  snapshotSyncValue.textContent = status.latestSnapshotAt || "Waiting for first sync";
  connectedPlayersValue.textContent = `${status.connectedCount || 0} connected`;
  hostErrorValue.textContent = status.lastError || "None";
  publicConfigMessageValue.textContent = status.setupStatus === "configured"
    ? "Named tunnel backup is saved, but Quick Tunnel is still the default public-host path."
    : "Quick Tunnel starts immediately. Named setup is saved only as an advanced backup.";

  const hostBusy = ["starting_local", "starting_tunnel"].includes(rawStatus);
  startPublicHostButton.disabled = hostBusy || rawStatus === "running_public" || rawStatus === "running_local";
  startHostButton.disabled = hostBusy || rawStatus === "running_public" || rawStatus === "running_local";
  stopHostButton.disabled = rawStatus === "off" || rawStatus === "error";
  const publicInviteUrl = rawStatus === "running_public" ? formatInviteUrl(status.publicPlayerUrl, status.sessionCode) : "";
  copyInviteButton.disabled = !publicInviteUrl;
  openPublicInviteButton.disabled = !publicInviteUrl;

  const players = Array.isArray(status.players) ? status.players : [];
  if (!players.length) {
    hostPlayerList.innerHTML = '<div class="host-player-empty">No players connected.</div>';
    return;
  }

  hostPlayerList.innerHTML = players.map((player) => {
    const joinedAt = player.joinedAt ? new Date(player.joinedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "just now";
    const submission = player.latestSubmission || "No submission yet.";
    const viewMode = player.viewMode === "simulator" ? "Simulator" : "Room";
    return `
      <div class="host-player-row">
        <div class="host-player-top">
          <strong>${escapeHtml(player.playerName)}</strong>
          <span>${escapeHtml(viewMode)} · ${player.ready ? "Ready" : "Not ready"}</span>
        </div>
        <div class="host-player-meta">Joined ${escapeHtml(joinedAt)}</div>
        <div class="host-player-meta">${player.lastStateAt ? `Last simulator edit ${escapeHtml(new Date(player.lastStateAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}` : "No simulator edits yet"}</div>
        <div class="host-player-submission">${escapeHtml(submission)}</div>
      </div>
    `;
  }).join("");
}

function measureLayout() {
  const frameRect = frame.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const heightOkay = frameRect.height > viewportHeight * 0.45;
  const bottomGapOkay = Math.abs(viewportHeight - frameRect.bottom) <= 3;
  const drawerClosedOkay = hostDrawer.hidden || hostDrawer.getBoundingClientRect().width > 0;
  const okay = heightOkay && bottomGapOkay && drawerClosedOkay;
  window.gmHostDesktop?.emitSmokeSignal(okay ? "layout-ok" : "layout-fail", {
    viewportHeight,
    frameHeight: frameRect.height,
    frameBottom: frameRect.bottom,
    drawerHidden: hostDrawer.hidden
  });
  console.log(okay ? "GM_HOST_LAYOUT_OK" : `GM_HOST_LAYOUT_FAIL:${JSON.stringify({
    viewportHeight,
    frameHeight: frameRect.height,
    frameBottom: frameRect.bottom,
    drawerHidden: hostDrawer.hidden
  })}`);
}

function scheduleLayoutCheck() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      measureLayout();
    });
  });
}

async function syncSimulatorState(force = false) {
  const payload = captureSimulatorState();
  if (!payload) return;
  const serialized = serializePayload(payload);
  if (!force && serialized === lastSyncPayload) return;
  lastSyncPayload = serialized;
  await window.gmHostDesktop?.syncGmState(payload);
}

function startSyncLoop() {
  if (syncTimer) window.clearInterval(syncTimer);
  syncTimer = window.setInterval(() => {
    void syncSimulatorState(false);
  }, 1200);
}

async function loadAppInfo() {
  if (!window.gmHostDesktop) return;
  const [info, packaged, hostStatus, publicConfig] = await Promise.all([
    window.gmHostDesktop.getAppInfo(),
    window.gmHostDesktop.isPackaged(),
    window.gmHostDesktop.getHostStatus(),
    window.gmHostDesktop.getPublicHostConfig()
  ]);
  appVersion.textContent = info.version;
  appMode.textContent = packaged ? "Packaged app" : "Development app";
  userDataPath.textContent = info.userDataPath;
  publicHostConfigState = publicConfig || publicHostConfigState;
  renderPublicConfig(publicHostConfigState);
  updateHostPanel(hostStatus);
}

function toggleAbout() {
  const nextHidden = !aboutPanel.hidden;
  aboutPanel.hidden = nextHidden;
  aboutToggle.setAttribute("aria-expanded", String(!nextHidden));
  scheduleLayoutCheck();
}

aboutToggle.addEventListener("click", toggleAbout);
hostPanelToggle.addEventListener("click", () => {
  setDrawerOpen(!hostDrawerOpen);
});
closeHostDrawerButton.addEventListener("click", () => {
  setDrawerOpen(false);
});
hostDrawerBackdrop.addEventListener("click", () => {
  setDrawerOpen(false);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && hostDrawerOpen) {
    setDrawerOpen(false);
  }
});

openDataFolderButton.addEventListener("click", async () => {
  openDataFolderButton.disabled = true;
  try {
    await window.gmHostDesktop?.openUserDataDirectory();
  } finally {
    openDataFolderButton.disabled = false;
  }
});

startHostButton.addEventListener("click", async () => {
  startHostButton.disabled = true;
  try {
    const status = await window.gmHostDesktop?.startLocalHost();
    updateHostPanel(status);
    setDrawerOpen(true);
    await syncSimulatorState(true);
  } finally {
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  }
});

startPublicHostButton.addEventListener("click", async () => {
  startPublicHostButton.disabled = true;
  try {
    const status = await window.gmHostDesktop?.startPublicHost();
    updateHostPanel(status);
    setDrawerOpen(true);
    await syncSimulatorState(true);
  } finally {
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  }
});

pickCredentialsButton.addEventListener("click", async () => {
  pickCredentialsButton.disabled = true;
  try {
    const picked = await window.gmHostDesktop?.pickPublicHostCredentials();
    if (picked) {
      publicCredentialsPathInput.value = picked;
    }
  } finally {
    pickCredentialsButton.disabled = false;
  }
});

savePublicConfigButton.addEventListener("click", async () => {
  savePublicConfigButton.disabled = true;
  try {
    publicHostConfigState = await window.gmHostDesktop?.savePublicHostConfig(readPublicConfigForm()) || publicHostConfigState;
    renderPublicConfig(publicHostConfigState);
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } finally {
    savePublicConfigButton.disabled = false;
  }
});

clearPublicConfigButton.addEventListener("click", async () => {
  clearPublicConfigButton.disabled = true;
  try {
    publicHostConfigState = await window.gmHostDesktop?.clearPublicHostConfig() || publicHostConfigState;
    renderPublicConfig(publicHostConfigState);
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } finally {
    clearPublicConfigButton.disabled = false;
  }
});

stopHostButton.addEventListener("click", async () => {
  stopHostButton.disabled = true;
  try {
    const status = await window.gmHostDesktop?.stopLocalHost();
    updateHostPanel(status);
  } finally {
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  }
});

refreshHostButton.addEventListener("click", async () => {
  refreshHostButton.disabled = true;
  try {
    await syncSimulatorState(true);
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } finally {
    refreshHostButton.disabled = false;
  }
});

copyInviteButton.addEventListener("click", async () => {
  copyInviteButton.disabled = true;
  try {
    await window.gmHostDesktop?.copyInviteLink();
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } catch {
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } finally {
    copyInviteButton.disabled = false;
  }
});

openPublicInviteButton.addEventListener("click", async () => {
  openPublicInviteButton.disabled = true;
  try {
    await window.gmHostDesktop?.openInviteLink();
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } catch {
    updateHostPanel(await window.gmHostDesktop?.getHostStatus());
  } finally {
    openPublicInviteButton.disabled = false;
  }
});

frame.addEventListener("load", () => {
  window.gmHostDesktop?.emitSmokeSignal("ready");
  console.log("GM_HOST_SHELL_READY");
  scheduleLayoutCheck();
  startSyncLoop();
  void syncSimulatorState(true);
});

window.addEventListener("beforeunload", () => {
  if (unsubscribeHostEvents) unsubscribeHostEvents();
  if (unsubscribeSharedState) unsubscribeSharedState();
  if (syncTimer) window.clearInterval(syncTimer);
});

unsubscribeHostEvents = window.gmHostDesktop?.subscribeHostEvents((status) => {
  updateHostPanel(status);
});

unsubscribeSharedState = window.gmHostDesktop?.subscribeSharedState((message) => {
  if (!message?.payload || message.sourceOrigin === "gm") return;
  if (!applySimulatorStateToFrame(message.payload)) return;
  lastSyncPayload = serializePayload(message.payload);
});

void loadAppInfo();
