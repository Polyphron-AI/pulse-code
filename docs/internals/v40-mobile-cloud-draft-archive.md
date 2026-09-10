# Mobile relay draft preservation

Adapted the account-owned archive slice of source `9bc7a5684`, with final V40 multiple-draft migration behavior, from Pulse integration `b50173ab8`.

Previously, mobile sign-out/account switching removed relay environments through their normal owned-data cleanup. That cleanup removed local drafts and queued messages. The mobile account bridge now deactivates credentials, durably archives unsent relay work for its account, and only then removes environments. Activation checks the persisted previous account, completes required cleanup, and restores only the selected account before enabling delivery.

The existing version-1 draft document gains optional `cloudAccountId` and `signedOutDrafts` fields. Archive records include drafts and encoded queued messages; older documents still decode. Pulse retains inline image creation, fileUri-compatible readers, version-4 outbox writes, file-only upload ownership, existing remote/bootstrap CAS behavior, and its provider setup flow. The upstream background upload queue is not part of this slice.

Archived draft and outbox attachments remain owners during file cleanup, including file-backed images and pending-task edits. Restoration preserves concurrent draft content and share-import receipts. A late delivery removes only its matching archived payload; newer edits remain recoverable. Archive, restore, and late-delivery mutations serialize through the existing async queue utility. Queued-message identity includes the environment. A failed archive prevents environment removal; a failed restoration leaves its durable archive available for retry. Legacy relay work with no known account owner refuses destructive cleanup.

Verification: 74 focused tests across draft persistence, outbox drain, account credentials, and cold-start task-list suites pass. Tests cover restart/account isolation, file and image ownership, backup failure, archived legacy-draft migration, late acknowledgements versus edits, failed restore retry, environment-scoped message collisions, and serialization of delivery/restoration. Mobile typechecking and scoped lint pass. No real account or runtime verification was performed.
