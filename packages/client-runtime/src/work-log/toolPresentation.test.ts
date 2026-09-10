import { describe, expect, it } from "@effect/vitest";

import {
  workEntryViewedImagePath,
  extractToolActivityPresentation,
  summarizeToolSources,
} from "./toolPresentation.ts";

describe("extractToolActivityPresentation", () => {
  it("reads provider-neutral presentation fields", () => {
    expect(
      extractToolActivityPresentation({
        toolSurface: "browser",
        toolIcon: {
          _tag: "website",
          pageUrl: "https://example.com/docs",
          faviconUrl: "https://example.com/favicon.png",
          faviconUrlDark: "https://example.com/favicon-dark.png",
        },
        toolSource: {
          key: "integration:example",
          name: "Example",
          kind: "integration",
          icon: {
            _tag: "themed-logo",
            logoUrl: "https://example.com/logo-light.png",
            logoUrlDark: "https://example.com/logo-dark.png",
          },
        },
      }),
    ).toEqual({
      toolSurface: "browser",
      toolIcon: {
        _tag: "website",
        pageUrl: "https://example.com/docs",
        faviconUrl: "https://example.com/favicon.png",
        faviconUrlDark: "https://example.com/favicon-dark.png",
      },
      toolSource: {
        key: "integration:example",
        name: "Example",
        kind: "integration",
        icon: {
          _tag: "themed-logo",
          logoUrl: "https://example.com/logo-light.png",
          logoUrlDark: "https://example.com/logo-dark.png",
        },
      },
    });
  });

  it("reads provider-neutral native app icons", () => {
    expect(
      extractToolActivityPresentation({
        toolSurface: "computer",
        toolIcon: {
          _tag: "native-app",
          app: { _tag: "app-id", appId: "com.example.Editor" },
        },
        toolSource: {
          key: "native-app:com.example.editor",
          name: "Editor",
          kind: "computer",
        },
      }),
    ).toEqual({
      toolSurface: "computer",
      toolIcon: {
        _tag: "native-app",
        app: { _tag: "app-id", appId: "com.example.Editor" },
      },
      toolSource: {
        key: "native-app:com.example.editor",
        name: "Editor",
        kind: "computer",
      },
    });
  });

  it("does not infer presentation from provider-specific payload data", () => {
    expect(
      extractToolActivityPresentation({
        data: {
          item: {
            arguments: { code: 'await sky.click({ app: "Finder" })' },
            result: {
              _meta: {
                "codex/toolSurface": {
                  kind: "computerUse",
                  app: { kind: "displayName", displayName: "Finder" },
                },
              },
            },
          },
        },
      }),
    ).toEqual({});
  });
});

it("summarizes sources once without combining unrelated integrations", () => {
  const chrome = { toolSource: { key: "chrome", name: "Chrome", kind: "integration" as const } };
  expect(summarizeToolSources([chrome, chrome])).toBe("Used Chrome integration");
  expect(
    summarizeToolSources([
      chrome,
      { toolSource: { key: "finder", name: "Finder", kind: "computer" } },
    ]),
  ).toBe("Used Chrome and Finder");
  expect(summarizeToolSources([{}])).toBeUndefined();
});

describe("viewed image tools", () => {
  it("recognizes explicit image and read tools only", () => {
    expect(workEntryViewedImagePath({ itemType: "image_view", detail: " /tmp/image.png " })).toBe(
      "/tmp/image.png",
    );
    expect(
      workEntryViewedImagePath({ requestKind: "file-read", detail: "C:\\work\\photo.webp" }),
    ).toBe("C:\\work\\photo.webp");
    expect(
      workEntryViewedImagePath({
        itemType: "dynamic_tool_call",
        toolTitle: "Read file",
        detail: "photo.jpg",
      }),
    ).toBe("photo.jpg");
    expect(
      workEntryViewedImagePath({ itemType: "command_execution", detail: "photo.png" }),
    ).toBeNull();
    expect(
      workEntryViewedImagePath({ itemType: "image_view", detail: "photo.png\nother.png" }),
    ).toBeNull();
    expect(workEntryViewedImagePath({ itemType: "image_view", detail: "script.ts" })).toBeNull();
    expect(
      workEntryViewedImagePath({ itemType: "image_view", detail: "https://example.com/photo.png" }),
    ).toBeNull();
  });
});
