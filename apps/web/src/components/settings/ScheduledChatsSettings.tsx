/**
 * Settings → Scheduled Chats: the single editor for scheduled chats, both the
 * project-scoped daily check-in and the environment-wide sweep. Project
 * settings only links here, so there is one place a schedule can be created,
 * paused, or deleted.
 *
 * @module ScheduledChatsSettings
 */
import { useAtomValue } from "@effect/atom-react";
import {
  compareSchedulesForDisplay,
  formatScheduleLocalTime,
  formatScheduleTimeZoneLabel,
  nextScheduleRunAtMs,
  resolveViewerTimeZone,
  scheduleRowStatus,
  scheduleRunSummary,
  supportedTimeZones,
  type ScheduleRowStatus,
} from "@t3tools/client-runtime/state/schedules";
import {
  SCHEDULE_LIMIT_MINUTES_MAX,
  SCHEDULE_LIMIT_MINUTES_MIN,
  scheduleSkipIfDirty,
  type EnvironmentId,
  type OrchestrationSchedule,
  type ProjectId,
  type ProviderInstanceId,
  type ScheduleId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useNavigate } from "@tanstack/react-router";
import {
  AlarmClockIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useProjects, useServerConfigs } from "../../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { environmentSchedules, scheduleEnvironment } from "../../state/schedules";
import { useAtomCommand } from "../../state/use-atom-command";
import { usePrimarySettings } from "../../hooks/useSettings";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { NumberField, NumberFieldGroup, NumberFieldInput } from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useRelativeTimeTick,
} from "./settingsLayout";
import {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_STATUS_LABELS,
  describeAutoPause,
  describeScheduleRuns,
  describeScheduleTarget,
  emptyScheduleForm,
  scheduleCreatePayload,
  scheduleDisplayTitle,
  scheduleFormFromSchedule,
  scheduleFormIssue,
  scheduleUpdateHasChanges,
  scheduleUpdatePayload,
  type ScheduleFormState,
} from "./ScheduledChatsSettings.logic";
import { searchableSetting } from "./settingsSearch";

/** Rows re-render on this cadence so "next in 40m" does not go stale on screen. */
const RELATIVE_TICK_MS = 30_000;
/** Time-zone list is long; the picker shows this many matches for a query. */
const TIME_ZONE_RESULT_LIMIT = 60;
const TIME_PRESETS = [6, 7, 8, 9] as const;

const STATUS_BADGE_VARIANT: Readonly<
  Record<ScheduleRowStatus, "success" | "error" | "outline" | "secondary">
> = {
  paused: "secondary",
  running: "outline",
  failed: "error",
  completed: "success",
  "never-run": "outline",
};

function ScheduleStatusBadge({ status }: { readonly status: ScheduleRowStatus }) {
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]}>
      {status === "running" ? <LoaderCircleIcon className="animate-spin" /> : null}
      {status === "failed" ? <CircleAlertIcon /> : null}
      {status === "paused" ? <PauseIcon /> : null}
      {SCHEDULE_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Searchable IANA zone picker. The full list is hundreds of entries, so only
 * the matches for the current query are rendered — a schedule's zone is picked
 * once and never scrolled through.
 */
function TimeZonePicker({
  value,
  nowMs,
  onChange,
}: {
  readonly value: string;
  readonly nowMs: number;
  readonly onChange: (timeZone: string) => void;
}) {
  const [query, setQuery] = useState("");
  const zones = useMemo(supportedTimeZones, []);
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches =
      needle.length === 0
        ? zones
        : zones.filter((zone) => zone.toLowerCase().includes(needle.replaceAll(" ", "_")));
    return matches.slice(0, TIME_ZONE_RESULT_LIMIT);
  }, [query, zones]);

  return (
    <Combobox
      items={items}
      filteredItems={items}
      value={value}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      onValueChange={(next) => {
        if (typeof next === "string" && next.length > 0) onChange(next);
      }}
    >
      <ComboboxTrigger
        aria-label="Time zone"
        className="inline-flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-[calc(--spacing(3)-1px)] text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 sm:min-h-8 dark:bg-input/32"
      >
        <span className="min-w-0 truncate">{value}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
          {formatScheduleTimeZoneLabel(value, nowMs)}
          <ChevronDownIcon className="size-3 opacity-50" />
        </span>
      </ComboboxTrigger>
      <ComboboxPopup align="start" className="w-80">
        <div className="shrink-0 px-3 pt-2.5">
          <div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55"
            />
            <ComboboxInput
              className="[&_input]:h-6.5 [&_input]:ps-5 [&_input]:font-sans [&_input]:leading-6.5"
              inputClassName="rounded-none bg-transparent text-sm"
              placeholder="Search time zones…"
              showTrigger={false}
              size="sm"
              unstyled
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <ComboboxEmpty>No matching time zones.</ComboboxEmpty>
        <ComboboxList className="max-h-64">
          {items.map((zone) => (
            <ComboboxItem key={zone} value={zone}>
              <span className="min-w-0 truncate">{zone}</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  readonly children: string;
  readonly htmlFor?: string;
}) {
  return (
    <label className="font-medium text-muted-foreground text-xs" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

interface EditorProject {
  readonly id: ProjectId;
  readonly title: string;
}

function ScheduleEditorDialog({
  open,
  environmentId,
  original,
  projects,
  nowMs,
  onOpenChange,
  onSubmit,
}: {
  readonly open: boolean;
  readonly environmentId: EnvironmentId;
  /** null for a new schedule. */
  readonly original: OrchestrationSchedule | null;
  readonly projects: ReadonlyArray<EditorProject>;
  readonly nowMs: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (form: ScheduleFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<ScheduleFormState>(() =>
    original
      ? scheduleFormFromSchedule(original)
      : emptyScheduleForm({
          timezone: resolveViewerTimeZone(),
          projectId: projects[0]?.id ?? null,
        }),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const serverConfigs = useServerConfigs();
  const settings = usePrimarySettings();
  const serverProviders = serverConfigs.get(environmentId)?.providers ?? [];
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(serverProviders), settings),
      ),
    [serverProviders, settings],
  );
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, serverProviders),
    [serverProviders, settings],
  );
  const resolvedSelection = resolveDefaultProviderModelSelection(
    serverProviders,
    form.modelSelection,
  );
  const issue = scheduleFormIssue(form);
  const patch = original === null ? null : scheduleUpdatePayload(original, form);
  const unchanged = patch !== null && !scheduleUpdateHasChanges(patch);
  const nextRunAtMs = nextScheduleRunAtMs({ ...form, pausedAt: null }, nowMs);
  const update = useCallback(
    (partial: Partial<ScheduleFormState>) => setForm((current) => ({ ...current, ...partial })),
    [],
  );

  const submit = async () => {
    if (issue !== null || saving) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  const environmentTargets = form.environmentTargets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {original === null ? "New scheduled chat" : "Edit scheduled chat"}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="space-y-1.5">
            <FieldLabel>Runs in</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={form.scopeKind}
                onValueChange={(next) => {
                  if (next === "project" || next === "environment") update({ scopeKind: next });
                }}
              >
                <SelectTrigger aria-label="Schedule scope" className="w-44">
                  <SelectValue>
                    {form.scopeKind === "project" ? "One project" : "This environment"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="project">One project</SelectItem>
                  <SelectItem value="environment">This environment</SelectItem>
                </SelectPopup>
              </Select>
              {form.scopeKind === "project" ? (
                <Select
                  value={form.projectId ?? ""}
                  onValueChange={(next) => {
                    if (typeof next === "string" && next.length > 0) {
                      update({ projectId: next as ProjectId });
                    }
                  }}
                >
                  <SelectTrigger aria-label="Project" className="min-w-52">
                    <SelectValue>
                      {projects.find((project) => project.id === form.projectId)?.title ??
                        "Pick a project"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              ) : (
                <Select
                  value={environmentTargets === "all" ? "all" : "some"}
                  onValueChange={(next) => {
                    if (next === "all") update({ environmentTargets: "all" });
                    if (next === "some") {
                      update({
                        environmentTargets:
                          environmentTargets === "all" ? [] : [...environmentTargets],
                      });
                    }
                  }}
                >
                  <SelectTrigger aria-label="Target projects" className="min-w-52">
                    <SelectValue>
                      {environmentTargets === "all" ? "Every project" : "Selected projects"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="all">Every project</SelectItem>
                    <SelectItem value="some">Selected projects</SelectItem>
                  </SelectPopup>
                </Select>
              )}
            </div>
            {form.scopeKind === "environment" && environmentTargets !== "all" ? (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {projects.map((project) => {
                  const selected = environmentTargets.includes(project.id);
                  return (
                    <Button
                      key={project.id}
                      size="xs"
                      type="button"
                      variant={selected ? "secondary" : "outline"}
                      onClick={() =>
                        update({
                          environmentTargets: selected
                            ? environmentTargets.filter((id) => id !== project.id)
                            : [...environmentTargets, project.id],
                        })
                      }
                    >
                      {selected ? <CheckIcon /> : null}
                      {project.title}
                    </Button>
                  );
                })}
              </div>
            ) : null}
            {form.scopeKind === "environment" ? (
              <p className="text-muted-foreground text-xs">
                One turn per targeted project, each in its own thread.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Every day at</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {TIME_PRESETS.map((hour) => (
                <Button
                  key={hour}
                  size="xs"
                  type="button"
                  variant={
                    form.hourLocal === hour && form.minuteLocal === 0 ? "secondary" : "outline"
                  }
                  onClick={() => update({ hourLocal: hour, minuteLocal: 0 })}
                >
                  {formatScheduleLocalTime({ hourLocal: hour, minuteLocal: 0 })}
                </Button>
              ))}
              <div className="flex items-center gap-1">
                <NumberField
                  aria-label="Hour"
                  min={0}
                  max={23}
                  value={form.hourLocal}
                  onValueChange={(next) => update({ hourLocal: next ?? 0 })}
                >
                  <NumberFieldGroup>
                    <NumberFieldInput className="w-14" />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-muted-foreground">:</span>
                <NumberField
                  aria-label="Minute"
                  min={0}
                  max={59}
                  value={form.minuteLocal}
                  onValueChange={(next) => update({ minuteLocal: next ?? 0 })}
                >
                  <NumberFieldGroup>
                    <NumberFieldInput className="w-14" />
                  </NumberFieldGroup>
                </NumberField>
              </div>
            </div>
            <TimeZonePicker
              value={form.timezone}
              nowMs={nowMs}
              onChange={(timezone) => update({ timezone })}
            />
            <p className="text-muted-foreground text-xs">
              {nextRunAtMs === null
                ? "Pulse Code cannot read that time zone here, so the next run cannot be previewed."
                : `Next run would be ${new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(nextRunAtMs)} your time.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="schedule-prompt">Prompt</FieldLabel>
            <Textarea
              id="schedule-prompt"
              className="min-h-28"
              maxLength={SCHEDULE_PROMPT_MAX_LENGTH}
              placeholder="Read yesterday's handoff, check CI and open PRs, then write today's handoff."
              value={form.prompt}
              onChange={(event) => update({ prompt: event.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Sent as one turn each day. The previous day's handoff file is included automatically.
            </p>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Model</FieldLabel>
            {resolvedSelection ? (
              <div className="flex flex-wrap items-center gap-2">
                <ProviderModelPicker
                  activeInstanceId={resolvedSelection.instanceId}
                  model={resolvedSelection.model}
                  lockedProvider={null}
                  instanceEntries={instanceEntries}
                  modelOptionsByInstance={modelOptionsByInstance}
                  triggerVariant="outline"
                  triggerClassName="min-w-0 max-w-none shrink-0"
                  onInstanceModelChange={(instanceId: ProviderInstanceId, model: string) =>
                    update({ modelSelection: createModelSelection(instanceId, model) })
                  }
                />
                {form.modelSelection === null ? (
                  <span className="text-muted-foreground text-xs">Project default</span>
                ) : (
                  <Button
                    size="xs"
                    type="button"
                    variant="ghost-muted"
                    onClick={() => update({ modelSelection: null })}
                  >
                    Use the project default
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No providers available here.</p>
            )}
          </div>

          <div>
            <Button
              size="xs"
              type="button"
              variant="ghost-muted"
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <ChevronDownIcon
                className={cn("transition-transform", advancedOpen && "rotate-180")}
              />
              Advanced
            </Button>
            {advancedOpen ? (
              <div className="mt-3 space-y-4 border-t border-border/50 pt-3">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="schedule-handoff">Handoff file</FieldLabel>
                  <Input
                    id="schedule-handoff"
                    value={form.handoffPathTemplate}
                    onChange={(event) => update({ handoffPathTemplate: event.target.value })}
                  />
                  <p className="text-muted-foreground text-xs">
                    Relative to the project. <code>{"{date}"}</code> becomes the local date, so each
                    day gets its own file.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1.5">
                    <FieldLabel>Run limit (minutes)</FieldLabel>
                    <NumberField
                      aria-label="Run limit in minutes"
                      min={SCHEDULE_LIMIT_MINUTES_MIN}
                      max={SCHEDULE_LIMIT_MINUTES_MAX}
                      value={form.maxRunMinutes}
                      onValueChange={(next) =>
                        update({ maxRunMinutes: next ?? SCHEDULE_LIMIT_MINUTES_MIN })
                      }
                    >
                      <NumberFieldGroup>
                        <NumberFieldInput className="w-20" />
                      </NumberFieldGroup>
                    </NumberField>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Turn limit (minutes)</FieldLabel>
                    <NumberField
                      aria-label="Turn limit in minutes"
                      min={SCHEDULE_LIMIT_MINUTES_MIN}
                      max={SCHEDULE_LIMIT_MINUTES_MAX}
                      value={form.maxTurnMinutes}
                      onValueChange={(next) =>
                        update({ maxTurnMinutes: next ?? SCHEDULE_LIMIT_MINUTES_MIN })
                      }
                    >
                      <NumberFieldGroup>
                        <NumberFieldInput className="w-20" />
                      </NumberFieldGroup>
                    </NumberField>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm">Skip when the working tree is dirty</p>
                    <p className="text-muted-foreground text-xs">
                      {form.skipIfDirty === null
                        ? `Following the scope default (${
                            scheduleSkipIfDirty({
                              scope:
                                form.scopeKind === "project"
                                  ? {
                                      _tag: "project",
                                      projectId: (form.projectId ?? "") as ProjectId,
                                    }
                                  : { _tag: "environment", projectIds: environmentTargets },
                              skipIfDirty: null,
                            })
                              ? "on"
                              : "off"
                          }).`
                        : "Set explicitly for this schedule."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      aria-label="Skip when the working tree is dirty"
                      checked={
                        form.skipIfDirty ??
                        scheduleSkipIfDirty({
                          scope:
                            form.scopeKind === "project"
                              ? { _tag: "project", projectId: (form.projectId ?? "") as ProjectId }
                              : { _tag: "environment", projectIds: environmentTargets },
                          skipIfDirty: null,
                        })
                      }
                      onCheckedChange={(checked) => update({ skipIfDirty: checked })}
                    />
                    {form.skipIfDirty === null ? null : (
                      <Button
                        size="xs"
                        type="button"
                        variant="ghost-muted"
                        onClick={() => update({ skipIfDirty: null })}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter className="items-center justify-between gap-3">
          <span className="min-w-0 text-muted-foreground text-xs">{issue ?? ""}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={issue !== null || saving || unchanged}
              onClick={() => void submit()}
            >
              {saving ? <LoaderCircleIcon className="animate-spin" /> : null}
              {original === null ? "Create" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ScheduleRow({
  schedule,
  environmentId,
  projectTitleById,
  nowMs,
  onEdit,
}: {
  readonly schedule: OrchestrationSchedule;
  readonly environmentId: EnvironmentId;
  readonly projectTitleById: ReadonlyMap<ProjectId, string>;
  readonly nowMs: number;
  readonly onEdit: () => void;
}) {
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pauseSchedule = useAtomCommand(scheduleEnvironment.pause, { reportFailure: false });
  const resumeSchedule = useAtomCommand(scheduleEnvironment.resume, { reportFailure: false });
  const deleteSchedule = useAtomCommand(scheduleEnvironment.delete, { reportFailure: false });

  const summary = scheduleRunSummary(schedule);
  const status = scheduleRowStatus(schedule, summary);
  const nextRunAtMs = nextScheduleRunAtMs(schedule, nowMs);
  const autoPause = describeAutoPause(schedule);
  const threads = schedule.projectStates.filter((state) => state.threadId !== null);
  const singleThreadId = threads.length === 1 ? threads[0]?.threadId : null;

  const run = async (
    action: "pause" | "resume" | "delete",
    failureTitle: string,
  ): Promise<void> => {
    if (pending) return;
    setPending(true);
    const input = { scheduleId: schedule.id };
    const result =
      action === "pause"
        ? await pauseSchedule({ environmentId, input })
        : action === "resume"
          ? await resumeSchedule({ environmentId, input })
          : await deleteSchedule({ environmentId, input });
    setPending(false);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: failureTitle });
    }
  };

  return (
    <SettingsRow
      id={`schedule-${schedule.id}`}
      title={scheduleDisplayTitle(schedule)}
      description={
        <span className="block space-y-0.5">
          <span className="block">
            {`Every day at ${formatScheduleLocalTime(schedule)} ${formatScheduleTimeZoneLabel(
              schedule.timezone,
              nowMs,
            )} · ${describeScheduleTarget(schedule, projectTitleById)}`}
          </span>
          <span className="block">{describeScheduleRuns({ summary, nextRunAtMs, nowMs })}</span>
          {autoPause ? <span className="block text-destructive">{autoPause}</span> : null}
        </span>
      }
      status={<ScheduleStatusBadge status={status} />}
      control={
        <div className="flex shrink-0 items-center gap-1">
          {singleThreadId ? (
            <Button
              size="icon-sm"
              variant="ghost-muted"
              aria-label="Open this schedule's chat"
              onClick={() =>
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: { environmentId, threadId: singleThreadId },
                })
              }
            >
              <MessageSquareIcon />
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label={schedule.pausedAt === null ? "Pause this schedule" : "Resume this schedule"}
            disabled={pending}
            onClick={() =>
              void run(
                schedule.pausedAt === null ? "pause" : "resume",
                schedule.pausedAt === null
                  ? "Failed to pause the schedule"
                  : "Failed to resume the schedule",
              )
            }
          >
            {schedule.pausedAt === null ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label="Edit this schedule"
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label="Delete this schedule"
            disabled={pending}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this scheduled chat?</AlertDialogTitle>
                <AlertDialogDescription>
                  It stops running from now on. The threads it already created stay where they are.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="ghost">Cancel</Button>} />
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    setDeleteOpen(false);
                    void run("delete", "Failed to delete the schedule");
                  }}
                >
                  Delete
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        </div>
      }
    />
  );
}

type EditorState =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly scheduleId: ScheduleId | null };

function ScheduledChatsSection({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const nowMs = useRelativeTimeTick(RELATIVE_TICK_MS);
  const schedules = useAtomValue(environmentSchedules.environmentSchedulesAtom(environmentId));
  const projects = useProjects();
  const [editor, setEditor] = useState<EditorState>({ kind: "closed" });
  const createSchedule = useAtomCommand(scheduleEnvironment.create, { reportFailure: false });
  const updateSchedule = useAtomCommand(scheduleEnvironment.update, { reportFailure: false });

  const environmentProjects = useMemo(
    () =>
      projects
        .filter((project) => project.environmentId === environmentId)
        .map((project) => ({ id: project.id, title: project.title })),
    [environmentId, projects],
  );
  const projectTitleById = useMemo(
    () => new Map(environmentProjects.map((project) => [project.id, project.title] as const)),
    [environmentProjects],
  );
  const visible = useMemo(
    () =>
      schedules
        .filter((schedule) => schedule.deletedAt === null)
        .toSorted(compareSchedulesForDisplay),
    [schedules],
  );
  const editing =
    editor.kind === "open" && editor.scheduleId !== null
      ? (visible.find((schedule) => schedule.id === editor.scheduleId) ?? null)
      : null;

  const submit = async (form: ScheduleFormState) => {
    if (editor.kind !== "open") return;
    if (editing === null) {
      const result = await createSchedule({ environmentId, input: scheduleCreatePayload(form) });
      if (result._tag === "Failure") {
        toastManager.add({ type: "error", title: "Failed to create the schedule" });
        return;
      }
    } else {
      const patch = scheduleUpdatePayload(editing, form);
      if (scheduleUpdateHasChanges(patch)) {
        const result = await updateSchedule({
          environmentId,
          input: { scheduleId: editing.id, ...patch },
        });
        if (result._tag === "Failure") {
          toastManager.add({ type: "error", title: "Failed to save the schedule" });
          return;
        }
      }
    }
    setEditor({ kind: "closed" });
  };

  return (
    <SettingsSection
      id="scheduled-chats"
      title="Scheduled chats"
      icon={<AlarmClockIcon className="size-4.5 text-sky-500" />}
      headerAction={
        <Button
          size="sm"
          variant="outline"
          disabled={environmentProjects.length === 0}
          onClick={() => setEditor({ kind: "open", scheduleId: null })}
        >
          <PlusIcon />
          New
        </Button>
      }
    >
      <SettingsRow
        {...searchableSetting("scheduled-chats")}
        description="A scheduled chat sends one prompt a day to its own thread, and hands the day's notes to tomorrow through a handoff file. Runs happen while this Pulse Code server is running; a run missed while it was off fires the next time it starts."
      />
      {visible.length === 0 ? (
        <Empty className="rounded-xl border border-border/60 border-dashed py-8">
          <EmptyMedia variant="icon">
            <AlarmClockIcon />
          </EmptyMedia>
          <EmptyTitle>No scheduled chats yet</EmptyTitle>
          <EmptyDescription>
            {environmentProjects.length === 0
              ? "Add a project to this environment first."
              : "Pick a project, a time, and the prompt it should send every day."}
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="divide-y divide-border/50">
          {visible.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              environmentId={environmentId}
              projectTitleById={projectTitleById}
              nowMs={nowMs}
              onEdit={() => setEditor({ kind: "open", scheduleId: schedule.id })}
            />
          ))}
        </div>
      )}
      {editor.kind === "open" ? (
        <ScheduleEditorDialog
          // Remounting per target keeps the form state owned by the dialog
          // instead of needing a reset effect on every open.
          key={editor.scheduleId ?? "new"}
          open
          environmentId={environmentId}
          original={editing}
          projects={environmentProjects}
          nowMs={nowMs}
          onOpenChange={(open) => {
            if (!open) setEditor({ kind: "closed" });
          }}
          onSubmit={submit}
        />
      ) : null}
    </SettingsSection>
  );
}

export function ScheduledChatsSettingsPanel() {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environmentId =
    environments.find((environment) => environment.environmentId === selectedEnvironmentId)
      ?.environmentId ??
    environments.find((environment) => environment.environmentId === primaryEnvironmentId)
      ?.environmentId ??
    environments[0]?.environmentId ??
    null;

  return (
    <SettingsPageContainer>
      {environments.length > 1 ? (
        <div className="flex items-center gap-2">
          <FieldLabel>Environment</FieldLabel>
          <Select
            value={environmentId ?? ""}
            onValueChange={(next) => {
              if (typeof next === "string" && next.length > 0) {
                setSelectedEnvironmentId(next as EnvironmentId);
              }
            }}
          >
            <SelectTrigger aria-label="Environment" className="min-w-52">
              <SelectValue>
                {environments.find((environment) => environment.environmentId === environmentId)
                  ?.label ?? "Pick an environment"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {environments.map((environment) => (
                <SelectItem key={environment.environmentId} value={environment.environmentId}>
                  {environment.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      ) : null}
      {environmentId === null ? (
        <Empty className="rounded-xl border border-border/60 border-dashed py-8">
          <EmptyMedia variant="icon">
            <AlarmClockIcon />
          </EmptyMedia>
          <EmptyTitle>No environment connected</EmptyTitle>
          <EmptyDescription>
            Connect an environment to schedule a daily chat in one of its projects.
          </EmptyDescription>
        </Empty>
      ) : (
        <ScheduledChatsSection environmentId={environmentId} />
      )}
    </SettingsPageContainer>
  );
}
