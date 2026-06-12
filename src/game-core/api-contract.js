export const gameCoreApiContract = Object.freeze({
  loadState: "Hydrate saved state from local JSON or imported legacy payloads.",
  migrateState: "Normalize older saved-state shapes into the current game-core model.",
  computePreview: "Compute preview-mode derived values without mutating state.",
  runBattleRound: "Resolve a deterministic battle round and return next state plus emitted effects.",
  appendBattleHistory: "Create and append a persisted history record from a resolved round.",
  toPlayerView: "Project GM state into a player-safe session snapshot."
});
