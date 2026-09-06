// @effect-diagnostics nodeBuiltinImport:off - Electron adapter installed and disposed by the Effect application scope.
import { app, BrowserWindow, ipcMain, screen, type WebContents } from "electron";
import * as NodePath from "node:path";
import { parseVoiceShortcut } from "@t3tools/shared/voiceShortcut";
import { startWindowsVoice } from "./WindowsVoice.ts";

const prefix = "desktop:voice:";
export function installVoiceDesktop(
  preloadPath: string,
  rendererOrigin: string,
  platform: NodeJS.Platform,
) {
  let renderer: WebContents | null = null;
  let overlay: BrowserWindow | null = null;
  let native: ReturnType<typeof startWindowsVoice> | null = null;
  let phase = "idle";
  let hover = false;
  let generation = 0;
  let activeTarget: string | null = null;
  let lastMessage = "";
  function send(kind: "toggle" | "cancel", target: string | null = null) {
    if (renderer && !renderer.isDestroyed()) renderer.send(prefix + "action", { kind, target });
  }
  function status(message: string) {
    lastMessage = message;
    overlay?.webContents.send(prefix + "status", { phase, message });
  }
  function reportError(message: string) {
    phase = "error";
    status(message);
    position(true);
    if (renderer && !renderer.isDestroyed())
      renderer.send(prefix + "action", { kind: "error", target: null, message });
  }
  function activate(target: string) {
    if (!["idle", "error", "recording"].includes(phase)) return;
    if (phase === "recording") {
      send("toggle", activeTarget);
      return;
    }
    const mainFocused = renderer && BrowserWindow.fromWebContents(renderer)?.isFocused();
    if (!mainFocused && !target) {
      reportError("Click an accessible text field before recording.");
      return;
    }
    activeTarget = mainFocused ? null : target;
    send("toggle", activeTarget);
  }
  function position(expanded: boolean) {
    if (!overlay) return;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = expanded ? 320 : 80;
    const height = expanded ? 92 : 32;
    overlay.setBounds({
      x: Math.round(area.x + (area.width - width) / 2),
      y: area.y + area.height - height - 16,
      width,
      height,
    });
  }
  function showOverlay() {
    if (!hover) {
      overlay?.hide();
      return;
    }
    if (!overlay) {
      overlay = new BrowserWindow({
        width: 80,
        height: 32,
        frame: false,
        transparent: true,
        resizable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
          preload: NodePath.join(NodePath.dirname(preloadPath), "voice-overlay-preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      overlay.webContents.on("will-navigate", (event) => event.preventDefault());
      void overlay.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>body{margin:0;font:13px system-ui;color:#fff;background:#202229;border-radius:16px;overflow:hidden}button{border:0;background:transparent;color:inherit;cursor:pointer;padding:7px 12px}#toggle{width:100%;height:32px}#details{padding:0 12px 8px;display:none}#message{margin:0;max-height:30px;overflow:hidden}#cancel{float:right;padding:3px}body.expanded #details{display:block}body.recording{background:#8d2634}</style></head><body><button id="toggle" aria-label="Start voice capture">● Mic</button><div id="details"><p id="message" role="status"></p><button id="cancel">Cancel</button></div><script>const api=window.pulseVoiceOverlay;document.getElementById('toggle').onclick=()=>api.toggle();document.getElementById('cancel').onclick=()=>api.cancel();api.onStatus(s=>{document.body.className=(s.phase==='idle'?'':'expanded ')+s.phase;document.getElementById('message').textContent=s.message;document.getElementById('toggle').textContent=s.phase==='recording'?'■ Stop recording':'● Mic';});</script></body></html>`,
          ),
      );
      overlay.webContents.on("did-finish-load", () => {
        position(phase !== "idle");
        status(lastMessage);
        if (hover) overlay?.showInactive();
      });
    }
    position(phase !== "idle");
    overlay.showInactive();
  }
  function trusted(sender: WebContents) {
    const url = new URL(sender.getURL());
    return (
      Boolean(BrowserWindow.fromWebContents(sender)) &&
      (url.protocol === "pulsecode:" ||
        url.protocol === "pulsecode-dev:" ||
        url.origin === rendererOrigin)
    );
  }
  ipcMain.handle(prefix + "configure", async (event, value: unknown) => {
    if (!trusted(event.sender) || typeof value !== "object" || !value)
      throw new Error("Invalid voice configuration.");
    if (
      !("shortcut" in value) ||
      typeof value.shortcut !== "string" ||
      !parseVoiceShortcut(value.shortcut) ||
      !("globalEnabled" in value) ||
      typeof value.globalEnabled !== "boolean" ||
      !("hoverEnabled" in value) ||
      typeof value.hoverEnabled !== "boolean"
    )
      throw new Error("Invalid voice configuration.");
    const version = ++generation;
    renderer = event.sender;
    hover = value.hoverEnabled;
    if (!value.globalEnabled && !hover) {
      native?.close();
      native = null;
      overlay?.hide();
      return;
    }
    if (platform !== "win32")
      throw new Error("Desktop-wide voice capture is currently available on Windows.");
    native ??= startWindowsVoice(activate, (message) => {
      native = null;
      reportError(message);
    });
    await native.configure(value.globalEnabled ? value.shortcut : null);
    if (version === generation) showOverlay();
  });
  ipcMain.handle(prefix + "publish", (event, value: unknown) => {
    if (
      event.sender !== renderer ||
      typeof value !== "object" ||
      !value ||
      !("phase" in value) ||
      typeof value.phase !== "string" ||
      !("message" in value) ||
      typeof value.message !== "string"
    )
      return;
    phase = value.phase;
    if (hover) {
      position(phase !== "idle");
      status(value.message.slice(0, 500));
    }
    if (phase === "idle" || phase === "error") activeTarget = null;
  });
  ipcMain.handle(prefix + "deliver", async (event, value: unknown) => {
    if (
      event.sender !== renderer ||
      !native ||
      typeof value !== "object" ||
      !value ||
      !("target" in value) ||
      typeof value.target !== "string" ||
      value.target !== activeTarget ||
      !("text" in value) ||
      typeof value.text !== "string" ||
      value.text.length > 20000
    )
      throw new Error("Dictation target is unavailable. Copy the transcript from Pulse Code.");
    await native.deliver(value.target, value.text);
    activeTarget = null;
  });
  ipcMain.on(prefix + "toggle", (event) => {
    if (event.sender !== overlay?.webContents || !native) return;
    if (phase === "recording") {
      send("toggle", activeTarget);
      return;
    }
    void native
      .capture()
      .then(activate)
      .catch((error: unknown) =>
        reportError(error instanceof Error ? error.message : "Capture failed."),
      );
  });
  ipcMain.on(prefix + "cancel", (event) => {
    if (event.sender === overlay?.webContents) send("cancel");
  });
  const focused = (_event: Electron.Event, window: BrowserWindow) => {
    if (["idle", "error"].includes(phase) && trusted(window.webContents))
      renderer = window.webContents;
  };
  app.on("browser-window-focus", focused);
  return () => {
    ++generation;
    native?.close();
    overlay?.destroy();
    for (const method of ["configure", "publish", "deliver"])
      ipcMain.removeHandler(prefix + method);
    ipcMain.removeAllListeners(prefix + "toggle");
    ipcMain.removeAllListeners(prefix + "cancel");
    app.removeListener("browser-window-focus", focused);
  };
}
