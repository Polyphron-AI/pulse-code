import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ScheduleAuthProbe, type ScheduleAuthProbeShape } from "../Services/ScheduleAuthProbe.ts";

/**
 * Live auth probe. Real provider credential checks do not exist yet, so it
 * always answers "unknown", which the ScheduleReactor treats as "fire anyway".
 */
export const ScheduleAuthProbeLive = Layer.succeed(ScheduleAuthProbe, {
  probe: () => Effect.succeed({ _tag: "unknown" as const }),
} satisfies ScheduleAuthProbeShape);
