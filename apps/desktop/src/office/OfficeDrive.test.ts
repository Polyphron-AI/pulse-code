import { describe, expect, it } from "vite-plus/test";
import { createOfficeProviders, type ProviderContext } from "./OfficeProviders.ts";
import { oauthScopes } from "./OfficeOAuth.ts";

const context: ProviderContext = {
  account: {
    id: "g",
    provider: "google",
    email: "test@example.com",
    capabilities: ["drive"],
    status: "connected",
    selectedCalendarIds: [],
  },
  credentials: {
    oauth: { accessToken: "private-token", refreshToken: "private-refresh", expiresAt: 999999 },
  },
  signal: new AbortController().signal,
};
const folder = {
  id: "folder",
  name: "Marketing",
  mimeType: "application/vnd.google-apps.folder",
  parents: ["root"],
};
describe("Google Drive read connector", () => {
  it("scopes folder search, escapes provider filters, and carries shared-drive pagination", async () => {
    const providers = createOfficeProviders(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe("https://www.googleapis.com/drive/v3/files");
      expect(url.searchParams.get("q")).toBe(
        "trashed = false and 'folder\\'id' in parents and name contains 'team\\\\brief\\''",
      );
      expect(url.searchParams.get("supportsAllDrives")).toBe("true");
      expect(url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
      expect(url.searchParams.get("pageToken")).toBe("next");
      expect(url.searchParams.get("pageSize")).toBe("25");
      expect(init?.redirect).toBe("error");
      return Response.json({ files: [folder], nextPageToken: "more" });
    });
    expect(await providers.driveFiles(context, "folder'id", "next", "team\\brief'", 25)).toEqual({
      files: [folder],
      nextCursor: "more",
    });
  });
  it("exports Google documents with a bounded text stream", async () => {
    const providers = createOfficeProviders(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/export")) {
        expect(url.searchParams.get("mimeType")).toBe("text/plain");
        return new Response("a".repeat(2_000_001));
      }
      return Response.json({ ...folder, mimeType: "application/vnd.google-apps.document" });
    });
    const result = await providers.driveFile(context, "folder");
    expect(result.text).toHaveLength(2_000_000);
    expect(result.textTruncated).toBe(true);
  });
  it.each([401, 403, 404, 500])("sanitizes provider errors for HTTP %s", async (status) => {
    const providers = createOfficeProviders(async () => new Response("private-token", { status }));
    await expect(providers.driveFiles(context, "root", undefined, undefined, 50)).rejects.toThrow(
      /Drive/,
    );
    await expect(
      providers.driveFiles(context, "root", undefined, undefined, 50),
    ).rejects.not.toThrow("private-token");
  });
  it.each([
    { files: [{}] },
    { files: "invalid" },
    { files: [{ ...folder, webViewLink: "javascript:alert(1)" }] },
    { nextPageToken: {} },
  ])("rejects malformed provider data", async (body) => {
    const providers = createOfficeProviders(async () => Response.json(body));
    await expect(providers.driveFiles(context, "root", undefined, undefined, 50)).rejects.toThrow(
      /invalid/,
    );
  });
  it("requests read-only Drive access and rejects non-Google Drive grants", () => {
    expect(oauthScopes("google", ["drive"])).toContain(
      "https://www.googleapis.com/auth/drive.readonly",
    );
    expect(oauthScopes("google", ["drive"])).not.toContain("gmail");
    expect(() => oauthScopes("microsoft", ["drive"])).toThrow(/Google/);
  });
});
describe("Google Drive note export", () => {
  it("creates a text file in the chosen folder without changing permissions", async () => {
    const methods: string[] = [];
    const providers = createOfficeProviders(async (input, init) => {
      const url = new URL(String(input));
      methods.push(init?.method ?? "GET");
      expect(init?.redirect).toBe("error");
      if (!init?.method) {
        expect(url.pathname).toBe("/drive/v3/files/folder");
        return Response.json({ ...folder, capabilities: { canAddChildren: true } });
      }
      expect(url.pathname).toBe("/upload/drive/v3/files");
      expect(url.searchParams.get("uploadType")).toBe("multipart");
      expect(url.searchParams.get("supportsAllDrives")).toBe("true");
      expect(new Headers(init.headers).get("Content-Type")).toContain(
        "multipart/related; boundary=pulse-",
      );
      expect(String(init.body)).toContain('"parents":["folder"]');
      expect(String(init.body)).toContain('"name":"Planning.txt"');
      expect(String(init.body)).toContain("Decisions and actions");
      return Response.json({
        id: "note",
        name: "Planning.txt",
        mimeType: "text/plain",
        parents: ["folder"],
        webViewLink: "https://drive.google.com/file/d/note/view",
      });
    });
    expect(
      await providers.exportNote(context, "folder", "Planning", "Decisions and actions"),
    ).toMatchObject({ id: "note", parents: ["folder"] });
    expect(methods).toEqual(["GET", "POST"]);
  });
  it("refuses read-only folders before uploading", async () => {
    let calls = 0;
    const providers = createOfficeProviders(async () => {
      calls++;
      return Response.json({ ...folder, capabilities: { canAddChildren: false } });
    });
    await expect(
      providers.exportNote(context, "folder", "Planning", "Notes"),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(calls).toBe(1);
  });
  it("does not retry an uncertain export or fall back to a different folder", async () => {
    let uploads = 0;
    const providers = createOfficeProviders(async (_input, init) => {
      if (!init?.method)
        return Response.json({ ...folder, capabilities: { canAddChildren: true } });
      uploads++;
      throw new Error("lost connection");
    });
    await expect(providers.exportNote(context, "folder", "Planning", "Notes")).rejects.toThrow(
      "Check the Drive folder before trying again",
    );
    expect(uploads).toBe(1);
  });
  it("reports missing app access without requesting a broader scope", async () => {
    const providers = createOfficeProviders(async (_input, init) =>
      !init?.method
        ? Response.json({ ...folder, capabilities: { canAddChildren: true } })
        : new Response("private", { status: 403 }),
    );
    await expect(providers.exportNote(context, "folder", "Planning", "Notes")).rejects.toThrow(
      "Google Picker",
    );
    expect(oauthScopes("google", ["drive", "driveWrite"]).split(" ")).toEqual(
      expect.arrayContaining([
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ]),
    );
    expect(oauthScopes("google", ["drive"])).not.toContain("drive.file");
    expect(oauthScopes("google", ["driveWrite"]).split(" ")).not.toContain(
      "https://www.googleapis.com/auth/drive",
    );
  });
});
