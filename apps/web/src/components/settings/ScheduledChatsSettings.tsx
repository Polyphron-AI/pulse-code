import { useAtomValue } from "@effect/atom-react";
import {
  ProjectId,
  ScheduleId,
  scheduleIntervalMinutes,
  type EnvironmentId,
  type OrchestrationSchedule,
  type OrchestrationShellSnapshot,
  type ScheduleHandoffGitPolicy,
  type ScheduleIntervalUnit,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import {
  CalendarClockIcon,
  CircleAlertIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { randomUUID } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { orchestrationEnvironment } from "~/state/orchestration";
import { environmentSnapshotAtom } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const EMPTY_SNAPSHOT_ATOM = Atom.make<OrchestrationShellSnapshot | null>(null).pipe(
  Atom.withLabel("scheduled-chats-empty-snapshot"),
);
const EMPTY_PROJECTS: OrchestrationShellSnapshot["projects"] = [];
const EMPTY_SCHEDULES: ReadonlyArray<OrchestrationSchedule> = [];

interface ScheduleDraft {
  readonly allProjects: boolean;
  readonly projectId: ProjectId | null;
  readonly intervalValue: string;
  readonly intervalUnit: ScheduleIntervalUnit;
  readonly preserveLegacyDaily: boolean;
  readonly handoffGitPolicy: ScheduleHandoffGitPolicy;
  readonly time: string;
  readonly timezone: string;
  readonly prompt: string;
  readonly skipIfDirty: boolean;
}

const INTERVAL_DEFAULTS: Readonly<Record<ScheduleIntervalUnit, string>> = {
  minutes: "15",
  hours: "1",
  days: "1",
  weeks: "1",
};

function defaultDraft(projectId: ProjectId | null): ScheduleDraft {
  return {
    allProjects: false,
    projectId,
    intervalValue: INTERVAL_DEFAULTS.days,
    intervalUnit: "days",
    preserveLegacyDaily: false,
    handoffGitPolicy: "ignore",
    time: "09:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    prompt: "",
    skipIfDirty: false,
  };
}

function draftFromSchedule(schedule: OrchestrationSchedule): ScheduleDraft {
  const allProjects = schedule.scope._tag === "environment";
  const projectId =
    schedule.scope._tag === "project"
      ? schedule.scope.projectId
      : schedule.scope.projectIds === "all"
        ? null
        : (schedule.scope.projectIds[0] ?? null);
  return {
    allProjects,
    projectId,
    intervalValue: String(schedule.interval?.value ?? 1),
    intervalUnit: schedule.interval?.unit ?? "days",
    preserveLegacyDaily: schedule.interval == null,
    handoffGitPolicy: schedule.handoffGitPolicy ?? "ignore",
    time: `${String(schedule.hourLocal).padStart(2, "0")}:${String(schedule.minuteLocal).padStart(2, "0")}`,
    timezone: schedule.timezone,
    prompt: schedule.prompt,
    skipIfDirty: schedule.skipIfDirty ?? allProjects,
  };
}

function intervalCompatibility(draft: ScheduleDraft) {
  const value = Number(draft.intervalValue);
  if (!Number.isFinite(value) || value <= 0) {
    return { interval: null, message: "Enter a number greater than zero." };
  }
  const interval = { value, unit: draft.intervalUnit };
  const minutes = scheduleIntervalMinutes(interval);
  if (minutes === null) {
    return {
      interval: null,
      message: "This interval must resolve to a whole number of minutes.",
    };
  }
  return {
    interval,
    message: `Compatible · runs every ${minutes.toLocaleString()} minute${minutes === 1 ? "" : "s"}.`,
  };
}

function intervalDisplay(value: string | number, unit: ScheduleIntervalUnit): string {
  return `${value} ${Number(value) === 1 ? unit.slice(0, -1) : unit}`;
}

function scheduleTimingLabel(schedule: OrchestrationSchedule): string {
  if (schedule.interval != null) {
    return `Every ${intervalDisplay(schedule.interval.value, schedule.interval.unit)}`;
  }
  return `Daily at ${String(schedule.hourLocal).padStart(2, "0")}:${String(schedule.minuteLocal).padStart(2, "0")}`;
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function scopeLabel(
  schedule: OrchestrationSchedule,
  projectTitles: ReadonlyMap<ProjectId, string>,
): string {
  if (schedule.scope._tag === "project") {
    return projectTitles.get(schedule.scope.projectId) ?? "Missing project";
  }
  if (schedule.scope.projectIds === "all") return "All projects";
  const count = schedule.scope.projectIds.length;
  return `${count} selected project${count === 1 ? "" : "s"}`;
}

function statusFor(schedule: OrchestrationSchedule) {
  if (schedule.pausedAt !== null) {
    return schedule.autoPausedReason
      ? { label: "Auto-paused", variant: "warning" as const }
      : { label: "Paused", variant: "secondary" as const };
  }
  if (schedule.projectStates.some((state) => state.lastOccurrenceStatus === "running")) {
    return { label: "Running", variant: "info" as const };
  }
  if (schedule.projectStates.some((state) => state.lastOccurrenceStatus === "failed")) {
    return { label: "Last run failed", variant: "error" as const };
  }
  if (schedule.projectStates.some((state) => state.lastOccurrenceStatus === "skipped")) {
    return { label: "Last run skipped", variant: "warning" as const };
  }
  return { label: "Active", variant: "success" as const };
}

function latestOccurrence(schedule: OrchestrationSchedule) {
  let latest: (typeof schedule.projectStates)[number] | null = null;
  for (const state of schedule.projectStates) {
    if (
      state.lastOccurrenceAt !== null &&
      (latest?.lastOccurrenceAt == null || state.lastOccurrenceAt > latest.lastOccurrenceAt)
    ) {
      latest = state;
    }
  }
  return latest;
}

function ScheduleEditor({
  draft,
  projects,
  editing,
  busy,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  readonly draft: ScheduleDraft;
  readonly projects: OrchestrationShellSnapshot["projects"];
  readonly editing: OrchestrationSchedule | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onChange: (draft: ScheduleDraft) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  const compatibility = intervalCompatibility(draft);
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.025] p-3 sm:p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {editing ? "Edit schedule" : "New schedule"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Each occurrence starts a fresh agent session in a persistent chat.
          </p>
        </div>
        <Badge variant="outline">
          {draft.preserveLegacyDaily
            ? "Daily"
            : `Every ${intervalDisplay(draft.intervalValue, draft.intervalUnit)}`}
        </Badge>
      </div>

      <div className="mb-4 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Repeat every</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            nativeInput
            className="sm:w-28"
            type="number"
            min="0.01"
            step="any"
            inputMode="decimal"
            value={draft.intervalValue}
            aria-label="Schedule interval"
            onChange={(event) =>
              onChange({
                ...draft,
                intervalValue: event.currentTarget.value,
                preserveLegacyDaily: false,
              })
            }
          />
          <div className="grid flex-1 grid-cols-4 gap-1 rounded-lg bg-muted/60 p-1">
            {(["minutes", "hours", "days", "weeks"] as const).map((unit) => (
              <Button
                key={unit}
                type="button"
                size="sm"
                variant={draft.intervalUnit === unit ? "secondary" : "ghost"}
                onClick={() =>
                  onChange({
                    ...draft,
                    intervalUnit: unit,
                    intervalValue: INTERVAL_DEFAULTS[unit],
                    preserveLegacyDaily: false,
                  })
                }
              >
                {unit[0]!.toUpperCase() + unit.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <p
          className={
            compatibility.interval === null
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {draft.preserveLegacyDaily
            ? "Existing daily-at-time schedule remains unchanged until you edit this interval."
            : compatibility.message}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Scope
          <Select
            value={draft.allProjects ? "all" : "project"}
            onValueChange={(value) =>
              onChange({
                ...draft,
                allProjects: value === "all",
                skipIfDirty: value === "all",
              })
            }
          >
            <SelectTrigger aria-label="Schedule scope">
              <SelectValue>{draft.allProjects ? "All projects" : "One project"}</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              <SelectItem value="project">One project</SelectItem>
              <SelectItem value="all">All projects</SelectItem>
            </SelectPopup>
          </Select>
        </label>

        {!draft.allProjects ? (
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Project
            <Select
              value={draft.projectId ?? undefined}
              onValueChange={(value) =>
                onChange({ ...draft, projectId: ProjectId.make(String(value)) })
              }
            >
              <SelectTrigger aria-label="Scheduled project">
                <SelectValue>
                  {projects.find((project) => project.id === draft.projectId)?.title ??
                    "Choose project"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
        ) : null}

        {draft.preserveLegacyDaily ? (
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Local time
            <Input
              nativeInput
              type="time"
              value={draft.time}
              onChange={(event) => onChange({ ...draft, time: event.currentTarget.value })}
            />
          </label>
        ) : null}

        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          Time zone
          <Input
            nativeInput
            value={draft.timezone}
            placeholder="Africa/Johannesburg"
            onChange={(event) => onChange({ ...draft, timezone: event.currentTarget.value })}
          />
        </label>
      </div>

      <label className="mt-4 block space-y-1.5 text-xs font-medium text-muted-foreground">
        Prompt
        <Textarea
          value={draft.prompt}
          placeholder="Review the project, run the relevant checks, and leave a concise handoff."
          onChange={(event) => onChange({ ...draft, prompt: event.currentTarget.value })}
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background/60 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Handoff files</p>
          <p className="text-xs text-muted-foreground">
            Ignore generated docs in Git or commit each successful handoff.
          </p>
        </div>
        <div className="flex rounded-lg bg-muted/60 p-1">
          {(["ignore", "commit"] as const).map((policy) => (
            <Button
              key={policy}
              type="button"
              size="sm"
              variant={draft.handoffGitPolicy === policy ? "secondary" : "ghost"}
              onClick={() => onChange({ ...draft, handoffGitPolicy: policy })}
            >
              {policy === "ignore" ? "Add to .gitignore" : "Commit"}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background/60 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Skip dirty working trees</p>
          <p className="text-xs text-muted-foreground">
            Avoid unattended edits when a project has uncommitted work.
          </p>
        </div>
        <Switch
          checked={draft.skipIfDirty}
          onCheckedChange={(checked) => onChange({ ...draft, skipIfDirty: checked })}
          aria-label="Skip dirty working trees"
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Uses each project&apos;s default model. Handoffs go to{" "}
        <code className="rounded bg-muted px-1 py-0.5">handoff/{"{date}"}.md</code>.
      </p>

      {error ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
          <CircleAlertIcon className="size-3.5" />
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy || projects.length === 0}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create schedule"}
        </Button>
      </div>
    </div>
  );
}

export function ScheduledChatsSettingsPanel() {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(
    primaryEnvironmentId,
  );
  const environmentId =
    environments.find((environment) => environment.environmentId === selectedEnvironmentId)
      ?.environmentId ??
    primaryEnvironmentId ??
    environments[0]?.environmentId ??
    null;
  const selectedEnvironment =
    environments.find((environment) => environment.environmentId === environmentId) ?? null;
  const snapshot = useAtomValue(
    environmentId === null ? EMPTY_SNAPSHOT_ATOM : environmentSnapshotAtom(environmentId),
  );

  const createSchedule = useAtomCommand(orchestrationEnvironment.createSchedule);
  const updateSchedule = useAtomCommand(orchestrationEnvironment.updateSchedule);
  const pauseSchedule = useAtomCommand(orchestrationEnvironment.pauseSchedule);
  const resumeSchedule = useAtomCommand(orchestrationEnvironment.resumeSchedule);
  const runSchedule = useAtomCommand(orchestrationEnvironment.runSchedule);
  const deleteSchedule = useAtomCommand(orchestrationEnvironment.deleteSchedule);

  const projects = snapshot?.projects ?? EMPTY_PROJECTS;
  const schedules = useMemo(
    () =>
      (snapshot?.schedules ?? EMPTY_SCHEDULES).filter((schedule) => schedule.deletedAt === null),
    [snapshot?.schedules],
  );
  const projectTitles = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title] as const)),
    [projects],
  );

  const [editing, setEditing] = useState<OrchestrationSchedule | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(() => defaultDraft(null));
  const [editorOpen, setEditorOpen] = useState(false);
  const [busyId, setBusyId] = useState<ScheduleId | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.projectId !== null && projects.some((project) => project.id === draft.projectId)) {
      return;
    }
    setDraft((current) => ({ ...current, projectId: projects[0]?.id ?? null }));
  }, [draft.projectId, projects]);

  useEffect(() => {
    setEditorOpen(false);
    setEditing(null);
    setError(null);
  }, [environmentId]);

  const openNew = () => {
    setEditing(null);
    setDraft(defaultDraft(projects[0]?.id ?? null));
    setError(null);
    setEditorOpen(true);
  };

  const openEdit = (schedule: OrchestrationSchedule) => {
    setEditing(schedule);
    setDraft(draftFromSchedule(schedule));
    setError(null);
    setEditorOpen(true);
  };

  const save = async () => {
    if (environmentId === null) return;
    const compatibility = intervalCompatibility(draft);
    if (!draft.preserveLegacyDaily && compatibility.interval === null) {
      setError(compatibility.message);
      return;
    }
    const [hourText, minuteText] = draft.time.split(":");
    const hourLocal = Number(hourText);
    const minuteLocal = Number(minuteText);
    if (
      !Number.isInteger(hourLocal) ||
      hourLocal < 0 ||
      hourLocal > 23 ||
      !Number.isInteger(minuteLocal) ||
      minuteLocal < 0 ||
      minuteLocal > 59
    ) {
      setError("Choose a valid local time.");
      return;
    }
    const timezone = draft.timezone.trim();
    if (!validTimezone(timezone)) {
      setError("Enter a valid IANA time zone, such as Africa/Johannesburg.");
      return;
    }
    const prompt = draft.prompt.trim();
    if (!prompt) {
      setError("Add the prompt the agent should run.");
      return;
    }
    if (!draft.allProjects && draft.projectId === null) {
      setError("Choose a project.");
      return;
    }

    const scope = draft.allProjects
      ? { _tag: "environment" as const, projectIds: "all" as const }
      : { _tag: "project" as const, projectId: draft.projectId! };
    setError(null);
    setBusyId(editing?.id ?? "new");
    const result =
      editing === null
        ? await createSchedule({
            environmentId,
            input: {
              scheduleId: ScheduleId.make(randomUUID()),
              scope,
              hourLocal,
              minuteLocal,
              interval: compatibility.interval!,
              handoffGitPolicy: draft.handoffGitPolicy,
              timezone,
              prompt,
              skipIfDirty: draft.skipIfDirty,
            },
          })
        : await updateSchedule({
            environmentId,
            input: {
              scheduleId: editing.id,
              scope,
              hourLocal,
              minuteLocal,
              ...(draft.preserveLegacyDaily ? {} : { interval: compatibility.interval! }),
              handoffGitPolicy: draft.handoffGitPolicy,
              timezone,
              prompt,
              skipIfDirty: draft.skipIfDirty,
            },
          });
    setBusyId(null);
    if (result._tag === "Success") {
      setEditorOpen(false);
      setEditing(null);
    }
  };

  const runNow = async (schedule: OrchestrationSchedule) => {
    if (environmentId === null || schedule.pausedAt !== null) return;
    setBusyId(schedule.id);
    await runSchedule({ environmentId, input: { scheduleId: schedule.id } });
    setBusyId(null);
  };

  const setPaused = async (schedule: OrchestrationSchedule, paused: boolean) => {
    if (environmentId === null) return;
    setBusyId(schedule.id);
    await (paused ? pauseSchedule : resumeSchedule)({
      environmentId,
      input: { scheduleId: schedule.id },
    });
    setBusyId(null);
  };

  const remove = async (schedule: OrchestrationSchedule) => {
    if (environmentId === null) return;
    const api = readLocalApi();
    if (!api) return;
    const confirmed = await api.dialogs.confirm(
      "Delete this schedule? Its existing chats and handoff files will be kept.",
      { variant: "destructive" },
    );
    if (!confirmed) return;
    setBusyId(schedule.id);
    await deleteSchedule({ environmentId, input: { scheduleId: schedule.id } });
    setBusyId(null);
    if (editing?.id === schedule.id) {
      setEditorOpen(false);
      setEditing(null);
    }
  };

  const supportsSchedules = snapshot?.schedules !== undefined;

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="scheduled-chats"
        title="Scheduled chats"
        icon={<CalendarClockIcon className="size-5 text-muted-foreground" />}
        headerAction={
          supportsSchedules && !editorOpen ? (
            <Button size="sm" onClick={openNew} disabled={projects.length === 0}>
              <PlusIcon />
              Add schedule
            </Button>
          ) : null
        }
      >
        {environments.length > 1 ? (
          <div className="rounded-xl px-3 py-3 sm:px-4">
            <label className="block max-w-sm space-y-1.5 text-xs font-medium text-muted-foreground">
              Environment
              <Select
                value={environmentId ?? undefined}
                onValueChange={(value) => setSelectedEnvironmentId(value as EnvironmentId)}
              >
                <SelectTrigger aria-label="Scheduled chats environment">
                  <SelectValue>{selectedEnvironment?.label ?? "Choose environment"}</SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  {environments.map((environment) => (
                    <SelectItem key={environment.environmentId} value={environment.environmentId}>
                      {environment.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
          </div>
        ) : null}

        {!isReady || snapshot === null ? (
          <div className="rounded-xl px-3 py-8 text-center text-sm text-muted-foreground sm:px-4">
            {isReady ? "Waiting for the environment snapshot." : "Loading environments."}
          </div>
        ) : !supportsSchedules ? (
          <div className="rounded-xl border border-warning/20 bg-warning/5 px-4 py-4">
            <p className="text-sm font-medium text-foreground">Server update required</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Update this environment&apos;s Pulse Code server, then reconnect.
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl px-3 py-8 text-center sm:px-4">
            <p className="text-sm font-medium text-foreground">Add a project first</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Scheduled chats run against projects in this environment.
            </p>
          </div>
        ) : (
          <>
            {editorOpen ? (
              <ScheduleEditor
                draft={draft}
                projects={projects}
                editing={editing}
                busy={busyId !== null}
                error={error}
                onChange={setDraft}
                onCancel={() => {
                  setEditorOpen(false);
                  setEditing(null);
                  setError(null);
                }}
                onSave={() => void save()}
              />
            ) : null}

            {schedules.length === 0 && !editorOpen ? (
              <button
                type="button"
                className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 py-6 text-left hover:border-primary/30 hover:bg-primary/[0.025]"
                onClick={openNew}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                  <CalendarClockIcon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Schedule the first recurring chat
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Choose projects, an interval, and the prompt to run.
                  </span>
                </span>
              </button>
            ) : (
              <div className="space-y-1">
                {schedules.map((schedule) => {
                  const status = statusFor(schedule);
                  const latest = latestOccurrence(schedule);
                  const skippedRunCount = schedule.projectStates.reduce(
                    (total, state) => total + (state.skippedRunCount ?? 0),
                    0,
                  );
                  const lastSkippedAt = schedule.projectStates
                    .map((state) => state.lastSkippedAt)
                    .filter((value): value is string => value != null)
                    .toSorted()
                    .at(-1);
                  const busy = busyId === schedule.id;
                  const canEdit =
                    schedule.scope._tag === "project" || schedule.scope.projectIds === "all";
                  return (
                    <article
                      key={schedule.id}
                      className="relative overflow-hidden rounded-xl px-3 py-3 sm:px-4"
                    >
                      <span
                        className={
                          schedule.pausedAt !== null
                            ? "absolute inset-y-3 left-0 w-0.5 rounded-full bg-muted-foreground/30"
                            : "absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary/55"
                        }
                      />
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-medium text-foreground">
                              {scopeLabel(schedule, projectTitles)}
                            </h3>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            {scheduleTimingLabel(schedule)} · {schedule.timezone} ·{" "}
                            {schedule.handoffGitPolicy === "commit"
                              ? "handoffs committed"
                              : schedule.handoffGitPolicy === "ignore"
                                ? "handoffs ignored"
                                : "handoffs unmanaged"}
                          </p>
                          <p className="mt-2 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground/85">
                            {schedule.prompt}
                          </p>
                          {schedule.autoPausedReason ? (
                            <p className="mt-2 text-xs text-warning-foreground">
                              {schedule.autoPausedReason}
                            </p>
                          ) : latest?.lastOccurrenceAt ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Last {latest.lastOccurrenceStatus ?? "run"}{" "}
                              {new Date(latest.lastOccurrenceAt).toLocaleString()}
                              {latest.lastOccurrenceFailureReason
                                ? ` · ${latest.lastOccurrenceFailureReason}`
                                : ""}
                              {latest.lastOccurrenceFailureMessage
                                ? ` · ${latest.lastOccurrenceFailureMessage}`
                                : ""}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">No runs yet</p>
                          )}
                          {skippedRunCount > 0 ? (
                            <p className="mt-1 text-xs text-warning-foreground">
                              Skipped {skippedRunCount} run{skippedRunCount === 1 ? "" : "s"}{" "}
                              because the scheduled thread was already running
                              {lastSkippedAt
                                ? ` · latest ${new Date(lastSkippedAt).toLocaleString()}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label="Run schedule now"
                            disabled={busy || schedule.pausedAt !== null}
                            onClick={() => void runNow(schedule)}
                          >
                            <PlayIcon />
                            Run now
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost-muted"
                            aria-label={
                              schedule.pausedAt === null ? "Pause schedule" : "Resume schedule"
                            }
                            disabled={busy}
                            onClick={() => void setPaused(schedule, schedule.pausedAt === null)}
                          >
                            {schedule.pausedAt === null ? <PauseIcon /> : <PlayIcon />}
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost-muted"
                            aria-label="Edit schedule"
                            disabled={busy || !canEdit}
                            onClick={() => openEdit(schedule)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost-muted"
                            className="hover:text-destructive"
                            aria-label="Delete schedule"
                            disabled={busy}
                            onClick={() => void remove(schedule)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
