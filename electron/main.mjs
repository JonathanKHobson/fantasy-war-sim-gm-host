import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } from "electron";

import { CloudflaredManager } from "./cloudflared-manager.mjs";
import { LocalHostService } from "./local-host-service.mjs";
import { clearPublicHostConfig, loadPublicHostConfig, normalizePublicHostConfig, savePublicHostConfig, validatePublicHostConfig } from "./public-host-config.mjs";
import { buildPlayerUrl, resolvePublicInviteUrl } from "./public-hosting.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const isDev = process.argv.includes("--dev");
const isSmoke = process.argv.includes("--smoke-test");

let mainWindow = null;
let smokeReadySeen = false;
let smokeLayoutSeen = false;
let publicHostConfig = normalizePublicHostConfig();
let publicHostValidation = {
  ok: false,
  status: "missing",
  config: publicHostConfig,
  message: "Public hosting is not configured."
};

function syncHostStatusToWindow(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:host-status", status);
  }
}

function applyPublicConfigToHostStatus() {
  return localHostService.setHostState({
    publicConfigured: publicHostValidation.ok,
    configuredHostname: publicHostConfig.hostname || "",
    setupStatus: publicHostValidation.status || "missing",
    fallbackAvailable: publicHostValidation.ok,
    lastError: localHostService.getStatus().status === "error"
      ? localHostService.getStatus().lastError
      : ""
  });
}

const localHostService = new LocalHostService({
  onStatusChange: (status) => {
    syncHostStatusToWindow(status);
  },
  onSharedStateChange: (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:shared-sim-state", payload);
    }
  }
});

const cloudflaredManager = new CloudflaredManager({
  toolRoot: path.join(app.getPath("userData"), "tools", "cloudflared"),
  onStatusChange: (status) => {
    localHostService.setHostState({
      tunnelStatus: status.status,
      candidatePublicOrigin: status.publicUrl || "",
      lastError: status.status === "error" ? status.lastError : localHostService.getStatus().lastError
    });
  }
});

function buildAppInfo() {
  return {
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData")
  };
}

function showAboutPanel() {
  const info = buildAppInfo();
  return dialog.showMessageBox({
    type: "info",
    title: `About ${info.name}`,
    message: info.name,
    detail: `Version ${info.version}\n${info.isPackaged ? "Packaged build" : "Development build"}\nData folder: ${info.userDataPath}`,
    buttons: ["OK"]
  });
}

async function openUserDataDirectory() {
  const userDataPath = app.getPath("userData");
  const error = await shell.openPath(userDataPath);
  if (error) {
    throw new Error(error);
  }
  return userDataPath;
}

async function copyInviteLink() {
  const status = localHostService.getStatus();
  const inviteUrl = resolvePublicInviteUrl(status);
  clipboard.writeText(inviteUrl);
  return inviteUrl;
}

async function openInviteLink() {
  const inviteUrl = await copyInviteLink();
  await shell.openExternal(inviteUrl);
  return inviteUrl;
}

async function startPublicHostedSession() {
  if (localHostService.getStatus().status !== "off") {
    await stopHostedSession();
  }

  publicHostValidation = await validatePublicHostConfig(publicHostConfig);
  applyPublicConfigToHostStatus();

  const status = await localHostService.start({
    mode: "public",
    status: "starting_local",
    readyStatus: "starting_tunnel",
    verificationStatus: "idle",
    tunnelStatus: "starting",
    publicConfigured: publicHostValidation.ok,
    configuredHostname: publicHostConfig.hostname,
    setupStatus: publicHostValidation.status,
    tunnelProvider: "quick",
    fallbackAvailable: false,
    fallbackAttempted: false,
    fallbackStatus: "idle"
  });

  try {
    const tunnel = await cloudflaredManager.startQuick(status.localOrigin);
    localHostService.setHostState({
      status: "running_public",
      mode: "public",
      tunnelStatus: "running",
      verificationStatus: "idle",
      publicOrigin: tunnel.publicUrl || "",
      publicPlayerUrl: buildPlayerUrl(tunnel.publicUrl),
      publicConfigured: publicHostValidation.ok,
      configuredHostname: publicHostConfig.hostname,
      setupStatus: publicHostValidation.status,
      tunnelProvider: "quick",
      fallbackAvailable: false,
      fallbackAttempted: false,
      fallbackStatus: "idle",
      lastError: ""
    });
  } catch (error) {
    const quickError = error instanceof Error ? error.message : "Quick Tunnel failed to start.";
    await cloudflaredManager.stop().catch(() => {});

    await localHostService.stop({
      finalStatus: "error",
      mode: "public",
      tunnelStatus: "error",
      verificationStatus: "idle",
      publicConfigured: publicHostValidation.ok,
      configuredHostname: publicHostConfig.hostname || "",
      setupStatus: publicHostValidation.status,
      tunnelProvider: "quick",
      fallbackAvailable: false,
      fallbackAttempted: false,
      fallbackStatus: "idle",
      lastError: quickError
    });
  }
  return localHostService.getStatus();
}

async function startLocalOnlySession() {
  if (localHostService.getStatus().status !== "off") {
    await stopHostedSession();
  }
  return localHostService.start({
    mode: "local",
    status: "starting_local",
    readyStatus: "running_local",
    verificationStatus: "idle",
    tunnelStatus: "idle",
    publicConfigured: publicHostValidation.ok,
    configuredHostname: publicHostConfig.hostname || "",
    setupStatus: publicHostValidation.status || "missing",
    tunnelProvider: "none",
    fallbackAvailable: false,
    fallbackAttempted: false,
    fallbackStatus: "idle"
  });
}

async function stopHostedSession() {
  await cloudflaredManager.stop();
  const status = await localHostService.stop({
    publicConfigured: publicHostValidation.ok,
    configuredHostname: publicHostConfig.hostname || "",
    setupStatus: publicHostValidation.status || "missing",
    tunnelProvider: "none",
    fallbackAvailable: false,
    fallbackAttempted: false,
    fallbackStatus: "idle",
    lastError: ""
  });
  applyPublicConfigToHostStatus();
  return status;
}

async function refreshPublicHostConfigState() {
  publicHostConfig = await loadPublicHostConfig(app.getPath("userData"));
  publicHostValidation = await validatePublicHostConfig(publicHostConfig);
  return applyPublicConfigToHostStatus();
}

async function savePublicHostConfigState(payload = {}) {
  publicHostConfig = await savePublicHostConfig(app.getPath("userData"), payload);
  publicHostValidation = await validatePublicHostConfig(publicHostConfig);
  applyPublicConfigToHostStatus();
  return {
    ...publicHostConfig,
    publicConfigured: publicHostValidation.ok,
    setupStatus: publicHostValidation.status,
    message: publicHostValidation.message || ""
  };
}

async function clearPublicHostConfigState() {
  publicHostConfig = await clearPublicHostConfig(app.getPath("userData"));
  publicHostValidation = await validatePublicHostConfig(publicHostConfig);
  applyPublicConfigToHostStatus();
  return {
    ...publicHostConfig,
    publicConfigured: publicHostValidation.ok,
    setupStatus: publicHostValidation.status,
    message: publicHostValidation.message || ""
  };
}

async function getPublicHostConfigState() {
  if (!publicHostConfig.hostname && publicHostValidation.status === "missing") {
    await refreshPublicHostConfigState();
  }
  return {
    ...publicHostConfig,
    publicConfigured: publicHostValidation.ok,
    setupStatus: publicHostValidation.status,
    message: publicHostValidation.message || ""
  };
}

async function pickCredentialsFile() {
  const result = await dialog.showOpenDialog({
    title: "Select Cloudflare Tunnel Credentials JSON",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePaths.length) {
    return "";
  }
  return result.filePaths[0];
}

function maybeFinishSmoke() {
  if (!isSmoke || !smokeReadySeen || !smokeLayoutSeen) return;
  setTimeout(() => {
    app.quit();
  }, 250);
}

async function runSmokeProbe() {
  if (!isSmoke || !mainWindow || mainWindow.isDestroyed()) return;

  try {
    const result = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const startedAt = Date.now();
        const timeoutMs = 15000;

        function check() {
          const frame = document.getElementById("gmAppFrame");
          const toggle = document.getElementById("hostPanelToggle");
          const closeButton = document.getElementById("closeHostDrawerButton");
          const drawer = document.getElementById("hostDrawer");
          if (!frame) {
            resolve({ ok: false, reason: "missing-frame" });
            return;
          }
          if (!toggle || !closeButton || !drawer) {
            resolve({ ok: false, reason: "missing-drawer-controls" });
            return;
          }

          const rect = frame.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const iframeReady = !!(frame.contentDocument && frame.contentDocument.readyState === "complete");
          const layoutOk = rect.height > viewportHeight * 0.45 && Math.abs(viewportHeight - rect.bottom) <= 3;

          if (iframeReady && !window.__gmHostSmokeToggleDone) {
            window.__gmHostSmokeToggleDone = true;
            toggle.click();
            setTimeout(() => closeButton.click(), 60);
          }

          const drawerClosed = drawer.hidden === true;

          if (iframeReady && layoutOk && window.__gmHostSmokeToggleDone && drawerClosed) {
            resolve({ ok: true });
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            resolve({
              ok: false,
              reason: iframeReady ? "layout-timeout" : "iframe-timeout",
              viewportHeight,
              frameHeight: rect.height,
              frameBottom: rect.bottom,
              drawerClosed
            });
            return;
          }

          window.requestAnimationFrame(check);
        }

        check();
      });
    `, true);

    if (result?.ok) {
      smokeReadySeen = true;
      smokeLayoutSeen = true;
      maybeFinishSmoke();
      return;
    }

    console.error(`GM_HOST_LAYOUT_FAIL:${JSON.stringify(result || {})}`);
    app.exit(1);
  } catch (error) {
    console.error(`GM_HOST_SMOKE_ERROR:${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
  }
}

function buildMenu() {
  const template = [
    {
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => {
            void showAboutPanel();
          }
        },
        { type: "separator" },
        {
          label: "Open App Data Folder",
          click: () => {
            void openUserDataDirectory();
          }
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "File",
      submenu: [
        {
          label: "Open App Data Folder",
          click: () => {
            void openUserDataDirectory();
          }
        },
        { type: "separator" },
        { role: "close" }
      ]
    },
    {
      label: "View",
      submenu: isDev
        ? [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" }
          ]
        : [
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" }
          ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    title: "Fantasy War Sim GM Host",
    backgroundColor: "#0f1115",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on("console-message", (_event, _level, message) => {
    if (isDev || isSmoke) {
      console.log(message);
    }
    if (message === "GM_HOST_SHELL_READY") {
      smokeReadySeen = true;
      maybeFinishSmoke();
      return;
    }
    if (message === "GM_HOST_LAYOUT_OK") {
      smokeLayoutSeen = true;
      maybeFinishSmoke();
      return;
    }
    if (message.startsWith("GM_HOST_LAYOUT_FAIL")) {
      console.error(message);
      if (isSmoke) {
        app.exit(1);
      }
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (isDev || isSmoke) {
      console.log("GM_HOST_MAIN_WINDOW_LOADED");
    }
    if (isSmoke) {
      void runSmokeProbe();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`GM_HOST_LOAD_FAIL:${errorCode}:${errorDescription}`);
  });

  mainWindow.loadFile(path.join(appRoot, "desktop", "index.html"));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.setName("Fantasy War Sim GM Host");
app.setAboutPanelOptions({
  applicationName: app.getName(),
  applicationVersion: app.getVersion(),
  version: app.getVersion()
});

ipcMain.handle("desktop:get-app-info", () => buildAppInfo());
ipcMain.handle("desktop:is-packaged", () => app.isPackaged);
ipcMain.handle("desktop:open-user-data-directory", () => openUserDataDirectory());
ipcMain.handle("desktop:start-public-host", () => startPublicHostedSession());
ipcMain.handle("desktop:start-local-host", () => startLocalOnlySession());
ipcMain.handle("desktop:stop-local-host", () => stopHostedSession());
ipcMain.handle("desktop:get-host-status", () => localHostService.getStatus());
ipcMain.handle("desktop:get-public-host-config", () => getPublicHostConfigState());
ipcMain.handle("desktop:save-public-host-config", (_event, payload) => savePublicHostConfigState(payload));
ipcMain.handle("desktop:clear-public-host-config", () => clearPublicHostConfigState());
ipcMain.handle("desktop:pick-public-host-credentials", () => pickCredentialsFile());
ipcMain.handle("desktop:copy-invite-link", () => copyInviteLink());
ipcMain.handle("desktop:open-invite-link", () => openInviteLink());
ipcMain.handle("desktop:sync-gm-state", (_event, payload) => localHostService.updateGmState(payload));
ipcMain.on("desktop:smoke-signal", (_event, signal, detail) => {
  if (signal === "ready") {
    smokeReadySeen = true;
    maybeFinishSmoke();
    return;
  }
  if (signal === "layout-ok") {
    smokeLayoutSeen = true;
    maybeFinishSmoke();
    return;
  }
  if (signal === "layout-fail") {
    console.error(`GM_HOST_LAYOUT_FAIL:${JSON.stringify(detail || {})}`);
    if (isSmoke) {
      app.exit(1);
    }
  }
});

app.whenReady().then(() => {
  void refreshPublicHostConfigState();
  buildMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void cloudflaredManager.stop();
  void localHostService.stop();
});
