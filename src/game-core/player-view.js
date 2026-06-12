import { computePreview } from "./preview.js";

export function toPlayerView(input = {}, options = {}) {
  const preview = computePreview(input, options);
  const session = input.session && typeof input.session === "object" ? input.session : {};
  return {
    generatedAt: preview.generatedAt,
    schemaVersion: preview.schemaVersion,
    session: {
      sessionId: session.sessionId || "",
      sessionCode: session.sessionCode || "",
      status: session.status || "off",
      verificationStatus: session.verificationStatus || "idle",
      mode: session.mode || "local",
      connectedCount: Number(session.connectedCount || 0),
      localOrigin: session.localOrigin || "",
      localPlayerUrl: session.localPlayerUrl || "",
      lanPlayerUrl: session.lanPlayerUrl || "",
      publicOrigin: session.publicOrigin || "",
      candidatePublicOrigin: session.candidatePublicOrigin || "",
      publicPlayerUrl: session.publicPlayerUrl || "",
      publicConfigured: !!session.publicConfigured,
      configuredHostname: session.configuredHostname || "",
      setupStatus: session.setupStatus || "missing",
      tunnelStatus: session.tunnelStatus || "idle",
      players: Array.isArray(session.players)
        ? session.players.map((player) => ({
            playerId: player.playerId,
            playerName: player.playerName,
            ready: !!player.ready,
            latestSubmission: player.latestSubmission || "",
            joinedAt: player.joinedAt || "",
            viewMode: player.viewMode || "room",
            lastStateAt: player.lastStateAt || ""
          }))
        : []
    },
    battle: preview.battle,
    weather: preview.weather,
    war: preview.war,
    history: preview.history,
    armies: preview.armies
  };
}
