# V40 composer preferences

## Skill menus

Source `9da0fab08` is adapted to the Pulse composer. The existing shared helpers already provide the source search behavior, skill/native-command deduplication and display-name matching, with Pulse's additional workspace resolution and user-invocation restrictions. Those helpers are preserved.

Web and desktop gain the `showSkillsInSlashMenu` client preference, defaulting on, with Settings search, individual reset and restore-defaults support. The grouped slash menu now retains skill rows instead of dropping them. Skill rows show source badges, and slash aliases use the display name with a dimmed `/skill:` prefix. Selecting either alias still inserts the original `$name` token.

Pulse's built-in/provider grouping, Antigravity capability gates, command-position restrictions, diff settings and compaction controls remain intact. Mobile keeps its native menu and local preferences, matching the source's web/desktop scope. Local and remote web clients resolve skills from the selected environment/provider/workspace as before.

Focused checks cover menu rendering, search, workspace/deduplication helpers, contract defaults and desktop persistence. No browser or development server is launched by this agent; integrated client verification remains with the primary agent.

## Context window indicator

Source `a19f01fc1` adds `contextWindowMeterEnabled`, defaulting off, to client settings. Web and desktop gate only the footer meter passed to the existing primary-actions component. Pulse's configured compaction threshold calculation, usage widgets and `/compact` availability remain unchanged. The preference is searchable under Legacy features and participates in restore-defaults. Mobile retains its native context presentation, matching source scope.

## Scroll collapse

Sources `03728361a` and `a12589dc0` are implemented as the final scroll-only preference. The retired desktop blur setting is never added. The existing Pulse blur handler already applies only to mobile.

The upstream resting-composer foundation `5b8445b7a` and follow-ups `044ea8e34`, `0ba06a122`, `54aef6fbe`, `9e1bc36a0`, `c1d27e593` and `a07715c09` were reviewed. Pulse did not have that control-relocation layout. This adaptation keeps all existing footer controls, including dictation and compaction, visible and shortens only the prompt row. It does not claim to port the unrelated upstream control relocation or its full visual refactor.

The final gesture and multiline-measurement helpers are reused. Collapse requires an existing desktop thread with overflowing real timeline content. Zoom, horizontal gestures and nested scrollers do not trigger it. A restored gesture stays suppressed until a new gesture begins. Returning to the logical end restores the composer without moving focus. Explicit or soft-wrapped multiline drafts, attachments, pending approvals/answers, plan follow-up and open composer menus prevent collapse. The timeline retains the last expanded composer inset during collapse so restoring it cannot cover the final message. Mobile keyboard behavior remains unchanged.

The preference defaults on, can be disabled immediately, is searchable, and participates in individual reset and restore-defaults. Synthetic tests exercise scrolling, opt-out, restoration, gesture suppression, nested content, multiline measurement and inset reservation. Browser verification remains with the primary agent.
