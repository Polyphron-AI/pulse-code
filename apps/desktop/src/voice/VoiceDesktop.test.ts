import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { sender: unknown }, value: unknown) => Promise<unknown>>(),
  toggle: null as ((target: string) => void) | null,
  configure: vi.fn(async () => ""),
  close: vi.fn(),
  deliver: vi.fn(async () => ""),
  focused: false,
  sender: { getURL: () => "pulsecode://app/", isDestroyed: () => false, send: vi.fn() },
}));
vi.mock("electron", () => ({
  app: { on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: { fromWebContents: () => ({ isFocused: () => mocks.focused }) },
  ipcMain: {
    handle: (
      name: string,
      handler: (event: { sender: unknown }, value: unknown) => Promise<unknown>,
    ) => mocks.handlers.set(name, handler),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  screen: {},
}));
vi.mock("./WindowsVoice.ts", () => ({
  startWindowsVoice: (toggle: (target: string) => void) => {
    mocks.toggle = toggle;
    return { configure: mocks.configure, close: mocks.close, deliver: mocks.deliver };
  },
}));
import { installVoiceDesktop } from "./VoiceDesktop.ts";
describe("desktop voice routing", () => {
  let dispose: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.focused = false;
    mocks.toggle = null;
    dispose = installVoiceDesktop("/app/preload.cjs", "http://localhost:3000", "win32");
  });
  afterEach(() => dispose());
  const call = (name: string, value: unknown) =>
    mocks.handlers.get("desktop:voice:" + name)!({ sender: mocks.sender }, value);
  const settings = { shortcut: "ctrl+shift+space", globalEnabled: true, hoverEnabled: false };
  it("keeps the original target when a second shortcut stops recording", async () => {
    await call("configure", settings);
    mocks.toggle!("original-field");
    await call("publish", { phase: "recording", message: "Listening" });
    mocks.toggle!("different-field");
    expect(mocks.sender.send).toHaveBeenLastCalledWith("desktop:voice:action", {
      kind: "toggle",
      target: "original-field",
    });
    await call("deliver", { target: "original-field", text: "hello" });
    expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith("original-field", "hello");
  });
  it("uses composer insertion when Pulse Code is focused", async () => {
    mocks.focused = true;
    await call("configure", settings);
    mocks.toggle!("native-field");
    expect(mocks.sender.send).toHaveBeenLastCalledWith("desktop:voice:action", {
      kind: "toggle",
      target: null,
    });
  });
  it("stops its owned helper when desktop voice is disabled", async () => {
    await call("configure", settings);
    await call("configure", { ...settings, globalEnabled: false });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("rejects delivery to an unrecognized target", async () => {
    await call("configure", settings);
    mocks.toggle!("original-field");
    await expect(call("deliver", { target: "other-field", text: "hello" })).rejects.toThrow(
      "target is unavailable",
    );
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
