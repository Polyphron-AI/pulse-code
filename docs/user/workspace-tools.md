# Workspace tools and automations

The side panel places **Browser**, **Files**, and **Agents** below Linked and Suggested. Files lists the Drive files confirmed for the selected item. Agents lists its confirmed thread links and offers **Start thread**. Suggestions alone do not appear in either list or become agent context.

In a project's hub, **Project workspace settings** defines its task columns and **Browser thread**. Choose an existing thread from that project for the desktop Browser. On desktop, **Open Browser** opens the existing embedded browser for that thread. On web and phone browsers, **Open in new tab** opens the address externally. External tabs do not report navigation back to Pulse Code: paste their current address before choosing **Link this page**. That action links the page to the item you selected. URLs are normalized like pasted links.

Open **Tasks** to browse all tasks in an environment or filter to one project. **List** and **Board** share the same filters and task records. **Load more** adds pages; the open count includes matching tasks on later pages. In Resources, choose a project and **Tasks** to work with its tasks while keeping your current space and date. Its task details open inside Resources. The older task list inside each project still shows up to 200 tasks, including on servers without the newer Tasks support.

Use a checkbox to complete or reopen a task. Completion moves it to the project's designated completed column; reopening moves it to an open column. Choose that designation in **Project workspace settings**, and move tasks out before removing or renaming their column. Select a task to edit its title, column, date-only due date, area or owner, then **Save task**. New tasks default to **Me**; **Unassigned** clears the owner. Me is the environment owner's display label and grants no access. Today and overdue labels follow the environment's workspace timezone; changing devices never shifts the stored date or creates a reminder. **Delete task** keeps its links, which then explain that the task is unavailable. Tasks have no recurrence or dependencies.

Choose **Start automation** from an item's actions, context menu, command palette, or selected-item shortcut. It opens the existing scheduled-task editor with a source reference and the item's project, or asks you to choose a project when needed. Edit the prompt, schedule, model, and workspace as usual. Canceling before Save creates nothing.

Saving first creates an idle thread and confirms its source and project links. Only then can the schedule become enabled. No provider turn runs as part of saving. If a save only partly succeeds, the error tells you an idle thread may exist; retry in the same editor to reuse its thread and schedule. Changing the source or workspace of that partially started save requires a fresh editor. The prompt names the source; its contents remain data, never instructions.

Saved automations appear in **Settings > Scheduled tasks**, using the existing enable, disable, **Run now**, edit, and delete controls. Disabling or deleting stops future scheduled runs. Their confirmed source links remain. Scheduled sends use the existing provider and approval rules; an automation does not bypass exact mail-send approval.

Code thread menus retain their branch, rename, lifecycle, handoff, and copy operations, with a **Workspace actions** group added. Project right-click retains **Project settings** and adds scoped workspace actions. If a grouped project spans environments, choose its environment before starting work. These optional tools need a supporting server; existing native operations and manual links remain available on older servers.

An agent can read a Calendar event only when that exact event is directly linked to its thread or
project. A saved reference, suggestion, meeting note or related item does not grant access. Unlinking
revokes future reads unless another direct thread or project link remains. Event reads return bounded
text and metadata; they do not browse calendars, refresh a provider or read related notes.
