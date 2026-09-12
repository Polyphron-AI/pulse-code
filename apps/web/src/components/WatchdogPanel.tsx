/**
 * Watchdog surface. A watchdog supervises one thread under user-written rules,
 * answering pending questions, approving permission gates, or escalating to the
 * user (see docs/internals/glossary.md, Agent roles).
 *
 * The panel is the rules editor only. The on/off state also lives in the thread
 * header and on the sidebar row, so a toggle here is never the only way in or
 * out. It is deliberately dumb: local draft state, save on blur or toggle, no
 * animation.
 */
import { useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentId,
  type ModelSelection,
  type ServerConfig,
  type ServerProvider,
  type ThreadId,
  type ThreadWatchdog,
  type UnifiedSettings,
} from "@t3tools/contracts";
import {
  WATCHDOG_RULES_PLACEHOLDER,
  watchdogInterventionsLabel,
} from "@t3tools/client-runtime/state/watchdog";
import { Atom } from "effect/unstable/reactivity";
import { AlertTriangle, Eye } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createModelSelection } from "@t3tools/shared/model";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import { useClientSettings } from "~/hooks/useSettings";
import { serverEnvironment } from "~/state/server";

import { ProviderModelPicker } from "./chat/ProviderModelPicker";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";

const EMPTY_SERVER_CONFIG_ATOM = Atom.make<ServerConfig | null>(null).pipe(
  Atom.withLabel("watchdog-panel-empty-server-config"),
);
const EMPTY_PROVIDERS: ReadonlyArray<ServerProvider> = [];

export interface WatchdogPanelSaveInput {
  readonly enabled: boolean;
  readonly rules: string;
  readonly modelSelection: ModelSelection | null;
}

export function WatchdogPanel(props: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly watchdog: ThreadWatchdog | null;
  /** Reason from the newest `watchdog.escalated` activity, if any. */
  readonly escalationReason: string | null;
  readonly onSave: (input: WatchdogPanelSaveInput) => void;
  /** Clears the escalation and hands the thread back to the composer. */
  readonly onTakeAction: () => void;
}) {
  const { environmentId, threadId, watchdog, onSave } = props;
  const clientSettings = useClientSettings();
  const serverConfig = useAtomValue(
    environmentId === null
      ? EMPTY_SERVER_CONFIG_ATOM
      : serverEnvironment.configValueAtom(environmentId),
  );
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

  const enabled = watchdog?.enabled === true;
  const modelSelection = watchdog?.modelSelection ?? null;
  const escalated = watchdog?.escalatedAt != null;
  const interventionsLabel = watchdogInterventionsLabel(watchdog?.interventions ?? 0);

  // The rules textarea is a draft: the server value wins whenever the thread
  // changes or the stored rules move under us, otherwise typing would be
  // clobbered by every unrelated thread update.
  const [draftRules, setDraftRules] = useState(watchdog?.rules ?? "");
  const storedRules = watchdog?.rules ?? "";
  const syncedRef = useRef<{ key: string; rules: string }>({ key: "", rules: "" });
  const syncKey = `${environmentId ?? ""}:${threadId ?? ""}`;
  useEffect(() => {
    const synced = syncedRef.current;
    if (synced.key !== syncKey || synced.rules !== storedRules) {
      syncedRef.current = { key: syncKey, rules: storedRules };
      setDraftRules(storedRules);
    }
  }, [storedRules, syncKey]);

  const disabled = environmentId === null || threadId === null;

  const save = (patch: Partial<WatchdogPanelSaveInput>) => {
    if (disabled) return;
    onSave({
      enabled,
      rules: draftRules,
      modelSelection,
      ...patch,
    });
  };

  // Follows the schedule editor: the picker always shows a concrete model, the
  // badge says whether the stored value is a real pick or the default.
  const pickerSelection =
    resolveDefaultProviderModelSelection(providers, modelSelection) ?? modelSelection;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eye aria-hidden className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Watchdog</p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Answers questions and approves tools in this thread under the rules you write, and
            escalates to you when it is unsure.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          aria-label={enabled ? "Watchdog on" : "Watchdog off"}
          onCheckedChange={(checked) => save({ enabled: checked })}
        />
      </div>

      {escalated ? (
        <div className="rounded-lg border border-warning/40 bg-warning/[0.06] p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden className="size-4 text-warning" />
            <p className="text-sm font-medium">Watchdog stuck</p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {props.escalationReason ?? "The watchdog stopped and handed this thread back to you."}
          </p>
          <Button className="mt-2" size="compact" variant="outline" onClick={props.onTakeAction}>
            Take action
          </Button>
        </div>
      ) : null}

      <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
        Rules
        <Textarea
          className="min-h-32 resize-y text-sm"
          value={draftRules}
          disabled={disabled}
          placeholder={WATCHDOG_RULES_PLACEHOLDER}
          onChange={(event) => setDraftRules(event.currentTarget.value)}
          onBlur={() => {
            if (draftRules !== storedRules) save({});
          }}
        />
      </label>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Model</p>
            {modelSelection === null ? <Badge variant="secondary">Default text model</Badge> : null}
          </div>
          {modelSelection !== null ? (
            <Button
              type="button"
              size="compact"
              variant="ghost-muted"
              onClick={() => save({ modelSelection: null })}
            >
              Use default text model
            </Button>
          ) : null}
        </div>
        {pickerSelection !== null ? (
          <ProviderModelPicker
            activeInstanceId={pickerSelection.instanceId}
            model={pickerSelection.model}
            lockedProvider={null}
            instanceEntries={instanceEntries}
            modelOptionsByInstance={modelOptionsByInstance}
            triggerVariant="outline"
            triggerClassName="w-full max-w-none text-foreground/90 hover:text-foreground"
            triggerAriaLabel="Watchdog model"
            disabled={disabled}
            onInstanceModelChange={(instanceId, model) =>
              save({ modelSelection: createModelSelection(instanceId, model) })
            }
          />
        ) : null}
      </div>

      {interventionsLabel ? (
        <p className="text-xs text-muted-foreground">{interventionsLabel}</p>
      ) : null}
    </div>
  );
}
