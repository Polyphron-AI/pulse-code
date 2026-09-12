import type { EnvironmentId } from "@t3tools/contracts";
import { mentionKindLabel } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useManagers } from "~/hooks/useManagers";
import { cn } from "~/lib/utils";
import { useProjects, useScheduleCatalog, useThreadShells } from "~/state/entities";

import {
  type MissionMentionOption,
  type MissionMentionQuery,
  buildMissionPreview,
  clampMentionHighlight,
  filterMissionMentionOptions,
  findMissionMentionQuery,
  insertMissionMention,
  missionChipLabel,
  moveMentionHighlight,
} from "./argoMissionMentions.logic";
import { Textarea } from "../ui/textarea";

/**
 * The Argo mission editor: a textarea where `@` opens a record picker and the
 * `@[kind:id]` tokens it inserts are drawn as named chips underneath. The
 * boundary is the environment, matching what the server expands at cycle
 * time.
 *
 * Mobile has no mission editing in the first cut, so this stays web-only.
 */

/** Every record in this environment the mission may name. */
function useMissionMentionOptions(
  environmentId: EnvironmentId,
): ReadonlyArray<MissionMentionOption> {
  const projects = useProjects();
  const threads = useThreadShells();
  const scheduleCatalog = useScheduleCatalog();
  const managers = useManagers();

  return useMemo(() => {
    const projectTitles = new Map(
      projects
        .filter((project) => project.environmentId === environmentId)
        .map((project) => [project.id, project.title]),
    );
    const options: MissionMentionOption[] = [];
    for (const [id, title] of projectTitles) {
      options.push({ kind: "project", id, label: title, detail: null });
    }
    for (const thread of threads) {
      if (thread.environmentId !== environmentId) continue;
      options.push({
        kind: "thread",
        id: thread.id,
        label: thread.title,
        detail: projectTitles.get(thread.projectId) ?? null,
      });
    }
    for (const schedule of scheduleCatalog.schedules) {
      if (schedule.environmentId !== environmentId) continue;
      const firstLine = schedule.prompt.split(/\r?\n/, 1)[0]!.trim();
      options.push({
        kind: "schedule",
        id: schedule.id,
        label: firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine,
        detail: "Schedule",
      });
    }
    for (const manager of managers) {
      if (manager.environmentId !== environmentId) continue;
      options.push({ kind: "manager", id: manager.id, label: manager.name, detail: "Argo" });
    }
    return options;
  }, [environmentId, managers, projects, scheduleCatalog.schedules, threads]);
}

const MissionPreview = memo(function MissionPreview(props: {
  readonly mission: string;
  readonly options: ReadonlyArray<MissionMentionOption>;
}) {
  const parts = useMemo(
    () => buildMissionPreview(props.mission, props.options),
    [props.mission, props.options],
  );
  if (!parts.some((part) => part.type === "chip")) return null;
  return (
    <p
      data-testid="argo-mission-preview"
      className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground"
    >
      {parts.map((part, index) =>
        part.type === "text" ? (
          // eslint-disable-next-line react/no-array-index-key -- parts are positional
          <span key={index}>{part.text}</span>
        ) : (
          <span
            // eslint-disable-next-line react/no-array-index-key -- parts are positional
            key={index}
            aria-label={`${mentionKindLabel(part.kind)} ${part.id}`}
            className={cn(
              "mx-0.5 inline-flex items-center rounded px-1 py-px text-[11px] font-medium",
              part.label === null
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            {missionChipLabel(part)}
          </span>
        ),
      )}
    </p>
  );
});

export const ArgoMissionEditor = memo(function ArgoMissionEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly mission: string;
  readonly onMissionChange: (mission: string) => void;
  readonly onCommit: () => void;
}) {
  const { mission, onCommit, onMissionChange } = props;
  const options = useMissionMentionOptions(props.environmentId);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<MissionMentionQuery | null>(null);
  const [highlight, setHighlight] = useState(0);
  // Set when a pick moves the caret, applied after React repaints the value.
  const pendingCaret = useRef<number | null>(null);

  const matches = useMemo(
    () => (query === null ? [] : filterMissionMentionOptions(options, query.text)),
    [options, query],
  );

  useEffect(() => {
    setHighlight((current) => clampMentionHighlight(current, matches.length));
  }, [matches.length]);

  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    textareaRef.current?.setSelectionRange(caret, caret);
  }, [mission]);

  const syncQuery = useCallback((text: string, caret: number) => {
    setQuery(findMissionMentionQuery(text, caret));
  }, []);

  const pick = useCallback(
    (option: MissionMentionOption) => {
      if (query === null) return;
      const result = insertMissionMention(mission, query, option);
      pendingCaret.current = result.caret;
      setQuery(null);
      onMissionChange(result.mission);
      textareaRef.current?.focus();
    },
    [mission, onMissionChange, query],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (query === null || matches.length === 0) {
        if (event.key === "Escape" && query !== null) setQuery(null);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((current) =>
          moveMentionHighlight(current, matches.length, event.key === "ArrowDown" ? 1 : -1),
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(matches[clampMentionHighlight(highlight, matches.length)]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
      }
    },
    [highlight, matches, pick, query],
  );

  const open = query !== null && matches.length > 0;

  return (
    <div className="mt-3">
      <label className="block space-y-1 text-xs font-medium text-muted-foreground">
        Mission
        <div className="relative">
          <Textarea
            ref={textareaRef}
            aria-label="Argo mission"
            aria-expanded={open}
            aria-haspopup="listbox"
            rows={3}
            placeholder="Describe the standing job. Type @ to name a project, thread, schedule, or Argo. Nothing runs until this has text."
            value={mission}
            onChange={(event) => {
              onMissionChange(event.currentTarget.value);
              syncQuery(event.currentTarget.value, event.currentTarget.selectionStart);
            }}
            onKeyUp={(event) =>
              syncQuery(event.currentTarget.value, event.currentTarget.selectionStart)
            }
            onClick={(event) =>
              syncQuery(event.currentTarget.value, event.currentTarget.selectionStart)
            }
            onKeyDown={onKeyDown}
            onBlur={() => {
              setQuery(null);
              onCommit();
            }}
          />
          {open ? (
            <ul
              role="listbox"
              aria-label="Mention a record"
              data-testid="argo-mission-mention-picker"
              className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full max-w-96 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
            >
              {matches.map((option, index) => (
                <li key={`${option.kind}:${option.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === clampMentionHighlight(highlight, matches.length)}
                    // The textarea must keep focus, so the pick runs on mousedown.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(option);
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    className={cn(
                      "flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs",
                      index === clampMentionHighlight(highlight, matches.length) && "bg-accent",
                    )}
                  >
                    <span className="truncate font-medium text-foreground">{option.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {option.detail ?? mentionKindLabel(option.kind)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </label>
      <MissionPreview mission={mission} options={options} />
    </div>
  );
});
