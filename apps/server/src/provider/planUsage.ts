/**
 * Normalizes provider-native rate-limit notifications into the
 * `ServerProviderPlanUsage` snapshot carried on `ServerProvider`.
 *
 * Both emitting drivers report sparse, rolling updates: Codex sends its
 * primary/secondary windows together, Claude reports one window per event.
 * `mergePlanUsage` folds a delta into the last-known snapshot by window id
 * so a sparse update never clears sibling windows.
 */
import type {
  ProviderRuntimeEvent,
  ServerProviderPlanUsage,
  ServerProviderPlanUsageWindow,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export interface PlanUsageDelta {
  readonly planLabel?: string;
  readonly windows: ReadonlyArray<ServerProviderPlanUsageWindow>;
}

// Tolerant local shapes: a driver adding fields (or omitting optional ones)
// must not drop the whole update, so only what we consume is declared.
const CodexRateLimitWindow = Schema.Struct({
  usedPercent: Schema.Number,
  resetsAt: Schema.optionalKey(Schema.Union([Schema.Number, Schema.Null])),
  windowDurationMins: Schema.optionalKey(Schema.Union([Schema.Number, Schema.Null])),
});

const CodexRateLimitsPayload = Schema.Struct({
  rateLimits: Schema.Struct({
    planType: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    primary: Schema.optionalKey(Schema.Union([CodexRateLimitWindow, Schema.Null])),
    secondary: Schema.optionalKey(Schema.Union([CodexRateLimitWindow, Schema.Null])),
  }),
});

const ClaudeRateLimitEvent = Schema.Struct({
  rate_limit_info: Schema.Struct({
    rateLimitType: Schema.optionalKey(Schema.String),
    utilization: Schema.optionalKey(Schema.Number),
    resetsAt: Schema.optionalKey(Schema.Number),
  }),
});

const isCodexRateLimitsPayload = Schema.is(CodexRateLimitsPayload);
const isClaudeRateLimitEvent = Schema.is(ClaudeRateLimitEvent);

/** Epoch timestamps arrive in seconds; guard against a millisecond emitter. */
function epochToIso(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const millis = value > 1e12 ? value : value * 1000;
  return Option.match(DateTime.make(millis), {
    onNone: () => undefined,
    onSome: DateTime.formatIso,
  });
}

function windowLabelFromMinutes(minutes: number | null | undefined): string | undefined {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }
  if (minutes === 300) return "5h";
  if (minutes === 10_080) return "Weekly";
  if (minutes % 43_200 === 0) return `${minutes / 43_200}mo`;
  if (minutes % 10_080 === 0) return `${minutes / 10_080}w`;
  if (minutes % 1_440 === 0) return `${minutes / 1_440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

const CODEX_PLAN_LABELS: Record<string, string> = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro Lite",
  team: "Team",
  self_serve_business_usage_based: "Business",
  business: "Business",
  enterprise_cbp_usage_based: "Enterprise",
  enterprise: "Enterprise",
  edu: "Edu",
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function codexWindow(
  window: typeof CodexRateLimitWindow.Type | null | undefined,
  fallbackId: "primary" | "secondary",
): ServerProviderPlanUsageWindow | undefined {
  if (!window) {
    return undefined;
  }
  const minutes = window.windowDurationMins ?? undefined;
  const label = windowLabelFromMinutes(minutes);
  const resetsAt = typeof window.resetsAt === "number" ? epochToIso(window.resetsAt) : undefined;
  return {
    // Duration-derived ids keep the merge key stable if the provider ever
    // reorders which window is primary.
    id: minutes !== undefined ? `codex-${minutes}m` : `codex-${fallbackId}`,
    label: label ?? (fallbackId === "primary" ? "Primary" : "Secondary"),
    usedPercent: clampPercent(window.usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
    ...(minutes !== undefined ? { windowMinutes: minutes } : {}),
  };
}

const CLAUDE_WINDOW_PRESENTATION: Record<string, { label: string; windowMinutes?: number }> = {
  five_hour: { label: "5h", windowMinutes: 300 },
  seven_day: { label: "Weekly", windowMinutes: 10_080 },
  seven_day_opus: { label: "Weekly (Opus)", windowMinutes: 10_080 },
  seven_day_sonnet: { label: "Weekly (Sonnet)", windowMinutes: 10_080 },
};

/**
 * Extract a plan-usage delta from an `account.rate-limits.updated` runtime
 * event. Returns undefined for other event types, drivers without plan
 * windows, and payloads that carry no window data (e.g. Claude overage-only
 * events).
 */
export function planUsageDeltaFromRuntimeEvent(
  event: ProviderRuntimeEvent,
): PlanUsageDelta | undefined {
  if (event.type !== "account.rate-limits.updated") {
    return undefined;
  }
  const raw = event.payload.rateLimits;

  if (event.provider === "codex" && isCodexRateLimitsPayload(raw)) {
    const snapshot = raw.rateLimits;
    const windows = [
      codexWindow(snapshot.primary, "primary"),
      codexWindow(snapshot.secondary, "secondary"),
    ].filter((window) => window !== undefined);
    if (windows.length === 0) {
      return undefined;
    }
    const planType = snapshot.planType ?? undefined;
    const planLabel =
      planType && planType !== "unknown" ? (CODEX_PLAN_LABELS[planType] ?? planType) : undefined;
    return { ...(planLabel ? { planLabel } : {}), windows };
  }

  if (event.provider === "claudeAgent" && isClaudeRateLimitEvent(raw)) {
    const info = raw.rate_limit_info;
    const presentation = info.rateLimitType
      ? CLAUDE_WINDOW_PRESENTATION[info.rateLimitType]
      : undefined;
    if (!presentation || typeof info.utilization !== "number") {
      return undefined;
    }
    const resetsAt = typeof info.resetsAt === "number" ? epochToIso(info.resetsAt) : undefined;
    return {
      windows: [
        {
          id: `claude-${info.rateLimitType}`,
          label: presentation.label,
          usedPercent: clampPercent(info.utilization),
          ...(resetsAt ? { resetsAt } : {}),
          ...(presentation.windowMinutes !== undefined
            ? { windowMinutes: presentation.windowMinutes }
            : {}),
        },
      ],
    };
  }

  return undefined;
}

/**
 * Fold a sparse delta into the last-known snapshot. Windows replace by id,
 * previously seen windows survive, and ordering is shortest window first so
 * every surface renders "5h, then weekly" without re-sorting.
 */
export function mergePlanUsage(
  previous: ServerProviderPlanUsage | undefined,
  delta: PlanUsageDelta,
  capturedAt: string,
): ServerProviderPlanUsage {
  const windowsById = new Map((previous?.windows ?? []).map((window) => [window.id, window]));
  for (const window of delta.windows) {
    windowsById.set(window.id, window);
  }
  const windows = [...windowsById.values()].sort(
    (a, b) =>
      (a.windowMinutes ?? Number.MAX_SAFE_INTEGER) - (b.windowMinutes ?? Number.MAX_SAFE_INTEGER) ||
      a.label.localeCompare(b.label),
  );
  const planLabel = delta.planLabel ?? previous?.planLabel;
  return {
    ...(planLabel ? { planLabel } : {}),
    windows,
    capturedAt,
  };
}
