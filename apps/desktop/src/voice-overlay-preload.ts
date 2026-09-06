import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("pulseVoiceOverlay", {
  toggle: () => ipcRenderer.send("desktop:voice:toggle"),
  cancel: () => ipcRenderer.send("desktop:voice:cancel"),
  onStatus: (listener: (status: { phase: string; message: string }) => void) => {
    ipcRenderer.on("desktop:voice:status", (_event, status) => listener(status));
  },
});
