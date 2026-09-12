import type {
  OrchestrationThreadHandoffBasis,
  OrchestrationThreadHandoffFailureReason,
} from "@t3tools/contracts";
import type { ProviderInstanceEntry } from "../../providerInstances";

/**
 * Pure classification for a single model-picker row once a thread has
 * started. Locking normally hides or disables anything outside the active
 * driver/continuation group. Thread handoff loosens that: when the server
 * advertises the capability, an "outside the group" or "blocked" pick stays
 * selectable, it just routes to the switch sheet instead of changing the
 * draft in place.
 */
export type ThreadModelPickKind = "normal" | "disabled" | "handoff";

export function classifyThreadModelPick(input: {
  /** True once the thread has a started session and a driver is locked. */
  isLocked: boolean;
  /** Server capability flag (`ExecutionEnvironmentCapabilities.threadHandoff`). */
  threadHandoffEnabled: boolean;
  /** Whether this row's instance matches the locked driver + continuation group. */
  matchesLockedProvider: boolean;
  /** Non-null when `getStartedThreadModelChangeBlockReason` blocks this exact pick. */
  disabledReason: string | null;
}): ThreadModelPickKind {
  if (!input.isLocked) {
    return "normal";
  }
  if (input.matchesLockedProvider && !input.disabledReason) {
    return "normal";
  }
  if (!input.threadHandoffEnabled) {
    return "disabled";
  }
  return "handoff";
}

export const THREAD_HANDOFF_PICK_TOOLTIP = "Switching hands the conversation to this model";

/** Default first message sent to the destination model after a handoff. */
export const THREAD_HANDOFF_DEFAULT_INSTRUCTION = "Continue from where the conversation left off.";

export interface ThreadHandoffModelLabel {
  readonly providerLabel: string;
  readonly modelLabel: string;
}

/**
 * Resolve display labels for a (instanceId, model slug) pair, falling back to
 * the raw slug/id when the instance or model can't be found (for example a
 * custom instance that was since removed). Shared by the switch sheet title
 * and the timeline handoff card.
 */
export function resolveThreadHandoffModelLabel(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  selection: { instanceId: string; model: string } | null | undefined,
): ThreadHandoffModelLabel | null {
  if (!selection) return null;
  const entry = entries.find((candidate) => candidate.instanceId === selection.instanceId);
  const providerLabel = entry?.displayName ?? selection.instanceId;
  const model = entry?.models.find((candidate) => candidate.slug === selection.model);
  const modelLabel = model?.name ?? selection.model;
  return { providerLabel, modelLabel };
}

/**
 * One-line note about how much of the conversation the destination model
 * will actually see. Fallback is rendered in warning tone since it means the
 * summary generation failed and only first lines were kept.
 */
export function resolveThreadHandoffBasisNote(
  basis: OrchestrationThreadHandoffBasis,
  targetModelLabel: string,
): { text: string; tone: "warning" | "neutral" } {
  if (basis === "fallback") {
    return {
      text: "Summary unavailable, only the first line of each older message is included.",
      tone: "warning",
    };
  }
  if (basis === "generated") {
    return { text: `Summary written by ${targetModelLabel}`, tone: "neutral" };
  }
  return { text: "Full conversation included", tone: "neutral" };
}

/** True while a turn is in flight, so the switch sheet must block sending. */
export function isThreadHandoffSendBlocked(sessionStatus: string | null | undefined): boolean {
  return sessionStatus === "running" || sessionStatus === "starting";
}

/**
 * Map a switch/preview failure to the message shown in a toast. `thread-busy`
 * gets a specific, actionable message; everything else surfaces the server's
 * own message verbatim.
 */
export function resolveThreadHandoffErrorMessage(
  reason: OrchestrationThreadHandoffFailureReason | null,
  message: string,
): string {
  if (reason === "thread-busy") {
    return "Stop the current turn before switching.";
  }
  return message;
}
