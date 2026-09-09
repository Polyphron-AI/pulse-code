# Managed skills and thread dictation

Open **Settings > Providers > Managed skills**, or **Skills > Manage skills** in a thread.

Import a SKILL.md file or a ZIP containing one skill folder and supporting files. SKILL.md must include YAML frontmatter with a name and description. Packages support up to 128 files, 1 MB per file and 8 MB total; SKILL.md itself is limited to 64,000 characters. Choose a unique lowercase ID. Importing with an existing ID replaces that skill for future turns.

GitHub imports accept owner/repository or a repository URL, an optional branch/tag/commit, and the directory containing SKILL.md. Public and private repositories use the GitHub CLI account already signed in on the connected environment. Pulse does not copy that account's token to the browser. A private repository must be accessible to that account. Imports fetch files through GitHub's API; they do not run repository hooks or scripts.

GitHub skills check for updates hourly while the environment is running, and on startup. Use **Sync now** for an immediate check or switch off **Update automatically** to retain the current version. Failed checks display an error and retain the last valid revision. Uploads are updated with **Replace upload**. Saved revisions remain on the environment so ongoing work can continue using them.

**Always available for** chooses defaults for configured providers. Each thread's Skills dropdown lists enabled skills first and offers search by name, ID or description. The list scrolls, showing three rows on narrow screens and four on larger screens when space allows. It can enable or disable a managed skill, or **Use defaults** to remove its overrides. A turn receives the selected skill names, descriptions and immutable file locations; the agent reads the instructions and supporting files when relevant. Changes during a turn apply before the next turn. Native provider and workspace skills remain in the existing skill picker and are not disabled by this menu. Skills guide behavior; they do not change filesystem or tool permissions.

The desktop composer orders model, reasoning effort, access, MCPs, Skills, attachment and Send/Stop. Narrow layouts can scroll the configuration controls. The microphone sits above Send/Stop. Click to record locally, then click again to transcribe into the draft for review. Sending is disabled while dictating or transcribing. Navigating away cancels capture; stopping or cancelling retains the recording in Talk history for recovery. Capture is limited to two minutes.

Enable dictation and load Parakeet in Settings > Dictation before using the mic. Opening a thread does not start capture or download a model. Dictation currently uses the Windows desktop Talk worker; the web client shows setup guidance. Managed skills are available through the web and desktop clients, including remote environments. The separate native mobile client has no managed-skills editor in this preview.
