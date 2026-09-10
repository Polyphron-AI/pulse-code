# Antigravity setup

Pulse Code runs Google's official Antigravity ACP agent on the environment you select. Each provider instance has its own sign-in. Your browser or phone controls that environment; signing in to another Antigravity application does not sign in this provider.

On web or desktop, open **Settings → Providers**, select the device, and expand **Antigravity**. On mobile, open **Settings → Environments**, expand the environment, and choose **Set up Antigravity** or **Manage Antigravity**.

1. Enable Antigravity. It is off by default.
2. Choose **Install Antigravity**, or configure a manually installed executable under **Binary path** on web or desktop.
3. Choose **Sign in with Google** and open the sign-in page. You can copy the link to another browser.
4. Complete sign-in and wait for Pulse Code to confirm account access.

Setup requires permission to operate the environment. Older environments without setup controls need an update first. Installation continues if you leave the page or reconnect.

## Signing in remotely

Google returns to a `127.0.0.1` address on the machine running your browser. When that is a different machine from the environment, the final page may fail to load. Copy its full address, including the query string, into the return URL field in the same Pulse Code client where you started sign-in. Choose **Continue** on web or desktop, or **Complete sign-in** on mobile. Keep the original address; do not replace it with the server hostname.

The return URL contains a temporary sign-in code. Paste it only into the setup field. If the attempt expires, start a new sign-in attempt.

## Authentication and installation settings

Web and desktop provider settings offer Google account, Gemini Enterprise, Gemini API key, and Agent Platform authentication methods. Mobile shows the configured method and its connection controls. Pulse Code uses the selected method without switching methods after an authentication failure.

Managed installation uses the release manifest bundled with Pulse Code. An explicit binary path takes priority and is not updated or removed by managed installation controls. Provider instances share the managed executable, but keep separate sign-in profiles.

Disabling an instance keeps its saved sign-in. Signing out removes that instance's saved credentials. Removing the managed installation removes the shared executable and keeps sign-in profiles, thread history, and workspace files. Disable the instances using it and cancel active installation before removal.

Use **Refresh provider status** on web or desktop to explicitly check account access and discover available models. Automatic status checks verify the installation without opening a model discovery session.

On mobile, open the thread's model settings and choose **Refresh models**. The same picker offers provider setup. If an Antigravity model becomes unavailable, Pulse Code keeps the selected model and asks you to finish setup or choose another one. Queued messages return for editing instead of silently switching models.

## Questions and approvals

Antigravity can offer a fixed set of answers. Choose one of the displayed options; these questions do not accept custom text. Approval choices can include a warning supplied by the provider. On web or desktop, hover or focus the warning icon to read it; mobile displays the warning beside the choice.

## Conversation controls

Pulse Code uses the interaction modes reported by the selected provider. Providers with native mode controls do not show the legacy Plan toggle. When a provider cannot restore conversation history, Pulse Code hides conversation rewind. Start a new thread when you need a fresh conversation.
