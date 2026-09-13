# Pulse Next branch transition

On 2026-09-13 the user selected Pulse Next as the primary development codebase.

| Branch                       | Purpose                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `develop`                    | Pulse Next. Start new feature branches here.                                 |
| `pulse-code-old`             | Preserved legacy Pulse Code development history.                             |
| `experiment/pulse-next-v040` | Original Pulse Next branch, retained for history.                            |
| `main`                       | Existing production target and GitHub default; unchanged by this transition. |

Legacy `develop` was preserved at `2fa59554b67b83fd6a0b643bce39bc969ade1a2e`,
including the thread usage meters merge. The Pulse Next application revision is
`377d0c7bf`; its acceptance documentation is at `1da83f2f7`.
This is a deliberate branch replacement, not a merge of legacy features.
Legacy-only features need explicit selection and porting through the feature ledger.

Existing worktrees and feature branches retain their history and local files.
Do not merge an old feature branch wholesale into the new `develop`. Check its
base and port the selected changes into a fresh branch from `origin/develop`.
Do not blindly pull the rewritten branch into a checkout with unpublished work.
Fetch, preserve local work on a separate branch, then create a fresh worktree from
`origin/develop`.

Pulse Next has no production release yet. Its retained local test environment is
in `.worktrees/pulse-next/.t3/transport-validation`; the web port observed during
this transition is 7986. Pairing is required. This is synthetic development
evidence, not a public deployment. Production identity, signing, update feeds,
packaged installation and real-provider acceptance remain release gates.

Keep GitHub's default branch on `main` until its scheduled release workflows have
been reviewed. Changing the default branch can activate scheduled publication from
the new tree. This transition does not authorize that publication or replace the
installed application.

The remote transition preserves the old branch and replaces `develop` in one
atomic push with an exact lease on its previous commit. A concurrent update must
reject that transaction rather than discard the newer work. Recovery uses the
preserved `pulse-code-old` commit, after checking for new Pulse Next commits.
