# Reliability updates

Pulse includes these fixes for everyday coding and remote work:

- Publishing a feature branch that tracks a differently named base branch creates the feature branch on the selected remote instead of pushing its commits onto the base branch. Explicit push-remote settings still apply.
- New worktrees have more time to finish checking out large repositories. Pulse also attempts to initialize their submodules. A submodule checkout failure leaves the worktree available and records a warning.
- Removing a worktree that is already gone succeeds. Existing paths and filesystem access errors still receive normal error handling.
- Restarting an environment rebuilds its saved thread views from the complete event backlog. Routine activity updates avoid unnecessary full-history reads.
- Large Codex responses require less repeated input-buffer processing.
- Clients resume interrupted queries when a connection returns. During a server update, a temporary credential rejection receives a paced retry; permission and configuration failures remain blocked.
- Claude title and source-control text generation runs without executable tools, hooks, slash commands, or inherited MCP servers. Title generation also runs outside the project directory.
- Saving provider settings with redacted secret values preserves the stored secrets. Explicit replacement and clearing remain available.

These fixes do not change provider selection, scheduled-chat settings, or the database schema.
