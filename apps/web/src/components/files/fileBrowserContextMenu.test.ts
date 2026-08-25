import { describe, expect, it } from "vite-plus/test";

import {
  fileBrowserContextMenuItems,
  shouldOfferFileManagerReveal,
} from "./fileBrowserContextMenu";

describe("shouldOfferFileManagerReveal", () => {
  it("offers reveal for a file in the primary desktop environment", () => {
    expect(
      shouldOfferFileManagerReveal({
        environmentId: "primary",
        primaryEnvironmentId: "primary",
        itemPath: "src/index.ts",
        isDesktop: true,
      }),
    ).toBe(true);
  });

  it.each([
    {
      itemPath: "src/",
      environmentId: "primary",
      primaryEnvironmentId: "primary",
      isDesktop: true,
    },
    {
      itemPath: "src/index.ts",
      environmentId: "remote",
      primaryEnvironmentId: "primary",
      isDesktop: true,
    },
    {
      itemPath: "src/index.ts",
      environmentId: "primary",
      primaryEnvironmentId: "primary",
      isDesktop: false,
    },
  ])("does not offer reveal for directories, remote environments, or web", (input) => {
    expect(shouldOfferFileManagerReveal(input)).toBe(false);
  });
});

describe("fileBrowserContextMenuItems", () => {
  it("adds the platform reveal action when the desktop can reveal the file", () => {
    expect(fileBrowserContextMenuItems({ canRevealPath: true, platform: "Win32" })).toEqual([
      { id: "reveal-path", label: "Reveal in File Explorer" },
      { id: "copy-mention", label: "Copy mention" },
      { id: "add-to-chat", label: "Add to chat" },
    ]);
  });

  it("keeps the existing menu when the host cannot reveal the file", () => {
    expect(fileBrowserContextMenuItems({ canRevealPath: false, platform: "Win32" })).toEqual([
      { id: "copy-mention", label: "Copy mention" },
      { id: "add-to-chat", label: "Add to chat" },
    ]);
  });
});
