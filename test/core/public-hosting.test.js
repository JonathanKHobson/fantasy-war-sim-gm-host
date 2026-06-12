import test from "node:test";
import assert from "node:assert/strict";

import { buildInviteUrl, buildPlayerUrl, resolvePublicInviteUrl, verifyPublicOrigin } from "../../electron/public-hosting.mjs";

test("buildPlayerUrl and buildInviteUrl normalize routes for shareable player links", () => {
  assert.equal(buildPlayerUrl("https://example.trycloudflare.com/"), "https://example.trycloudflare.com/player");
  assert.equal(buildInviteUrl("https://example.trycloudflare.com/player", "ABC123"), "https://example.trycloudflare.com/player?code=ABC123");
});

test("resolvePublicInviteUrl only allows verified public sessions", () => {
  assert.throws(
    () => resolvePublicInviteUrl({ status: "verifying_public", publicPlayerUrl: "https://example.trycloudflare.com/player", sessionCode: "ABC123" }),
    /Public hosting is not ready yet/
  );

  assert.equal(
    resolvePublicInviteUrl({
      status: "running_public",
      publicPlayerUrl: "https://example.trycloudflare.com/player",
      sessionCode: "ABC123"
    }),
    "https://example.trycloudflare.com/player?code=ABC123"
  );
});

test("verifyPublicOrigin waits for a reachable public status endpoint and matches the session", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length < 3) {
      throw Object.assign(new Error("temporary dns miss"), { cause: { code: "ENOTFOUND" } });
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { sessionId: "host-123" };
      }
    };
  };

  const result = await verifyPublicOrigin({
    publicOrigin: "https://example.trycloudflare.com",
    expectedSessionId: "host-123",
    intervalMs: 1,
    timeoutMs: 50,
    fetchImpl
  });

  assert.equal(result.publicOrigin, "https://example.trycloudflare.com");
  assert.equal(result.publicPlayerUrl, "https://example.trycloudflare.com/player");
  assert.equal(calls.length, 3);
});

test("verifyPublicOrigin times out with the last reachability error", async () => {
  const fetchImpl = async () => {
    throw Object.assign(new Error("dns miss"), { cause: { code: "ENOTFOUND" } });
  };

  await assert.rejects(
    () => verifyPublicOrigin({
      publicOrigin: "https://example.trycloudflare.com",
      expectedSessionId: "host-123",
      intervalMs: 1,
      timeoutMs: 5,
      fetchImpl
    }),
    /ENOTFOUND/
  );
});
