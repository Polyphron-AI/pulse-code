// @effect-diagnostics nodeBuiltinImport:off - Native TLS supplies client certificates and bounded file reads at the broker boundary.
import { InfrastructureError } from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttps from "node:https";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type { McpInvocationScope } from "../mcp/McpInvocationContext.ts";
import { configurationError, type SavedQuery, type Target } from "./catalog.ts";

const isInfrastructureError = Schema.is(InfrastructureError);
const unavailable = (message: string) => new InfrastructureError({ code: "unavailable", message });
const upstreamError = () =>
  new InfrastructureError({
    code: "upstream",
    message:
      "Warden log query failed. Ask the environment operator to check broker availability and access. Execution is not automatically retried.",
  });
const Identifier = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/));
const Use = Schema.Struct({
  useId: Identifier,
  state: Schema.Literals(["pending", "ready"]),
  expiresAt: Schema.String,
});
const Result = Schema.Struct({
  useId: Identifier,
  state: Schema.Literal("succeeded"),
  queryId: Identifier,
  stage: Schema.String,
  startTime: Schema.String,
  endTime: Schema.String,
  content: Schema.String,
  outputTruncated: Schema.Boolean,
});
const decodeUse = Schema.decodeUnknownSync(Use);
const decodeResult = Schema.decodeUnknownSync(Result);

export interface BrokerTls {
  readonly cert: Buffer;
  readonly key: Buffer;
  readonly ca: Buffer;
}
export type BrokerRequest = (
  url: URL,
  tls: BrokerTls,
  body: object,
  signal: AbortSignal,
) => Promise<unknown>;

/** Each request uses verified mTLS, never redirects, and bounds bytes before JSON parsing. */
export const requestBroker: BrokerRequest = (url, tls, body, signal) =>
  new Promise<unknown>((resolve, reject) => {
    if (url.protocol !== "https:") {
      reject(upstreamError());
      return;
    }
    const payload = JSON.stringify(body);
    const req = NodeHttps.request(
      url,
      {
        method: "POST",
        ...tls,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        agent: false,
        signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        if (response.statusCode !== 200 && response.statusCode !== 201) {
          response.destroy();
          reject(
            response.statusCode === 401 ||
              response.statusCode === 403 ||
              response.statusCode === 409 ||
              response.statusCode === 410
              ? unavailable(
                  "Warden access is denied, expired, revoked, or already used. Ask the environment operator to review access.",
                )
              : upstreamError(),
          );
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1_048_576) {
            response.destroy();
            req.destroy();
            reject(upstreamError());
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", () => reject(upstreamError()));
        response.on("aborted", () => reject(upstreamError()));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(upstreamError());
          }
        });
      },
    );
    req.on("error", () => reject(upstreamError()));
    req.end(payload);
  }).catch((error: unknown) => {
    throw isInfrastructureError(error) ? error : upstreamError();
  });

async function readCertificate(file: string) {
  const handle = await NodeFSP.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > 65536) throw configurationError();
    const buffer = Buffer.alloc(65537);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === 0 || bytesRead > 65536) throw configurationError();
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Bound to trusted session issuance, not a per-turn attempt supplied by an agent. */
export const brokerAttemptId = (scope: McpInvocationScope) =>
  NodeCrypto.createHash("sha256")
    .update(
      JSON.stringify([
        scope.environmentId,
        scope.providerInstanceId,
        scope.providerSessionId,
        scope.issuedAt,
      ]),
    )
    .digest("hex");

export async function executeBrokerQuery(
  target: Target,
  query: SavedQuery,
  scope: McpInvocationScope,
  minutes: number,
  tls: BrokerTls,
  signal: AbortSignal,
  nowMillis: number,
  send: BrokerRequest = requestBroker,
) {
  if (
    target.environmentId !== scope.environmentId ||
    !target.allowedThreadIds.includes(scope.threadId) ||
    !target.enabled
  )
    throw unavailable("This target is not available to this thread or environment.");
  const brokerStage =
    target.stage === "development" ? "dev" : target.stage === "production" ? "prod" : undefined;
  if (!brokerStage)
    throw unavailable("This environment stage is not supported by Warden log queries.");
  const binding = { threadId: scope.threadId, attemptId: brokerAttemptId(scope) };
  const use = decodeUse(
    await send(
      new URL("/v1/uses", target.brokerEndpoint),
      tls,
      {
        requestId: NodeCrypto.randomUUID(),
        ...binding,
        queryId: query.brokerQueryId,
        lookbackMinutes: minutes,
      },
      signal,
    ),
    { onExcessProperty: "error" },
  );
  if (!Number.isFinite(Date.parse(use.expiresAt)) || Date.parse(use.expiresAt) <= nowMillis)
    throw unavailable("Warden access has expired. Ask the environment operator to review access.");
  if (use.state === "pending")
    throw unavailable(
      `Warden use ${use.useId} is awaiting operator approval. Ask the environment operator to approve the access policy before querying again.`,
    );
  const result = decodeResult(
    await send(
      new URL(`/v1/uses/${encodeURIComponent(use.useId)}/execute`, target.brokerEndpoint),
      tls,
      binding,
      signal,
    ),
    { onExcessProperty: "error" },
  );
  const start = Date.parse(result.startTime);
  const end = Date.parse(result.endTime);
  if (
    result.useId !== use.useId ||
    result.queryId !== query.brokerQueryId ||
    result.stage !== brokerStage ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    end - start > minutes * 60000
  )
    throw upstreamError();
  // Broker owns log redaction. Never include certificate material or transport diagnostics in results.
  const receipt = `Warden receipt: ${result.useId}\n`;
  const limit = 24000 - receipt.length;
  return {
    startTime: result.startTime,
    endTime: result.endTime,
    text: receipt + result.content.slice(0, limit),
    outputTruncated: result.outputTruncated || result.content.length > limit,
  };
}

export const queryBroker = Effect.fn("WardenBroker.query")(function* (
  target: Target,
  query: SavedQuery,
  scope: McpInvocationScope,
  minutes: number,
) {
  const nowMillis = yield* Clock.currentTimeMillis;
  return yield* Effect.tryPromise({
    try: async (signal) => {
      let tls: BrokerTls;
      try {
        tls = {
          cert: await readCertificate(target.clientCertificateFile),
          key: await readCertificate(target.clientKeyFile),
          ca: await readCertificate(target.caFile),
        };
      } catch {
        throw configurationError();
      }
      return executeBrokerQuery(
        target,
        query,
        scope,
        minutes,
        tls,
        AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        nowMillis,
      );
    },
    catch: (error) => (isInfrastructureError(error) ? error : upstreamError()),
  });
});

export class WardenBroker extends Context.Service<
  WardenBroker,
  { readonly query: typeof queryBroker }
>()("t3/infrastructure/WardenBroker") {}
export const wardenBrokerLayer = Layer.succeed(WardenBroker, { query: queryBroker });
