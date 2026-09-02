# V40 host document previews

Source `f46a709ee` is adapted to Pulse web, desktop, and mobile. Markdown outside a project opens read-only; HTML and PDF use signed exact-file assets on the owning environment. Markdown relative links resolve from the document directory. Workspace editing, native sharing actions, citations, file-chip reveal actions, and remote shell availability gates remain in place.

`projects.readFile` retains the `orchestration:read` authorization requirement. Absolute reads deliberately follow environment-wide filesystem authority. Relative reads retain traversal and symlink containment checks, and writes remain workspace-relative. Reads require a regular file and remain bounded. HTML runs in a sandboxed opaque origin. Signed host assets reject adjacent paths, tampering, expiry, and changed file identity; workspace HTML retains directory-scoped assets.

Focused proof: 152 tests passed across eight suites covering WorkspaceFileSystem, AssetAccess, HTTP headers, mobile and web file paths, Markdown links, RPC scopes, and shared preview MIME helpers. The Unix FIFO case is skipped on Windows. Mobile, web, and server type checks passed; server reports existing Effect suggestions. No runtime acceptance is claimed by this port.

Preview integration must retain the separate Pulse saved-output asset claims, signing, download headers, and assistant-output contexts. Those features live on the preview release branch; this source port does not replace their authorization path.
