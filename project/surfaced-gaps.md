# Surfaced gaps

This file is the session gap-watch inbox. Durable integration gaps live in
[known-gaps.md](known-gaps.md) and `project/state/shards/gaps.yaml`.

## Open

- **2026-08-22 · G-2026-08-22-inert-file-link-tap · high:** A workspace-file link in mobile chat can
  be completely inert with no feedback. `ThreadFeed.tsx:1414` guards the whole interaction on
  `resolveWorkspaceRelativeFilePath(props.workspaceRoot, presentation.path)` and falls through to a
  bare `return` when it yields null, so no sheet, alert, haptic, or log occurs. Null happens when the
  link is absolute and `workspaceRoot` is null, absolute and outside `workspaceRoot/`, or starts with
  `~/` (`apps/mobile/src/features/files/filePath.ts:64`). `workspaceRoot` is the nullable thread cwd
  (`ThreadDetailScreen.tsx:589` passes `props.threadCwd`), not the project workspace root, so a link
  the agent wrote against the project root can be unresolvable. Present since `30034eced`
  (2026-06-18); `d4ec0aaf3` added the action sheet inside the same guard and did not address it.
  Observed by the maintainer on Android against a `pulse-go` thread.

- **2026-08-22 · G-2026-08-22-document-asset-type-gate · high:** The Open with action shipped in
  `R-2026-08-21-mobile-file-link-actions` cannot serve most documents. `issueAssetUrl` gates every
  `workspace-file` resource through `isWorkspacePreviewEntryPath`, which allows only `.htm`,
  `.html`, `.pdf`, and images, so links to `.docx`, `.xlsx`, `.csv`, `.md`, and archives fail with
  `AssetPreviewTypeValidationError` after the sheet has already offered the action. The user sees a
  generic download failure. `R-2026-08-22-document-link-durability` closes this with a download
  intent; until then the shipped action is only usable for browser-previewable types.

- **2026-08-22 · G-2026-08-22-icon-regeneration-macos-only · medium:** The mobile file-icon
  pipeline cannot be regenerated on Windows.
  `apps/mobile/modules/t3-markdown-text/scripts/sync-pierre-file-icons.mjs:109` rasterizes each
  symbol with `sips`, which exists only on macOS, so any new icon — including the pdf, word, and
  slides art wanted for document links — is unbuildable from a Windows checkout. Authoring the
  symbols is not the blocker: `customIcons` plus `T3_FILE_ICON_SPRITE` in
  `apps/web/src/pierre-icons.ts` already carries six repo-authored icons, and upstream
  `@pierre/trees` 1.0.0-beta.4 has no document symbol to map to. Replace the rasterizer with a
  cross-platform one, or regenerate on a macOS runner.

- **2026-08-21 · G-2026-08-21-windows-secret-acl-inspector · high:** INT-SEC-01 now exposes a
  bounded, fail-closed host-protection report, but Windows remains OAuth-ineligible until the
  packaged server can inspect effective ACL grants and identify untrusted principals. A successful
  `chmod` call is intentionally not accepted as evidence; PAT auth and server startup remain
  available while this release gate is open.

- **2026-08-20 · G-2026-08-20-externally-managed-credential-mode · medium:** T9 found that GitHub's
  existing server-owned `gh` profile is neither an absent credential nor a `ServerSecretStore`
  secret. Define ownership/mode and disconnect semantics before building the GitHub work adapter.

## Consumed

- **2026-08-23:** `G-2026-08-21-workspace-endpoints-yaml-parser` was resolved by converting the
  endpoint shard to supported block mappings; deterministic render, freshness, and Minion checks
  now pass.

- **2026-08-20:** `G-2026-08-20-integration-transport-bridge-unassigned` was resolved by T11's typed
  server bridge and T12's client/mobile runtime binding. Mixed-version verification continues in T8.

- **2026-08-19:** `G-2026-08-19-tokenizer-definition`,
  `G-2026-08-19-shared-server-connection-ownership`, and
  `G-2026-08-19-secret-store-guarantees` were linked into
  `CR-2026-08-19-pulse-integrations-foundation` and retained in the durable gap register.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-23 . **Last edited:** 2026-08-23 . **Status:** active . **Owner:** Product
