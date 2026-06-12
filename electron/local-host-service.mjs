import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WebSocketServer } from "ws";

import { toPlayerView } from "../src/game-core/player-view.js";
import { uuid } from "../src/game-core/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const playerRoot = path.join(appRoot, "desktop", "player");
const referenceRoot = path.join(appRoot, "reference");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath)] || "text/plain; charset=utf-8";
}

function randomSessionCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pickLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "";
}

function normalizeViewMode(value) {
  return value === "simulator" ? "simulator" : "room";
}

export class LocalHostService {
  constructor(options = {}) {
    this.port = options.port || 0;
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onSharedStateChange = options.onSharedStateChange || (() => {});
    this.status = "off";
    this.verificationStatus = "idle";
    this.lastError = "";
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.participants = new Map();
    this.sessionId = "";
    this.sessionCode = "";
    this.localOrigin = "";
    this.localPlayerUrl = "";
    this.lanPlayerUrl = "";
    this.publicOrigin = "";
    this.publicPlayerUrl = "";
    this.candidatePublicOrigin = "";
    this.publicConfigured = false;
    this.configuredHostname = "";
    this.setupStatus = "missing";
    this.tunnelProvider = "none";
    this.fallbackAvailable = false;
    this.fallbackAttempted = false;
    this.fallbackStatus = "idle";
    this.hostMode = "local";
    this.tunnelStatus = "idle";
    this.latestGmState = null;
    this.latestPlayerView = null;
    this.latestSnapshotAt = "";
    this.latestStateMeta = {
      updatedAt: "",
      sourcePlayerId: "",
      sourceOrigin: ""
    };
  }

  getActiveConnectionsForPlayer(playerId) {
    return Array.from(this.clients.values()).filter((client) => client.joined && client.playerId === playerId);
  }

  ensureParticipant(playerId, playerName = "") {
    const existing = this.participants.get(playerId);
    if (existing) {
      if (playerName) existing.playerName = playerName;
      return existing;
    }
    const participant = {
      playerId,
      playerName: playerName || "Player",
      ready: false,
      latestSubmission: "",
      joinedAt: new Date().toISOString(),
      viewMode: "room",
      lastStateAt: ""
    };
    this.participants.set(playerId, participant);
    return participant;
  }

  refreshParticipantPresence(playerId) {
    const connections = this.getActiveConnectionsForPlayer(playerId);
    if (!connections.length) {
      this.participants.delete(playerId);
      return null;
    }

    const participant = this.ensureParticipant(playerId, connections[connections.length - 1].playerName);
    participant.playerName = connections[connections.length - 1].playerName || participant.playerName;
    participant.joinedAt = participant.joinedAt || connections[0].joinedAt || new Date().toISOString();
    participant.viewMode = connections.some((client) => client.viewMode === "simulator") ? "simulator" : "room";
    this.participants.set(playerId, participant);
    return participant;
  }

  getJoinedPlayers() {
    return Array.from(this.participants.values()).sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
  }

  getStatus() {
    return {
      status: this.status,
      verificationStatus: this.verificationStatus,
      sessionId: this.sessionId,
      sessionCode: this.sessionCode,
      mode: this.hostMode,
      localOrigin: this.localOrigin,
      localPlayerUrl: this.localPlayerUrl,
      lanPlayerUrl: this.lanPlayerUrl,
      publicOrigin: this.publicOrigin,
      candidatePublicOrigin: this.candidatePublicOrigin,
      publicPlayerUrl: this.publicPlayerUrl,
      publicConfigured: this.publicConfigured,
      configuredHostname: this.configuredHostname,
      setupStatus: this.setupStatus,
      tunnelProvider: this.tunnelProvider,
      fallbackAvailable: this.fallbackAvailable,
      fallbackAttempted: this.fallbackAttempted,
      fallbackStatus: this.fallbackStatus,
      tunnelStatus: this.tunnelStatus,
      connectedCount: this.getJoinedPlayers().length,
      players: this.getJoinedPlayers().map((player) => ({ ...player })),
      latestSnapshotAt: this.latestSnapshotAt,
      lastError: this.lastError
    };
  }

  getSharedStateEnvelope() {
    return {
      payload: this.latestGmState,
      updatedAt: this.latestStateMeta.updatedAt,
      sourcePlayerId: this.latestStateMeta.sourcePlayerId,
      sourceOrigin: this.latestStateMeta.sourceOrigin
    };
  }

  notifyStatus() {
    this.onStatusChange(this.getStatus());
  }

  notifySharedState() {
    this.onSharedStateChange(this.getSharedStateEnvelope());
  }

  buildSessionSummary() {
    return {
      sessionId: this.sessionId,
      sessionCode: this.sessionCode,
      status: this.status,
      verificationStatus: this.verificationStatus,
      mode: this.hostMode,
      connectedCount: this.getJoinedPlayers().length,
      localOrigin: this.localOrigin,
      localPlayerUrl: this.localPlayerUrl,
      lanPlayerUrl: this.lanPlayerUrl,
      publicOrigin: this.publicOrigin,
      candidatePublicOrigin: this.candidatePublicOrigin,
      publicPlayerUrl: this.publicPlayerUrl,
      publicConfigured: this.publicConfigured,
      configuredHostname: this.configuredHostname,
      setupStatus: this.setupStatus,
      tunnelProvider: this.tunnelProvider,
      fallbackAvailable: this.fallbackAvailable,
      fallbackAttempted: this.fallbackAttempted,
      fallbackStatus: this.fallbackStatus,
      tunnelStatus: this.tunnelStatus,
      players: this.getJoinedPlayers().map((player) => ({ ...player }))
    };
  }

  setHostState(payload = {}) {
    if (payload.status !== undefined) this.status = payload.status || this.status;
    if (payload.verificationStatus !== undefined) this.verificationStatus = payload.verificationStatus || "idle";
    if (payload.mode !== undefined) this.hostMode = payload.mode || "local";
    if (payload.localOrigin !== undefined) this.localOrigin = payload.localOrigin || "";
    if (payload.localPlayerUrl !== undefined) this.localPlayerUrl = payload.localPlayerUrl || "";
    if (payload.lanPlayerUrl !== undefined) this.lanPlayerUrl = payload.lanPlayerUrl || "";
    if (payload.publicOrigin !== undefined) this.publicOrigin = payload.publicOrigin || "";
    if (payload.candidatePublicOrigin !== undefined) this.candidatePublicOrigin = payload.candidatePublicOrigin || "";
    if (payload.publicPlayerUrl !== undefined) this.publicPlayerUrl = payload.publicPlayerUrl || "";
    if (payload.publicConfigured !== undefined) this.publicConfigured = !!payload.publicConfigured;
    if (payload.configuredHostname !== undefined) this.configuredHostname = payload.configuredHostname || "";
    if (payload.setupStatus !== undefined) this.setupStatus = payload.setupStatus || "missing";
    if (payload.tunnelProvider !== undefined) this.tunnelProvider = payload.tunnelProvider || "none";
    if (payload.fallbackAvailable !== undefined) this.fallbackAvailable = !!payload.fallbackAvailable;
    if (payload.fallbackAttempted !== undefined) this.fallbackAttempted = !!payload.fallbackAttempted;
    if (payload.fallbackStatus !== undefined) this.fallbackStatus = payload.fallbackStatus || "idle";
    if (payload.tunnelStatus !== undefined) this.tunnelStatus = payload.tunnelStatus || "idle";
    if (payload.lastError !== undefined) {
      this.lastError = payload.lastError || "";
    }
    this.notifyStatus();
    this.broadcastStatus();
    this.broadcastSnapshot();
    return this.getStatus();
  }

  async start(options = {}) {
    if (this.server || this.wss) return this.getStatus();
    this.status = options.status || "starting_local";
    this.verificationStatus = options.verificationStatus || "idle";
    this.hostMode = options.mode || "local";
    this.lastError = "";
    this.tunnelStatus = options.tunnelStatus || "idle";
    this.localOrigin = "";
    this.localPlayerUrl = "";
    this.lanPlayerUrl = "";
    this.publicOrigin = "";
    this.publicPlayerUrl = "";
    this.candidatePublicOrigin = "";
    this.publicConfigured = !!options.publicConfigured;
    this.configuredHostname = options.configuredHostname || "";
    this.setupStatus = options.setupStatus || "missing";
    this.tunnelProvider = options.tunnelProvider || "none";
    this.fallbackAvailable = !!options.fallbackAvailable;
    this.fallbackAttempted = !!options.fallbackAttempted;
    this.fallbackStatus = options.fallbackStatus || "idle";
    this.sessionId = `host-${Date.now().toString(36)}-${uuid().slice(0, 6)}`;
    this.sessionCode = randomSessionCode();
    this.notifyStatus();

    this.server = http.createServer((request, response) => {
      void this.handleHttpRequest(request, response);
    });
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (ws) => {
      const client = {
        id: uuid(),
        playerId: uuid(),
        playerName: "Player",
        joined: false,
        joinedAt: "",
        viewMode: "room",
        ws
      };

      this.clients.set(client.id, client);
      this.notifyStatus();
      this.sendMessage(ws, "host_status", this.getStatus());
      this.sendSnapshot(ws);
      this.sendSharedState(ws);

      ws.on("message", (data) => {
        void this.handleClientMessage(client, String(data));
      });

      ws.on("close", () => {
        this.clients.delete(client.id);
        if (client.joined) {
          this.refreshParticipantPresence(client.playerId);
        }
        this.notifyStatus();
        this.broadcastStatus();
        this.broadcastSnapshot();
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "0.0.0.0", () => resolve());
    });

    const address = this.server.address();
    const port = typeof address === "object" && address ? address.port : this.port;
    const lanAddress = pickLanAddress();
    this.localOrigin = `http://127.0.0.1:${port}`;
    this.localPlayerUrl = `${this.localOrigin}/player`;
    this.lanPlayerUrl = lanAddress ? `http://${lanAddress}:${port}/player` : "";
    this.status = options.readyStatus || "running_local";
    if (this.latestGmState) {
      this.updateSharedState(this.latestGmState, { sourceOrigin: "gm" });
    }
    this.notifyStatus();
    this.broadcastStatus();
    return this.getStatus();
  }

  async stop(options = {}) {
    if (!this.server && !this.wss) {
      this.status = options.finalStatus || "off";
      this.verificationStatus = options.verificationStatus || "idle";
      this.hostMode = options.mode || "local";
      this.tunnelStatus = options.tunnelStatus || "idle";
      if (options.lastError !== undefined) {
        this.lastError = options.lastError || "";
      }
      this.notifyStatus();
      return this.getStatus();
    }

    this.status = "stopped";
    this.broadcastStatus();

    for (const client of this.clients.values()) {
      client.ws.close(1001, "Host stopped");
    }
    this.clients.clear();
    this.participants.clear();

    const closeServer = this.server
      ? new Promise((resolve) => this.server.close(() => resolve()))
      : Promise.resolve();
    const closeSockets = this.wss
      ? new Promise((resolve) => this.wss.close(() => resolve()))
      : Promise.resolve();
    await Promise.all([closeServer, closeSockets]);

    this.server = null;
    this.wss = null;
    this.localOrigin = "";
    this.localPlayerUrl = "";
    this.lanPlayerUrl = "";
    this.publicOrigin = "";
    this.publicPlayerUrl = "";
    this.candidatePublicOrigin = "";
    this.publicConfigured = !!options.publicConfigured;
    this.configuredHostname = options.configuredHostname || "";
    this.setupStatus = options.setupStatus || "missing";
    this.tunnelProvider = options.tunnelProvider || "none";
    this.fallbackAvailable = !!options.fallbackAvailable;
    this.fallbackAttempted = !!options.fallbackAttempted;
    this.fallbackStatus = options.fallbackStatus || "idle";
    this.hostMode = options.mode || "local";
    this.tunnelStatus = options.tunnelStatus || "idle";
    this.verificationStatus = options.verificationStatus || "idle";
    this.sessionId = "";
    this.sessionCode = "";
    this.status = options.finalStatus || "off";
    this.lastError = options.lastError || "";
    this.notifyStatus();
    return this.getStatus();
  }

  updateSharedState(payload, meta = {}) {
    this.latestGmState = payload && typeof payload === "object"
      ? { saved: payload.saved || null, runtime: payload.runtime || null }
      : null;
    this.latestStateMeta = {
      updatedAt: new Date().toISOString(),
      sourcePlayerId: meta.sourcePlayerId || "",
      sourceOrigin: meta.sourceOrigin || ""
    };
    this.latestPlayerView = toPlayerView({
      saved: this.latestGmState?.saved || null,
      runtime: this.latestGmState?.runtime || null,
      session: this.buildSessionSummary()
    });
    this.latestSnapshotAt = this.latestPlayerView.generatedAt;
    this.notifyStatus();
    this.notifySharedState();
    this.broadcastSharedState();
    this.broadcastSnapshot();
    this.broadcastStatus();
    return this.latestPlayerView;
  }

  updateGmState(payload) {
    return this.updateSharedState(payload, { sourceOrigin: "gm" });
  }

  sendMessage(ws, type, payload) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type, payload }));
  }

  broadcast(type, payload) {
    for (const client of this.clients.values()) {
      this.sendMessage(client.ws, type, payload);
    }
  }

  broadcastStatus() {
    this.broadcast("host_status", this.getStatus());
  }

  sendSnapshot(ws) {
    const payload = this.latestPlayerView || toPlayerView({ saved: null, runtime: null, session: this.buildSessionSummary() });
    this.sendMessage(ws, "player_snapshot", payload);
  }

  broadcastSnapshot() {
    const payload = this.latestPlayerView || toPlayerView({ saved: null, runtime: null, session: this.buildSessionSummary() });
    this.broadcast("player_snapshot", payload);
  }

  sendSharedState(ws) {
    if (!this.latestGmState) return;
    this.sendMessage(ws, "sim_state_updated", this.getSharedStateEnvelope());
  }

  broadcastSharedState() {
    if (!this.latestGmState) return;
    this.broadcast("sim_state_updated", this.getSharedStateEnvelope());
  }

  async handleHttpRequest(request, response) {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/api/status") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(this.getStatus()));
      return;
    }

    const normalizedPath = url.pathname === "/" ? "/player" : url.pathname;
    const filePath = this.resolveAssetPath(normalizedPath);
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      response.writeHead(200, { "Content-Type": getMimeType(filePath) });
      response.end(content);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  }

  resolveAssetPath(pathname) {
    if (pathname === "/player" || pathname === "/player/") {
      return path.join(playerRoot, "index.html");
    }
    if (pathname === "/player/simulator" || pathname === "/player/simulator/") {
      return path.join(playerRoot, "simulator-shell.html");
    }
    if (pathname === "/player/simulator/app" || pathname === "/player/simulator/app/") {
      return path.join(referenceRoot, "fantasy-war-sim.html");
    }
    if (pathname.startsWith("/player/simulator/app/")) {
      const relativeApp = pathname.replace(/^\/player\/simulator\/app\//, "");
      if (!relativeApp || relativeApp.includes("..")) return null;
      return path.join(referenceRoot, relativeApp);
    }
    const relative = pathname.replace(/^\/player\//, "");
    if (!relative || relative.includes("..")) return null;
    if (relative === "shared-theme.css") {
      return path.join(appRoot, "desktop", "shared-theme.css");
    }
    return path.join(playerRoot, relative);
  }

  async handleClientMessage(client, rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.sendMessage(client.ws, "error", { message: "Invalid JSON payload." });
      return;
    }

    const type = String(message?.type || "").trim();
    const sessionCode = String(message?.sessionCode || "").trim().toUpperCase();
    const payload = message?.payload && typeof message.payload === "object" ? message.payload : {};

    try {
      if (type === "join_session") {
        if (sessionCode !== this.sessionCode) throw new Error("Session code is incorrect.");
        client.playerId = String(message?.playerId || client.playerId || uuid()).trim() || uuid();
        client.playerName = String(payload.playerName || payload.name || "Player").trim() || "Player";
        client.joinedAt = client.joinedAt || new Date().toISOString();
        client.joined = true;
        const participant = this.ensureParticipant(client.playerId, client.playerName);
        participant.joinedAt = participant.joinedAt || client.joinedAt;
        this.refreshParticipantPresence(client.playerId);
      } else {
        if (!client.joined) throw new Error("Join the session first.");
      }

      const participant = this.ensureParticipant(client.playerId, client.playerName);

      if (type === "set_ready") {
        participant.ready = !!payload.ready;
      }

      if (type === "submit_choice") {
        participant.latestSubmission = String(payload.choice || payload.submission || "").trim().slice(0, 240);
      }

      if (type === "set_view_mode") {
        client.viewMode = normalizeViewMode(payload.viewMode);
        this.refreshParticipantPresence(client.playerId);
        if (client.viewMode === "simulator") {
          this.sendSharedState(client.ws);
        }
      }

      if (type === "push_sim_state") {
        client.viewMode = "simulator";
        participant.lastStateAt = new Date().toISOString();
        this.refreshParticipantPresence(client.playerId);
        this.updateSharedState(payload, {
          sourcePlayerId: client.playerId,
          sourceOrigin: "player"
        });
      }

      if (type === "request_refresh") {
        this.sendSnapshot(client.ws);
        this.sendSharedState(client.ws);
      }

      if (!["join_session", "set_ready", "submit_choice", "request_refresh", "set_view_mode", "push_sim_state"].includes(type)) {
        throw new Error("Unsupported command.");
      }

      this.lastError = "";
      this.notifyStatus();
      this.broadcastStatus();
      this.broadcastSnapshot();
      this.sendMessage(client.ws, "command_result", { ok: true, type });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown command failure.";
      this.notifyStatus();
      this.sendMessage(client.ws, "error", { message: this.lastError });
    }
  }
}
