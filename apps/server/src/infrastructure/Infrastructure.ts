import {
  InfrastructureError,
  InfrastructureQueryInput,
  WardenRequestInput,
  WardenUseInput,
  WardenReceiptsInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../config.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { McpInvocationContext } from "../mcp/McpInvocationContext.ts";
import { configurationError, parseCatalog, summarizeTarget } from "./catalog.ts";
import { WardenBroker, wardenBrokerLayer } from "./WardenBroker.ts";

const decodeQueryInput = Schema.decodeUnknownEffect(InfrastructureQueryInput);
const decodeRequest = Schema.decodeUnknownEffect(WardenRequestInput);
const decodeReceipts = Schema.decodeUnknownEffect(WardenReceiptsInput);
const decodeUse = Schema.decodeUnknownEffect(WardenUseInput);

export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const broker = yield* WardenBroker;
  const settings = yield* ServerSettingsService;
  const catalogPath = path.join(config.stateDir, "infrastructure.json");
  const catalog = Effect.gen(function* () {
    if (!(yield* fs.exists(catalogPath))) return [];
    const stat = yield* fs.stat(catalogPath);
    if (stat.size > 262144n) return yield* configurationError();
    const text = yield* fs.readFileString(catalogPath);
    return yield* Effect.try({ try: () => parseCatalog(text), catch: configurationError });
  }).pipe(Effect.mapError(configurationError));

  const accessible = Effect.gen(function* () {
    const scope = yield* McpInvocationContext;
    if (
      !scope.capabilities.has("warden") ||
      !(yield* settings.getSettings.pipe(Effect.mapError(configurationError)))
        .enableAgentWardenAccess
    )
      return [];
    return (yield* catalog).filter(
      (target) =>
        target.enabled &&
        target.environmentId === scope.environmentId &&
        target.allowedThreadIds.includes(scope.threadId),
    );
  });

  const invalid = () =>
    new InfrastructureError({
      code: "unavailable",
      message: "Use an authorized saved query and a valid Warden request or use reference.",
    });
  const selectedTarget = Effect.fn("Infrastructure.selectedTarget")(function* (id: string) {
    const target = (yield* accessible).find((value) => value.id === id);
    if (!target) return yield* invalid();
    return target;
  });
  const request = Effect.fn("Infrastructure.requestUse")(function* (input: WardenRequestInput) {
    const checked = yield* decodeRequest(input, { onExcessProperty: "error" }).pipe(
      Effect.mapError(invalid),
    );
    const scope = yield* McpInvocationContext;
    const target = yield* selectedTarget(checked.targetId);
    const query = target.queries.find((value) => value.id === checked.queryId);
    if (!query) return yield* invalid();
    return yield* broker.requestUse(
      target,
      query,
      scope,
      checked.lookbackMinutes,
      checked.requestId,
    );
  });
  const use = Effect.fn("Infrastructure.useAction")(function* (
    input: WardenUseInput,
    action: "execute" | "status" | "revoke",
  ) {
    const checked = yield* decodeUse(input, { onExcessProperty: "error" }).pipe(
      Effect.mapError(invalid),
    );
    const scope = yield* McpInvocationContext;
    const target = yield* selectedTarget(checked.targetId);
    return yield* broker.useAction(target, scope, checked, action);
  });
  return {
    listTargets: accessible.pipe(
      Effect.map((targets) => ({ targets: targets.map(summarizeTarget) })),
    ),
    request,
    use,
    receipts: Effect.fn("Infrastructure.receipts")(function* (input: WardenReceiptsInput) {
      const checked = yield* decodeReceipts(input, { onExcessProperty: "error" }).pipe(
        Effect.mapError(invalid),
      );
      const scope = yield* McpInvocationContext;
      return yield* broker.receipts(yield* selectedTarget(checked.targetId), scope, checked);
    }),
    query: Effect.fn("Infrastructure.query")(function* (input: InfrastructureQueryInput) {
      const checked = yield* decodeQueryInput(input, { onExcessProperty: "error" }).pipe(
        Effect.mapError(invalid),
      );
      const requested = yield* request({
        ...checked,
        requestId: yield* crypto.randomUUIDv4.pipe(Effect.orDie),
      });
      if (requested.state !== "ready") return requested;
      return yield* use(
        {
          targetId: checked.targetId,
          useRef: requested.useRef,
          expectedRequestDigest: requested.requestDigest,
        },
        "execute",
      );
    }),
  };
});

/** @effect-expect-leaking McpInvocationContext */
export class Infrastructure extends Context.Service<Infrastructure, Effect.Success<typeof make>>()(
  "t3/infrastructure/Infrastructure",
) {}
export const layer = Layer.effect(Infrastructure, make).pipe(Layer.provide(wardenBrokerLayer));
