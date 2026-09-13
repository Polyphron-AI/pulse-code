import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type ProviderDriverKind,
  type PulseSkillRecord,
  type PulseSkillSelection,
} from "@t3tools/contracts";
import { GithubIcon, LayersIcon, UploadIcon } from "lucide-react";
import { useMemo } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import {
  ComposerControl,
  ComposerControlChevron,
  ComposerControlIcon,
} from "../components/chat/ComposerControl";
import { composerFloatingLayerProps } from "../components/chat/composerEventScope";
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../components/ui/menu";
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
  if (!props.state.providerIsCodex || (!props.state.visible && props.state.selected.length === 0))
    return null;
  const size = props.size ?? "sm";
  const selectedCount = props.state.selected.length;
  const toggle = (selection: PulseSkillSelection) =>
    props.onChange(toggleManagedSkillSelection(props.state.selected, selection));

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
            {groups.map((group) => (
              <MenuSub key={group.id}>
                <MenuSubTrigger>
                  {group.uploaded ? <UploadIcon /> : <GithubIcon />}
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {group.skills.length}
                  </span>
                </MenuSubTrigger>
                <MenuSubPopup className="w-72">
                  {group.skills.map((skill) => {
                    const checked = props.state.selected.some(
                      (selection) =>
                        selection.id === skill.id && selection.revision === skill.revision,
                    );
                    return (
                      <MenuCheckboxItem
                        key={`${skill.id}:${skill.revision}`}
                        checked={checked}
                        disabled={
                          !checked &&
                          selectedCount >= MAX_MANAGED_SKILL_SELECTIONS &&
                          !props.state.selected.some((selection) => selection.id === skill.id)
                        }
                        onCheckedChange={() => toggle({ id: skill.id, revision: skill.revision })}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{skill.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {skill.description || skill.id} ({shortRevision(skill.revision)})
                          </span>
                        </span>
                      </MenuCheckboxItem>
                    );
                  })}
                </MenuSubPopup>
              </MenuSub>
            ))}
            {stale.length > 0 ? (
              <MenuSub>
                <MenuSubTrigger>
                  <LayersIcon />
                  <span className="min-w-0 flex-1 truncate">Needs attention</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{stale.length}</span>
                </MenuSubTrigger>
                <MenuSubPopup className="w-72">
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
                </MenuSubPopup>
              </MenuSub>
            ) : null}
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
