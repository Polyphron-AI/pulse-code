# V40 Antigravity backend compatibility

This batch ports the backend and protocol portions of upstream `06336460c`. Contracts are in `018315a9c`; ACP transport support is in `4b6393e90`. Client setup and interaction controls are coordinated separately. This is not a claim that the entire source commit or V40 release is integrated.

The backend adds instance-owned Google profiles, explicit authentication and model discovery, a shared managed executable installer, the Antigravity ACP adapter, workspace skills, and text generation. Setup RPCs preserve environment authorization and bind private authentication state to the authenticated connection. Managed installation verifies archive hashes and sizes, validates both executables, commits activation atomically, and protects leased releases from removal. Checkpoint rewind is rejected before filesystem restoration when the provider cannot rewind its conversation.

Pulse adaptations:

- OMP remains registered with its existing identity, settings, mock behavior, and presentation order. Exact child environments and force-kill handling remain supported. The ACP `extendEnv` option also respects exact-environment isolation.
- Antigravity defaults to disabled. Custom model settings retain Pulse's object and legacy-string forms. Provider defaults and classification use the bundled manifest; no remote manifest service or automatic catalog destination was added.
- Existing raw usage and reset-credit RPCs remain intact. Setup uses the same provider registry rather than a parallel instance map.
- Existing compaction and tool-placeholder suppression remain intact. Native logout is handled before title generation or turn startup.
- The necessary `f90e2f2bd` prerequisite subscribes to provider settings before starting its watcher. Its regression waits for the replacement catalog result without polling.

Verification uses synthetic protocol peers, mocked authentication and HTTP responses, and disposable installer archives. No Antigravity download, login, real provider session, or browser verification was performed.

Backend verification: 135 authentication/protocol/installation tests; 103 adapter/provider/auth coordinator/skills/text-generation/manifest tests; 178 ACP/runtime/provider/checkpoint/reactor tests; 57 registry/cache tests; and three setup RPC tests passed. Five driver tests that launch a Unix shell fixture are skipped on Windows. Disabled-provider and missing-credential driver guards run on Windows. Server types and scoped lint pass.

Installer fixtures preserve POSIX metadata expectations when simulating Linux on Windows, while PATH lookup and executable validation use native Windows archive names. These fixtures verify the installer implementation; they do not establish that Google's published runtime executes successfully on this machine.
