# Provider model metadata

Pulse ships a validated model manifest with each release. It classifies current and legacy models and supplies Claude model names, aliases, capabilities, defaults, runtime-version requirements, and API mappings. The v0.0.40 compatibility catalog is bundled; the server does not fetch an upstream repository at runtime.

Aliases resolve within the selected provider instance. An exact configured custom slug takes precedence over an alias. Web, desktop, and mobile use server-advertised metadata, including optional aliases and new-model badges. Older servers can omit those fields.

Claude chat and restricted text generation share the same catalog. Catalog changes do not enable tools, hooks, project execution, or permission bypass for title and branch-name generation. Other provider registries, including OMP, retain their own discovery and defaults.
