import fs from "node:fs/promises";
import path from "node:path";

function clean(value) {
  return String(value || "").trim();
}

export function normalizePublicHostConfig(input = {}) {
  return {
    accountId: clean(input.accountId),
    tunnelId: clean(input.tunnelId),
    hostname: clean(input.hostname).replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
    credentialsPath: clean(input.credentialsPath)
  };
}

export async function validatePublicHostConfig(input = {}) {
  const config = normalizePublicHostConfig(input);
  if (!config.accountId || !config.tunnelId || !config.hostname || !config.credentialsPath) {
    return {
      ok: false,
      status: "missing",
      config,
      message: "Account ID, tunnel ID, hostname, and credentials file are required."
    };
  }

  let credentials;
  try {
    credentials = JSON.parse(await fs.readFile(config.credentialsPath, "utf8"));
  } catch {
    return {
      ok: false,
      status: "invalid",
      config,
      message: "Credentials file could not be read as JSON."
    };
  }

  const credentialAccount = clean(credentials?.AccountTag);
  const credentialTunnel = clean(credentials?.TunnelID);
  if (!credentialAccount || !credentialTunnel) {
    return {
      ok: false,
      status: "invalid",
      config,
      message: "Credentials file is missing AccountTag or TunnelID."
    };
  }

  if (credentialAccount !== config.accountId) {
    return {
      ok: false,
      status: "invalid",
      config,
      message: "Account ID does not match the credentials file."
    };
  }

  if (credentialTunnel !== config.tunnelId) {
    return {
      ok: false,
      status: "invalid",
      config,
      message: "Tunnel ID does not match the credentials file."
    };
  }

  return {
    ok: true,
    status: "configured",
    config,
    message: ""
  };
}

export function buildPublicHostConfigPath(userDataPath) {
  return path.join(userDataPath, "public-host-config.json");
}

export async function loadPublicHostConfig(userDataPath) {
  const configPath = buildPublicHostConfigPath(userDataPath);
  try {
    const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
    return normalizePublicHostConfig(raw);
  } catch {
    return normalizePublicHostConfig();
  }
}

export async function savePublicHostConfig(userDataPath, input = {}) {
  const config = normalizePublicHostConfig(input);
  const configPath = buildPublicHostConfigPath(userDataPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return config;
}

export async function clearPublicHostConfig(userDataPath) {
  const configPath = buildPublicHostConfigPath(userDataPath);
  await fs.rm(configPath, { force: true });
  return normalizePublicHostConfig();
}
