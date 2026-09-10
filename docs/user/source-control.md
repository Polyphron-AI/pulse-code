# Source Control Integrations

Pulse Code connects to your Git hosting provider so you can create pull requests, review code, and manage repositories without leaving the app.

## Supported Providers

Pulse Code works with the platforms your team already uses:

- **GitHub** – Pull requests, repository creation, and clone integration
- **GitLab** – Merge requests, repository publishing, and hosted clones
- **Bitbucket** – Pull request workflows (via API token authentication)
- **Azure DevOps** – Pull request support for Microsoft-hosted repositories

## What You Can Do

### Start Projects from Anywhere

**Clone repositories directly**

- Open the Command Palette (`Cmd/Ctrl + K`) → **Add Project**
- Choose **GitHub repository**, **GitLab repository**, **Bitbucket repository**, **Azure DevOps repository**, or paste any **Git URL**
- Enter the repository path (`owner/repo`, `group/project`, `workspace/repository`, or `project/repository`) or a full Git URL, pick a destination, and start coding

**Publish local projects to the cloud**

- Have a local Git repository without a remote?
- Use the **Publish Repository** action to create a new hosted repository (GitHub, GitLab, Bitbucket, or Azure DevOps), add it as your origin remote, and push, in one flow
- If the local repository has no commits yet, publishing creates the remote and wires it up but does not push. Make a commit, then push normally.

### Manage Code Reviews Without Context Switching

Draft pull requests show a gray draft indicator in the sidebar on desktop, web, and mobile. Pull request lists and reviews refresh after an agent turn finishes.

**Create pull requests while you work**

- Push a branch and create a pull request from the Git actions controls in the toolbar
- Pulse Code can suggest titles and descriptions based on your commits
- Supports GitHub Pull Requests, GitLab Merge Requests, Bitbucket Pull Requests, and Azure DevOps Pull Requests

**Stay on top of open reviews**

- See if your current branch already has an open PR/MR
- Open several reviews from the **Pull requests** page as tabs in the right panel
- While working in a thread, open linked reviews in the same compact right-panel tabs without
  leaving the conversation
- Enable **Settings → General → Proactive panels** to open a newly linked review automatically and
  switch to the completed turn's diff when agent work finishes
- Open the review directly in your browser with one click
- Command-click (Control-click on Windows and Linux) a pull request number in the sidebar to open it in your browser instead of in Pulse Code
- Check out a teammate's branch to review code locally

**Manage merge and workflow state**

- On GitHub, **Revert changes** opens a new pull request reversing a merged pull request. Review the confirmation before creating it.
- Fork workflows awaiting permission appear as **Action required**, rather than passed checks. **Approve workflows to run** is available when your account can approve them; review the code and workflow changes before confirming.
- Auto-merge shows the strategy reported by the host. You can disable it or choose **Merge now** when permitted.
- You can post a comment and close or reopen a review together. If the state change fails after posting, the comment remains saved.

Actions depend on the hosting provider and your permissions. These controls are available in the web and desktop pull-request workspace.

**Edit review text**

- Rewrite a pull request's title and description from the review itself, in Markdown, with a
  preview before you save
- Rewrite your own comments the same way, wherever they are shown
- Works on GitHub, GitLab, and Bitbucket. Azure DevOps takes a new title and description; its
  comments stay read-only here, as they already were
- On GitHub, put a label on a pull request or take one off from the **Labels** row of the review.
  Changing labels needs triage access or better on the repository

### Know Your Setup at a Glance

The **Source Control settings** page shows you exactly what's connected:

- ✅ Which providers are authenticated and ready
- ⚠️ What's missing and how to fix it
- 👤 Which account is signed in (when available)

Run a quick **Rescan** after setting up a new machine or changing credentials.

## Getting Started

### For GitHub (Recommended for most users)

1. Install the GitHub CLI on the machine running Pulse Code:
   ```bash
   brew install gh
   ```
2. Sign in:
   ```bash
   gh auth login
   ```
3. Open **Settings → Source Control** in Pulse Code and verify GitHub shows as authenticated

You can now clone, publish, and create pull requests.

### For GitLab

1. Install the GitLab CLI:
   ```bash
   brew install glab
   ```
2. Authenticate:
   ```bash
   glab auth login
   ```
3. Check **Settings → Source Control** to confirm the connection

### For Bitbucket

Bitbucket uses tokens instead of a CLI tool. Two options, both set as environment variables on the
machine running Pulse Code.

Recommended, a Bitbucket access token:

```bash
export PULSE_CODE_BITBUCKET_ACCESS_TOKEN="your-access-token"
```

Or an Atlassian account email plus API token, with read/write access to pull requests and
repositories, plus read access to your user account (`read:user:bitbucket`, used to verify the
connection):

```bash
export PULSE_CODE_BITBUCKET_EMAIL="you@example.com"
export PULSE_CODE_BITBUCKET_API_TOKEN="your-token"
```

If both are set, the access token wins. Restart Pulse Code and verify the connection in **Source
Control settings**.

### For Azure DevOps

1. Install Azure CLI:
   ```bash
   brew install azure-cli
   ```
2. Add the DevOps extension:
   ```bash
   az extension add --name azure-devops
   ```
3. Sign in:
   ```bash
   az login
   ```

---

## Requirements & Troubleshooting

**Git is required** – Pulse Code uses Git for all local operations. Ensure `git` is installed on your server.

**Server-side setup** – Authentication happens on the machine running Pulse Code (the server), not your local browser. If you're using a hosted or team instance, your administrator may have already configured providers.

**Common issues:**

- **Provider shows "Not authenticated"** – Run the login command for that provider (e.g., `gh auth login`) in a terminal on the server, then rescan in Settings
- **Bitbucket not connecting** – Double-check your environment variables are set in the correct shell profile and the server was restarted
- **Can't push to a remote** – Verify your Git remote URL matches the provider you've authenticated with (SSH vs HTTPS remotes may need different credentials)

**Need more help?** Check your provider's CLI documentation:

- [GitHub CLI](https://cli.github.com/)
- [GitLab CLI](https://gitlab.com/gitlab-org/cli)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/)

The pull request list remembers its filters and sort order when reopened from the sidebar. Filtering or sorting keeps the selected review panel open. Merge readiness is the default browse order: approved passing work comes first, followed by passing work, other open work, finished work, and conflicts. Smaller measured changes come first within each tier. Text searches keep relevance order unless you choose another sort.

The pull request list?s **Author / labels** control filters by a login (or `me`) and one or more labels. Add labels individually; all selected labels must match. Apply saves these controls in the shareable URL and remembers them for the next visit. Remove an individual label or use Clear to broaden the list. Search qualifiers such as `author:` and `label:` take precedence over the corresponding controls. Filtering keeps the selected pull request open.

Opening **Author / labels** loads suggestions from the current environment, project, host, and involvement scope. Author suggestions show loaded pull request and merged counts; label suggestions show loaded counts and their host colors. These counts describe the loaded sample, not repository-wide totals. The pull request list also shows its first label and how many additional labels it has.
