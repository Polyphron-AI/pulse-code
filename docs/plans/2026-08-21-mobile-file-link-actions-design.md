# Mobile file-link actions — feature design

Status: approved
Date: 2026-08-21

## One-line pitch

Tapping a workspace-file link in mobile chat opens a small native menu that lets
the user either preview the file in Pulse Code or stream it to the device and
hand it to the platform's Open with chooser.

## Problem

Mobile chat currently sends workspace-file links directly to the built-in file
viewer. That navigation does not always activate, and the user has no alternate
way to open the linked artifact in an installed app. Files such as PDFs, archives,
office documents, and generated reports are often better handled by the operating
system than by a source-oriented preview surface.

## Decided interaction

A tap on a recognized workspace-file link in a thread presents two actions:

- **Preview in Pulse Code** keeps the existing `ThreadFile` navigation, including
  a linked line number when present.
- **Open with…** resolves the existing authenticated workspace-file asset
  capability, downloads the response to the mobile cache under the original
  filename, and opens the platform share/open chooser.

External web, email, and telephone links keep their current behavior. The Files
tab keeps opening the built-in viewer directly; this choice belongs specifically
to chat hyperlinks where the current one-way navigation is unreliable.

## Architecture and data flow

The mobile client already has every server primitive needed for this flow. Asset
URL creation accepts a `workspace-file` resource containing the thread id and
absolute workspace path. The server returns a short-lived capability URL that is
valid over local, remote/relay, and tunnel connections. No filesystem path or
credential is exposed outside that capability.

The thread feed resolves the markdown destination to a safe workspace-relative
path before showing the menu. Preview uses the existing navigation callback.
Open with requests the capability only after the user chooses it, converts the
relative path back to the workspace absolute path, streams the URL with
`expo-file-system` into `Paths.cache`, and invokes `expo-sharing`. The cache
destination preserves a sanitized basename and extension so receiving apps can
identify the file. Concurrent requests for the same target share one in-flight
operation to avoid duplicate downloads and choosers.

## Error handling

If the link cannot be resolved inside the workspace, it remains inert rather than
requesting an arbitrary host path. If the environment is disconnected, asset URL
creation fails, the URL is invalid, the file download fails, or native sharing is
unavailable, mobile shows a concise error alert and stays in the thread. A failed
Android download may leave a partial cache file; the helper removes that file on
failure when it exists. Capability URLs are requested at action time so they are
not likely to expire while a message is visible.

## Surface decisions

- **Entry points:** mobile chat markdown links apply; Files-tab browsing does not.
- **Clients:** mobile changes; web and desktop retain their existing link menus.
- **Providers:** not applicable because markdown messages are provider-neutral.
- **Contracts/server:** no change; reuse the typed asset capability contract.
- **Reverse state:** the menu always retains both Preview and Open with choices.
- **Connection modes:** local, remote/relay, and tunnel all use the prepared
  environment's HTTP base URL and signed asset route.
- **Docs:** a mobile user guide records the two actions and cache behavior.

## Constraints and open questions

There are no blocking open questions. The system chooser is provided by
`expo-sharing`; operating systems may label it as Share rather than Open with and
control which installed apps are offered. Cache lifetime is intentionally left to
the operating system. Progress UI and persistent offline downloads are non-goals.

## Verification

Focused unit tests cover filename sanitization, single-flight behavior, successful
download/share, capability failures, sharing unavailability, and cleanup after a
failed download. Existing markdown-link tests continue to prove file recognition.
The mobile package typecheck proves ThreadFeed integration. Simulator testing is
optional and requires explicit user approval under repository policy.

## Build order

1. Add the mobile Open with helper, the chat file-link action menu, focused tests,
   and user documentation; then run the touched tests and mobile typecheck and fix
   all failures.
