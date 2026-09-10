# V40 mobile rendering source dispositions

This records the bounded late-V40 rendering audit against upstream `09e8de9c`.
It does not mark unrelated changes in a prerequisite commit as integrated.

| Source                   | Disposition                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b7175371d`              | Adapted in `e2e8a9c2a`: turn completion invalidates feed appearance data so unchanged assistant rows restore their footer and spacing.                                                                            |
| `357b8d521`              | Already equivalent: Pulse's Working labels use sky blue in both thread row presentations. Existing Pulse theme classes remain.                                                                                    |
| `dc39615ae`              | Not applicable to the current Pulse feed: it does not toggle `itemLayoutAnimation`, so its container component types remain stable. Reassess if animated disclosure containers are introduced.                    |
| `b248f5ad5`              | Not applicable to the current Pulse layout: it does not render upstream's `floating-working-control.tsx`. Existing composer status controls remain.                                                               |
| `f15680bd3`, `261380f91` | LegendList patch prerequisites adapted incrementally. Their broader tool-summary, composer, and work-log changes are outside this patch group. Pulse's keyboard-controller patch and client layout are preserved. |
| `71297974c`              | Adapted: maintain native iOS anchoring during dragging, track native drag/momentum state, and keep animated list bounds current.                                                                                  |
| `c0d4e95c0`              | Adapted: release the initial scroll target after a user drag.                                                                                                                                                     |
| `8d7f78121`              | Adapted: wait for native scroll delivery before revealing the initial thread; recover through the bounded frame watchdog.                                                                                         |
| `98469159d`, `e32dd42f8` | Lifecycle dismissal prerequisite adaptation is in progress; not yet claimed complete.                                                                                                                             |

The final LegendList patch was reached through individual upstream deltas and
conflict review. It matches the `8d7f78121` patch. A duplicate
`onScrollBeginDrag` destructuring insertion from the earlier Pulse patch was
removed while preserving the existing field. Dependency versions are unchanged;
the lockfile records only the new LegendList patch hash.

Validation: installed CommonJS and ESM native bundles pass syntax checks;
29 focused reveal/live-follow tests pass. No browser, emulator, or live data is
used by these checks.
