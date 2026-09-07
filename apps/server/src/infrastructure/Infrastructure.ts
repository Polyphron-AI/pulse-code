import { InfrastructureError, InfrastructureQueryInput } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

import { ServerConfig } from "../config.ts";
import { McpInvocationContext } from "../mcp/McpInvocationContext.ts";
import { configurationError, makeQueryCall, parseCatalog, summarizeTarget } from "./catalog.ts";
import { callGrafana } from "./GrafanaMcp.ts";

const decodeQueryInput = Schema.decodeUnknownEffect(InfrastructureQueryInput);

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const client = yield* HttpClient.HttpClient;
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
    return (yield* catalog).filter(
      (target) => target.enabled && target.allowedThreadIds.includes(scope.threadId),
    );
  });

  return {
    listTargets: accessible.pipe(
      Effect.map((targets) => ({ targets: targets.map(summarizeTarget) })),
    ),
    query: Effect.fn("Infrastructure.query")(function* (input: InfrastructureQueryInput) {
      const checked = yield* decodeQueryInput(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError(
          () =>
            new InfrastructureError({
              code: "unavailable",
              message: "Specify a saved query and a lookback of 1 to 60 minutes.",
            }),
        ),
      );
      const scope = yield* McpInvocationContext;
      const target = (yield* accessible).find((target) => target.id === checked.targetId);
      const query = target?.queries.find((query) => query.id === checked.queryId);
      if (!target || !query)
        return yield* new InfrastructureError({
          code: "unavailable",
          message: "This target or saved query is not available to this thread.",
        });
      const token = yield* Config.string(target.tokenEnv).pipe(Effect.mapError(configurationError));
      if (!token.trim() || /[\r\n]/.test(token)) return yield* configurationError();
      const now = yield* DateTime.now;
      const endTime = DateTime.formatIso(now);
      const startTime = DateTime.formatIso(
        DateTime.subtract(now, { minutes: checked.lookbackMinutes }),
      );
      const result = yield* callGrafana(
        target.mcpEndpoint,
        token,
        makeQueryCall(query, startTime, endTime, checked.lookbackMinutes),
      ).pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.tapError(() =>
          Effect.logWarning("infrastructure query failed", {
            targetId: target.id,
            queryId: query.id,
            threadId: scope.threadId,
          }),
        ),
      );
      yield* Effect.logInfo("infrastructure query completed", {
        targetId: target.id,
        queryId: query.id,
        threadId: scope.threadId,
        startTime,
        endTime,
        outputTruncated: result.outputTruncated,
      });
      return {
        target: summarizeTarget(target),
        queryId: query.id,
        startTime,
        endTime,
        fetchedAt: DateTime.formatIso(yield* DateTime.now),
        ...result,
      };
    }),
  };
});

/** @effect-expect-leaking McpInvocationContext */
export class Infrastructure extends Context.Service<Infrastructure, Effect.Success<typeof make>>()(
  "t3/infrastructure/Infrastructure",
) {}
export const layer = Layer.effect(Infrastructure, make).pipe(Layer.provide(FetchHttpClient.layer));
