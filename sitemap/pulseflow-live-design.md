# PulseFlow Live-Design Surfaces

> Map the existing Pulse Code surfaces that host PulseFlow live design. This proposal adds no top-level route.

## URL and surface tree

```text
Pulse Code web / desktop
├── thread composer                         existing surface
│   ├── skill picker                       existing; lists Impeccable
│   └── agent tool status                  existing pattern; live-design additions proposed
├── thread Preview                         existing surface
│   ├── Preview chrome                     existing
│   │   ├── viewport / appearance          existing
│   │   ├── screenshot / recording         existing
│   │   ├── annotations                    existing
│   │   └── Live design                    proposed capability-gated toolbar
│   └── PulseFlow chrome-free page         external environment-port target
│       ├── picker / Insert / Detect        PulseFlow-owned page controls
│       ├── action / prompt / annotation    PulseFlow-owned live controls
│       ├── copy staging / Apply recovery   shared action and receipt path
│       ├── DESIGN.md Visual / Raw          PulseFlow-owned context panel
│       └── variants / Tune / Steer         shared session presentation
└── Settings / Preview diagnostics         existing settings patterns; gateway state proposed

Pulse Code mobile
└── thread detail                          existing
    └── live-design status + handoff        proposed read-only surface
```

## Surface inventory

| Surface | State | Pulse Code responsibility | PulseFlow responsibility | PRD ref |
|---|---|---|---|---|
| Composer skill picker | Existing, extended by installed metadata | Discover and select Impeccable without maintaining a partial command copy | Supply target context and adapter selection | [§Skill picker](../prd/16-pulseflow-live-design.md#experience-contract) |
| Thread Preview | Existing host, proposed live capability | Bind environment and tab; show session state and host controls | Advertise adapter, render page, own design lifecycle | [§Experience](../prd/16-pulseflow-live-design.md#experience-contract) |
| Preview live-design toolbar | Proposed component in existing surface | Original/variant position, progress, Tune, Steer, Accept, Discard, Stop, errors | State truth and receipts | [§Host capability](../prd/16-pulseflow-live-design.md#host-capability-contract) |
| PulseFlow page picker | External page in Preview | Pointer transport, focus coordination, host-chrome exclusion | Pickable rules, node identity, placement, annotations | PulseFlow `prd/21-design-intelligence.md` |
| PulseFlow action and insert chrome | External page in Preview | Preserve focus, bounds, and exact event routing | Freeform plus eleven actions, prompts, count, Go, placement, placeholder, Create | [§Hosted parity](../prd/16-pulseflow-live-design.md#hosted-live-surface-parity) |
| Copy staging and recovery dock | External page plus host receipts | Relay Apply, discard, Keep fixing, and Rollback once; show exact result | Eligibility, Save, Cancel, staged batch, validation, transaction, repair | [AC-PCLD-15](../prd/20-acceptance-criteria/pulseflow-live-design.md#ac-pcld-15-copy-edit-apply-recovery) |
| DESIGN.md panel and live errors | External page in Preview | Preserve isolation and transport typed status | Visual/Raw content, missing/stale states, toasts, mount Retry/Dismiss | [AC-PCLD-16](../prd/20-acceptance-criteria/pulseflow-live-design.md#ac-pcld-16-live-registry-parity) |
| Preview diagnostics | Proposed addition to existing diagnostics | Capability version, host availability, direct/gateway route, typed blocker | Adapter version and page-side failure reason | [§Transport](../prd/16-pulseflow-live-design.md#transport-and-trust) |
| Mobile session status | Proposed, read-only | Phase, target label, environment, and handoff | Session status | [AC-PCLD-13](../prd/20-acceptance-criteria/pulseflow-live-design.md#ac-pcld-13-mobile-honesty) |

## Navigation contract

- Live design lives in the existing thread Preview. It does not add `/pulseflow`, `/design`, or a provider dashboard route.
- Opening a PulseFlow environment-port target preserves the owning environment and thread scope.
- The live-design toolbar appears only after capability negotiation and a valid page handshake.
- A normal page or incompatible server remains an ordinary Preview with no dead controls.
- Public remote routing exposes a gateway state and recovery action, never a raw target port.
- Mobile links to a capable host and does not simulate the pointer-heavy experience.

## Workflows and ownership

- Workflow: [Run a PulseFlow live-design session](../workflows/run-pulseflow-live-design.md)
- Tool flow: [Preview live-design host](../tool-flow/pulseflow-live-design.md)
- Acceptance criteria: [PulseFlow live design host](../prd/20-acceptance-criteria/pulseflow-live-design.md)

## Open questions

- Whether Preview diagnostics belongs in Settings or only in the Preview empty/error state should be decided during the gateway UX slice.

---

**Created:** 2026-09-04 . **Last opened:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Product
