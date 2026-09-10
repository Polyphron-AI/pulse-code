# Antigravity client compatibility

Source `06336460c` adds provider authentication and managed installation across clients. The first client batch ports the shared RPC operations and subscriptions, web setup controls, mobile setup route and connection entry points, provider metadata, and authentication-method form controls.

Pulse retains its expandable provider cards, custom model objects, OMP provider, scheduled chats, usage routes, and adaptive mobile themes. Setup links retain the environment and provider instance; a missing target never opens another account. Read-only connections cannot initiate setup, and older environments without setup capabilities show an update explanation.

The second batch adds model availability and interaction-mode helpers, preserves missing selections in drafts, and adds provider warnings and fixed-choice answer handling to both clients. Pulse's shared pending-request parser already preserved option values and custom-answer rules, so the upstream duplicate parsers were not introduced. Custom model objects remain stored, while Antigravity's picker options come only from the account catalog. The required OpenCode catalog-gap option preservation is included without replacing Pulse's other provider traits behavior.

The third batch connects web model-picker and settings setup entry points, shows unavailable account models without making them selectable, and filters unsupported text-generation providers. Pulse's existing provider sidebar and custom model editor remain; the sidebar permits opening a setup page for an unavailable account without permitting dispatch to that account.

The fourth batch wires mobile composer/setup, model refresh, and queued-send capabilities. Queue dispatch waits for config and rechecks the live catalog after attachments finish; unavailable Antigravity selections restore for editing. Existing pending-task bootstrap retry identities and compare-and-swap ownership remain intact. Refresh deduplication is environment-scoped. Pulse scheduled-chat model settings receive their environment, and account-scoped aliases resolve before availability checks.

These batches do not complete the source commit. Web chat composer setup entry points and send/rollback capability wiring remain in the next client batch. The backend and provider contracts are coordinated separately.

Validation: focused setup, permissions, target-account, clipboard, and external URL tests; scoped web and mobile typechecks. The primary integrator owns the authorized browser and emulator pass.
