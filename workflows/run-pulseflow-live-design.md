# Run a PulseFlow Live-Design Session

> Host the complete PulseFlow and Impeccable interaction loop in a thread-bound Pulse Code Preview tab.

## Actors

- **Designer:** owns intent, variant choice, and explicit acceptance.
- **Coding agent:** invokes the selected Impeccable skill and reports progress or blockers.
- **Pulse Code client:** renders composer, Preview, live controls, and receipts.
- **Pulse Code Server:** owns environment authorization, tab routing, broker state, and public remote gateway.
- **PulseFlow adapter:** owns page identity, design semantics, validation, variants, and document transactions.

## Preconditions and trigger

- A Pulse Code thread is scoped to the environment running the PulseFlow project.
- The user can view the page and has designer mutation permission for generate and accept actions.
- The dev server is running or discoverable.
- A compatible Preview automation host and PulseFlow live-design adapter are available.
- The user selects Impeccable and requests live design, or starts **Live design** from Preview.

## Happy path

1. The client checks the selected environment's `preview.liveDesign` capability before enabling **Design**. The start menu offers only advertised actions: Create mock-up, Import current Preview, Open existing design, and Resume last session.
2. Preview reuses the matching PulseFlow tab or opens its environment-port target.
3. After navigation, the client and page complete the versioned, origin-checked, nonce-bound handshake.
4. The server binds the live session to user, environment, thread, Preview tab, adapter origin, site, page, and document revision.
5. Preview exposes its existing viewport, appearance, capture, annotation, refresh, and pop-out controls alongside honest agent and live-design status.
6. The active strip offers Designing, Pick, Create, Iterate, Polish, Compare, Undo, Apply, and Finish. At narrow widths it keeps Designing, Pick, Actions, and Apply visible. The user chooses Browse, Pick, or Interact, then selects a stable PulseFlow node or valid insertion anchor rather than a CSS selector guess.
7. A capability-driven toolbar appears near the selected target. The user chooses Iterate, Polish, a target-specific action, Freeform, or one of eleven live disciplines; supplies text, voice, comments, strokes, or an annotated screenshot; and requests one through eight variants.
8. Eligible visible text supports Edit copy, Save, and Cancel. Saved edits enter a per-page dock whose Apply, discard, Keep fixing, and Rollback actions are relayed exactly once.
9. The agent applies the selected Impeccable command. PulseFlow generates and validates three variants by default.
10. Each valid variant appears progressively. Phases never regress, the original remains available, a partial failure does not remove valid siblings, and a mount failure retains Retry and Dismiss without becoming acceptable.
11. The user cycles with previous, next, clickable dots, or keyboard, changes up to four range, steps, or toggle parameters, or submits text or supported voice Steer. Pulse Code preserves page-editable focus and reports queued or failed work accurately.
12. The user chooses Accept. The client sends one idempotent, session-bound action and disables duplicate submission.
13. PulseFlow applies or rejects the action. Pulse Code displays the exact transaction or conflict receipt and never edits the document itself.
14. The user may undo in PulseFlow, continue picking, inspect DESIGN.md in Visual or Raw form, run Polish, or stop the session.

## Edge cases

| Condition                               | Required response                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Server lacks the capability             | Keep Preview usable; show update-required guidance at the Live design entry point.                              |
| Page lacks or mismatches the adapter    | Keep ordinary Preview; show adapter version guidance without injecting a shim.                                  |
| No automation-capable host              | Name the missing host and provide the supported handoff path.                                                   |
| Local/private target cannot connect     | Preserve the intended environment and show target diagnostics; do not fall back to another server.              |
| Public environment has no gateway       | Return `gateway_required`; do not expose or guess a port.                                                       |
| Tab navigates or origin changes         | Invalidate the binding and require a new handshake.                                                             |
| Page and host both want keyboard input  | The focused page editable retains text keys; Escape unwinds annotation, configuration, selection, then session. |
| Variant generation partly fails         | Render valid variants and the failed slot reason.                                                               |
| Variant mount fails                     | Keep the variant invalid and offer Retry or Dismiss without enabling Accept.                                    |
| Copy Apply fails or disconnects         | Preserve the per-page staged batch and reconcile before Keep fixing, Rollback, or another Apply.                |
| Accept result is uncertain              | Reconcile by idempotency key before enabling another accept or retry.                                           |
| Permission or document revision changed | Show PulseFlow's typed denial or conflict; preserve intent for rebase or regeneration.                          |
| Client disconnects                      | Mark reconnecting, keep the page visible, restore checkpointed state, and disable accept until reconciled.      |
| Mobile opens the thread                 | Show read-only session state and handoff to a capable web or desktop host.                                      |

## Post-conditions

- A successful accept has exactly one PulseFlow transaction receipt and no Pulse Code document mutation.
- Discard and Stop leave ordinary Preview available and remove live-only host state.
- Session and capture payloads remain bounded, redacted, and scoped to the correct environment and tab.
- Unsupported combinations remain compatible rather than sending unknown RPC methods.

## References

- PRD: [PulseFlow Live Design in Pulse Code](../prd/16-pulseflow-live-design.md)
- Sitemap: [PulseFlow live-design surfaces](../sitemap/pulseflow-live-design.md)
- Tool flow: [Preview live-design host](../tool-flow/pulseflow-live-design.md)
- Acceptance criteria: [PulseFlow live design host](../prd/20-acceptance-criteria/pulseflow-live-design.md)

## Open questions

- None beyond the gateway and first-release web scope decisions in the PRD.

---

**Created:** 2026-09-04 . **Last opened:** 2026-09-04 . **Last edited:** 2026-09-04 . **Status:** proposed . **Owner:** Product and Engineering . **Layer:** tactical
