# Email

Email lets an agent read, search, organize, and draft messages in an IMAP mailbox,
and send mail through SMTP after you approve each message. In Settings, open
Email. Accounts, passwords, and tokens belong to the selected environment and stay
on that environment's machine. A remote environment signs in to your mail server
itself; your browser or phone never holds the credential.

Agents can't delete mail, empty Trash, move mail to Trash, or approve their own
sends. Message content is treated as data, never as instructions.

## Connect an account

Add an account with its address, IMAP and SMTP servers, and a nickname. Give it a
nickname you can use in a prompt, such as "work". Then sign in:

- **Password:** most providers require an app password rather than your normal
  password. Create one in your provider's security settings and paste it in.
- **Google or Microsoft OAuth:** bring your own OAuth client. Register a desktop
  or web client with your provider, then enter its client ID, plus its secret if
  the provider issued one. Sign in opens your browser. If the browser can't
  return to T3 Code, for example on a remote environment, paste the address it
  landed on into the field T3 Code shows.

Saved passwords and secrets are never shown again. **Test** signs in and reports
the account's health. **Re-authenticate** replaces the sign-in. **Disconnect**
deletes the stored sign-in but keeps the account and its project access.
**Remove** deletes the account entirely. Disconnecting or removing an account
cancels any send still waiting for approval.

### Private networks

T3 Code refuses mail servers on private or local network addresses unless you
turn on **Allow private network** for that account. Turn it on only for a server
you run, such as a mail bridge on your own machine.

## Give a project access

An agent can use only the accounts granted to its thread's project. Under
project access, tick the accounts each project may use and choose a default. In a
thread, an agent uses the account you name, then the thread's selected account,
then the project default. If the choice is missing or ambiguous, the agent is told
to ask rather than picking another account.

## Approve a send

When an agent prepares a send, the thread shows the exact message: account,
sender, every recipient including BCC, subject, the full body, and each
attachment's name, size, and fingerprint. Choose **Approve once** to send that
exact message, or **Decline**. If the message or its draft changes, the approval
no longer applies and the agent must prepare it again. Approvals expire if left
unanswered. Mobile shows the same card; if the app is too old to read it, update
the app to approve.

**Accepted** means your mail server took the message. It does not confirm
delivery.

### Outcome unknown

If the connection drops after the message was handed to the server, T3 Code
can't tell whether it was sent and shows **Outcome unknown**. Check your Sent
folder before asking the agent to try again, so the recipient doesn't get it
twice. T3 Code never retries a send on its own.

## Providers

Codex, Claude, Cursor, Grok, Antigravity, and locally managed OpenCode receive
the email tools in every thread. OpenCode connected to an external server can't
use them.

## Conversations and replies

Mail starts in Conversations view and remembers your Messages or Conversations choice on this device.
Conversations use Gmail thread IDs or reply headers, never matching subjects alone. The list groups
up to the newest 500 matching messages before paging conversations. A notice identifies incomplete
scans; narrow the search or switch to Messages for older mail. Older bodies load when expanded.
Links belong to individual messages. The conversation's Linked panel combines their saved links;
new links and list actions target its newest message. Expand a specific message to act on it instead.

Choose **Draft reply with agent**, choose a project if needed, then choose an available model whose
adapter supports the mail tools. The project must have access to that email account. The action
opens a draft or reuses a compatible linked thread with an empty composer. Review the prompt and
removable source references, then send it to the agent. This does not send email. The agent prepares
the exact message for the existing approval card, where you approve or decline it.

After your server accepts the message, Pulse Code saves links from its exact Message-ID to the
thread and confirmed original. If link persistence fails, **Save sent links** retries only those
local writes. Reconnecting also recovers unfinished link writes. It never submits SMTP again.
An unknown SMTP outcome has no send-retry button; check Sent before deciding on any new send.
