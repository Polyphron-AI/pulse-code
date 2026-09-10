# Customize a project icon

Pulse Code selects a project icon automatically. It checks `t3.json`, common favicon and app icon
paths, and icon links in project HTML files. If it does not find an image, it chooses a built-in
emoji from the project name.

To choose a different icon or emoji:

1. Open **Settings** and select **Projects**.
2. Select the project.
3. Next to **Project icon**, select **Choose icon**.
4. Search the full Lucide icon set and choose a color, or switch to **Emoji** and choose or paste
   an emoji.

To use an image from the project instead, select **Choose file**, search for an image, and select
it. For a local project in the desktop app, the file picker also offers **Open in Finder** or
**Open in Explorer** to choose an image outside the project. That image stays on the host machine;
connected clients display it through the host. Remote projects use the project file search.

Pulse Code supports SVG, PNG, ICO, JPEG, GIF, AVIF, and WebP files. The selected path applies to
each checkout in the project group and appears on your connected clients.

To use automatic detection again, select **Automatic**.

## Keep the default branch current

Turn on **Automatically pull** in a project's settings to keep its default-branch checkout current.
Pulse Code checks in the background and when the server starts. It uses the branch's configured
upstream and only performs a fast-forward pull when the checkout has no working-tree changes,
untracked files, or local commits.

The pull is skipped if the checkout is on another branch, has no upstream, or contains local work.
Pull failures do not prevent the server from starting.

On mobile, open **Settings** and use **Project automatic pull**. Each switch controls the named environment's checkout. Older servers hide the option until updated. Turn it off to stop automatic pulls.

On mobile, Settings > Project icons offers common icons, colors, emoji, and an automatic reset for each connected project. Icons saved on another device appear in the thread lists, archive, and new-task picker. Mobile uses native equivalents for common icons and a colored folder for other icon names; web and desktop offer the full icon catalog.

## Older project scripts

Scripts saved with older identifiers remain available to run, edit, or delete. If an identifier cannot support a keyboard shortcut, the script menu omits its shortcut. Newly added scripts use identifiers compatible with shortcuts.
