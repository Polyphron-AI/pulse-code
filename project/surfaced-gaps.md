# Surfaced gaps

This file is the session gap-watch inbox. Durable integration gaps live in
[known-gaps.md](known-gaps.md) and `project/state/shards/gaps.yaml`.

## Open

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

- **2026-08-21 · G-2026-08-21-workspace-endpoints-yaml-parser · high:** The ProductOps workspace
  renderer cannot parse `project/state/shards/endpoints.yaml` (`line 2: unbalanced flow
collection`), so the unified workspace cannot be regenerated after synchronizing the OAuth
  release-gate plan. Resolve the shard syntax or renderer subset compatibility, then rerun
  `workspace_render.py --check` and `--out`; do not hand-edit `project/workspace.html`.

- **2026-08-20 · G-2026-08-20-externally-managed-credential-mode · medium:** T9 found that GitHub's
  existing server-owned `gh` profile is neither an absent credential nor a `ServerSecretStore`
  secret. Define ownership/mode and disconnect semantics before building the GitHub work adapter.

## Consumed

- **2026-08-23:** `G-2026-08-21-workspace-endpoints-yaml-parser` was resolved by normalizing the
  ProductOps-owned endpoint, roadmap, and surface shards to its supported YAML subset. The unified
  workspace now passes renderer input checks and freshness verification.

- **2026-08-22:** `G-2026-08-22-inert-file-link-tap` is closed. A tapped workspace-file link whose
  path the workspace could not address fell through `onMarkdownLinkPress` to a bare `return`, so the
  link looked live and did nothing. Narrower than first recorded: `b2c0509c6` had already fixed the
  filename-only case via a workspace index lookup, leaving only absolute-outside-root, absolute with
  no thread cwd, and `~/`-prefixed paths. Fixed by `resolveWorkspaceLinkTarget` in
  `apps/mobile/src/features/files/filePath.ts`, which names the reason, plus an alert with Copy path.
  The first record of this gap cited a pre-`b2c0509c6` tree; treat that citation as superseded.

- **2026-08-20:** `G-2026-08-20-integration-transport-bridge-unassigned` was resolved by T11's typed
  server bridge and T12's client/mobile runtime binding. Mixed-version verification continues in T8.

- **2026-08-19:** `G-2026-08-19-tokenizer-definition`,
  `G-2026-08-19-shared-server-connection-ownership`, and
  `G-2026-08-19-secret-store-guarantees` were linked into
  `CR-2026-08-19-pulse-integrations-foundation` and retained in the durable gap register.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-22 . **Last edited:** 2026-08-22 . **Status:** active . **Owner:** Product
