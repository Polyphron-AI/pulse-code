import { useAtomValue } from "@effect/atom-react";
import {
  managerBadgeLabel,
  managerCycleNowLabel,
  managerCycleNowState,
  managerPillAction,
  managerState,
  managerStateLabel,
  type EnvironmentManager,
} from "@t3tools/client-runtime/state/managers";
import {
  DEFAULT_SERVER_SETTINGS,
  type ManagerIntervalMinutes,
  type ManagerMaxChildren,
  type RuntimeMode,
  type ServerProvider,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import { RadarIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { useClientSettings } from "~/hooks/useSettings";
import { useManagerActions } from "~/hooks/useManagers";
import { cn } from "~/lib/utils";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import { serverEnvironment } from "~/state/server";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Link } from "@tanstack/react-router";

import { ArgoMissionEditor } from "./ArgoMissionEditor";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

const EMPTY_PROVIDERS: ReadonlyArray<ServerProvider> = [];

const INTERVAL_OPTIONS: ReadonlyArray<ManagerIntervalMinutes> = [1, 5, 15, 30, 60, 120, 240];
const MAX_CHILDREN_OPTIONS: ReadonlyArray<ManagerMaxChildren> = [2, 4, 8, 16];
const RUNTIME_MODE_OPTIONS: ReadonlyArray<{ value: RuntimeMode; label: string }> = [
  { value: "approval-required", label: "Ask before every change" },
  { value: "auto-accept-edits", label: "Accept edits" },
  { value: "auto", label: "Auto" },
  { value: "full-access", label: "Full access" },
];

export function intervalLabel(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} min`;
  const hours = minutes / 60;
  return `Every ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** The pill is the pause toggle, everywhere Argo is drawn. */
const ManagerStatePill = memo(function ManagerStatePill(props: {
  readonly manager: EnvironmentManager;
  readonly onToggle: () => void;
}) {
  const state = managerState(props.manager);
  return (
    <button
      type="button"
      data-testid="argo-state-pill"
      aria-label={`Argo state: ${managerStateLabel(props.manager)}`}
      disabled={managerPillAction(props.manager) === "open"}
      onClick={props.onToggle}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        state === "watching" && "bg-primary/15 text-primary hover:bg-primary/25",
        state === "paused" && "bg-muted text-muted-foreground hover:text-foreground",
        state === "no-mission" && "bg-transparent text-muted-foreground",
      )}
    >
      {managerStateLabel(props.manager)}
    </button>
  );
});

/**
 * The Argo record header, pinned above the transcript of the Argo's own
 * thread. There is no Argo settings screen: this is the control surface.
 */
export const ArgoThreadHeader = memo(function ArgoThreadHeader(props: {
  readonly manager: EnvironmentManager;
}) {
  const { manager } = props;
  const { togglePause, updateManager, cycleManagerNow } = useManagerActions();
  const clientSettings = useClientSettings();
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(manager.environmentId));
  const providers = serverConfig?.providers ?? EMPTY_PROVIDERS;
  const settings = useMemo<UnifiedSettings>(
    () => ({ ...clientSettings, ...(serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS) }),
    [clientSettings, serverConfig?.settings],
  );
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
      ),
    [providers, settings],
  );
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, providers),
    [providers, settings],
  );
  const modelSelection =
    resolveDefaultProviderModelSelection(providers, manager.childModelSelection) ?? null;

  // Name and mission are free text: they hold local edits and commit on blur
  // so every keystroke does not become a command.
  const [name, setName] = useState(manager.name);
  const [mission, setMission] = useState(manager.mission);
  useEffect(() => setName(manager.name), [manager.name]);
  useEffect(() => setMission(manager.mission), [manager.mission]);

  const commitName = useCallback(() => {
    const next = name.trim();
    if (next.length === 0) {
      setName(manager.name);
      return;
    }
    if (next === manager.name) return;
    void updateManager(manager, { name: next });
  }, [manager, name, updateManager]);

  const commitMission = useCallback(() => {
    if (mission === manager.mission) return;
    void updateManager(manager, { mission });
  }, [manager, mission, updateManager]);

  return (
    <div
      data-testid="argo-thread-header"
      className="shrink-0 border-b border-border/60 bg-background/80 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <RadarIcon className="size-4 shrink-0 text-primary/70" aria-hidden />
        <Input
          aria-label="Argo name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={commitName}
          className="h-7 max-w-64 border-transparent bg-transparent px-1 text-sm font-semibold hover:border-border focus:border-border"
        />
        <ManagerStatePill manager={manager} onToggle={() => void togglePause(manager)} />
        <Button
          type="button"
          size="compact"
          variant="outline"
          data-testid="argo-cycle-now"
          disabled={managerCycleNowState(manager) !== "available"}
          onClick={() => void cycleManagerNow(manager)}
        >
          {managerCycleNowLabel(manager)}
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Interval
          <Select
            value={String(manager.intervalMinutes)}
            onValueChange={(value) =>
              void updateManager(manager, {
                intervalMinutes: Number(value) as ManagerIntervalMinutes,
              })
            }
          >
            <SelectTrigger aria-label="Argo interval">
              <SelectValue>{intervalLabel(manager.intervalMinutes)}</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {INTERVAL_OPTIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {intervalLabel(minutes)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Max children
          <Select
            value={String(manager.maxChildren)}
            onValueChange={(value) =>
              void updateManager(manager, { maxChildren: Number(value) as ManagerMaxChildren })
            }
          >
            <SelectTrigger aria-label="Argo max children">
              <SelectValue>{manager.maxChildren}</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {MAX_CHILDREN_OPTIONS.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Child model
          {modelSelection !== null ? (
            <ProviderModelPicker
              activeInstanceId={modelSelection.instanceId}
              model={modelSelection.model}
              lockedProvider={null}
              instanceEntries={instanceEntries}
              modelOptionsByInstance={modelOptionsByInstance}
              triggerVariant="outline"
              triggerClassName="w-full max-w-none text-foreground/90 hover:text-foreground"
              triggerAriaLabel="Argo child model"
              onInstanceModelChange={(instanceId, model) =>
                void updateManager(manager, {
                  childModelSelection: createModelSelection(instanceId, model),
                })
              }
            />
          ) : (
            <p className="text-xs text-muted-foreground">No provider configured.</p>
          )}
          {manager.childModelSelection !== null ? (
            <Button
              type="button"
              size="compact"
              variant="ghost-muted"
              onClick={() => void updateManager(manager, { childModelSelection: null })}
            >
              Use project default
            </Button>
          ) : null}
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Child permissions
          <Select
            value={manager.childRuntimeMode}
            onValueChange={(value) =>
              void updateManager(manager, { childRuntimeMode: value as RuntimeMode })
            }
          >
            <SelectTrigger aria-label="Argo child permissions">
              <SelectValue>
                {RUNTIME_MODE_OPTIONS.find((option) => option.value === manager.childRuntimeMode)
                  ?.label ?? manager.childRuntimeMode}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {RUNTIME_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </label>
      </div>

      <ArgoMissionEditor
        environmentId={manager.environmentId}
        mission={mission}
        onMissionChange={setMission}
        onCommit={commitMission}
      />
    </div>
  );
});

/** The way back up from a child thread. */
export const ArgoChildBadge = memo(function ArgoChildBadge(props: {
  readonly manager: EnvironmentManager;
}) {
  const { manager } = props;
  const label = managerBadgeLabel(manager);
  if (manager.threadId === null) {
    return (
      <div className="shrink-0 border-b border-border/60 px-4 py-1.5 text-xs text-muted-foreground">
        {label}
      </div>
    );
  }
  return (
    <div className="shrink-0 border-b border-border/60 px-4 py-1.5">
      <Link
        to="/$environmentId/$threadId"
        params={buildThreadRouteParams({
          environmentId: manager.environmentId,
          threadId: manager.threadId,
        })}
        data-testid="argo-child-badge"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
      >
        <RadarIcon className="size-3" aria-hidden />
        {label}
      </Link>
    </div>
  );
});
