# Antigravity client compatibility

Source `06336460c` adds provider authentication and managed installation across clients. The first client batch ports the shared RPC operations and subscriptions, web setup controls, mobile setup route and connection entry points, provider metadata, and authentication-method form controls.

Pulse retains its expandable provider cards, custom model objects, OMP provider, scheduled chats, usage routes, and adaptive mobile themes. Setup links retain the environment and provider instance; a missing target never opens another account. Read-only connections cannot initiate setup, and older environments without setup capabilities show an update explanation.

This batch does not complete the source commit. Model availability, interaction-mode capabilities, approval options, custom answers, and composer/model-picker setup entry points remain in the next client batch. The backend and provider contracts are coordinated separately.

Validation: focused setup, permissions, target-account, clipboard, and external URL tests; scoped web and mobile typechecks. The primary integrator owns the authorized browser and emulator pass.
