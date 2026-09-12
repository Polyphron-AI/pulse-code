# Pulse Next launch design proposal

Status: defaults and module approach approved; visual comparison in progress.
Not implemented or platform-verified. The feature ledger owns scope and approval
state. The UI placements below still need comparison against the running baseline.

## Packaging

Retain the upstream tree and existing packages. Put cohesive Pulse modules inside
the owning server, web and contracts packages. Do not rename upstream packages,
copy the application into a second tree, or introduce a generic extension system.

Three modules earn their place at launch:

- Managed skills: imported content, immutable revisions, selection and update
  policy. Reuse upstream native/workspace skill discovery rather than replacing it.
- Managed MCP connections: environment-owned configuration and secrets, provider
  defaults, thread overrides and provider-session application.
- Dictation: recording lifecycle, backend selection, cancellation and delivery to
  the originating draft, with separate Parakeet and Groq adapters.

Keep the upstream integration edits explicit: settings composition, composer
controls, authenticated request registration and provider turn preparation.
Do not patch role reactors, add another thread store or build future role hooks.
Assess each actual integration against upstream before selecting its implementation.
Module names above describe ownership, not a mandate to create new npm packages.

## Proposed skills and MCP defaults

Retain file/ZIP and Git-linked skill imports with immutable revisions. Uploaded
skills stay pinned to the uploaded content until explicitly replaced or linked
to an update source. Offer **Pin version** and **Keep updated** for every skill.
Selecting Keep updated without a GitHub source prompts for a GitHub link and,
where needed, the skill directory and tracking branch/ref. Validate repository
access and the selected skill before enabling updates. Cancelling the prompt or
failing validation leaves the current content and pinned policy unchanged. A
skill with a valid saved source reuses it without prompting for the link again.
Pin version retains the resolved commit and content revision.
Keep updated follows the selected repository branch/ref, validates each update,
and makes a successful new revision available to subsequent turns. A fixed commit
cannot track updates; selecting Keep updated requires a tracking branch/ref.
Failed checks or invalid updates retain the last valid revision and show an error.
An active turn retains its selected immutable revision. Switching back to Pin
version freezes the current revision. Show the source, tracking ref and installed
revision so the selected policy is visible. Git hosting support beyond the current
GitHub importer still needs assessment; this policy does not imply support for
every Git host or authentication method.

Start with no bundled third-party content selected. Users import the skills they
need and explicitly choose the Git update policy. Preserve provider defaults and
per-thread overrides, with changes effective next turn.
Do not disable native or workspace skills through the managed-skills selector.

Retain environment-owned HTTP and local-command MCP configurations, protected
credentials, provider defaults and per-thread overrides. New connections start
disabled unless explicitly selected. Run local commands on the selected
environment, never on the browser device. Unsupported provider selections must
be unavailable, not silently ignored. Selected counts are not connection health.

These are proposed defaults, not approval to import content, run commands, use
credentials or install any MCP server during development.

## Dictation

Capture on the device displaying the composer. Separate capture from transcription
and draft insertion. A single lifecycle owns idle, preparing, recording,
transcribing, error and cancellation. Navigating or changing environment must not
deliver a late result into another draft. Stop and Cancel are different actions.
Do not submit the resulting text automatically.

Parakeet is the first local adapter candidate. The develop snapshot contains
`apps/web/src/voice/parakeet.worker.ts`, using parakeet.js with ONNX/WASM, and
`voiceCapture.ts`. This is evidence of an implementation, not proof of present
browser support or acceptable mobile memory/latency. Offer an explicit model
download/setup action. Load it lazily; opening a chat must not download or run it.

Groq is the opt-in remote adapter. Proposed flow: client recording to the selected
authenticated Pulse environment, then to Groq; return text only to the requesting
client. Keep the API credential in the environment secret store, never browser
storage or an unprotected shared preference. State where audio goes before use.
No automatic local-to-cloud fallback. Avoid persisting recordings by default.
Cancel local delivery and abort outstanding requests where supported; do not
promise cancellation can undo processing already accepted by an external API.

Groq documents a file-transcription API suitable for this stop-then-transcribe
flow. Supported formats and service limits must be checked during implementation:
https://console.groq.com/docs/speech-to-text

Windows, macOS, Linux and mobile web are launch targets. Test capture, codec,
microphone permissions, cancellation and draft preservation on each. Test local
Parakeet performance separately from Groq routing. Do not require mobile devices
to load Parakeet to use Groq. If local Parakeet is unsuitable on mobile, present
that limitation and the explicit Groq choice; do not claim both backends work
everywhere. Environment-hosted Parakeet would be a further design decision, not
an implicit fallback requiring another runtime.

## Minimal UI proposal

Keep T3 navigation, thread list, message feed and composer structure. No Office
switcher, agent dashboard or new top-level workspace.

| Location | Small Pulse addition |
| --- | --- |
| Composer on desktop/web | Model, effort, access, Skills, MCP in that order; microphone in the composer's top-right corner, Send/Stop and attachment at bottom-right |
| Narrow mobile web composer | Keep all five selectors visible in the same reading order: model/effort/access then Skills/MCP; microphone top-right, separated from Send/Stop at bottom-right |
| Existing settings | Managed skills, MCP connections and Dictation entries using existing settings composition |
| Dictation settings | Backend, local model setup/status, or protected Groq configuration; explicit audio destination |
| Active recording | Static status, elapsed time if useful, Stop and Cancel; no continuously animated waveform |

The baseline was inspected in Chromium at 1280x800 and 390x844 on 2026-09-12.
Desktop has model, effort and access controls on the left, attachment and send on
the right. Mobile already collapses configuration into More composer controls.
The user's subsequent direction overrides the overflow proposal: keep Skills and
MCP visible, wrapping in order on mobile, and place the microphone at the composer's
top-right, away from Send/Stop to reduce accidental sending. Reserve text space
around that control so long drafts cannot render underneath it.
Provider settings
stack into a long single column on mobile, so managed skills and MCP need direct
settings navigation or anchors, not placement after all provider runtime fields.
Keep the microphone separate from the send action and never replace its semantics.

Skills and MCP dropdowns show per-thread on/off selections and update the trigger's
selected count immediately. Label their effect as next-turn selection, not tool
health or an already-running turn change. The interactive mockup uses a 140 ms
dropdown reveal and a 120 ms switch transition; reduced motion removes sliding.
Example entries in `.t3/visual-evidence/skills-mcp-toggle-demo.webm` are local mock
state only. Keyboard Escape closes the dropdown. No backend activation is shown.

Group Git-linked skills by repository in the Skills dropdown. Each group has an
expand/collapse control, a repository label and an enabled/total count that remains
visible when collapsed. Individual skills retain their own toggles; collapsing a
group never changes selection. This lets users expand a collection such as Matt
Pollock's skills, choose the skills needed, then collapse it to manage other
collections. Group by repository identity, not author display name; multiple
repositories from one author remain distinct. Show branch/ref and skill path
inside the group where needed to distinguish imports. Uploaded skills without a
linked repository appear in an Uploaded skills group.

Keep collapse state local to the client, separate from per-thread skill selection.
Repository groups use keyboard-accessible disclosure controls with aria-expanded.
Search exposes matching skills within their groups without discarding the user's
previous collapse choices when the search is cleared. No bulk activation is
implied by expanding a repository. The exact Matt Pollock repository remains to
be supplied before importing any real content.

Local baseline captures are in `.t3/visual-evidence/` and are not release evidence.
They show the upstream UI before Pulse controls, not a completed before/after
comparison. No native mobile app, device keyboard or recording flow was tested.
Actual new controls still require a combined desktop/mobile-web render review.

Reuse existing controls if they already cover the requirement. Check keyboard,
touch, focus and screen-reader operation. Preserve draft, selection and undo when
inserting transcription. Nothing may cover Send/Stop or steal its meaning.

## Cross-client compatibility

Mobile web receives the launch controls. The existing native mobile app does not
gain new screens; it keeps baseline threads and its own dictation behavior where
tested. Skills/MCP configured for an environment can affect provider sessions
started from native mobile, so scope and next-turn semantics must be consistent
even without an editor there. Verify old-client settings writes cannot erase Pulse
configuration. Do not expose unknown events on baseline client streams.

Keep Pulse configuration independent of upstream settings where embedding it would
cause round-trip loss or schema incompatibility. Use narrowly scoped authenticated
extension requests only where required; capability detection and routing must work
through existing local, remote, relay and tunnel connections. Do not invent a
parallel transport or unauthenticated endpoint.

## Implementation and acceptance order after approval

1. Isolated identity/state and pinned compatibility fixtures.
2. Settings/configuration and provider integration shared by skills/MCP, sequenced.
3. Managed skill behavior and focused tests, then MCP selection/application tests.
4. Dictation lifecycle and adapters, followed by composer integration.
5. Desktop and mobile-web visual comparison and integrated acceptance checks.
6. Attachment previews only after a reproducible gap and preservation test.

Keep commits separated by concern and record upstream files changed, tests,
client/protocol gaps and next action per batch. Rehearse an upstream update after
the first accepted slice. Deferred features are not dependencies of this launch.
