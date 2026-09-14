/**
 * Menu shape for "continue this thread in another provider". Kept separate
 * from the row components because both thread list variants build the same
 * submenu and decode the same prefixed ids.
 */
import {
  buildThreadHandoffTargets,
  type ThreadHandoffTarget,
} from "@t3tools/client-runtime/state/thread-handoff";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { DEFAULT_SERVER_SETTINGS, type EnvironmentId, type ServerConfig } from "@t3tools/contracts";
import type { MenuAction } from "@react-native-menu/menu";

const HANDOFF_EVENT_PREFIX = "continue-in:";

/**
 * Handoff targets for a thread: everything the model picker would offer on
 * that server, minus the instance the thread already runs on.
 */
export function resolveThreadHandoffTargets(
  serverConfigs: ReadonlyMap<EnvironmentId, ServerConfig>,
  thread: EnvironmentThreadShell,
): ReadonlyArray<ThreadHandoffTarget> {
  const config = serverConfigs.get(thread.environmentId);
  const current = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  return buildThreadHandoffTargets(
    config?.providers ?? [],
    config?.settings ?? DEFAULT_SERVER_SETTINGS,
  ).filter((target) => target.instanceId !== current);
}

/**
 * The submenu item, or nothing when the server has no other provider to
 * move to. An empty parent item would just be a dead end.
 */
export function buildThreadHandoffMenuItems(
  targets: ReadonlyArray<ThreadHandoffTarget>,
): ReadonlyArray<MenuAction> {
  if (targets.length === 0) return [];
  return [
    {
      id: "continue-in",
      title: "Continue in…",
      image: "arrow.triangle.branch",
      subactions: targets.map((target) => ({
        id: `${HANDOFF_EVENT_PREFIX}${target.instanceId}`,
        title: target.label,
        attributes: { disabled: target.disabled },
      })),
    },
  ];
}

/**
 * Decode a menu selection back to a target. Unknown or stale instance ids
 * resolve to nothing, so a menu built against an older config cannot start a
 * handoff to a provider that has since gone away.
 */
export function resolveThreadHandoffMenuSelection(input: {
  readonly event: string;
  readonly targets: ReadonlyArray<ThreadHandoffTarget>;
}): ThreadHandoffTarget | null {
  if (!input.event.startsWith(HANDOFF_EVENT_PREFIX)) return null;
  const instanceId = input.event.slice(HANDOFF_EVENT_PREFIX.length);
  return (
    input.targets.find((target) => !target.disabled && target.instanceId === instanceId) ?? null
  );
}
