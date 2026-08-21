# Install Pulse Code

Pulse Code is a web and desktop GUI for running coding agents on your machine.

## Requirements

Node.js `^22.16 || ^23.11 || >=24.10` on the machine that runs the Pulse Code server.

At least one provider CLI, installed and authenticated. See [Providers](#providers) below.

## Run Without Installing

```bash
npx t3@latest
```

This starts the Pulse Code server on your machine and opens the local web app. Use
`npx t3@latest --help` for the full CLI reference.

## Desktop App

Pulse Code desktop is an independently installable downstream product. It uses its own application
identity and state, so you can install and open it alongside official T3 Code. Installing Pulse does
not update, replace, or modify the official T3 installation.

Download the Pulse installer from the assets attached to
[Pulse Code GitHub Releases](https://github.com/Polyphron-AI/pulse-code/releases). For the current
Windows candidate, download and run the `Pulse-Code-*-x64.exe` installer manually.

Do not use the existing `T3Tools.T3Code` Winget package, `t3-code` Homebrew cask, or `t3code-*` AUR
packages to install Pulse. Those identifiers install official or legacy T3 desktop packages.

Start Pulse as a fresh installation. It does not automatically read, move, or delete T3 desktop
data. A future import tool may offer an explicit, selective copy into Pulse, but import is optional
and will not alter the source T3 installation.

The Windows candidate is suitable for local installation evidence. Signed, team-wide macOS and
Linux releases remain unavailable until each platform has passed packaging, signing, launch, and
side-by-side verification.

## Providers

Pulse Code drives provider CLIs; it does not ship them. Install the CLI for each provider you want
to use, then authenticate it.

| Provider   | CLI                                                   | Default binary | Log in with           |
| ---------- | ----------------------------------------------------- | -------------- | --------------------- |
| Codex      | [Codex CLI](https://developers.openai.com/codex/cli)  | `codex`        | `codex login`         |
| Claude     | [Claude Code](https://claude.com/product/claude-code) | `claude`       | `claude auth login`   |
| Cursor     | [Cursor CLI](https://cursor.com/cli)                  | `cursor-agent` | `agent login`         |
| Grok Build | [Grok Build CLI](https://x.ai/cli)                    | `grok`         | `grok login`          |
| OpenCode   | [OpenCode](https://opencode.ai)                       | `opencode`     | `opencode auth login` |

Cursor is the one to watch: install Cursor CLI, which provides the `cursor-agent` binary that
Pulse Code looks for, but authenticate with `agent login`, not `cursor-agent login`.

Run the login command on the machine running the Pulse Code server, not on the device you browse
from.

### Binary Discovery

Each provider CLI must be on the server's `PATH`, or have an explicit binary path set in
**Settings** → the provider instance → **Binary path**. Use the explicit path when a version
manager or a non-standard install location keeps the CLI off the `PATH` of the shell that
started Pulse Code.

### When Auth Is Needed

Provider auth is required before you start a session with that provider, not before you start
Pulse Code. You can install Pulse Code, open it, and add providers afterwards. A provider that is not
authenticated shows its status in **Settings** and fails at session start with the login command
to run.

For multi-account setups, see [Codex](./providers-codex.md) and [Claude](./providers-claude.md).

## Next Steps

- [Permission modes](./permission-modes.md): how much Pulse Code asks before acting
- [Remote access](./remote-access.md): connect from a phone, tablet, or another desktop
- [Keeping Pulse Code in sync](./updating.md): client and server version skew
- [Running in the background](./background-service.md): Linux background service
