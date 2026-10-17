import { DriveBrowseInput, DriveError, DriveFile, DriveFileId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

const Metadata = Schema.Struct({
  id: DriveFileId,
  name: Schema.String,
  mimeType: Schema.String,
  trashed: Schema.optionalKey(Schema.Boolean),
  modifiedTime: Schema.optionalKey(Schema.String),
  size: Schema.optionalKey(Schema.String),
  owners: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        displayName: Schema.optionalKey(Schema.String),
        emailAddress: Schema.optionalKey(Schema.String),
        me: Schema.optionalKey(Schema.Boolean),
      }),
    ).check(Schema.isMaxLength(100)),
  ),
  parents: DriveFile.fields.parents,
  driveId: DriveFile.fields.driveId,
  shortcutDetails: DriveFile.fields.shortcutDetails,
});
const fields =
  "id,name,mimeType,trashed,modifiedTime,size,owners(displayName,emailAddress,me),parents,driveId,shortcutDetails(targetId,targetMimeType)";
const mimeByType = {
  folder: "application/vnd.google-apps.folder",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
} as const;
const quote = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
const ProviderToken = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096));
const Owner = Schema.String.check(
  Schema.isMaxLength(256),
  Schema.isPattern(/^(?:me|[^\s@,;'"\\]+@[^\s@,;'"\\]+\.[^\s@,;'"\\]+)$/),
);
const DateBound = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.isPattern(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/,
  ),
  Schema.makeFilter((value) => {
    const calendarDate = value.slice(0, 10);
    const parsed = DateTime.make(`${calendarDate}T00:00:00Z`);
    return (
      Option.isSome(parsed) &&
      DateTime.formatIsoDateUtc(parsed.value) === calendarDate &&
      Option.isSome(DateTime.make(value))
    );
  }),
);
const ListInput = Schema.Struct({
  parentId: DriveFileId,
  pageToken: Schema.optionalKey(ProviderToken),
  query: DriveBrowseInput.fields.query,
  type: DriveBrowseInput.fields.type,
  owner: Schema.optionalKey(Owner),
  modifiedAfter: Schema.optionalKey(DateBound),
  modifiedBefore: Schema.optionalKey(DateBound),
  sort: DriveBrowseInput.fields.sort,
  direction: DriveBrowseInput.fields.direction,
  limit: DriveBrowseInput.fields.limit,
});
const decodeListInput = Schema.decodeUnknownEffect(ListInput);
export const validateListInput = Effect.fnUntraced(function* (input: typeof ListInput.Type) {
  const decoded = yield* decodeListInput(input).pipe(
    Effect.mapError(() =>
      fail("invalid-input", "Use valid folder filters and a page size from 1 to 50."),
    ),
  );
  const after = decoded.modifiedAfter ? DateTime.makeUnsafe(decoded.modifiedAfter) : undefined;
  const before = decoded.modifiedBefore ? DateTime.makeUnsafe(decoded.modifiedBefore) : undefined;
  if (after && before && !DateTime.isLessThan(after, before))
    return yield* fail(
      "invalid-input",
      "Use one owner email or me, and valid ordered RFC3339 date bounds.",
    );
  const { query, ...rest } = decoded;
  return {
    ...rest,
    ...(query?.trim() ? { query: query.trim() } : {}),
    ...(after ? { modifiedAfter: DateTime.formatIso(after) } : {}),
    ...(before ? { modifiedBefore: DateTime.formatIso(before) } : {}),
  };
});
const isDriveError = Schema.is(DriveError);
const fail = (kind: DriveError["kind"], message: string) => new DriveError({ kind, message });
const metadata = (value: typeof Metadata.Type): DriveFile => ({
  id: value.id,
  name: value.name.slice(0, 300),
  mimeType: value.mimeType.slice(0, 160),
  url:
    value.mimeType === mimeByType.folder
      ? `https://drive.google.com/drive/folders/${value.id}`
      : value.mimeType === mimeByType.document
        ? `https://docs.google.com/document/d/${value.id}/edit`
        : value.mimeType === mimeByType.spreadsheet
          ? `https://docs.google.com/spreadsheets/d/${value.id}/edit`
          : value.mimeType === mimeByType.presentation
            ? `https://docs.google.com/presentation/d/${value.id}/edit`
            : `https://drive.google.com/file/d/${value.id}/view`,
  ...(value.modifiedTime ? { modifiedTime: value.modifiedTime.slice(0, 64) } : {}),
  ...(value.size ? { size: value.size.slice(0, 30) } : {}),
  ...(value.owners?.[0]
    ? { owner: (value.owners[0].displayName ?? value.owners[0].emailAddress ?? "").slice(0, 160) }
    : {}),
  ...(value.owners
    ? {
        owners: value.owners.map(({ displayName, emailAddress, ...owner }) => ({
          ...owner,
          ...(displayName !== undefined ? { displayName: displayName.slice(0, 160) } : {}),
          ...(emailAddress !== undefined ? { emailAddress: emailAddress.slice(0, 256) } : {}),
        })),
      }
    : {}),
  ...(value.parents ? { parents: value.parents } : {}),
  ...(value.driveId ? { driveId: value.driveId } : {}),
  ...(value.shortcutDetails ? { shortcutDetails: value.shortcutDetails } : {}),
});
export const DRIVE_CONTENT_LIMIT = 262144;
export const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const request = (token: string, path: string, params: Record<string, string> = {}) =>
    http
      .execute(
        HttpClientRequest.get(`https://www.googleapis.com/drive/v3/${path}`).pipe(
          HttpClientRequest.setHeader("authorization", `Bearer ${token}`),
          HttpClientRequest.setUrlParams(params),
        ),
      )
      .pipe(
        Effect.mapError(() => fail("unavailable", "Google Drive could not be reached.")),
        Effect.flatMap((response) =>
          response.status >= 200 && response.status < 300
            ? Effect.succeed(response)
            : Effect.fail(
                fail(
                  response.status === 401
                    ? "auth-required"
                    : response.status === 404
                      ? "not-found"
                      : "unavailable",
                  response.status === 401
                    ? "Reconnect this Drive connection in Settings."
                    : response.status === 404
                      ? "This file was removed or is not available to this account."
                      : "Google Drive did not allow this request.",
                ),
              ),
        ),
        Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
      );
  const json = <S extends Schema.Top>(
    token: string,
    path: string,
    schema: S,
    params: Record<string, string> = {},
  ) =>
    request(token, path, params).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(Schema.decodeUnknownEffect(schema)),
      Effect.mapError((error) =>
        isDriveError(error)
          ? error
          : fail("unavailable", "Google Drive returned an invalid response."),
      ),
      Effect.timeoutOrElse({
        duration: "15 seconds",
        orElse: () => Effect.fail(fail("unavailable", "Google Drive timed out.")),
      }),
    );
  const file = (token: string, id: string) =>
    json(token, `files/${encodeURIComponent(id)}`, Metadata, {
      fields,
      supportsAllDrives: "true",
    }).pipe(
      Effect.flatMap((value) =>
        value.id !== id || value.trashed
          ? Effect.fail(fail("not-found", "This file is no longer available."))
          : Effect.succeed(metadata(value)),
      ),
    );
  return {
    identity: (token: string) =>
      json(
        token,
        "about",
        Schema.Struct({
          user: Schema.Struct({
            permissionId: Schema.String,
            displayName: Schema.String,
            emailAddress: Schema.optionalKey(Schema.String),
          }),
        }),
        { fields: "user(permissionId,displayName,emailAddress)" },
      ).pipe(
        Effect.map(({ user }) => ({
          id: user.permissionId,
          name: user.displayName.slice(0, 200),
          ...(user.emailAddress ? { email: user.emailAddress.slice(0, 256) } : {}),
        })),
      ),
    file,
    listChildren: Effect.fnUntraced(function* (token: string, raw: typeof ListInput.Type) {
      const input = yield* validateListInput(raw);
      const clauses = ["trashed = false", `${quote(input.parentId)} in parents`];
      if (input.query?.trim()) clauses.push(`name contains ${quote(input.query.trim())}`);
      if (input.type && input.type !== "other")
        clauses.push(`mimeType = ${quote(mimeByType[input.type])}`);
      if (input.type === "other") {
        for (const mime of Object.values(mimeByType)) clauses.push(`mimeType != ${quote(mime)}`);
        clauses.push("mimeType != 'application/vnd.google-apps.shortcut'");
      }
      if (input.owner) clauses.push(`${quote(input.owner)} in owners`);
      if (input.modifiedAfter) clauses.push(`modifiedTime >= ${quote(input.modifiedAfter)}`);
      if (input.modifiedBefore) clauses.push(`modifiedTime < ${quote(input.modifiedBefore)}`);
      const modifier = input.direction === "desc" ? " desc" : "";
      const result = yield* json(
        token,
        "files",
        Schema.Struct({
          files: Schema.Array(Metadata).check(Schema.isMaxLength(input.limit)),
          nextPageToken: Schema.optionalKey(ProviderToken),
          incompleteSearch: Schema.optionalKey(Schema.Boolean),
        }),
        {
          q: clauses.join(" and "),
          orderBy:
            input.sort === "name"
              ? `folder,name${modifier}`
              : `folder,modifiedTime${modifier},name`,
          pageSize: String(input.limit),
          ...(input.pageToken ? { pageToken: input.pageToken } : {}),
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
          fields: `nextPageToken,incompleteSearch,files(${fields})`,
        },
      );
      if (result.files.some((file) => file.trashed))
        return yield* fail("unavailable", "Google Drive returned unavailable file metadata.");
      return {
        files: result.files.map(metadata),
        ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
        incomplete: result.incompleteSearch === true,
      };
    }),
    search: (token: string, query: string, limit: number) =>
      json(
        token,
        "files",
        Schema.Struct({
          files: Schema.Array(Metadata),
          nextPageToken: Schema.optionalKey(Schema.String),
          incompleteSearch: Schema.optionalKey(Schema.Boolean),
        }),
        {
          q: `trashed = false and name contains ${quote(query)}`,
          pageSize: String(limit),
          fields: `files(${fields}),nextPageToken,incompleteSearch`,
          includeItemsFromAllDrives: "true",
          supportsAllDrives: "true",
        },
      ).pipe(
        Effect.map((result) => ({
          files: result.files.slice(0, limit).map(metadata),
          incomplete: Boolean(
            result.nextPageToken || result.incompleteSearch || result.files.length > limit,
          ),
        })),
      ),
    content: (token: string, info: DriveFile) =>
      Effect.gen(function* () {
        const native: Record<string, string> = {
          "application/vnd.google-apps.document": "text/plain",
          "application/vnd.google-apps.presentation": "text/plain",
          "application/vnd.google-apps.spreadsheet": "text/csv",
        };
        const exported = native[info.mimeType];
        if (
          !exported &&
          !info.mimeType.startsWith("text/") &&
          !["application/json", "application/xml"].includes(info.mimeType)
        )
          return yield* fail(
            "unsupported",
            "This file type cannot be read here. Open it in Google Drive.",
          );
        const response = yield* request(
          token,
          `files/${encodeURIComponent(info.id)}${exported ? "/export" : ""}`,
          exported ? { mimeType: exported } : { alt: "media" },
        );
        let total = 0;
        const chunks: Uint8Array[] = [];
        yield* response.stream.pipe(
          Stream.map((chunk) => {
            const remaining = DRIVE_CONTENT_LIMIT + 1 - total;
            if (remaining > 0) {
              const part = chunk.slice(0, remaining);
              chunks.push(part);
              total += part.length;
            }
            return total;
          }),
          Stream.takeUntil((size) => size > DRIVE_CONTENT_LIMIT),
          Stream.runDrain,
        );
        const bytes = Buffer.concat(chunks);
        let end = Math.min(bytes.length, DRIVE_CONTENT_LIMIT);
        while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
        return {
          bytes: bytes.subarray(0, end),
          truncated: bytes.length > DRIVE_CONTENT_LIMIT,
          ...(info.mimeType === "application/vnd.google-apps.spreadsheet"
            ? { limitation: "CSV export contains the first sheet only." }
            : {}),
        };
      }).pipe(
        Effect.mapError((error) =>
          isDriveError(error) ? error : fail("unavailable", "The file could not be read."),
        ),
        Effect.timeoutOrElse({
          duration: "15 seconds",
          orElse: () => Effect.fail(fail("unavailable", "Reading the file timed out.")),
        }),
      ),
  };
});
export class DriveApi extends Context.Service<DriveApi, Effect.Success<typeof make>>()(
  "t3/drive/DriveApi",
) {}
export const layer = Layer.effect(DriveApi, make);
