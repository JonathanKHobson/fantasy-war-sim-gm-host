import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RELEASE_API_URL = "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";
const PUBLIC_URL_PATTERN = /https:\/\/[-a-z0-9]+\.trycloudflare\.com/ig;

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}.`));
    });
  });
}

export function getCloudflaredAssetName(platform = process.platform, arch = process.arch) {
  if (platform !== "darwin") {
    throw new Error("Automatic tunnel setup currently supports macOS only.");
  }
  if (arch === "arm64") return "cloudflared-darwin-arm64.tgz";
  if (arch === "x64") return "cloudflared-darwin-amd64.tgz";
  throw new Error(`Unsupported Mac architecture: ${arch}.`);
}

export function extractPublicUrl(text) {
  const match = String(text || "").match(PUBLIC_URL_PATTERN);
  return match ? match[0] : "";
}

export function buildNamedTunnelArgs({ tunnelId, credentialsPath, localOrigin }) {
  const normalizedTunnelId = String(tunnelId || "").trim();
  const normalizedCredentialsPath = String(credentialsPath || "").trim();
  const normalizedLocalOrigin = String(localOrigin || "").trim();

  if (!normalizedTunnelId || !normalizedCredentialsPath || !normalizedLocalOrigin) {
    throw new Error("Tunnel ID, credentials path, and local origin are required to start a named tunnel.");
  }

  return [
    "tunnel",
    "--no-autoupdate",
    "run",
    "--credentials-file",
    normalizedCredentialsPath,
    "--url",
    normalizedLocalOrigin,
    normalizedTunnelId
  ];
}

export class CloudflaredManager {
  constructor(options = {}) {
    this.toolRoot = options.toolRoot || path.join(os.tmpdir(), "fantasy-war-sim-cloudflared");
    this.onStatusChange = options.onStatusChange || (() => {});
    this.child = null;
    this.stopRequested = false;
    this.state = {
      status: "idle",
      publicUrl: "",
      version: "",
      binaryPath: "",
      lastError: "",
      localOrigin: "",
      hostname: "",
      tunnelId: ""
    };
  }

  getStatus() {
    return { ...this.state };
  }

  notify() {
    this.onStatusChange(this.getStatus());
  }

  async readManifest() {
    const manifestPath = path.join(this.toolRoot, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (!manifest?.binaryPath || !await fileExists(manifest.binaryPath)) {
        return null;
      }
      return manifest;
    } catch {
      return null;
    }
  }

  async writeManifest(manifest) {
    await fs.mkdir(this.toolRoot, { recursive: true });
    await fs.writeFile(path.join(this.toolRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  }

  async fetchLatestRelease() {
    const response = await fetch(RELEASE_API_URL, {
      headers: {
        "User-Agent": "fantasy-war-sim-gm-host"
      }
    });
    if (!response.ok) {
      throw new Error(`Cloudflared release lookup failed (${response.status}).`);
    }
    return response.json();
  }

  async downloadToFile(url, destinationPath) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "fantasy-war-sim-gm-host"
      }
    });
    if (!response.ok || !response.body) {
      throw new Error(`Cloudflared download failed (${response.status}).`);
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    const archive = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destinationPath, archive);
  }

  async ensureBinary() {
    const cached = await this.readManifest();
    const assetName = getCloudflaredAssetName();

    let release;
    try {
      release = await this.fetchLatestRelease();
    } catch (error) {
      if (cached) return cached;
      throw error;
    }

    const asset = Array.isArray(release.assets)
      ? release.assets.find((item) => item?.name === assetName)
      : null;
    if (!asset?.browser_download_url) {
      if (cached) return cached;
      throw new Error(`Could not find ${assetName} in the latest cloudflared release.`);
    }

    const version = String(release.tag_name || release.name || "").trim() || "latest";
    const versionDir = path.join(this.toolRoot, version);
    const binaryPath = path.join(versionDir, "cloudflared");

    if (await fileExists(binaryPath)) {
      const manifest = { version, assetName, binaryPath };
      await this.writeManifest(manifest);
      return manifest;
    }

    this.state.status = "preparing";
    this.state.version = version;
    this.state.lastError = "";
    this.notify();

    const archivePath = path.join(this.toolRoot, `${assetName}`);
    await fs.mkdir(versionDir, { recursive: true });
    await this.downloadToFile(asset.browser_download_url, archivePath);
    await runCommand("tar", ["-xzf", archivePath, "-C", versionDir]);
    await fs.chmod(binaryPath, 0o755);
    await fs.rm(archivePath, { force: true });

    const manifest = { version, assetName, binaryPath };
    await this.writeManifest(manifest);
    return manifest;
  }

  async startQuick(localOrigin) {
    if (this.child) return this.getStatus();

    const origin = String(localOrigin || "").trim();
    if (!origin) {
      throw new Error("A local origin is required before starting the tunnel.");
    }

    const manifest = await this.ensureBinary();
    const cloudflaredHome = path.join(this.toolRoot, "home");
    await fs.mkdir(cloudflaredHome, { recursive: true });

    this.stopRequested = false;
    this.state = {
      status: "starting",
      publicUrl: "",
      version: manifest.version,
      binaryPath: manifest.binaryPath,
      lastError: "",
      localOrigin: origin
    };
    this.notify();

    const env = {
      ...process.env,
      HOME: cloudflaredHome,
      XDG_CONFIG_HOME: cloudflaredHome
    };

    const child = spawn(manifest.binaryPath, ["tunnel", "--no-autoupdate", "--url", origin], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.child = child;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.state.status = "error";
        this.state.lastError = "Timed out while waiting for a public hosting link.";
        this.notify();
        this.stop().catch(() => {});
        reject(new Error(this.state.lastError));
      }, 20000);

      const handleOutput = (chunk) => {
        const text = String(chunk || "");
        const publicUrl = extractPublicUrl(text);
        if (!publicUrl) return;
        this.state.status = "running";
        this.state.publicUrl = publicUrl;
        this.state.lastError = "";
        this.notify();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(this.getStatus());
        }
      };

      child.stdout.on("data", handleOutput);
      child.stderr.on("data", handleOutput);

      child.once("error", (error) => {
        clearTimeout(timeout);
        this.child = null;
        this.state.status = "error";
        this.state.lastError = error.message;
        this.notify();
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        this.child = null;
        if (this.stopRequested) {
          this.state.status = "idle";
          this.state.publicUrl = "";
          this.state.lastError = "";
          this.notify();
          if (!settled) {
            settled = true;
            resolve(this.getStatus());
          }
          return;
        }

        this.state.status = "error";
        this.state.publicUrl = "";
        this.state.lastError = code !== null
          ? `Public hosting helper exited with code ${code}.`
          : `Public hosting helper stopped (${signal || "unknown signal"}).`;
        this.notify();
        if (!settled) {
          settled = true;
          reject(new Error(this.state.lastError));
        }
      });
    });
  }

  async startNamed(config = {}, localOrigin) {
    if (this.child) return this.getStatus();

    const origin = String(localOrigin || "").trim();
    const hostname = String(config.hostname || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!origin) {
      throw new Error("A local origin is required before starting the tunnel.");
    }
    if (!hostname || !config.tunnelId || !config.credentialsPath) {
      throw new Error("Named tunnel configuration is incomplete.");
    }

    const manifest = await this.ensureBinary();
    const cloudflaredHome = path.join(this.toolRoot, "home");
    await fs.mkdir(cloudflaredHome, { recursive: true });

    this.stopRequested = false;
    this.state = {
      status: "starting",
      publicUrl: `https://${hostname}`,
      version: manifest.version,
      binaryPath: manifest.binaryPath,
      lastError: "",
      localOrigin: origin,
      hostname,
      tunnelId: String(config.tunnelId).trim()
    };
    this.notify();

    const env = {
      ...process.env,
      HOME: cloudflaredHome,
      XDG_CONFIG_HOME: cloudflaredHome
    };

    const args = buildNamedTunnelArgs({
      tunnelId: config.tunnelId,
      credentialsPath: config.credentialsPath,
      localOrigin: origin
    });

    const child = spawn(manifest.binaryPath, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.child = child;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.state.status = "error";
        this.state.lastError = "Timed out while starting the named Cloudflare tunnel.";
        this.notify();
        this.stop().catch(() => {});
        reject(new Error(this.state.lastError));
      }, 20000);

      const handleOutput = (chunk) => {
        const text = String(chunk || "");
        if (!/Registered tunnel connection|Connection .*registered|Initial protocol/i.test(text)) {
          return;
        }
        this.state.status = "running";
        this.state.lastError = "";
        this.notify();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(this.getStatus());
        }
      };

      child.stdout.on("data", handleOutput);
      child.stderr.on("data", handleOutput);

      child.once("error", (error) => {
        clearTimeout(timeout);
        this.child = null;
        this.state.status = "error";
        this.state.lastError = error.message;
        this.notify();
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        this.child = null;
        if (this.stopRequested) {
          this.state.status = "idle";
          this.state.publicUrl = "";
          this.state.lastError = "";
          this.notify();
          if (!settled) {
            settled = true;
            resolve(this.getStatus());
          }
          return;
        }

        this.state.status = "error";
        this.state.publicUrl = "";
        this.state.lastError = code !== null
          ? `Public hosting helper exited with code ${code}.`
          : `Public hosting helper stopped (${signal || "unknown signal"}).`;
        this.notify();
        if (!settled) {
          settled = true;
          reject(new Error(this.state.lastError));
        }
      });
    });
  }

  async stop() {
    if (!this.child) {
      this.state.status = "idle";
      this.state.publicUrl = "";
      this.state.lastError = "";
      this.notify();
      return this.getStatus();
    }

    const child = this.child;
    this.stopRequested = true;
    await new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    });

    this.child = null;
    this.state.status = "idle";
    this.state.publicUrl = "";
    this.state.lastError = "";
    this.notify();
    return this.getStatus();
  }
}
