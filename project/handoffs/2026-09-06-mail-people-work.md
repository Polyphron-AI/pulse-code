# Mail people and work MVP

Status: manual slice implemented; full requested Luna MVP is unfinished.

Worktree: `F:/Dev Ops/T3/Pulse Code/.worktrees/pulse-mail`. Existing mail and UI changes were uncommitted before this task and remain preserved. No commit, merge, live mail operation, server launch or browser test was performed.

## Implemented

- Optional persisted people context in MailStore, compatible with existing state files.
- Candidate people from opened message headers; explicit identity confirmation, correction, dismissal and restoration.
- Tasks and feedback requests associated with participants and source correspondence. Revision checks, edit, completion/resolution, reopen, dismissal and restore.
- Work edits survive an unavailable original message. Provider-confirmed moves and folder renames relocate evidence; arbitrary cross-account copies do not.
- Mail/Office People panel, outstanding work first, suggested/past/dismissed work groups, lazy source preview, and latest observed correspondence. The panel inherits the existing Impeccable/Pulse visual system.
- Native Mail participant and work controls with source navigation. Shared environment-scoped query/mutation atoms and a `mailPeople` capability gate.
- Typed discovery-result validation with exact excerpts and canonical endpoint checks. Tests cover dismissal preservation across reworded output. This is preparatory domain logic, not an integrated agent.

## Pending authorization and work

Permission update: the user subsequently requested adding the required permission to AGENTS.md. Both the main checkout and pulse-mail AGENTS.md now record scoped authorization for selected-email Luna analysis and isolated browser testing with synthetic data. The historical rejection below is retained for context; re-submit the integration through normal tool approval with this new user authorization. Implementation and visual verification remain pending until completed.

Automatic approval review rejected the proposed Luna adapter patch because it would transmit email headers, up to 24,000 characters of message text and confirmed identity context to a configured Codex provider. The patch was not applied. A user approval question for that specific data flow is pending. Do not bypass the rejection. No model invocation or discovery RPC exists yet; `discoveryAvailable` is false.

A separate user question asks permission for an isolated browser test with synthetic data. AGENTS.md requires that permission. Impeccable's finish review requires fresh captures, so it has not been performed. Do not reuse the pre-existing Office/mail screenshots as evidence for this feature. The new direction brief is `apps/web/.impeccable/surfaces/mail-people.md`; the existing DESIGN.md remains the visual authority.

After approval, complete bounded Codex/Luna extraction using the configured provider, source-specific receipts, deduplication, cancellation and per-account opt-in; wire the pending/error/review experience on both clients. The rejected proposal aimed to reuse `CodexTextGeneration`'s structured subprocess path. Provider instance selection must respect enabled state. Other adapters need explicit unsupported behavior. Do not route email through an unrelated title-generation prompt.

Calendar, CRM import, aliases/merges, universal Tasks integration and graph analytics remain outside this manual slice. The mail-alpha records must not be advertised as an implemented universal Tasks service.

## Verification

- Server focused tests: 31 passed across MailPeople, MailEngine and RpcAuthorization.
- Shared-client mail tests: 2 passed, including equal account identifiers in different environments.
- Web and server scoped typechecks passed. Server emitted existing suggestions outside mail.
- Targeted web lint passed. Targeted server lint initially reported two warnings; schema compilation was hoisted and excerpt checking adjusted afterward.
- Impeccable static detector on People panel, MailReader and OfficeWorkspace returned `[]`. This is not visual verification.
- Mobile typecheck remains unsuccessful with 68 diagnostics, primarily existing navigation calls typed as `never`; no diagnostics named the new MailPeoplePanel.
- `git diff --check` passed.

Use direct `node_modules/.bin/tsgo.CMD` and `vp.CMD` on this Windows host. `pnpm exec` unexpectedly performed workspace auto-install; it was stopped before running the requested check, after reporting three dependency additions. The worktree lockfile already had changes before this task. No intentional dependency was added by the People implementation; preserve existing mail dependency changes. Vite and compiler caches need execution permission for this worktree. Set `NODE_OPTIONS=--experimental-strip-types` for Vite under Node 22.14.0. Do not run repository-wide checks.
