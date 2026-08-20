# Windows browser target validation

## Problem

PulseCode's server launches browser targets through the operating system. On Windows, the launcher passes the target to PowerShell's `Start` command. If a caller accidentally supplies a bare executable or file-like value such as `oxfmt`, Windows treats it as a shell-open request and displays the "Select an app to open" dialog.

Browser targets currently originate from trusted HTTP flows, but the launch boundary accepts any string. The boundary should enforce the contract it documents.

## Decision

Validate the target in `ExternalLauncher.launchBrowser` before resolving or spawning a platform command. Accept only absolute `http:` and `https:` URLs. Preserve the original target string when launching so existing escaping and URL behavior remain unchanged.

Introduce a typed invalid-target error in the external-launcher contract. This distinguishes validation failures from process-spawn failures and keeps invalid input from reaching `open`, `xdg-open`, PowerShell, or a Windows shell association.

## Alternatives considered

- Register `oxfmt` as a Windows protocol or file association. This would hide the symptom while teaching Windows to open a command-line tool as a document.
- Special-case `oxfmt` in PulseCode. Other bare targets would still trigger the same operating-system behavior.
- Change only the Windows PowerShell command. macOS and Linux launchers would remain able to shell-open invalid targets, and the service contract would still be unenforced.

## Data flow

1. A caller requests `launchBrowser(target)`.
2. The launcher parses `target` as an absolute URL and checks its protocol.
3. Invalid or non-web targets fail with `ExternalLauncherInvalidBrowserTargetError` before platform launch resolution.
4. Valid HTTP(S) targets follow the existing platform-specific detached launch path.

File links are unaffected: they continue through PulseCode's internal file preview and configured editor launch flows rather than the browser launcher.

## Verification

- A Windows regression test passes `oxfmt`, expects the typed invalid-target error, and asserts that no process was spawned.
- Existing browser launch coverage confirms a valid HTTPS target still reaches the platform command unchanged.
- Focused external-launcher and shell tests cover the affected boundary and Windows command resolution.
