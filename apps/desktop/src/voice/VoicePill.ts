import * as Electron from "electron";

import type { PulseVoiceRect } from "./PulseVoiceClient.ts";

export type VoicePillState =
  | { readonly kind: "recording"; readonly level: number }
  | { readonly kind: "transcribing" }
  | { readonly kind: "error"; readonly message: string };

const PILL_WIDTH = 220;
const PILL_HEIGHT = 44;
const PILL_BOTTOM_MARGIN = 28;

/** Bottom-center of a work area, in the work area's coordinate space. */
export function pillBounds(workArea: PulseVoiceRect): Electron.Rectangle {
  return {
    x: Math.round(workArea.x + (workArea.width - PILL_WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height - PILL_HEIGHT - PILL_BOTTOM_MARGIN),
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
  };
}

// State changes repaint the pill; nothing animates on its own.
const PILL_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;user-select:none;
font:500 13px/1 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
#pill{box-sizing:border-box;height:100%;display:flex;align-items:center;justify-content:center;gap:10px;
padding:0 16px;border-radius:22px;background:rgba(20,20,22,.92);color:#f4f4f5;
border:1px solid rgba(255,255,255,.12)}
#bars{display:flex;align-items:center;gap:3px;height:20px}
#bars i{display:block;width:3px;height:4px;border-radius:2px;background:#f4f4f5}
#dot{width:8px;height:8px;border-radius:50%;background:#ef4444}
#pill.transcribing #dot{background:#a1a1aa}
#pill.error #dot{background:#f59e0b}
#pill:not(.recording) #bars{display:none}
#label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
</style></head><body><div id="pill" class="recording"><span id="dot"></span>
<span id="bars"><i></i><i></i><i></i><i></i><i></i></span><span id="label">Listening</span></div>
<script>
const shape=[.55,.8,1,.8,.55];
window.__pill=(s)=>{const p=document.getElementById("pill");p.className=s.kind;
const l=document.getElementById("label");
if(s.kind==="recording"){l.textContent="Listening";
const v=Math.min(1,Math.sqrt(Math.max(0,s.level))*2.2);
document.querySelectorAll("#bars i").forEach((b,i)=>{b.style.height=(4+16*v*shape[i])+"px"});}
else if(s.kind==="transcribing"){l.textContent="Transcribing"}
else{l.textContent=s.message}};
</script></body></html>`;

/**
 * The dictation hover pill: a transparent, click-through, non-focusable window
 * that never takes focus from the app being dictated into. It is created once
 * and reused so showing it is a move plus `showInactive`.
 */
export class VoicePill {
  private window: Electron.BrowserWindow | undefined;
  private loaded: Promise<void> | undefined;

  private readonly platform: NodeJS.Platform;

  constructor(platform: NodeJS.Platform) {
    this.platform = platform;
  }

  /** Create the window ahead of the first hotkey press. */
  prepare(): Promise<void> {
    if (this.window && !this.window.isDestroyed() && this.loaded) return this.loaded;
    const window = new Electron.BrowserWindow({
      width: PILL_WIDTH,
      height: PILL_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    window.setAlwaysOnTop(true, "pop-up-menu");
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true);
    this.window = window;
    this.loaded = window
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PILL_HTML)}`)
      .catch(() => undefined);
    return this.loaded;
  }

  /** Show on the work area given in physical pixels (Windows `GetMonitorInfoW`). */
  async show(physicalWorkArea: PulseVoiceRect, state: VoicePillState): Promise<void> {
    await this.prepare();
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const workArea =
      this.platform === "win32"
        ? Electron.screen.screenToDipRect(null, physicalWorkArea)
        : physicalWorkArea;
    window.setBounds(pillBounds(workArea));
    this.render(state);
    window.showInactive();
  }

  update(state: VoicePillState): void {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) return;
    this.render(state);
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
    this.loaded = undefined;
  }

  private render(state: VoicePillState): void {
    void this.window?.webContents
      .executeJavaScript(`window.__pill(${JSON.stringify(state)})`, false)
      .catch(() => undefined);
  }
}
