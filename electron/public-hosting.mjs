function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildPlayerUrl(origin) {
  const normalized = String(origin || "").trim().replace(/\/+$/, "");
  return normalized ? `${normalized}/player` : "";
}

export function buildInviteUrl(playerUrl, sessionCode) {
  const normalized = String(playerUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  return `${normalized}?code=${encodeURIComponent(String(sessionCode || ""))}`;
}

export function resolvePublicInviteUrl(status = {}) {
  if (status.status !== "running_public" || !status.publicPlayerUrl) {
    throw new Error("Public hosting is not ready yet.");
  }
  return buildInviteUrl(status.publicPlayerUrl, status.sessionCode);
}

function formatFetchError(error) {
  const code = error?.cause?.code || error?.code;
  if (code) return code;
  return error instanceof Error ? error.message : "Unknown verification failure.";
}

export async function verifyPublicOrigin(options = {}) {
  const publicOrigin = String(options.publicOrigin || "").trim().replace(/\/+$/, "");
  const expectedSessionId = String(options.expectedSessionId || "").trim();
  const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 2000;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60000;
  const fetchImpl = options.fetchImpl || fetch;

  if (!publicOrigin) {
    throw new Error("Public origin is required for verification.");
  }
  if (!expectedSessionId) {
    throw new Error("Expected session ID is required for verification.");
  }

  const startedAt = Date.now();
  let lastError = "Public hosting verification did not complete.";

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetchImpl(`${publicOrigin}/api/status`, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (String(payload?.sessionId || "") !== expectedSessionId) {
        throw new Error("Session ID mismatch.");
      }
      return {
        publicOrigin,
        publicPlayerUrl: buildPlayerUrl(publicOrigin)
      };
    } catch (error) {
      lastError = formatFetchError(error);
    }

    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(intervalMs);
  }

  throw new Error(`Public hosting verification timed out: ${lastError}`);
}
