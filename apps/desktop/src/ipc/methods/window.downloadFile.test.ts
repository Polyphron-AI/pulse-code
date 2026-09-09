import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { BrowserWindow } from "electron";
import { vi } from "vite-plus/test";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import { downloadFile } from "./window.ts";

describe("downloadFile", () => {
  it.effect("passes the original environment URL to Electron and rejects non-asset URLs", () => {
    const downloadURL = vi.fn();
    const window = { webContents: { downloadURL } } as unknown as BrowserWindow;
    return Effect.gen(function* () {
      const remoteUrl = "https://remote.example/api/assets/signed-token/report.xlsx";
      expect(yield* downloadFile.handler(remoteUrl)).toBe(true);
      expect(downloadURL).toHaveBeenCalledWith(remoteUrl);
      for (const url of ["file:///etc/passwd", "https://example.com/file.xlsx", "invalid"]) {
        expect(yield* downloadFile.handler(url)).toBe(false);
      }
      expect(downloadURL).toHaveBeenCalledTimes(1);
    }).pipe(
      Effect.provide(
        Layer.mock(ElectronWindow.ElectronWindow)({ main: Effect.succeed(Option.some(window)) }),
      ),
    );
  });
});
