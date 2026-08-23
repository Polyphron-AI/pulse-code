# Opening linked files on mobile

When a chat message links to a file in the current project, tap the link and
choose how to open it:

- **Preview in Pulse Code** opens the file in the built-in project file viewer.
- **Open with…** securely downloads a temporary copy from your connected Pulse
  Code environment and shows the apps available on your phone or tablet.

When an agent names a file without its folder — "HostPowerMonitor.ts:69" —
Pulse Code searches the project for that name before opening anything. A single
match opens straight away. If several files share the name, or the project has
none, Pulse Code says so instead of opening a viewer on a file that isn't there.

Open with works for local and remote environments while they are connected. The
temporary copy is stored in the app cache and may be removed automatically by the
operating system. If the file or environment is unavailable, Pulse Code keeps the
chat open and shows an error.
