import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import { OfficeDriveFile } from "@t3tools/contracts";
import { OfficeError, object } from "./OfficeErrors.ts";
import type { OfficeProviders, ProviderContext } from "./OfficeProviders.ts";

const fields = "id,name,mimeType,parents,modifiedTime,size,webViewLink,capabilities(canComment)";
const decode = Schema.decodeUnknownSync(OfficeDriveFile);
const quote = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
const mapFile = (value: unknown): OfficeDriveFile => {
  try {
    const row = object(value);
    const file = decode({ ...row, parents: row.parents ?? [] });
    // Source URLs are displayed by the client; do not pass through arbitrary schemes or hosts.
    if (file.webViewLink) {
      const url = new URL(file.webViewLink);
      if (
        url.protocol !== "https:" ||
        !["drive.google.com", "docs.google.com"].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new Error("Invalid source URL");
    }
    return file;
  } catch {
    throw new OfficeError("network", "Google Drive returned an invalid file record.");
  }
};

/** Drive permissions and native document comments remain owned by Google. */
export function createDriveProvider(
  fetcher: typeof globalThis.fetch,
): Pick<OfficeProviders, "driveFiles" | "driveFile" | "exportNote"> {
  const request = async (context: ProviderContext, path: string, params: URLSearchParams) => {
    if (context.account.provider !== "google")
      throw new OfficeError("unsupported", "Drive requires a Google account.");
    if (!context.credentials.oauth)
      throw new OfficeError("authentication", "Reconnect Google Drive to restore access.");
    const response = await fetcher(`https://www.googleapis.com/drive/v3/files${path}?${params}`, {
      headers: { Authorization: `Bearer ${context.credentials.oauth.accessToken}` },
      redirect: "error",
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]),
    });
    if (response.status === 401)
      throw new OfficeError("authentication", "Reconnect Google Drive to restore access.");
    if (response.status === 403)
      throw new OfficeError(
        "unsupported",
        "Google Drive denied access. Check file permissions and that the Drive API is enabled.",
      );
    if (response.status === 404)
      throw new OfficeError(
        "not_found",
        "This Drive file is unavailable or you do not have access.",
      );
    if (!response.ok)
      throw new OfficeError(
        "network",
        `Google Drive could not complete the request (HTTP ${response.status}). Try again later.`,
      );
    return response;
  };
  return {
    exportNote: async (context, folderId, title, text) => {
      if (!title.trim() || title.length > 4096 || Buffer.byteLength(text, "utf8") > 4_500_000)
        throw new OfficeError(
          "invalid_request",
          "Enter a note title and keep the exported text below 4.5 MB.",
        );
      const folder = object(
        await (
          await request(
            context,
            `/${encodeURIComponent(folderId)}`,
            new URLSearchParams({
              fields: "id,mimeType,capabilities(canAddChildren)",
              supportsAllDrives: "true",
            }),
          )
        ).json(),
      );
      if (folder.mimeType !== "application/vnd.google-apps.folder")
        throw new OfficeError("invalid_request", "Choose a Google Drive folder for this note.");
      if (object(folder.capabilities).canAddChildren !== true)
        throw new OfficeError(
          "unsupported",
          "Google Drive does not allow this account to add files to the selected folder.",
        );
      const boundary = `pulse-${NodeCrypto.randomUUID()}`;
      const name = /\.txt$/i.test(title.trim()) ? title.trim() : `${title.trim()}.txt`;
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify({ name, mimeType: "text/plain", parents: [folderId] }),
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        text,
        `--${boundary}--`,
        "",
      ].join("\r\n");
      let response: Response;
      try {
        response = await fetcher(
          `https://www.googleapis.com/upload/drive/v3/files?${new URLSearchParams({ uploadType: "multipart", supportsAllDrives: "true", fields })}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${context.credentials.oauth!.accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
            redirect: "error",
            signal: AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]),
          },
        );
      } catch {
        throw new OfficeError(
          "network",
          "The export result could not be confirmed. Check the Drive folder before trying again. Your Pulse note is unchanged.",
        );
      }
      if (response.status === 401)
        throw new OfficeError(
          "authentication",
          "Reconnect Google Drive with permission to export files.",
        );
      if (response.status === 403 || response.status === 404)
        throw new OfficeError(
          "unsupported",
          "Google Drive has not granted Pulse permission to create files in this folder. Folder access may require selecting it with Google Picker. Your Pulse note is unchanged.",
        );
      if (!response.ok)
        throw new OfficeError(
          "network",
          `Export was not confirmed (HTTP ${response.status}). Check the Drive folder before trying again. Your Pulse note is unchanged.`,
        );
      try {
        return mapFile(await response.json());
      } catch {
        throw new OfficeError(
          "network",
          "Google Drive accepted the export but its file link could not be read. Check the folder before exporting again.",
        );
      }
    },
    driveFiles: async (context, folderId, cursor, query, limit) => {
      const params = new URLSearchParams({
        q: `trashed = false and '${quote(folderId)}' in parents${query?.trim() ? ` and name contains '${quote(query.trim())}'` : ""}`,
        pageSize: String(limit),
        fields: `nextPageToken,files(${fields})`,
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        orderBy: "folder,name_natural",
        ...(cursor ? { pageToken: cursor } : {}),
      });
      const data = object(await (await request(context, "", params)).json());
      if (
        (data.files !== undefined && !Array.isArray(data.files)) ||
        (data.nextPageToken !== undefined &&
          (typeof data.nextPageToken !== "string" || data.nextPageToken.length > 1024))
      )
        throw new OfficeError("network", "Google Drive returned an invalid file list.");
      const rows = data.files ?? [];
      if (!Array.isArray(rows) || rows.length > limit)
        throw new OfficeError("network", "Google Drive returned an invalid file list.");
      return {
        files: rows.map(mapFile),
        ...(typeof data.nextPageToken === "string" && data.nextPageToken
          ? { nextCursor: data.nextPageToken }
          : {}),
      };
    },
    driveFile: async (context, id) => {
      const path = `/${encodeURIComponent(id)}`;
      const file = mapFile(
        await (
          await request(context, path, new URLSearchParams({ fields, supportsAllDrives: "true" }))
        ).json(),
      );
      if (file.mimeType !== "application/vnd.google-apps.document") return file;
      const response = await request(
        context,
        `${path}/export`,
        new URLSearchParams({ mimeType: "text/plain" }),
      );
      const reader = response.body?.getReader();
      if (!reader)
        throw new OfficeError("network", "Google Drive returned an empty document response.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      let truncated = false;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const remaining = 2_000_000 - size;
          chunks.push(chunk.value.subarray(0, remaining));
          size += chunk.value.byteLength;
          if (size > 2_000_000) {
            truncated = true;
            await reader.cancel();
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
      return { ...file, text: Buffer.concat(chunks).toString("utf8"), textTruncated: truncated };
    },
  };
}
