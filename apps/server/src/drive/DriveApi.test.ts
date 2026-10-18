import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Api from "./DriveApi.ts";
import { makeFakeDrive } from "./testing/fakeDrive.ts";

const input = {
  parentId: "synkek-root",
  sort: "name" as const,
  direction: "asc" as const,
  limit: 20,
};
it.effect.each([
  ["text/plain", undefined],
  ["application/json", undefined],
  ["application/xml", undefined],
  ["application/vnd.google-apps.document", "text/plain"],
  ["application/vnd.google-apps.presentation", "text/plain"],
  ["application/vnd.google-apps.spreadsheet", "text/csv"],
] as const)(
  "reads supported %s content using its provider representation",
  ([mimeType, exported]) =>
    Effect.gen(function* () {
      const fake = makeFakeDrive();
      const api = yield* Api.make.pipe(Effect.provide(fake.layer));
      const result = yield* api.content("token", {
        id: "file",
        name: "Brief",
        mimeType,
        url: "https://drive.google.com/file/d/file/view",
      });
      expect(new TextDecoder().decode(result.bytes)).toBe("Synthetic launch brief");
      expect(fake.calls[0]!.url.pathname).toBe(`/drive/v3/files/file${exported ? "/export" : ""}`);
      expect(fake.calls[0]!.url.searchParams.get(exported ? "mimeType" : "alt")).toBe(
        exported ?? "media",
      );
    }),
);
it.effect.each([
  "application/pdf",
  "application/vnd.google-apps.folder",
  "application/vnd.google-apps.shortcut",
])("rejects unsupported %s content before requesting a body", (mimeType) =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const error = yield* api
      .content("token", {
        id: "file",
        name: "Brief",
        mimeType,
        url: "https://drive.google.com/file/d/file/view",
      })
      .pipe(Effect.flip);
    expect(error.kind).toBe("unsupported");
    expect(fake.calls).toHaveLength(0);
  }),
);
it.effect.each([262143, 262144, 262145])("bounds a %s-byte body to 256 KiB", (size) =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.content = "a".repeat(size);
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const result = yield* api.content("token", {
      id: "file",
      name: "Brief",
      mimeType: "text/plain",
      url: "https://drive.google.com/file/d/file/view",
    });
    expect(result.bytes.length).toBe(Math.min(size, 262144));
    expect(result.truncated).toBe(size > 262144);
  }),
);
it.effect("keeps a multibyte character whole at the content limit", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.content = "a".repeat(262143) + "€";
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const result = yield* api.content("token", {
      id: "file",
      name: "Brief",
      mimeType: "text/plain",
      url: "https://drive.google.com/file/d/file/view",
    });
    expect(new TextDecoder("utf-8", { fatal: true }).decode(result.bytes)).toBe("a".repeat(262143));
    expect(result.truncated).toBe(true);
  }),
);
it.effect.each([
  ["mimeType", 161],
  ["modifiedTime", 65],
  ["size", 31],
] as const)("rejects oversized structural metadata %s without truncating it", ([field, length]) =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({
      files: [{ id: "file", name: "File", mimeType: "text/plain", [field]: "x".repeat(length) }],
    });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const result = yield* api.listChildren("token", input).pipe(Effect.flip);
    expect(result.kind).toBe("unavailable");
  }),
);
it.effect.each([
  ["folder", "application/vnd.google-apps.folder", "https://drive.google.com/drive/folders/file"],
  [
    "document",
    "application/vnd.google-apps.document",
    "https://docs.google.com/document/d/file/edit",
  ],
  [
    "spreadsheet",
    "application/vnd.google-apps.spreadsheet",
    "https://docs.google.com/spreadsheets/d/file/edit",
  ],
  [
    "presentation",
    "application/vnd.google-apps.presentation",
    "https://docs.google.com/presentation/d/file/edit",
  ],
] as const)(
  "maps %s metadata to its canonical URL without reading its body",
  ([type, mimeType, url]) =>
    Effect.gen(function* () {
      const fake = makeFakeDrive();
      fake.state.listRequests.push({
        files: [
          {
            id: "file",
            name: "File",
            mimeType,
            parents: ["synkek-root"],
            owners: [{ displayName: "Owner", emailAddress: "owner@example.test", me: true }],
          },
        ],
      });
      const api = yield* Api.make.pipe(Effect.provide(fake.layer));
      const page = yield* api.listChildren("token", { ...input, type });
      expect(page.files[0]).toMatchObject({
        url,
        owner: "Owner",
        owners: [{ displayName: "Owner", emailAddress: "owner@example.test", me: true }],
        parents: ["synkek-root"],
      });
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]!.url.searchParams.get("q")).toBe(
        `trashed = false and 'synkek-root' in parents and mimeType = '${mimeType}'`,
      );
    }),
);
it.effect("keeps shortcut identities and links without dereferencing their targets", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({
      files: [
        {
          id: "shortcut",
          name: "Shortcut",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: {
            targetId: "outside",
            targetMimeType: "application/vnd.google-apps.folder",
          },
        },
      ],
    });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const page = yield* api.listChildren("token", input);
    expect(page.files[0]).toMatchObject({
      id: "shortcut",
      url: "https://drive.google.com/file/d/shortcut/view",
      shortcutDetails: {
        targetId: "outside",
        targetMimeType: "application/vnd.google-apps.folder",
      },
    });
    expect(fake.calls).toHaveLength(1);
  }),
);
it.effect("filters and sorts the folder query before requesting a page", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({ files: [], nextPageToken: "third", incompleteSearch: true });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const page = yield* api.listChildren("synthetic-token", {
      ...input,
      query: "Nina's \\ plan",
      type: "document",
      owner: "owner@example.test",
      modifiedAfter: "2026-10-10T00:00:00Z",
      sort: "modifiedTime",
      direction: "desc",
      pageToken: "second-provider-page",
    });
    const call = fake.calls.at(-1)!;
    expect(call.method).toBe("GET");
    expect(call.url.searchParams.get("q")).toBe(
      "trashed = false and 'synkek-root' in parents and name contains 'Nina\\'s \\\\ plan' and mimeType = 'application/vnd.google-apps.document' and 'owner@example.test' in owners and modifiedTime >= '2026-10-10T00:00:00.000Z'",
    );
    expect(call.url.searchParams.get("orderBy")).toBe("folder,modifiedTime desc,name");
    expect(call.url.searchParams.get("pageToken")).toBe("second-provider-page");
    expect(call.url.searchParams.get("pageSize")).toBe("20");
    expect(call.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(call.url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(call.url.searchParams.get("fields")).toBe(
      "nextPageToken,incompleteSearch,files(id,name,mimeType,trashed,modifiedTime,size,owners(displayName,emailAddress,me),parents,driveId,shortcutDetails(targetId,targetMimeType))",
    );
    expect(page).toEqual({ files: [], nextPageToken: "third", incomplete: true });
  }),
);

it.effect.each(["asc", "desc"] as const)(
  "uses provider name order %s and excludes shortcuts from other files",
  (direction) =>
    Effect.gen(function* () {
      const fake = makeFakeDrive();
      fake.state.listRequests.push({ files: [] });
      const api = yield* Api.make.pipe(Effect.provide(fake.layer));
      yield* api.listChildren("token", {
        ...input,
        direction,
        type: "other",
        owner: "me",
        modifiedBefore: "2026-10-15T00:00:00Z",
      });
      const params = fake.calls[0]!.url.searchParams;
      expect(params.get("orderBy")).toBe(direction === "asc" ? "folder,name" : "folder,name desc");
      expect(params.get("q")).toBe(
        "trashed = false and 'synkek-root' in parents and mimeType != 'application/vnd.google-apps.folder' and mimeType != 'application/vnd.google-apps.document' and mimeType != 'application/vnd.google-apps.spreadsheet' and mimeType != 'application/vnd.google-apps.presentation' and mimeType != 'application/vnd.google-apps.shortcut' and 'me' in owners and modifiedTime < '2026-10-15T00:00:00.000Z'",
      );
    }),
);

it.effect.each([
  { owner: "a@example.test' or trashed = true" },
  { owner: "a@example.test,b@example.test" },
  { modifiedAfter: "2026-02-30T00:00:00Z" },
  { modifiedAfter: "2026-02-29T23:00:00-02:00" },
  { modifiedAfter: "2026-04-31T01:00:00+02:00" },
  { modifiedAfter: "2026-00-10T00:00:00Z" },
  { modifiedAfter: "2026-10-10T24:00:00Z" },
  { modifiedAfter: "2026-10-10T00:00:00" },
  { owner: "a@example.test\\" },
  { owner: "a@example.test; b@example.test" },
  { modifiedBefore: "yesterday" },
  { modifiedAfter: "2026-10-15T00:00:00Z", modifiedBefore: "2026-10-14T00:00:00Z" },
  { modifiedAfter: "2026-10-15T02:00:00+02:00", modifiedBefore: "2026-10-15T00:00:00Z" },
  { limit: 51 },
  { pageToken: "x".repeat(4097) },
])("rejects invalid listing filters before HTTP: %j", (invalid) =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    expect(
      (yield* api.listChildren("token", { ...input, ...invalid }).pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect(fake.calls).toHaveLength(0);
  }),
);

it.effect.each([
  Array.from({ length: 21 }, (_, i) => ({ id: `file-${i}`, name: "File", mimeType: "text/plain" })),
  [{ id: "../bad", name: "File", mimeType: "text/plain" }],
  [{ id: "file", name: "File", mimeType: "text/plain", parents: ["../bad"] }],
  [
    {
      id: "file",
      name: "File",
      mimeType: "text/plain",
      owners: Array.from({ length: 101 }, () => ({ me: true })),
    },
  ],
])("rejects malformed or oversized metadata instead of losing rows: %j", (files) =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({ files });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    expect((yield* api.listChildren("token", input).pipe(Effect.flip)).kind).toBe("unavailable");
  }),
);

it.effect("truncates a 301-character child name without dropping its row", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({
      files: [{ id: "file", name: "x".repeat(301), mimeType: "text/plain" }],
    });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    expect((yield* api.listChildren("token", input)).files.map((file) => file.name)).toEqual([
      "x".repeat(300),
    ]);
  }),
);

it.effect("normalizes checked calendar bounds and query text at the API boundary", () =>
  Effect.gen(function* () {
    expect(
      yield* Api.validateListInput({
        ...input,
        query: "  brief  ",
        owner: "me",
        modifiedAfter: "2024-02-29T23:30:00-02:00",
        modifiedBefore: "2024-03-01T03:00:00+00:00",
      }),
    ).toEqual({
      ...input,
      query: "brief",
      owner: "me",
      modifiedAfter: "2024-03-01T01:30:00.000Z",
      modifiedBefore: "2024-03-01T03:00:00.000Z",
    });
  }),
);

it.effect("sorts modifiedTime ascending with both normalized date bounds", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({ files: [] });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    yield* api.listChildren("token", {
      ...input,
      sort: "modifiedTime",
      modifiedAfter: "2026-10-10T02:00:00+02:00",
      modifiedBefore: "2026-10-15T00:00:00Z",
    });
    expect(fake.calls[0]!.url.searchParams.get("orderBy")).toBe("folder,modifiedTime,name");
    expect(fake.calls[0]!.url.searchParams.get("q")).toBe(
      "trashed = false and 'synkek-root' in parents and modifiedTime >= '2026-10-10T00:00:00.000Z' and modifiedTime < '2026-10-15T00:00:00.000Z'",
    );
  }),
);

it.effect("escapes quotes and backslashes identically in search and child queries", () =>
  Effect.gen(function* () {
    const fake = makeFakeDrive();
    fake.state.listRequests.push({ files: [] }, { files: [] });
    const api = yield* Api.make.pipe(Effect.provide(fake.layer));
    const query = "Nina's \\ plan";
    yield* api.search("token", query, 20);
    yield* api.listChildren("token", { ...input, query });
    expect(fake.calls[0]!.url.searchParams.get("q")).toBe(
      "trashed = false and name contains 'Nina\\'s \\\\ plan'",
    );
    expect(fake.calls[1]!.url.searchParams.get("q")).toBe(
      "trashed = false and 'synkek-root' in parents and name contains 'Nina\\'s \\\\ plan'",
    );
  }),
);
