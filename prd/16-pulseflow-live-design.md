# PulseFlow Live Design in Pulse Code

> Define how Pulse Code hosts the complete Impeccable-driven PulseFlow design loop in its existing Preview surface without taking ownership of PulseFlow documents or model behavior.

## Problem and outcome

PulseFlow needs a running-browser design loop with element picking, insertion, annotations, progressive variants, tuning, steering, acceptance, and recovery. Opening a second browser loses Pulse Code's thread context, environment identity, media capture, and agent controls. Copying PulseFlow into this repository would couple two products and give Pulse Code responsibility for a foreign document model.

The desired outcome is:

> A designer starts or resumes a PulseFlow live-design session from a Pulse Code thread, uses every Impeccable command and interactive control in Preview, and accepts one variant as a PulseFlow-owned transaction without leaving Pulse Code.

## Current leverage

Pulse Code already provides most host primitives:

- thread-bound Preview tabs and a desktop Chromium webview;
- local dev-server discovery and environment-port navigation;
- viewport presets, freeform sizing, refresh, and color-scheme emulation;
- semantic snapshots, click, type, key, scroll, evaluate, and wait operations;
- screenshots, recordings, annotations, and Issue evidence capture;
- server-brokered browser automation with environment and thread identity; and
- provider skill discovery and a composer skill picker.

The missing work is a typed live-design capability, a PulseFlow page handshake, session controls, and a safe remote route. The existing browser target resolver explicitly rejects a public environment host because the authenticated Preview gateway is not implemented.

## Scope

**In scope:** web and desktop Preview hosting, skill discovery, tab and environment binding, live-design toolbar and status, typed agent tools, local and private-network routing, authenticated public remote relay, reconnect, bounded evidence, and capability-skew behavior.

**Out of scope:** implementing Impeccable command semantics, generating variants, validating PulseFlow document operations, storing model credentials in a client, patching PulseFlow JSON from Pulse Code, replacing Preview, or delivering pointer-heavy mobile authoring in the first release.

## Experience contract

1. The user opens a PulseFlow project thread and starts `/impeccable live` or chooses **Live design** in Preview.
2. Pulse Code reuses the current PulseFlow Preview tab when its environment, site, and page match; otherwise it opens a new tab against the owning environment.
3. The page advertises `pulseflow.live-design/v1`, supported operations, page identity, document revision, and required permission through an origin-checked handshake.
4. Preview shows session phase, selection, original or variant position, generation progress, previous, next, Tune, Steer, Accept, Discard, and Stop. PulseFlow may also render page-level picker chrome.
5. The user can keep using Preview viewport, screenshot, recording, annotation, refresh, pop-out, and agent-browser features.
6. Picker events and evidence travel through the tab-bound session. The host never infers a document target from CSS selectors or visible text.
7. Accept and Discard require the current session and exact variant. Pulse Code forwards the explicit action and displays PulseFlow's transaction or terminal receipt.
8. Reload or reconnect restores the latest checkpoint and reconciles uncertain actions before enabling another mutation.

All 23 Impeccable commands and the root router remain discoverable through the existing skill picker. Pulse Code does not duplicate their descriptions or prompt logic. When the target advertises PulseFlow, the skill selects the PulseFlow document adapter. A generic compatible project may use the upstream source adapter only if that path is separately enabled.

## Hosted live surface parity

Pulse Code must not reduce the live experience to an Accept toolbar. The page adapter and Preview host jointly preserve the pinned upstream surface registry:

| Surface | Hosted behavior | Primary owner |
|---|---|---|
| `global-bottom-bar` | Agent status; Pick, Insert, Detect with count, DESIGN.md, text or supported voice Steer, and Exit | PulseFlow page; Pulse Code transports status and focus |
| `element-selection-chrome` + `action-picker` | Hover outline, target and clear; Freeform (`impeccable`), Bolder (`bolder`), Quieter (`quieter`), Distill (`distill`), Polish (`polish`), Typeset (`typeset`), Colorize (`colorize`), Layout (`layout`), Adapt (`adapt`), Animate (`animate`), Delight (`delight`), and Overdrive (`overdrive`) in pinned order; text or supported voice prompt; count 1 through 8; and Go | PulseFlow page |
| `insert-mode-chrome` | Before, after, schema-valid inside, resizable placeholder, prompt or annotation-only creation, and Create | PulseFlow page |
| `annotation-chrome` | Comment pins, editable comment text, strokes, clear, and annotated screenshot evidence | PulseFlow page plus existing Preview capture boundary |
| `edit-chrome` + `pending-copy-edit-dock` | Edit badge, Save, Cancel, per-page staged count, Apply, discard, busy, Keep fixing, and Rollback | PulseFlow page; Pulse Code relays the exact action and receipt |
| `generating-row` | Non-regressing phase, arrived progress, disabled conflicts, and honest agent or provider failure | Shared presentation of PulseFlow status |
| `variant-cycling-row` | Original, previous, clickable dots, count, next, Tune, Accept, Discard, and keyboard cycle | Shared toolbar; PulseFlow state is authoritative |
| `variant-params-panel` | Zero through four named range, steps, or toggle controls per variant; accepted values travel with the exact variant | PulseFlow page or host projection of typed state |
| `saving-confirmed-rows` | Applying, duplicate lock, confirmation, typed rejection, and uncertain-outcome reconciliation | Pulse Code host and broker |
| `design-system-panel` | Visual and Raw tabs, current tokens and components, missing or stale guidance, close, and copyable values where present | PulseFlow page |
| `toasts-and-errors` | Bounded toasts and a persistent failed-variant card with Retry and Dismiss | Shared; a dismissed failure never becomes valid |
| `css-isolation-boundary` | Host and page chrome stay unpickable and cannot corrupt each other's CSS, event, keyboard, capture, or annotation boundaries | Both |

First selection may prefetch bounded page context. Generate, plan and progress, mount result, checkpoint, staged edit, Apply, Steer, accept, discard, completion, agent failure, reload, and reconnect events retain their ordered session identity. A pinned upstream command, surface, action, event, phase, or parameter-kind change fails compatibility review until both repositories map it or carry an explicit waiver.

The host manifest maps the exact pinned protocol vocabulary:

| Family | Exact pinned values | Host rule |
|---|---|---|
| Browser requests | `generate`, `accept`, `discard`, `checkpoint`, `agent_phase`, `variant_mounted`, `variant_mount_failed`, `exit`, `prefetch`, `manual_edits`, `steer`, `carbonize_cleanup` | Forward only after session, capability, schema, sequence, size, and origin validation. Carbonize is generic-source-only. |
| Journal additions | `variant_plan`, `detector_waivers`, `variants_ready`, `agent_done`, `accept_intent`, `manual_edit_apply`, `steer_done`, `discarded`, `complete`, `agent_error` | Project bounded status and receipts without duplicating the PulseFlow journal. |
| Agent progress | `picked_up`, `scaffolding`, `source_ready`, `scaffold_fallback`, `generation_ready`, `first_reviewable`, `second_reviewable`, `all_variants_ready` | Render monotonic progress and do not infer success from transport delivery. |
| Session phases | `new`, `generate_requested`, `variants_ready`, `carbonize_required`, `carbonize_cleanup_requested`, `manual_edit_apply_requested`, `steer_requested`, `steer_done`, `accept_requested`, `discard_requested`, `discarded`, `completed`, `agent_error` | Map every phase to enabled controls and recovery. Carbonize phases remain generic-source-only. |
| Parameters | `range`, `steps`, `toggle` | Render or relay named values within the zero-through-four budget and bind them to the selected variant. |

## Host capability contract

Servers advertise an additive optional capability:

```ts
type PreviewLiveDesignCapability = {
  protocolVersions: readonly ["1"]
  operations: readonly (
    | "start" | "status" | "target" | "insert" | "annotate" | "prefetch"
    | "generate" | "preview" | "tune" | "steer" | "stageText"
    | "applyText" | "discardText" | "retryMount" | "accept" | "discard" | "stop"
  )[]
  transports: readonly ("direct" | "private-network" | "gateway")[]
}
```

Every request is scoped by `environmentId`, thread, Preview tab, adapter origin, session ID, actor, and sequence. Every mutation-like request also carries an idempotency key. Results are runtime-validated and bounded before they enter client state or agent output.

The agent toolkit exposes narrow operations such as `preview_live_design_start`, `preview_live_design_status`, `preview_live_design_steer`, `preview_live_design_accept`, and `preview_live_design_discard`. Generate and target messages may originate from page controls or the agent, but PulseFlow remains the authority that interprets and validates them.

## Ownership

| Concern | Pulse Code owns | PulseFlow owns |
|---|---|---|
| Browser | tab, webview, viewport, navigation, capture, pop-out, automation host | page rendering and authoring-only node markers |
| Session routing | environment, thread, tab, origin, reconnect, capability skew | site, page, document revision, design phase, checkpoints |
| Skills | discovery, picker, invocation context, tool delivery | target-specific context and operation adapter |
| Picker | pointer transport, host chrome exclusion, focus coordination | pickable rules, stable node identity, placement validity |
| Variants | progress and control presentation | generation, variation axes, validation, ephemeral revisions |
| Mutation | explicit user action forwarding and receipt display | permissions, revision guard, atomic transaction, undo, audit |
| Secrets | environment auth and browser-session credentials | model/provider and PulseFlow service credentials |

Pulse Code never stores a PulseFlow document, performs a design patch, or treats browser DOM as the source of truth.

## Transport and trust

| Environment | Feasibility | Route | Release condition |
|---|---|---|---|
| Local desktop | High | Existing loopback port discovery and desktop Preview host | Adapter handshake and focused integration suite. |
| Private-network remote | Medium to high | Existing environment-host substitution when directly reachable | Origin, TLS where applicable, reconnect, and latency verification. |
| Public hosted or relay-only | Blocked today | New authenticated Preview gateway | Gateway must bind environment, user, tab, target port, origin, expiry, and byte limits. |
| Web client | Conditional | Uses an automation-capable host attached to the environment | Show an actionable unavailable state when no host exists. |
| Mobile | Read-only first release | Session status and deep link to web or desktop | No hidden webview or partial picker claim. |

The gateway must not publish a raw dev-server port. It terminates authenticated client traffic, opens the environment-side connection through the owning server, validates target and origin, applies request and stream limits, and preserves backpressure. Browser-local `localhost` is never rewritten as though it were the remote environment.

Page messages use a nonce created after navigation, an exact allowed origin, a protocol version, a session ID, monotonic sequence, and bounded schemas. Navigation, origin change, tab transfer, environment reconnect, or server epoch change invalidates the old binding.

## Compatibility and failure behavior

- Older servers omit the capability. New clients keep ordinary Preview usable and show Live design as unavailable with an update reason.
- Older clients ignore the additive capability and continue using Preview.
- A page without the adapter remains an ordinary preview target.
- A handshake mismatch offers update guidance and does not inject a compatibility shim into the page.
- A lost connection preserves the visible page, marks the design session reconnecting, and disables accept until status is reconciled.
- A denied or failed PulseFlow action displays the typed reason and never retries a mutation blindly.
- Screenshot and annotation payloads follow existing evidence caps. Live design cannot widen them.
- Browser console and network evidence are redacted before entering agent context or durable receipts.

## Rollout and feasibility

1. **Host proof:** open a real PulseFlow preview locally, complete handshake, select a stable node, and receive status without adding new navigation.
2. **Interactive local slice:** expose toolbar state and forward target, generate, preview, Tune, Steer, Accept, Discard, and Stop against a deterministic PulseFlow fixture.
3. **Agent and skill slice:** advertise tools, preserve skill picker behavior, and prove mixed client/server capability skew.
4. **Private-network slice:** verify environment-host routing, reconnect, screenshots, recordings, and annotations.
5. **Gateway slice:** implement and threat-model authenticated public remote transport with bounded streams and exact session identity.
6. **Release gate:** run the end-to-end PulseFlow AC-P host cases and Pulse Code's focused Preview, broker, contracts, web, desktop, and compatibility suites.

The integration is technically feasible. Local desktop hosting is high-confidence because the browser, navigation, capture, and agent-control surfaces already exist. The PulseFlow adapter and authenticated public remote gateway are the two substantive builds. PulseFlow itself is specification-only, so no live integrated product exists yet.

Estimated Pulse Code effort is **6 to 9 engineering-weeks** inside PulseFlow's broader 28 engineering-week R9 estimate: contracts and broker 2, Preview UI and focus coordination 2, local/private integration and compatibility 1 to 2, gateway and security verification 1 to 3. This is a planning judgment, not a measured velocity forecast.

## Cross-references

- Acceptance criteria: [PulseFlow live design host](20-acceptance-criteria/pulseflow-live-design.md)
- Sitemap: [PulseFlow live-design surfaces](../sitemap/pulseflow-live-design.md)
- Workflow: [Run a PulseFlow live-design session](../workflows/run-pulseflow-live-design.md)
- Tool flow: [Preview live-design host](../tool-flow/pulseflow-live-design.md)
- Existing Preview contracts: `packages/contracts/src/preview.ts`, `packages/contracts/src/previewAutomation.ts`
- PulseFlow authority: `prd/21-design-intelligence.md` in the PulseFlow repository

## Open questions

- Which authenticated gateway shape best fits the current direct, relay, and tunnel environment transports?
- Should generic Impeccable direct-source acceptance ship in the first Pulse Code integration or stay standalone until PulseFlow is proven?
- Should web expose the full toolbar whenever a desktop automation host is attached, or limit first release support to desktop?

---

**Created:** 2026-09-04 . **Last opened:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Product and Engineering . **Layer:** tactical
