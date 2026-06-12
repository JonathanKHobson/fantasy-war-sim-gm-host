import test from "node:test";
import assert from "node:assert/strict";

import { buildNamedTunnelArgs, extractPublicUrl, getCloudflaredAssetName } from "../../electron/cloudflared-manager.mjs";

test("getCloudflaredAssetName returns the expected macOS archive name", () => {
  assert.equal(getCloudflaredAssetName("darwin", "arm64"), "cloudflared-darwin-arm64.tgz");
  assert.equal(getCloudflaredAssetName("darwin", "x64"), "cloudflared-darwin-amd64.tgz");
});

test("extractPublicUrl finds a trycloudflare URL in helper output", () => {
  const logLine = "INFO | Your quick Tunnel has been created! Visit it at https://amber-mist-forest.trycloudflare.com";
  assert.equal(extractPublicUrl(logLine), "https://amber-mist-forest.trycloudflare.com");
  assert.equal(extractPublicUrl("no url here"), "");
});

test("buildNamedTunnelArgs creates a named tunnel run command", () => {
  assert.deepEqual(
    buildNamedTunnelArgs({
      tunnelId: "tunnel-123",
      credentialsPath: "/tmp/creds.json",
      localOrigin: "http://127.0.0.1:4000"
    }),
    [
      "tunnel",
      "--no-autoupdate",
      "run",
      "--credentials-file",
      "/tmp/creds.json",
      "--url",
      "http://127.0.0.1:4000",
      "tunnel-123"
    ]
  );
});
