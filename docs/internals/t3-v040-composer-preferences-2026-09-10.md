# V40 composer preferences

## Skill menus

Source `9da0fab08` is adapted to the Pulse composer. The existing shared helpers already provide the source search behavior, skill/native-command deduplication and display-name matching, with Pulse's additional workspace resolution and user-invocation restrictions. Those helpers are preserved.

Web and desktop gain the `showSkillsInSlashMenu` client preference, defaulting on, with Settings search, individual reset and restore-defaults support. The grouped slash menu now retains skill rows instead of dropping them. Skill rows show source badges, and slash aliases use the display name with a dimmed `/skill:` prefix. Selecting either alias still inserts the original `$name` token.

Pulse's built-in/provider grouping, Antigravity capability gates, command-position restrictions, diff settings and compaction controls remain intact. Mobile keeps its native menu and local preferences, matching the source's web/desktop scope. Local and remote web clients resolve skills from the selected environment/provider/workspace as before.

Focused checks cover menu rendering, search, workspace/deduplication helpers, contract defaults and desktop persistence. No browser or development server is launched by this agent; integrated client verification remains with the primary agent.

## Context window indicator

Source `a19f01fc1` adds `contextWindowMeterEnabled`, defaulting off, to client settings. Web and desktop gate only the footer meter passed to the existing primary-actions component. Pulse's configured compaction threshold calculation, usage widgets and `/compact` availability remain unchanged. The preference is searchable under Legacy features and participates in restore-defaults. Mobile retains its native context presentation, matching source scope.
