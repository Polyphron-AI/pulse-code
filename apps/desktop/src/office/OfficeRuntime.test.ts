import { describe, expect, it, vi } from "vite-plus/test";
vi.mock("electron", () => ({
  app: {},
  dialog: {},
  globalShortcut: { unregister: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  safeStorage: {},
  shell: {},
}));
import { ipcMain } from "electron";
import * as configuration from "./OfficeOAuthConfig.ts";
import { installOfficeRuntime, isTrustedOfficeFrame } from "./OfficeRuntime.ts";

describe("Office IPC caller isolation", () => {
  it("keeps the desktop available when Office registration configuration is invalid", async () => {
    const config = vi
      .spyOn(configuration, "loadOfficeOAuthConfiguration")
      .mockRejectedValue(new Error("Office OAuth registration configuration is invalid."));
    vi.stubEnv("PULSE_TALK_WORKER", "C:/isolated-test-pulse/worker.exe");
    const runtime = await installOfficeRuntime({
      stateDir: "C:/isolated-test-pulse",
      platform: "win32",
      scheme: "pulse-preview",
    });
    try {
      const handler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find(([channel]) => channel === "pulse:office")?.[1];
      expect(handler).toBeDefined();
      const frame = { url: "pulse-preview://app/workspace" };
      const event = { senderFrame: frame, sender: { mainFrame: frame } } as unknown as Parameters<
        NonNullable<typeof handler>
      >[0];
      expect(
        await handler!(event, {
          operation: "accounts.connectOAuth",
          provider: "google",
          capabilities: ["mail"],
        }),
      ).toMatchObject({
        ok: false,
        error: {
          code: "setup_required",
          message: expect.stringContaining("configuration is invalid"),
        },
      });
    } finally {
      await runtime.close();
      config.mockRestore();
      vi.unstubAllEnvs();
    }
  });
  it("accepts only the app's top frame and exact protocol host", () => {
    expect(
      isTrustedOfficeFrame("pulse-preview://app/workspace?space=office", true, "pulse-preview"),
    ).toBe(true);
    for (const url of [
      "https://app/",
      "pulse-preview://attacker/",
      "pulse-preview://app.evil/",
      "file:///app",
      "not a url",
      "pulsecode://app/",
    ]) {
      expect(isTrustedOfficeFrame(url, true, "pulse-preview")).toBe(false);
    }
    expect(isTrustedOfficeFrame("pulse-preview://app/", false, "pulse-preview")).toBe(false);
  });
});
