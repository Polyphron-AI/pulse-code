import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type ProviderDriverKind,
  type PulseSkillRecord,
  type PulseSkillSelection,
} from "@t3tools/contracts";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GithubIcon,
  LayersIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import {
  ComposerControl,
  ComposerControlChevron,
  ComposerControlIcon,
} from "../components/chat/ComposerControl";
import { composerFloatingLayerProps } from "../components/chat/composerEventScope";
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from "../components/ui/menu";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentSessionState } from "../state/session";
import { serverEnvironment } from "../state/server";
import { groupManagedSkills, shortRevision } from "./managedSkills";
import {
  MAX_MANAGED_SKILL_SELECTIONS,
  managedSkillsBlockedReason,
  staleManagedSkillSelections,
  toggleManagedSkillSelection,
} from "./managedSkillPickerLogic";
import { managedSkillsList } from "./managedSkillsState";

export interface ManagedSkillPickerState {
  readonly providerIsCodex: boolean;
  readonly visible: boolean;
  readonly skills: ReadonlyArray<PulseSkillRecord>;
  readonly selected: ReadonlyArray<PulseSkillSelection>;
  readonly blockedReason: string | null;
  readonly loading: boolean;
  readonly error: boolean;
  readonly refresh: () => void;
}

export function useManagedSkillPickerState(input: {
  readonly environmentId: EnvironmentId;
  readonly provider: ProviderDriverKind;
  readonly selected: ReadonlyArray<PulseSkillSelection>;
}): ManagedSkillPickerState {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId: input.environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const capabilityReady = projection?.source === "live";
  const supported =
    capabilityReady && projection.config.pulseCapabilities?.codexManagedSkills === true;
  const session = useEnvironmentSessionState(input.environmentId);
  const sessionFresh = !session.isPending && session.data?.authenticated === true;
  const scopes = sessionFresh && session.data ? session.data.scopes : undefined;
  const canRead = scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate = scopes?.includes(AuthOrchestrationOperateScope) === true;
  const list = useEnvironmentQuery(
    supported && canRead && canOperate
      ? managedSkillsList({ environmentId: input.environmentId, input: {} })
      : null,
  );
  const skills = list.data ?? [];
  const providerIsCodex = input.provider === "codex";
  return {
    providerIsCodex,
    visible: providerIsCodex && supported && canRead && canOperate,
    skills,
    selected: input.selected,
    blockedReason: managedSkillsBlockedReason({
      selected: input.selected,
      providerIsCodex,
      capabilityReady,
      supported,
      canRead,
      canOperate,
      loading: list.isPending && list.data === null,
      error: list.error !== null,
      skills,
    }),
    loading: list.isPending && list.data === null,
    error: list.error !== null,
    refresh: list.refresh,
  };
}

export function ManagedSkillPicker(props: {
  readonly state: ManagedSkillPickerState;
  readonly size?: "sm" | "xs";
  readonly hidden?: boolean;
  readonly onChange: (skills: ReadonlyArray<PulseSkillSelection>) => void;
}) {
  const groups = useMemo(() => groupManagedSkills(props.state.skills), [props.state.skills]);
  const stale = staleManagedSkillSelections(props.state.selected, props.state.skills);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  if (!props.state.visible && props.state.selected.length === 0) return null;
  const size = props.size ?? "sm";
  const selectedCount = props.state.selected.length;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups.flatMap((group) => {
    const skills = group.skills.filter(
      (skill) =>
        normalizedQuery.length === 0 ||
        `${skill.name} ${skill.id} ${skill.description} ${group.label}`
          .toLowerCase()
          .includes(normalizedQuery),
    );
    return skills.length > 0 ? [{ ...group, skills }] : [];
  });
  const toggle = (selection: PulseSkillSelection) =>
    props.onChange(toggleManagedSkillSelection(props.state.selected, selection));
  const toggleGroup = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Menu>
      <MenuTrigger
        disabled={props.hidden}
        render={
          <ComposerControl
            size={size}
            variant="ghost"
            className="shrink-0"
            aria-label={selectedCount ? `Skills, ${selectedCount} selected` : "Skills"}
          />
        }
      >
        <ComposerControlIcon icon={LayersIcon} size={size} />
        <span>{selectedCount ? `Skills ${selectedCount}` : "Skills"}</span>
        <ComposerControlChevron size={size} />
      </MenuTrigger>
      <MenuPopup align="start" className="w-72" {...composerFloatingLayerProps}>
        <label className="mb-1 flex h-8 items-center gap-2 rounded-md bg-muted/55 px-2 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <SearchIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Search skills</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search skills"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {props.state.loading ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Loading skills…</div>
        ) : props.state.error ? (
          <button
            type="button"
            className="w-full rounded-sm px-2 py-2 text-left text-sm text-error-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={props.state.refresh}
          >
            Could not load skills. Try again
          </button>
        ) : groups.length === 0 && stale.length === 0 ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            No managed skills installed.
          </div>
        ) : (
          <>
            {filteredGroups.map((group) => {
              const groupSelected = props.state.selected.filter((selection) =>
                group.skills.some((skill) => skill.id === selection.id),
              ).length;
              const open = normalizedQuery.length > 0 || expanded.has(group.id);
              return (
                <div key={group.id} className="border-t border-border/50 first:border-t-0">
                  <button
                    type="button"
                    className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.id)}
                  >
                    {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    {group.uploaded ? <UploadIcon /> : <GithubIcon />}
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {groupSelected}/{group.skills.length}
                    </span>
                  </button>
                  {open ? (
                    <div className="ml-2 border-l border-border/60 pl-1">
                      {group.skills.map((skill) => {
                        const pinned = props.state.selected.find(
                          (selection) => selection.id === skill.id,
                        );
                        const checked = pinned?.revision === skill.revision;
                        return (
                          <div key={`${skill.id}:${skill.revision}`}>
                            {pinned && !checked ? (
                              <MenuCheckboxItem checked onCheckedChange={() => toggle(pinned)}>
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">{skill.name}</span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    Pinned revision ({shortRevision(pinned.revision)})
                                  </span>
                                </span>
                              </MenuCheckboxItem>
                            ) : null}
                            <MenuCheckboxItem
                              checked={checked}
                              disabled={
                                !props.state.visible ||
                                (!pinned && selectedCount >= MAX_MANAGED_SKILL_SELECTIONS)
                              }
                              onCheckedChange={() =>
                                toggle({ id: skill.id, revision: skill.revision })
                              }
                            >
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate">
                                  {pinned && !checked ? `Update ${skill.name}` : skill.name}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {skill.description || skill.id} ({shortRevision(skill.revision)})
                                </span>
                              </span>
                            </MenuCheckboxItem>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {filteredGroups.length === 0 && normalizedQuery ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">No matching skills.</div>
            ) : null}
            {stale.length > 0 ? (
              <div className="border-t border-border/50">
                <button
                  type="button"
                  className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  aria-expanded={normalizedQuery.length > 0 || expanded.has("missing")}
                  onClick={() => toggleGroup("missing")}
                >
                  {normalizedQuery.length > 0 || expanded.has("missing") ? (
                    <ChevronDownIcon />
                  ) : (
                    <ChevronRightIcon />
                  )}
                  <LayersIcon />
                  <span className="min-w-0 flex-1 truncate">Needs attention</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{stale.length}</span>
                </button>
                {normalizedQuery.length > 0 || expanded.has("missing") ? (
                  <div className="ml-2 border-l border-border/60 pl-1">
                    {stale.map((selection) => (
                      <MenuCheckboxItem
                        key={`${selection.id}:${selection.revision}`}
                        checked
                        onCheckedChange={() => toggle(selection)}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{selection.id}</span>
                          <span className="text-xs text-warning-foreground">
                            Changed or removed ({shortRevision(selection.revision)})
                          </span>
                        </span>
                      </MenuCheckboxItem>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
