#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - The opt-in probe parses operator CLI arguments and hashes evidence without printing log bodies.
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  InfrastructureError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as NodeUtil from "node:util";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServerConfig from "../src/config.ts";
import { Infrastructure, layer } from "../src/infrastructure/Infrastructure.ts";
import { configurationError, parseCatalog } from "../src/infrastructure/catalog.ts";
import { brokerAttemptId } from "../src/infrastructure/WardenBroker.ts";
import { McpInvocationContext, type McpInvocationScope } from "../src/mcp/McpInvocationContext.ts";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const isInfrastructureError = Schema.is(InfrastructureError);
const usage =
  "node --experimental-strip-types apps/server/scripts/warden-live-probe.ts --catalog ABSOLUTE_PATH --environment-id ID --thread-id ID --target-id ID --query-id ID [--lookback-minutes 5]";

async function main() {
  const { values } = NodeUtil.parseArgs({
    options: {
      catalog: { type: "string" },
      "environment-id": { type: "string" },
      "thread-id": { type: "string" },
      "target-id": { type: "string" },
      "query-id": { type: "string" },
      "lookback-minutes": { type: "string", default: "5" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(usage + "\n");
    return;
  }
  const catalogFile = values.catalog;
  const environmentId = values["environment-id"];
  const threadId = values["thread-id"];
  const targetId = values["target-id"];
  const queryId = values["query-id"];
  if (!catalogFile || !environmentId || !threadId || !targetId || !queryId)
    throw new Error("missing probe arguments");
  const minutes = Number(values["lookback-minutes"]);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60)
    throw new Error("invalid lookback");

  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-warden-live-probe-" });
  const dependencies = layer.pipe(
    Layer.provideMerge(configLayer),
    Layer.provideMerge(NodeServices.layer),
  );
  const program = Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      if (!path.isAbsolute(catalogFile)) return yield* configurationError();
      const stat = yield* fs.stat(catalogFile);
      if (stat.size > 262144n) return yield* configurationError();
      const text = yield* fs.readFileString(catalogFile);
      yield* Effect.try({ try: () => parseCatalog(text), catch: configurationError });
      yield* fs.writeFileString(path.join(config.stateDir, "infrastructure.json"), text);
      const scope: McpInvocationScope = {
        environmentId: EnvironmentId.make(environmentId),
        threadId: ThreadId.make(threadId),
        providerInstanceId: ProviderInstanceId.make("warden-infrastructure-probe"),
        providerSessionId: `operator-probe-${NodeCrypto.randomUUID()}`,
        issuedAt: yield* Clock.currentTimeMillis,
        capabilities: new Set(),
      };
      const service = yield* Infrastructure;
      const result = yield* service
        .query({ targetId, queryId, lookbackMinutes: minutes })
        .pipe(Effect.provideService(McpInvocationContext, scope));
      const receipt = /^Warden receipt: ([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})\n/.exec(result.text);
      if (!receipt)
        return yield* new InfrastructureError({
          code: "upstream",
          message: "Missing broker receipt.",
        });
      const content = result.text.slice(receipt[0].length);
      return {
        status: "succeeded",
        harness: "isolated-client-probe",
        desktopActivated: false,
        useId: receipt[1],
        environmentId: scope.environmentId,
        threadId: scope.threadId,
        providerInstanceId: scope.providerInstanceId,
        attemptId: brokerAttemptId(scope),
        targetId: result.target.id,
        queryId: result.queryId,
        stage: result.target.stage,
        startTime: result.startTime,
        endTime: result.endTime,
        fetchedAt: result.fetchedAt,
        contentCharacters: content.length,
        contentSha256: NodeCrypto.createHash("sha256").update(content).digest("hex"),
        outputTruncated: result.outputTruncated,
      };
    }),
  ).pipe(
    Effect.provide(Layer.merge(dependencies, Logger.layer([], { mergeWithExisting: false }))),
    Effect.match({
      onSuccess: (report) => report,
      onFailure: (error) => ({
        status: "failed",
        harness: "isolated-client-probe",
        code: isInfrastructureError(error) ? error.code : "configuration",
      }),
    }),
  );
  const report = await Effect.runPromise(program);
  process.stdout.write(json(report) + "\n");
  if (report.status !== "succeeded") process.exitCode = 1;
}

try {
  await main();
} catch {
  process.stderr.write(
    json({ status: "failed", harness: "isolated-client-probe", code: "configuration", usage }) +
      "\n",
  );
  process.exitCode = 1;
}
