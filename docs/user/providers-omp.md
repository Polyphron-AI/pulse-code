# Oh My Pi (OMP)

Oh My Pi is an early-access Pulse provider for interactive engineering sessions and short text-generation jobs. Pulse starts the official `omp` executable through its Agent Client Protocol (ACP) mode.

## Install OMP

Install OMP on the machine that runs the Pulse server. Use an official Oh My Pi installation method.

### Windows

Run in PowerShell:

```powershell
irm https://omp.sh/install.ps1 | iex
```

### macOS and Linux

Run in a shell:

```bash
curl -fsSL https://omp.sh/install | sh
```

On macOS, Homebrew is also supported:

```bash
brew install can1357/tap/omp
```

On any supported platform with Bun 1.3.14 or later, you can install the package directly:

```bash
bun install -g @oh-my-pi/pi-coding-agent
```

Verify the executable:

```bash
omp --version
omp models --json
```

See the [official OMP README](https://github.com/can1357/oh-my-pi#install) and [OMP releases](https://github.com/can1357/oh-my-pi/releases) for current installation requirements and release notes.

## Add OMP to Pulse

1. Open **Settings** and go to **Providers**.
2. Choose **Add provider instance**, then select **Oh My Pi**.
3. Give the instance a clear display name.
4. Leave **Binary path** as `omp` when the executable is on the Pulse server's `PATH`. Otherwise, enter its absolute path.
5. Add the provider credentials to that instance's **Environment variables** section.
6. Save, then use **Refresh provider status**.

Use one of these commands to locate the executable when needed:

```powershell
Get-Command omp | Select-Object -ExpandProperty Source
```

```bash
command -v omp
```

Each OMP provider instance can have its own binary path, display name, accent color, and environment.

## Configure provider credentials

OMP routes requests to model providers. Add the key required by the model provider you intend to use:

| Model provider | Sensitive environment variable | Selector form                    |
| -------------- | ------------------------------ | -------------------------------- |
| OpenAI         | `OPENAI_API_KEY`               | `openai/<model-id>`              |
| Anthropic      | `ANTHROPIC_API_KEY`            | `anthropic/<model-id>`           |
| Google Gemini  | `GEMINI_API_KEY`               | `google/<model-id>`              |
| OpenRouter     | `OPENROUTER_API_KEY`           | `openrouter/<upstream-model-id>` |

The selector forms show the required provider prefix. Availability depends on the OMP release, provider account, and credentials. Choose a selector that Pulse discovers from your installed OMP version instead of constructing one from the table.

Mark every API key or token as **Sensitive**. Pulse stores the sensitive value through `ServerSecretStore`; `settings.json` contains only a redacted placeholder. The saved value is also redacted when settings are returned to web, desktop, or mobile clients.

The selected Pulse instance environment wins when it defines the same variable as the Pulse server process environment. This lets two OMP instances use different API keys. On Windows, the variable-name match is case-insensitive.

These are model-provider credentials. They are not Pulse signing, linking, pairing, bootstrap, relay, or internal service keys. Never copy a `PULSE_CODE_*`, `T3CODE_*`, signing, link, bootstrap, or relay value into an OMP provider variable.

For the current credential map and native precedence rules, see [OMP providers](https://github.com/can1357/oh-my-pi/blob/main/docs/providers.md).

## Understand interactive state and native fallback

Pulse assigns each interactive OMP instance a separate `PI_CODING_AGENT_DIR`. OMP keeps that instance's native agent configuration, authentication database, and session data under the assigned root. Pulse owns this variable, so do not add `PI_CODING_AGENT_DIR`, `OMP_PROFILE`, `PI_PROFILE`, or `PI_CODING_AGENT_PROFILE` to the instance environment.

This boundary does not disable every native OMP credential source. When the selected instance does not provide a key, interactive OMP can still use its own stored authentication or `.env` fallback, including project, agent, config-root, or home files that OMP normally reads. A native OMP session launched outside Pulse also uses its own environment and state independently.

Native OMP `/login` is not a supported Pulse onboarding path today. It normally writes authentication under OMP's default agent root, while Pulse forces a separate `PI_CODING_AGENT_DIR` for each instance. Pulse ACP also does not advertise terminal authentication. Native OAuth remains an independent native workflow and can affect a Pulse interactive instance only when an operator separately configures authentication in that instance's exact OMP state root. Pulse text generation does not import that OAuth state.

For strict account separation, put the intended API key on every Pulse OMP instance and remove conflicting OMP `.env` or stored credentials from the directories that session can read. See [OMP settings and state roots](https://github.com/can1357/oh-my-pi/blob/main/docs/settings.md).

ORCA is separate from Pulse. Pulse has no supported API, provider registration, or secret bridge that supplies `ServerSecretStore` or Vault credentials to ORCA. This is not process isolation: the current `ServerSecretStore` keeps raw secrets in filesystem-protected storage for one trusted OS-account boundary. A compromised or deliberately directed ORCA or agent process running as that same user could read the backing files. Run untrusted orchestration under a separate OS account or sandbox, or use a stronger Vault backend. OMP launched by ORCA should use ORCA's own environment and native OMP authentication or state.

See the [official Orca repository](https://github.com/stablyai/orca) for Orca installation and native agent setup.

## Select a model

Pulse checks the configured executable with:

```bash
omp --version
omp models --json
```

The model picker uses the exact selectors returned by OMP. Pulse does not create fallback OMP models. A model selector has this form:

```text
provider/model-id
```

For example, if OMP reports `anthropic/claude-opus-4-6`, use that full selector. A selector beginning with `openrouter/` names an OpenRouter route instead, even when it reaches the same model family. Use the exact string from the catalog because the routes require different credentials.

Reasoning-capable models can expose a **Thinking** choice in Pulse. Pulse sends the selected model and thinking value to OMP before the turn starts.

A ready provider status means the binary ran and its model catalog parsed. OMP's ACP status does not prove that every listed model credential can complete a request. The first turn remains the definitive credential check.

See [OMP model providers](https://github.com/can1357/oh-my-pi/blob/main/docs/providers.md) for bundled, local, OAuth, and custom provider behavior.

## Runtime approval modes

Pulse maps its runtime mode to an explicit OMP approval mode:

| Pulse runtime mode | OMP mode     | Effect                                                                 |
| ------------------ | ------------ | ---------------------------------------------------------------------- |
| Approval required  | `always-ask` | Read actions proceed; write and execution actions ask                  |
| Auto-accept edits  | `write`      | Read and write actions proceed; execution actions ask                  |
| Auto               | `always-ask` | Write and execution actions still ask; unavailable review fails closed |
| Full access        | `yolo`       | OMP approval prompts are disabled for the session                      |

An explicit ACP permission request is still handled by Pulse if OMP emits one. Plan mode selects OMP's ACP plan mode. Form questions are shown in Pulse and require a response; URL elicitation is declined.

Review [OMP approval modes](https://github.com/can1357/oh-my-pi/blob/main/docs/approval-mode.md) before using **Full access**.

## Text-generation isolation

Pulse can use OMP for generated branch names, thread titles, commit messages, and pull request text. Those short jobs use a stricter boundary than an interactive session:

- Each call gets fresh agent, session, home, config, data, cache, state, workspace, and temporary roots.
- Tools, extensions, skills, rules, LSP, MCP servers, filesystem and terminal capabilities, permission requests, and elicitation are disabled or denied.
- Pulse internal variables, alternate Git roots, and other path escape variables are removed.
- Broker activation values (`OMP_AUTH_BROKER_URL` and `OMP_AUTH_BROKER_TOKEN`), external account-pool and snapshot-cache paths (`OMP_AUTH_BROKER_ACCOUNT_POOL_FILE` and `OMP_AUTH_BROKER_SNAPSHOT_CACHE`), and external `PI_CONFIG_DIR` and `PI_CONFIG_FILES` redirects are stripped. A scalar broker snapshot TTL may remain, but it cannot activate a broker or select broker state.
- `--no-session` disables normal conversation persistence. OMP may still make process-local session writes, but those writes are confined to the disposable call root rather than being absent.
- Provider API keys can authorize models from OMP's bundled catalog.
- Shared native OMP OAuth sessions and custom `models.yml` entries are intentionally not imported into the clean call root.

Choose an API-key-backed bundled OMP model for Pulse text generation and source-control writing. A model that works in an interactive session only because of shared OAuth or custom model state can fail in this isolated path.

## Status, updates, and troubleshooting

Use **Refresh provider status** after changing the binary path, credentials, or OMP installation. Pulse reports the detected version and models, and it can show an update advisory.

When **Update now** is available, Pulse runs the configured executable with:

```bash
omp update
```

OMP owns the update operation. After it completes, refresh provider status and start a new session. If the in-app update is unavailable or fails, update OMP with the same official installation method you used originally, then verify `omp --version` again.

Common failures:

- **Command not found:** put `omp` on the Pulse server's `PATH` or set an absolute **Binary path**.
- **No models:** add a supported provider key, remove an unintended disabled-provider rule, then refresh status.
- **Interactive model works but generated text fails:** use a bundled model with a provider API key instead of shared OAuth or a custom model.
- **Wrong account is used:** inspect the selected instance environment, then check project and native OMP `.env` or stored-auth fallback.

Use the [OMP releases page](https://github.com/can1357/oh-my-pi/releases) to review upstream changes before updating.
