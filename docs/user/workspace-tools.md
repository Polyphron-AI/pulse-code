# Workspace tools and automations

The side panel places **Browser**, **Files**, and **Agents** below Linked and Suggested. Files lists the Drive files confirmed for the selected item. Agents lists its confirmed thread links and offers **Start thread**. Suggestions alone do not appear in either list or become agent context.

In a project's hub, **Project workspace settings** defines its task columns and **Browser thread**. Choose an existing thread from that project for the desktop Browser. On desktop, **Open Browser** opens the existing embedded browser for that thread. On web and phone browsers, **Open in new tab** opens the address externally. External tabs do not report navigation back to Pulse Code: paste their current address before choosing **Link this page**. That action links the page to the item you selected. URLs are normalized like pasted links.

Basic project tasks have a title, one project column, and links. Use **Add task**, select a task to rename it or change its column, and **Save task**. Task selection shows that task's Linked panel and item actions. Move tasks out of a column before removing or renaming it in workspace settings. **Delete task** keeps its existing links and saved record, but opening the deleted task reports it unavailable. Task lists show at most 200 records. These tasks have no recurrence or dependencies.

Choose **Start automation** from an item's actions, context menu, command palette, or selected-item shortcut. It opens the existing scheduled-task editor with a source reference and the item's project, or asks you to choose a project when needed. Edit the prompt, schedule, model, and workspace as usual. Canceling before Save creates nothing.

Saving first creates an idle thread and confirms its source and project links. Only then can the schedule become enabled. No provider turn runs as part of saving. If a save only partly succeeds, the error tells you an idle thread may exist; retry in the same editor to reuse its thread and schedule. Changing the source or workspace of that partially started save requires a fresh editor. The prompt names the source; its contents remain data, never instructions.

Saved automations appear in **Settings > Scheduled tasks**, using the existing enable, disable, **Run now**, edit, and delete controls. Disabling or deleting stops future scheduled runs. Their confirmed source links remain. Scheduled sends use the existing provider and approval rules; an automation does not bypass exact mail-send approval.

Code thread menus retain their branch, rename, lifecycle, handoff, and copy operations, with a **Workspace actions** group added. Project right-click retains **Project settings** and adds scoped workspace actions. If a grouped project spans environments, choose its environment before starting work. These optional tools need a supporting server; existing native operations and manual links remain available on older servers.
