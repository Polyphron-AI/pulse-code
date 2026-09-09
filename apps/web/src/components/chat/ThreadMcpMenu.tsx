import { useState } from "react";
import { ChevronDownIcon, PlugIcon } from "lucide-react";
import {
  isMcpEnabled,
  supportsThreadMcp,
  type EnvironmentId,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Popover, PopoverPopup, PopoverTrigger, PopoverTitle } from "../ui/popover";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { McpSettingsPanel } from "../settings/McpSettingsPanel";

export function ThreadMcpMenu({
  environmentId,
  threadId,
  instanceId,
  driver,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  instanceId: ProviderInstanceId;
  driver: string;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const persist = useAtomCommand(serverEnvironment.updateSettings);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const supported = supportsThreadMcp(driver);
  const overrides = threadId ? (settings.threadMcpOverrides[threadId] ?? {}) : {};
  const entries = Object.entries(settings.mcpServers);
  const count = entries.filter(([id, server]) =>
    isMcpEnabled(server, instanceId, overrides[id]),
  ).length;
  const search = query.trim().toLocaleLowerCase();
  const visibleEntries = entries
    .filter(([id, server]) => `${server.name} ${id}`.toLocaleLowerCase().includes(search))
    .sort(
      ([leftId, left], [rightId, right]) =>
        Number(supported && isMcpEnabled(right, instanceId, overrides[rightId])) -
          Number(supported && isMcpEnabled(left, instanceId, overrides[leftId])) ||
        left.name.localeCompare(right.name) ||
        leftId.localeCompare(rightId),
    );
  const update = async (patch: Record<string, boolean | null>) => {
    if (!threadId) return;
    setSaving(true);
    setMessage(null);
    setFailed(false);
    try {
      const result = await persist({
        environmentId,
        input: { patch: { threadMcpOverrides: { [threadId]: patch } } },
      });
      const failure = result._tag === "Failure";
      setFailed(failure);
      setMessage(
        failure
          ? "Could not save. Check your connection and try again."
          : "Saved. Applies before the next turn.",
      );
    } catch {
      setFailed(true);
      setMessage("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 px-2"
              aria-label="Thread MCP connections"
            />
          }
        >
          <PlugIcon className="size-3.5" />
          <span>MCP{supported && count ? ` ${count}` : ""}</span>
          <ChevronDownIcon className="size-3" />
        </PopoverTrigger>
        <PopoverPopup
          initialFocus={false}
          side="top"
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)]"
          viewportClassName="flex min-h-0 flex-col"
        >
          <PopoverTitle className="text-sm">Thread MCPs</PopoverTitle>
          <p className="mt-2 text-xs text-muted-foreground">
            {!supported
              ? "This provider does not support thread MCP selection yet. Use Codex, Claude, Cursor or Grok."
              : !threadId
                ? "Start a thread to choose its MCP connections. Provider defaults apply to the first turn."
                : "Enabled connections appear first. Changes apply before your next turn."}
          </p>
          <Input
            type="search"
            aria-label="Search MCPs"
            placeholder="Search MCPs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-3 shrink-0"
          />
          <div
            className="my-3 min-h-0 max-h-48 shrink overflow-y-auto overscroll-contain sm:max-h-64"
            role="region"
            aria-label="MCPs"
            tabIndex={0}
          >
            {visibleEntries.map(([id, server]) => (
              <label
                key={id}
                className="flex min-h-16 items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate">{server.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {typeof overrides[id] === "boolean"
                      ? "Thread override"
                      : server.defaultProviders.includes(instanceId)
                        ? "Always available"
                        : "Off by default"}
                  </span>
                </span>
                <Switch
                  disabled={!supported || !threadId || saving}
                  checked={supported && isMcpEnabled(server, instanceId, overrides[id])}
                  onCheckedChange={(checked) => void update({ [id]: checked })}
                />
              </label>
            ))}
            {entries.length > 0 && !visibleEntries.length && (
              <p role="status" className="py-3 text-sm text-muted-foreground">
                No MCPs match your search.
              </p>
            )}
            {!entries.length && (
              <p className="text-sm text-muted-foreground">Add an MCP connection to get started.</p>
            )}
          </div>
          {message && (
            <p
              role={failed ? "alert" : "status"}
              className={
                failed ? "mb-2 text-xs text-destructive" : "mb-2 text-xs text-muted-foreground"
              }
            >
              {message}
            </p>
          )}
          <div className="flex shrink-0 justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={
                !threadId ||
                saving ||
                !Object.values(overrides).some((value) => typeof value === "boolean")
              }
              onClick={() =>
                void update(Object.fromEntries(Object.keys(overrides).map((id) => [id, null])))
              }
            >
              Use defaults
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setManage(true);
              }}
            >
              Manage MCPs
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
      <Dialog open={manage} onOpenChange={setManage}>
        <DialogPopup className="max-w-xl">
          <DialogTitle>Manage MCPs</DialogTitle>
          <DialogDescription>
            Connections for this environment, shared across threads.
          </DialogDescription>
          <div className="py-4">
            <McpSettingsPanel environmentId={environmentId} />
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
