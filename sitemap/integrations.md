# Integration surfaces

> Map where users connect providers, see external work, attach context, and recover failures.

## URL tree

```text
Pulse Code web / desktop
├── /settings/integrations              existing route
│   ├── Browser                         existing section
│   └── Pulse Issues                    in-flight section
├── /issues                             in-flight route
├── /pull-requests                      existing route
├── /projects/$projectKey               existing route
└── thread / right panel                existing surface; no independent URL
    ├── referenced pull request         existing behavior
    └── referenced Issue/context        in-flight behavior

Pulse Code mobile
├── Settings stack                      existing surface
├── Issues list/detail                  in-flight surface
└── Thread detail/context               existing surface + in-flight Issue context
```

## Surface inventory

| Surface                  | State                            | Integration responsibility                                            | Must not own                             |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `/settings/integrations` | Existing; Pulse Issues in flight | environment selector, provider connection health, mapping, disconnect | full provider administration             |
| `/issues`                | In flight                        | aggregate capable environments, filter, open detail, start/resume fix | embedded Pulse dashboard                 |
| `/pull-requests`         | Existing                         | hosted-code work list/detail/actions                                  | generic ticket semantics                 |
| `/projects/$projectKey`  | Existing                         | local project identity used by provider mappings                      | provider workspace administration        |
| Thread/right panel       | Existing + in flight             | compact resource reference, lazy detail, action preview               | secret display or unbounded evidence     |
| Preview                  | Existing + in flight             | capture evidence and link it to mapped project work                   | provider control plane                   |
| Mobile Issues            | In flight                        | list/detail/triage/resume across capable environments                 | long-lived secret entry in first release |

## Navigation contract

- Settings is the canonical entry point for connection management and recovery.
- Resource workspaces appear only when at least one connected environment advertises the capability;
  unsupported environments remain visible in diagnostics rather than causing unknown RPC calls.
- Every native resource view includes an external source link.
- Provider-specific advanced tasks deep-link out instead of introducing unplanned Pulse Code routes.
- Adding a provider does not add a top-level route unless it introduces a distinct, validated user
  workflow; provider cards and mappings remain under `/settings/integrations`.
- Web and desktop share routes. Mobile uses native stack destinations and the same typed contracts,
  not a webview recreation of desktop pages.

## Proposed additions inside existing surfaces

These are components within existing navigation, not new URLs:

- Provider catalog and capability summary in `/settings/integrations`.
- Consistent connect/reauthorize/disconnect controls and health history.
- Project mapping table grouped by owning environment.
- Context source/freshness strip in thread and right-panel resource views.
- Explicit action-preview confirmation for agent-proposed writes.
- Mobile connection-health readout with a handoff to web/desktop for credential changes.

## Cross-references

- PRD: [Pulse integrations](../prd/10-pulse-integrations.md)
- Workflows: [Connect and map](../workflows/connect-and-map-integration.md),
  [Use integration context](../workflows/use-integration-context.md)
- Tool flow: [Integration platform](../tool-flow/integration-platform.md)

## Open questions

- Whether usage/tokenizer context belongs in the existing Usage surface or only in thread context is
  TBD after “tokenizer” is defined.

---

**Created:** 2026-08-19 . **Last opened:** 2026-08-19 . **Last edited:** 2026-08-19 . **Status:** draft . **Owner:** Product
