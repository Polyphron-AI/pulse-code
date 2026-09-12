# Settings batch preparation

Astra's read-only audit at `7b4dcead3` supports the 30-source order in the
[campaign plan](../plans/2026-09-12-v40-dependency-batches.md). No implementation
or tests ran in this audit. Revalidate at the actual reviewed post-PR base.

## Dependency decision

Before `009c13fa`, adopt only the core keybindings terminal-focus guard and its
regression from `ce8ca5bb3d005d8653d1b09c1e7c9e02d3ef8ae4`. Its sidebar hook wiring
and hook test remain separate source obligations. Do not close the source in full
for a two-file prerequisite. The audit of 72 touched TypeScript paths found no
other selected-behavior prerequisite. No new settings abstraction is justified.

## Pulse behavior at existing boundaries

- `ProviderSettingsPanel` and the providers route own explicit environment and
  instance targets. Preserve remounts on target changes, missing-device display,
  and dropping an instance target only after an explicit device switch.
- Keep pending and readonly states distinct, using cached session permissions
  rather than only primary authentication. Setup retains the selected environment,
  row instance, configured binary path, enablement and Antigravity method.
- Keep MCP, managed skills and usage capability/connection/readonly gates. Retain
  explicit `mcpServers` map replacement from the utility batch.
- Preserve custom model objects and `CustomModelEditor` when older `6effe0a2`
  assumes string arrays. Custom definitions from `5a433244` are already reviewed.
- Search includes Pulse dictation, voice, mail, composer and scheduler destinations.
  Available-search filtering must not hide these or target a different environment.
- Keyboard source `896fe82f` affects Sidebar, LegacySidebar, ModelPickerContent,
  CommandPaletteContent and terminal startup focus. Preserve hidden-terminal and
  remote-routing behavior across all callers.

## Focused proof

Retain web CommandPalette.logic, settingsSearch, pulseSettingsSearch,
ProviderSettingsPanel.logic, ProviderSettingsPanel.environment, ProviderInstanceCard,
ProviderSettingsForm, ProviderSetupSection, customModelEditor.logic,
SettingsPanels.logic, ConnectionsSettings.logic, KeybindingsSettings.logic,
keybindings, providerInstances, modelOrdering and onboarding/providerReadiness.logic
tests. Source additions provide ProviderModelsSection and settingsSectionVisibility
tests; these are absent at the audit base.

Retain client-runtime `operations/projects.test.ts`; mobile AddProjectScreen.logic,
new-task-project-selection, environmentSections and cloudEnvironmentPresentation
tests; contracts `server.test.ts` for machine-kind fallback. Run affected web,
client-runtime and mobile typechecks and changed-file lint after final restoration.

Add preservation cases for a targeted device disappearing and reappearing, two
accounts on the same driver with instance-specific deep links, readonly editor
selection with writes disabled, enabled toggles preserving defaults and explicit
models, configured setup paths, and reachable Pulse search destinations.

## Exclusions and acceptance

Do not adopt whole ChatView, CommandPalette or SettingsPanels files. Target
WorkspacePageContainer, grouped rename helpers, refresh-icon context, mobile
Uniwind/voice context and terminal close/grouping are neighboring changes, not
missing prerequisites. `ff93aba6` supplies its own hook mock; it needs no new test
framework. Antigravity retains its prior partial runtime-acceptance gap. Real
client focus, animation and native acceptance remain separate from this audit.
