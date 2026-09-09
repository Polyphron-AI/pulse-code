# Managed skills and thread composer

Date: 2026-09-09

## User decisions

Pulse manages a skill library with direct uploads and GitHub links, including private repositories through the environment's existing GitHub CLI authentication. Skills can be enabled by provider default or overridden per thread. Changes between turns take effect on the next turn. GitHub sources update automatically while Pulse is running, retaining the last valid revision on failure.

Composer order: Model, reasoning effort, access, MCPs, Skills, attachment, Send/Stop. Place the dictation microphone directly above Send/Stop. Dictation fills the draft and never automatically sends it.

## Skill lifecycle

Import SKILL.md alone or a ZIP containing SKILL.md and supporting files. GitHub import specifies owner/repository, revision (default branch by default), and skill directory; one managed entry corresponds to one skill directory. Validate paths, sizes, file types and frontmatter before making a revision available. Never execute repository hooks or imported scripts while importing. Store immutable revisions on the environment, not the client. Sync hourly and allow manual refresh, with status and last successful update visible. A failed refresh retains the last valid copy.

Selected managed skills are supplied with each turn. Every turn captures the selected revision; updates and toggles do not rewrite an active turn. Skills are instructions and resources, not an operating-system access boundary. Provider-global and workspace skills remain separately identified; Pulse does not claim to disable them.

## UI

Managed skills section provides upload, GitHub import, source and revision details, defaults per configured provider, automatic update toggle, sync now, replacement upload and remove. Thread Skills popover mirrors MCP: toggles, default/override labels, reset defaults and Manage skills. Native provider skills remain visible through the existing skill picker.

## Verification

Focused coverage for path traversal and malformed uploads, private GitHub authentication failures, immutable revisions, failed sync fallback, defaults and per-thread overrides, turn selection and UI error handling. Verify composer layout and dictation draft insertion without recording or downloading a model during development.
