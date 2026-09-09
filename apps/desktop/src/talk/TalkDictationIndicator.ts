import { BrowserWindow, screen } from "electron";

/** Electron owns this passive indicator; it never takes focus from the paste target. */
export function createDictationIndicator() {
  let window: BrowserWindow | undefined;
  return (active: boolean) => {
    if (!active) {
      window?.destroy();
      window = undefined;
      return;
    }
    if (window) return;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const indicator = new BrowserWindow({
      width: 360,
      height: 76,
      x: Math.round(area.x + (area.width - 360) / 2),
      y: area.y + area.height - 100,
      frame: false,
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: "#202024",
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    window = indicator;
    indicator.setIgnoreMouseEvents(true);
    indicator.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    indicator.webContents.on("will-navigate", (event) => event.preventDefault());
    indicator.once("ready-to-show", () => {
      if (!indicator.isDestroyed() && window === indicator) indicator.showInactive();
    });
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;padding:16px;font:14px system-ui;color:#fafafa}small{display:block;color:#c4c4cb;margin-top:4px}</style><strong>Pulse Talk · Dictation active</strong><small>Release to transcribe. Escape cancels recording.</small>`;
    void indicator.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {
      if (window === indicator) {
        indicator.destroy();
        window = undefined;
      }
    });
  };
}
