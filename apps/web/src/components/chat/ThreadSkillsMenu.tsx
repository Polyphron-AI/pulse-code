import { useState } from "react";
import { ChevronDownIcon, BookOpenIcon } from "lucide-react";
import {
  isManagedSkillEnabled,
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
import { ManagedSkillsPanel } from "../settings/ManagedSkillsPanel";

export function ThreadSkillsMenu({
  environmentId,
  threadId,
  instanceId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  instanceId: ProviderInstanceId;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const persist = useAtomCommand(serverEnvironment.updateSettings);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const overrides = threadId ? (settings.threadSkillOverrides[threadId] ?? {}) : {};
  const entries = Object.entries(settings.managedSkills);
  const count = entries.filter(([id, server]) =>
    isManagedSkillEnabled(server, instanceId, overrides[id]),
  ).length;
  const search = query.trim().toLocaleLowerCase();
  const visibleEntries = entries
    .filter(([id, skill]) =>
      `${skill.name} ${id} ${skill.description}`.toLocaleLowerCase().includes(search),
    )
    .sort(
      ([leftId, left], [rightId, right]) =>
        Number(isManagedSkillEnabled(right, instanceId, overrides[rightId])) -
          Number(isManagedSkillEnabled(left, instanceId, overrides[leftId])) ||
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
        input: { patch: { threadSkillOverrides: { [threadId]: patch } } },
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
              aria-label="Thread skills"
            />
          }
        >
          <BookOpenIcon className="size-3.5" />
          <span>Skills{count ? ` ${count}` : ""}</span>
          <ChevronDownIcon className="size-3" />
        </PopoverTrigger>
        <PopoverPopup
          initialFocus={false}
          side="top"
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)]"
          viewportClassName="flex min-h-0 flex-col"
        >
          <PopoverTitle className="text-sm">Thread skills</PopoverTitle>
          <p className="mt-2 text-xs text-muted-foreground">
            {!threadId
              ? "Start a thread to choose its skills. Provider defaults apply to the first turn."
              : "Enabled skills appear first. Changes apply before your next turn."}
          </p>
          <Input
            type="search"
            aria-label="Search skills"
            placeholder="Search skills"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-3 shrink-0"
          />
          <div
            className="my-3 min-h-0 max-h-48 shrink overflow-y-auto overscroll-contain sm:max-h-64"
            role="region"
            aria-label="Skills"
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
                  disabled={!threadId || saving}
                  checked={isManagedSkillEnabled(server, instanceId, overrides[id])}
                  onCheckedChange={(checked) => void update({ [id]: checked })}
                />
              </label>
            ))}
            {entries.length > 0 && visibleEntries.length === 0 && (
              <p role="status" className="py-3 text-sm text-muted-foreground">
                No skills match your search.
              </p>
            )}
            {!entries.length && (
              <p className="text-sm text-muted-foreground">Add a skill to get started.</p>
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
              Manage skills
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
      <Dialog open={manage} onOpenChange={setManage}>
        <DialogPopup className="max-w-xl">
          <DialogTitle>Manage skills</DialogTitle>
          <DialogDescription>
            Skills managed by this environment, shared across threads.
          </DialogDescription>
          <div className="py-4">
            <ManagedSkillsPanel environmentId={environmentId} />
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
