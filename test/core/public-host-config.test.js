import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPublicHostConfigPath, clearPublicHostConfig, loadPublicHostConfig, normalizePublicHostConfig, savePublicHostConfig, validatePublicHostConfig } from "../../electron/public-host-config.mjs";

test("normalizePublicHostConfig trims values and strips protocol from hostname", () => {
  const config = normalizePublicHostConfig({
    accountId: "  acct  ",
    tunnelId: " tunnel ",
    hostname: "https://play.example.com/",
    credentialsPath: " /tmp/creds.json "
  });

  assert.deepEqual(config, {
    accountId: "acct",
    tunnelId: "tunnel",
    hostname: "play.example.com",
    credentialsPath: "/tmp/creds.json"
  });
});

test("validatePublicHostConfig rejects missing and mismatched credentials", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fws-public-config-"));
  const credentialsPath = path.join(tempDir, "credentials.json");
  await fs.writeFile(credentialsPath, JSON.stringify({ AccountTag: "acct-a", TunnelID: "tunnel-a" }));

  const missing = await validatePublicHostConfig({});
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "missing");

  const invalid = await validatePublicHostConfig({
    accountId: "acct-b",
    tunnelId: "tunnel-a",
    hostname: "play.example.com",
    credentialsPath
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, "invalid");
  assert.match(invalid.message, /Account ID/);
});

test("save/load/clear public host config persists setup in user data", async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "fws-user-data-"));
  const credentialsPath = path.join(userDataPath, "credentials.json");
  await fs.writeFile(credentialsPath, JSON.stringify({ AccountTag: "acct-a", TunnelID: "tunnel-a" }));

  const saved = await savePublicHostConfig(userDataPath, {
    accountId: "acct-a",
    tunnelId: "tunnel-a",
    hostname: "play.example.com",
    credentialsPath
  });
  assert.equal(saved.hostname, "play.example.com");
  assert.equal(buildPublicHostConfigPath(userDataPath), path.join(userDataPath, "public-host-config.json"));

  const loaded = await loadPublicHostConfig(userDataPath);
  assert.equal(loaded.accountId, "acct-a");
  assert.equal(loaded.credentialsPath, credentialsPath);

  const validation = await validatePublicHostConfig(loaded);
  assert.equal(validation.ok, true);
  assert.equal(validation.status, "configured");

  await clearPublicHostConfig(userDataPath);
  const cleared = await loadPublicHostConfig(userDataPath);
  assert.equal(cleared.hostname, "");
});
