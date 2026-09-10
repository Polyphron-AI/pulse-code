# PulseFlow Live Design Host Acceptance Criteria

> Deterministic gates for running PulseFlow's complete Impeccable-driven live design loop inside Pulse Code Preview.

## AC-PCLD-01-capability-skew

**Given** old and new client/server combinations<br>
**When** Preview capability negotiation completes<br>
**Then** only a compatible pair exposes Live design, ordinary Preview remains usable in every combination, and unsupported states name the required update<br>
**Verified by:** contracts and mixed-version compatibility fixtures.

## AC-PCLD-02-adapter-handshake

**Given** a Preview tab navigates to a PulseFlow page<br>
**When** the page and host complete the live-design handshake<br>
**Then** protocol version, exact origin, nonce, environment, thread, tab, site, page, revision, actor, permissions, and operations are bound before controls enable<br>
**Verified by:** browser bridge integration tests with valid, stale, foreign-origin, replayed, and oversized messages.

## AC-PCLD-03-tab-and-environment-binding

**Given** two environments or two PulseFlow tabs are open<br>
**When** the user starts and operates a live-design session<br>
**Then** every event reaches only the selected environment and tab, and navigation, transfer, origin change, or server epoch change invalidates the prior binding<br>
**Verified by:** multi-environment and multi-tab broker fixtures.

## AC-PCLD-04-complete-interactive-controls

**Given** the adapter advertises the full operation set<br>
**When** live mode is active<br>
**Then** agent status, Pick, Insert, Detect with count, DESIGN.md Visual and Raw, Exit, hover and clear selection, Freeform and eleven live actions, text or supported voice prompts, one-through-eight count, Go or Create, comments, strokes, clear annotations, edit-copy Save and Cancel, original, previous, clickable dots, next, zero-through-four range/steps/toggle controls, Tune, text or supported voice Steer, Accept, Discard, phase, mount Retry and Dismiss, and recovery states are operable without leaving Preview<br>
**Verified by:** canonical live-surface registry fixture plus keyboard, pointer, and voice-capability journeys against a deterministic PulseFlow fixture.

## AC-PCLD-05-preview-features-preserved

**Given** a live-design session is active<br>
**When** the user changes viewport or color scheme, refreshes, captures a screenshot, starts and stops recording, adds an annotation, or pops out and restores Preview<br>
**Then** each existing Preview behavior remains functional and the live session either preserves its binding or reports the exact rebind required<br>
**Verified by:** focused Preview regression suite and end-to-end capture journey.

## AC-PCLD-06-skill-picker-parity

**Given** a supported provider returns its skill list<br>
**When** the composer skill picker opens for a PulseFlow thread<br>
**Then** the Impeccable skill and all 23 commands remain discoverable, the selected skill enters agent context once, and Pulse Code does not replace upstream command metadata with a partial local list<br>
**Verified by:** provider discovery and composer picker fixtures against the pinned metadata.

## AC-PCLD-07-explicit-accept

**Given** a valid selected variant<br>
**When** the user chooses Accept<br>
**Then** Pulse Code forwards one session-bound, variant-bound, idempotent request only after direct user action, disables duplicate submission, and displays the PulseFlow transaction receipt without editing the document itself<br>
**Verified by:** broker spy and double-click, reconnect, timeout, denial, and stale-revision tests.

## AC-PCLD-08-uncertain-outcome-reconciliation

**Given** the connection drops after Accept or Discard is sent<br>
**When** the client reconnects<br>
**Then** Pulse Code queries the action by idempotency key, displays the recorded result if one exists, and never repeats the action until the outcome is known<br>
**Verified by:** fault-injection suite at each transport boundary.

## AC-PCLD-09-local-and-private-routing

**Given** the PulseFlow dev server is local or directly private-network reachable from the Preview host<br>
**When** the user opens Live design through an environment-port target<br>
**Then** the resolved URL reaches the owning environment, uses the expected host and port, and never changes another environment's recent URL or session<br>
**Verified by:** browser target resolver and real local/private fixture matrix.

## AC-PCLD-10-public-remote-gateway

**Given** the environment server address is public or relay-only<br>
**When** the user opens a PulseFlow environment-port target<br>
**Then** Preview uses an authenticated environment-side gateway bound to the exact target and session, or reports `gateway_required`; it never exposes the port or navigates to browser-local `localhost`<br>
**Verified by:** gateway integration and security suite covering expiry, origin, authorization, SSRF, replay, limits, backpressure, and reconnect.

## AC-PCLD-11-focus-and-accessibility

**Given** live controls, page editables, annotations, and agent browser control can all receive input<br>
**When** pointer, keyboard, screen-reader, and 200% zoom journeys run<br>
**Then** focus ownership is visible and deterministic, Escape unwinds one layer at a time, page editing retains text keys, host and page chrome do not trap each other, and every control has an accessible name and valid contrast<br>
**Verified by:** accessibility scan and browser focus matrix.

## AC-PCLD-12-bounds-and-redaction

**Given** hostile or oversized page messages, annotations, screenshots, console logs, network data, or agent output<br>
**When** they cross the live-design boundary<br>
**Then** runtime schemas, size and rate limits, origin checks, and redaction apply before client state, logs, prompts, or receipts; credentials and bearer values never cross<br>
**Verified by:** property-based contract tests, secret canaries, and bounded-payload integration fixtures.

## AC-PCLD-13-mobile-honesty

**Given** a mobile client observes an active or available PulseFlow live-design session<br>
**When** it lacks the full pointer and Preview host capability<br>
**Then** it shows read-only status and a deep link or handoff to a capable web or desktop client, without rendering nonfunctional picker or accept controls<br>
**Verified by:** mobile capability-skew UI tests.

## AC-PCLD-14-end-to-end-host-proof

**Given** a real PulseFlow dev server and a Pulse Code desktop session<br>
**When** a user picks a repeated nested node, requests three progressive variants, tunes or steers, accepts one, undoes it, repeats and discards<br>
**Then** Preview remains usable, the correct node and tab stay bound, copy Save, Cancel, Apply, and Rollback follow their declared outcomes, PulseFlow records exactly one transaction for each explicit Apply or accept, undo restores the original, discard writes nothing, mount failure remains invalid until retry succeeds, and no console error or live marker remains<br>
**Verified by:** release-blocking integrated browser run with screenshot and recording receipt.

## AC-PCLD-15-copy-edit-apply-recovery

**Given** one or more eligible text nodes have staged edits on the current page<br>
**When** the user chooses Apply, discard, Keep fixing, or Rollback<br>
**Then** Pulse Code forwards the exact per-page batch and direct user action once, displays busy and result state, reconciles by idempotency key after disconnect, and never edits source or document state itself; PulseFlow either commits one revision-guarded transaction, preserves the staged batch for repair, or restores the declared revision<br>
**Verified by:** browser and broker fixtures for Save, Cancel, page scoping, double-click, partial failure, repair, rollback, disconnect, and stale revision.

## AC-PCLD-16-live-registry-parity

**Given** the pinned Impeccable command, live UI, action, event, phase, and parameter registries<br>
**When** Pulse Code's capability and host manifests are compared during intake<br>
**Then** all 23 commands, fourteen live surfaces, twelve live action choices, client and journal events, generation phases, and range, steps, and toggle kinds are mapped to page-owned, host-owned, or intentionally unavailable behavior; an unmapped change fails the gate<br>
**Verified by:** exact cross-repository registry snapshot test against the pinned upstream commit.

## AC-PCLD-17-design-entry-and-responsive-controls

**Given** Preview is available at desktop or narrow width<br>
**When** capability discovery completes and the user starts a design session<br>
**Then** the permanent entry point reads Design before the session and Designing during it; Create mock-up, Import current Preview, Open existing design, and Resume last session appear only when advertised; and the active control strip collapses from Designing, Pick, Create, Iterate, Polish, Compare, Undo, Apply, and Finish to Designing, Pick, Actions, and Apply without losing an action<br>
**Verified by:** capability-state component tests and desktop, tablet-width, 200% zoom, and keyboard journeys.

## AC-PCLD-18-browse-pick-interact-arbitration

**Given** an interactive control is eligible for PulseFlow selection<br>
**When** the user switches among Browse, Pick, and Interact or temporarily inverts the mode with the configured modifier<br>
**Then** Browse and Interact deliver application input, Pick selects only adapter-declared stable targets, page editables retain composition input, Escape unwinds one layer at a time, and Pulse Code chrome can never become a PulseFlow target<br>
**Verified by:** pointer, touch, keyboard, editable, host-overlay, nested-target, and hot-reload browser tests.

## AC-PCLD-19-speculative-variant-isolation

**Given** Iterate or Polish produces one or more reviewable variants<br>
**When** the user previews, interacts with, compares, tunes, steers, accepts, or discards them<br>
**Then** every variant remains bound to an ephemeral document revision, real interactions remain operable, the canonical document remains unchanged before Accept, and Accept names the exact variant, parameter values, base revision, and idempotency key<br>
**Verified by:** PulseFlow fixture journal assertions plus integrated interaction, partial-failure, mount-failure, accept, and discard journeys.

## AC-PCLD-20-transactional-undo-and-finish

**Given** the user has applied staged edits or accepted a variant<br>
**When** the user chooses Undo, Redo, or Finish<br>
**Then** Pulse Code forwards the PulseFlow transaction identity rather than replaying DOM history, reports revision conflicts without silent retargeting, prompts before abandoning unaccepted work, removes live-only state after Finish, and leaves ordinary Preview open<br>
**Verified by:** transaction history, concurrent revision, unaccepted-work, stop, and finished-session integration tests.

## Open questions

- None. Gateway shape is an implementation decision, but AC-PCLD-10 fixes its required security outcome.

---

**Created:** 2026-09-04 . **Last opened:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Product and Engineering . **Layer:** tactical
