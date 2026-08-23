# Durable document links — feature design

Status: proposed
Date: 2026-08-22

## One-line pitch

A chat link to a project document stays openable for as long as the document
exists, because the client re-resolves and re-streams it on every tap instead of
trusting a stored copy or a previously minted URL — and the mobile sheet tells the
user what the tap will cost before it spends their tunnel bandwidth on it.

## Problem

A user reads a thread on their phone five days after the work happened, over
Pulse Connect, Tailscale, or the managed relay, and taps the link to the report
the agent produced. Three separate things stop that from working today.

0. **The tap can do nothing at all.** The whole interaction is guarded on
   `resolveWorkspaceRelativeFilePath` and falls through to a bare `return` when
   that yields null (`apps/mobile/src/features/threads/ThreadFeed.tsx:1414`), so
   the link is inert with no sheet, alert, haptic, or log. Null happens for a link
   that is absolute with a null `workspaceRoot`, absolute outside
   `workspaceRoot/`, or `~/`-prefixed (`apps/mobile/src/features/files/filePath.ts:64`),
   and `workspaceRoot` is the nullable thread cwd rather than the project
   workspace root (`ThreadDetailScreen.tsx:589`). This is the first failure a user
   meets and it predates the other two — observed on Android, 2026-08-22,
   `G-2026-08-22-inert-file-link-tap`. A tap must always produce a response: when
   the path cannot be resolved against the workspace, say which path was seen and
   keep **Copy path** available.
1. **Most documents cannot be served at all.** `issueAssetUrl` gates every
   `workspace-file` resource through `isWorkspacePreviewEntryPath`
   (`apps/server/src/assets/AssetAccess.ts:212`), which allows only `.htm`,
   `.html`, `.pdf`, and images (`packages/shared/src/filePreview.ts:1`). A link to
   `report.docx`, `export.csv`, `notes.md`, or `bundle.zip` fails with
   `AssetPreviewTypeValidationError`. Mobile still shows the Open with sheet and
   then errors, so the feature reads as broken rather than unsupported.
2. **Every failure looks the same.** `openWorkspaceFileWith` collapses a
   disconnected environment, an unsupported type, an expired token, and a deleted
   document into one alert (`apps/mobile/src/features/threads/ThreadFeed.tsx:1449`).
   Five days later the most likely cause is that the document moved or was
   deleted, and that is precisely the case the user cannot currently distinguish
   from a bug.
3. **Nothing is presented for a slow link.** The sheet offers "Preview in Pulse
   Code" for files the built-in viewer cannot render, and the download starts with
   no size, no progress, and no way out — on a connection that may be a phone on
   cellular reaching a laptop through a tunnel.

Two things that look like the problem are not. Mobile mints the capability at tap
time, so no 5-day-old message carries an expired URL; and each open writes into a
fresh cache directory (`apps/mobile/src/features/files/openWorkspaceFileWith.ts:63`),
so the phone never serves stale bytes. Both properties are load-bearing for this
feature and currently untested. This design keeps them and pins them.

## Decided model

A document link is a **durable reference, not a URL**. Durability comes from
re-resolution, not from storage: thread plus workspace-relative path is the whole
reference, and every tap mints a fresh capability and re-streams the file from the
environment. Nothing is copied into Pulse Code home, nothing is retained, and no
retention window has to be chosen or swept.

The consequence is explicit and intended: the user gets the document as it exists
now. If a later turn rewrote it, they get the new version. If it was deleted, they
are told it is no longer in the project — a fact, not a failure. Serving the
version as of that turn from the checkpoint git ref was considered and rejected:
`git add -A` excludes gitignored paths (`apps/server/src/vcs/GitVcsDriver.ts:737`),
so exactly the generated reports and exports a user most wants on their phone
would be the ones missing, and the feature would be dishonest about which version
it served.

## Decided interaction

Tapping a workspace-file link presents actions chosen by what the file actually
is, with no network round trip before the sheet appears.

- **Previewable** (source and text files, plus `.pdf`, `.html`, images) keeps
  today's two actions: **Preview in Pulse Code** first, **Open with…** second.
- **Not previewable** (`.docx`, `.xlsx`, `.pptx`, archives, other binaries) drops
  the preview action entirely and offers **Open with…** and **Copy path**. The
  built-in viewer is source-oriented; offering it for a `.docx` promises a reading
  experience that does not exist.

**Open with…** resolves a download capability, and if the document is larger than
25 MB it first confirms with the size named in the prompt, because the connection
may be metered or tunnelled. The download then reports progress against the
server-declared byte size and can be cancelled.

External web, email, and telephone links keep their current behavior. The Files
tab keeps opening the built-in viewer directly. Web and desktop behavior does not
change.

## Architecture and data flow

### Asset intent

`AssetResource`'s `workspace-file` member gains an optional
`intent: "preview" | "download"`, defaulting to `preview`, so every existing
caller — web preview, favicons, mobile image previews — is unchanged by
construction.

- `intent: "preview"` keeps today's behavior exactly: the browser-preview gate,
  and a directory-scoped claim for `.html` so a page can pull its sibling
  stylesheet.
- `intent: "download"` accepts **any regular file inside the canonical workspace
  root**, with two tightenings over the preview path: the claim is always
  exact-path, never directory-scoped, so a download capability can never reach a
  sibling; and any path segment beginning with `.` is refused, which keeps `.env`,
  `.ssh/`, and `.git/` out of the capability entirely.

This is a smaller blast radius than the capability the server already issues. An
authenticated client can read any workspace text file through `projects.readFile`
(`packages/contracts/src/project.ts:194`), and the existing preview claim already
permits sibling traversal within a directory. The new intent adds binary reads for
non-dot paths inside the same root, minted only for an authenticated session
against that thread's workspace.

A fifth `AssetClaims` variant, `workspace-file-download`, carries the intent to
the resolve side so the HTTP route can set the right headers.

### What the mint tells the client

`AssetCreateUrlResult` gains optional `byteSize` and `mediaType`. `issueAssetUrl`
already stats the canonical file while validating it, so this is free, and it is
what lets the sheet state the cost of a tap before spending it.

### Response headers

Download-intent responses add `Content-Disposition: attachment` with an
RFC 5987-encoded filename, and replace today's `Cache-Control: private,
max-age=3600` with `private, no-cache` plus an `ETag` derived from size and mtime,
so a re-open revalidates instead of replaying an hour-old body. Preview intent
keeps today's headers unchanged.

### Mobile open path

`openWorkspaceFileWith` gains progress and cancellation. Both are already
available on the call it makes: `DownloadOptions` in expo-file-system 56.0.8
carries `onProgress` and an AbortSignal `signal`. Progress totals come from the
mint's `byteSize` rather than `Content-Length`, because the global compression
middleware (`apps/server/src/http.ts:58`) can leave the response chunked.

Re-streaming stays the rule: each open mints a new capability and downloads into a
fresh cache directory, so a stale or partial copy can never be handed to another
app. Cache hygiene improves — the next open sweeps previous
`workspace-file-open` directories, since the current one cannot be deleted on
success while the receiving app is still reading the URI.

The single-flight map keeps deduplicating double taps, but must not be reusable
once settled; that is the property that makes "tap again five days later" work,
and it gets a test.

## Error handling

Each cause gets its own message, because after five days the cause is the
information the user actually needs.

- Document no longer in the project (`AssetWorkspaceAssetNotFoundError`) — say so,
  and keep **Copy path** available so the user can ask the agent about it.
- Environment not connected — say reconnect, not "download failed".
- No app on the device can open this type — say that; the file was fetched fine.
- Cancelled — no alert at all.
- Download or share failure — the existing generic message, now genuinely generic.

A failed or cancelled download removes its partial cache directory. A dot-segment
or outside-root request is refused at mint time and never becomes a URL.

## Surface decisions

- **Entry points:** mobile chat markdown links. The Files tab and the composer
  path search are unchanged.
- **Clients:** mobile only. Web and desktop inherit the additive contract without
  behavior change; adopting download intent for the web link menu is deferred.
- **Providers:** not applicable — markdown links are provider-neutral.
- **Contracts:** additive and optional throughout (`intent`, `byteSize`,
  `mediaType`), so server, web, mobile, and desktop can land independently.
- **Reverse states:** an in-flight download can be cancelled; a missing document
  reports a state instead of an inert tap; the sheet always has a way out.
- **Connection modes:** local, remote/relay, and tunnel all resolve against the
  prepared connection's `httpBaseUrl`, which is how every other HTTP path in the
  client already works. The asset route is signed-token-only and carries no bearer
  header (`apps/server/src/http.ts:197`), so it needs nothing extra per mode.
- **Docs:** `docs/user/mobile-file-links.md` gains the size, progress, cancel, and
  missing-document behavior; `docs/internals/` records asset intents.

## Constraints and open questions

- Document icons are wanted and are a separate task, not a scoping refusal. The
  pipeline already supports repo-authored icons: `sync-pierre-file-icons.mjs`
  merges a `customIcons` map against the `T3_FILE_ICON_SPRITE` symbols in
  `apps/web/src/pierre-icons.ts`, which is how `agents`, `claude`, `package`,
  `pnpm`, `readme`, and `tsconfig` already exist. Upstream `@pierre/trees`
  1.0.0-beta.4 carries no pdf, word, or slides symbol (it has `table`, `zip`,
  `text`, `markdown`), so pdf/word/slides would be three hand-authored sprite
  symbols plus a regeneration. The blocker is the regeneration step, not the art:
  the script rasterizes with macOS-only `sips`
  (`apps/mobile/modules/t3-markdown-text/scripts/sync-pierre-file-icons.mjs:109`)
  and cannot run on this Windows machine. Tracked as
  `G-2026-08-22-icon-regeneration-macos-only`. Until then spreadsheets map to
  `table`, archives to `zip`, and the rest stay `default`, with type and size
  carried in the sheet.
- The 25 MB confirmation threshold is a judgement call, not a measurement. It is a
  single constant and should move once there is real evidence.
- The operating system still owns cache lifetime and still labels the chooser
  "Share" on some platforms.
- Deferred: whether web adopts download intent for its own link menu, and whether
  a document that is gone should offer to search the project for a moved copy.

## Verification

Mobile, first: a link whose path resolves to null still produces a visible
response naming the unresolved path, and never a silent return; this covers a null
workspace root, an absolute path outside the root, and a `~/` path.

Server: download intent issues a URL for a `.docx`; dot-segment paths are refused;
a download claim rejects a sibling path that the equivalent preview claim would
allow; the response carries an attachment disposition and a revalidating cache
header; `byteSize` matches the file.

Mobile: the sheet omits preview for non-previewable types and keeps it for
previewable ones; a large file confirms with its size before downloading;
cancellation removes the partial file and shows no alert; each tap mints a new
capability rather than reusing a settled single-flight entry; the next open sweeps
the previous cache directory; each failure cause maps to its own message.

Typechecks for contracts, server, and mobile. Integrated mobile validation stays
optional and requires explicit approval under repository policy.

## Build order

0. Mobile: make the tap always respond. Smallest independent fix, ships ahead of
   the contract work, and covers the defect the maintainer actually hit.
1. Contracts: optional `intent` on the workspace-file resource, optional
   `byteSize` and `mediaType` on the result.
2. Server: download claim variant, the any-file-minus-dot-segments rule, size and
   media type on the mint, download response headers, and focused tests.
3. Mobile helper: progress, cancellation, cache sweep, cause-specific errors, and
   focused tests.
4. Mobile presentation: type-aware sheet, size confirmation, progress row with
   cancel.
5. Docs: `docs/user/mobile-file-links.md` and the internals note.

---

**Created:** 2026-08-22 . **Status:** proposed . **Owner:** Product
