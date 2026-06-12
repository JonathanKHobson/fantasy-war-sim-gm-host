import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gmHostDesktop", {
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  openUserDataDirectory: () => ipcRenderer.invoke("desktop:open-user-data-directory"),
  isPackaged: () => ipcRenderer.invoke("desktop:is-packaged"),
  startPublicHost: () => ipcRenderer.invoke("desktop:start-public-host"),
  startLocalHost: () => ipcRenderer.invoke("desktop:start-local-host"),
  stopLocalHost: () => ipcRenderer.invoke("desktop:stop-local-host"),
  getHostStatus: () => ipcRenderer.invoke("desktop:get-host-status"),
  getPublicHostConfig: () => ipcRenderer.invoke("desktop:get-public-host-config"),
  savePublicHostConfig: (payload) => ipcRenderer.invoke("desktop:save-public-host-config", payload),
  clearPublicHostConfig: () => ipcRenderer.invoke("desktop:clear-public-host-config"),
  pickPublicHostCredentials: () => ipcRenderer.invoke("desktop:pick-public-host-credentials"),
  copyInviteLink: () => ipcRenderer.invoke("desktop:copy-invite-link"),
  openInviteLink: () => ipcRenderer.invoke("desktop:open-invite-link"),
  syncGmState: (payload) => ipcRenderer.invoke("desktop:sync-gm-state", payload),
  emitSmokeSignal: (signal, detail) => ipcRenderer.send("desktop:smoke-signal", signal, detail),
  subscribeHostEvents: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:host-status", listener);
    return () => ipcRenderer.removeListener("desktop:host-status", listener);
  },
  subscribeSharedState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:shared-sim-state", listener);
    return () => ipcRenderer.removeListener("desktop:shared-sim-state", listener);
  }
});
