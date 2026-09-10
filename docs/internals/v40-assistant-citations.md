# V40 assistant citations

Sources: e7deb2aaf, 77e35c561, fe07ffe7c.

The wire token remains `t3-citation://v1/` so drafts and messages remain compatible across clients. Web and desktop author, edit, cancel, copy, stash, and navigate citations, including older history and remote environments. Native mobile renders saved tokens as readable quotations and comments; authoring and source navigation are outside the upstream mobile scope.

ProviderService expands quotes into explicitly delimited reference context and validates the expanded provider input before sending it. Title and branch seeds use readable text. Existing provider attachment and Pulse capability validation remain in place.

Pulse composer submission retains its existing queue and pending-input behavior. Citation comment Command/Ctrl+Enter saves through a discrete editor update before calling the same submit action. Cancel removes only a newly inserted citation; cancelling edits keeps the existing citation. Existing mobile keyboard, media, environment ownership, usage, skills, native icons, file reveal, and browser link preferences are retained.

The upstream timeline overlay-growth prerequisite was not imported: Pulse retains its existing scroll anchoring, with citation positioning suppressing end-follow until navigation finishes. Provider adapters receive the common expanded input; no provider-specific citation protocol is required.

Verification: 90 shared/provider tests and three focused reactor title/branch tests; 344 client tests covering editor persistence, source matching and navigation, selection behavior, clipboard, submission validation, stashes, and native title seeds. Scoped web, mobile, and server types pass. Integrated browser/native verification belongs to the primary agent.
