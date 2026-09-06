# Office and mailbox integration

This merge includes the alpha IMAP/SMTP mailbox, Office overview, full-width Office/Mail layout, mobile mail controls, and manual People/work review. Sent messages are retained through the adapter's Sent-folder handling.

The integration branch was isolated from `feat/pulse-mail` because Luna provider integration was being edited concurrently. Live Luna discovery is excluded. Canonical identity review and preparatory discovery-result validation remain included. Calendar, CRM, SOP automation and universal Tasks are not implemented by this change.

The original `pulse-mail` worktree and its index are preserved for continued Luna development. Reconcile its completed mailbox changes with `develop` before publishing subsequent work.

Existing Office/Mail screenshot evidence covers the layout changes. It does not validate the later People panel. Live IMAP/SMTP accounts were not exercised. Mobile's full typecheck has existing navigation errors; focused mail tests are used for this integration.
