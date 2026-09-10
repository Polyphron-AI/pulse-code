// @effect-diagnostics nodeBuiltinImport:off - Native TLS supplies client certificates and bounded file reads at the broker boundary.
import {
  InfrastructureError,
  WardenUseSnapshot,
  decodeWardenReadRequest,
  type WardenUseInput,
  WardenReceiptsResult,
  type WardenReceiptsInput,
} from "@t3tools/contracts";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttps from "node:https";
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
const decodeReceipts = Schema.decodeUnknownSync(WardenReceiptsResult);
const decodeUse = Schema.decodeUnknownSync(WardenUseSnapshot);
const ReadOutput = Schema.Struct({
  content: Schema.String,
  startTime: Schema.String,
  endTime: Schema.String,
  outputTruncated: Schema.Boolean,
});
const decodeOutput = Schema.decodeUnknownSync(ReadOutput);

export interface BrokerTls {
  readonly cert: Buffer;
  readonly key: Buffer;
  readonly ca: Buffer;
}
export type BrokerRequest = (
  url: URL,
  tls: BrokerTls,
  body: object | undefined,
  signal: AbortSignal,
  method?: "GET" | "POST",
  attemptRef?: string,
) => Promise<unknown>;

/** Each request uses verified mTLS, never redirects, and bounds bytes before JSON parsing. */
export const requestBroker: BrokerRequest = (url, tls, body, signal, method = "POST", attemptRef) =>
  new Promise<unknown>((resolve, reject) => {
    if (url.protocol !== "https:") {
      reject(upstreamError());
      return;
    }
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = NodeHttps.request(
      url,
      {
        method,
        ...tls,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        agent: false,
        signal,
        headers: {
          "content-type": "application/json",
          ...(attemptRef ? { "x-pulse-warden-attempt": attemptRef } : {}),
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

const reference = (target: Target, kind: string, id: string) =>
  `urn:pulse:${target.wardenAuthority}:${kind}:${id}`;

function binding(target: Target, scope: McpInvocationScope) {
  if (
    !scope.capabilities.has("warden") ||
    !scope.wardenAttempt ||
    scope.wardenAttempt.signal.aborted ||
    !target.enabled ||
    target.environmentId !== scope.environmentId ||
    !target.allowedThreadIds.includes(scope.threadId)
  ) {
    throw unavailable("Warden requires an enabled target and an active authorized turn.");
  }
  return {
    resourceRef: reference(target, "resource", target.id),
    taskRef: reference(target, "task", scope.threadId),
    attemptRef: reference(target, "attempt", scope.wardenAttempt.id),
    signal: scope.wardenAttempt.signal,
  };
}

function snapshot(target: Target, value: unknown) {
  const checked = decodeUse(value);
  if (checked.resourceRef !== reference(target, "resource", target.id)) throw upstreamError();
  return { ...checked, targetId: target.id, useRef: reference(target, "use", checked.useId) };
}

interface KnownUse {
  readonly target: Target;
  readonly useId: string;
  readonly requestDigest: string;
  readonly taskRef: string;
  readonly attemptRef: string;
  readonly resourceRef: string;
}

/** Retains only immutable metadata and protected file references, never private key bytes. */
export class KnownUseRevocations {
  readonly #attempts = new WeakMap<
    AbortSignal,
    { uses: Map<string, KnownUse>; abort: () => void }
  >();
  readonly #pending = new WeakMap<AbortSignal, Promise<void>>();
  readonly revoke: (use: KnownUse) => Promise<void>;
  readonly limit: number;
  constructor(revoke: (use: KnownUse) => Promise<void>, limit = 100) {
    this.revoke = revoke;
    this.limit = limit;
  }

  #enqueue(signal: AbortSignal, uses: ReadonlyArray<KnownUse>) {
    const previous = this.#pending.get(signal) ?? Promise.resolve();
    const next = previous.then(async () => {
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, uses.length) }, async () => {
          while (index < uses.length) {
            const use = uses[index++];
            if (use) await this.revoke(use).catch(() => undefined);
          }
        }),
      );
    });
    this.#pending.set(signal, next);
  }

  track(signal: AbortSignal, use: KnownUse, confirmed = false): boolean {
    if (signal.aborted) {
      this.#enqueue(signal, [use]);
      return false;
    }
    let attempt = this.#attempts.get(signal);
    if (!attempt) {
      const uses = new Map<string, KnownUse>();
      const abort = () => {
        this.#attempts.delete(signal);
        signal.removeEventListener("abort", abort);
        const pending = Array.from(uses.values());
        uses.clear();
        this.#enqueue(signal, pending);
      };
      attempt = { uses, abort };
      this.#attempts.set(signal, attempt);
      signal.addEventListener("abort", abort, { once: true });
    }
    const key = `${use.target.brokerEndpoint}/${use.useId}`;
    if (!attempt.uses.has(key) && attempt.uses.size >= this.limit) {
      this.#enqueue(signal, [use]);
      return false;
    }
    // An unverified execute input must not overwrite a broker-confirmed binding.
    if (confirmed || !attempt.uses.has(key)) attempt.uses.set(key, use);
    return true;
  }

  forget(signal: AbortSignal, target: Target, useId: string) {
    const attempt = this.#attempts.get(signal);
    if (!attempt) return;
    attempt.uses.delete(`${target.brokerEndpoint}/${useId}`);
    if (attempt.uses.size === 0) {
      signal.removeEventListener("abort", attempt.abort);
      this.#attempts.delete(signal);
    }
  }

  /** Tests and shutdown coordination await actual cleanup completion, never polling. */
  drain(signal: AbortSignal): Promise<void> {
    return this.#pending.get(signal) ?? Promise.resolve();
  }
}

async function revokeKnownUse(use: KnownUse) {
  let key: Buffer | undefined;
  try {
    const cert = await readCertificate(use.target.clientCertificateFile);
    key = await readCertificate(use.target.clientKeyFile);
    const ca = await readCertificate(use.target.caFile);
    await requestBroker(
      new URL(`/v1/uses/${use.useId}/revoke`, use.target.brokerEndpoint),
      { cert, key, ca },
      {
        taskRef: use.taskRef,
        attemptRef: use.attemptRef,
        resourceRef: use.resourceRef,
        expectedRequestDigest: use.requestDigest,
      },
      AbortSignal.timeout(5000),
      "POST",
      use.attemptRef,
    );
  } finally {
    key?.fill(0);
  }
}
const revocations = new KnownUseRevocations(revokeKnownUse);
function observeUse(
  target: Target,
  trusted: ReturnType<typeof binding>,
  result: WardenUseSnapshot,
  tracker: KnownUseRevocations,
) {
  if (!["pending_approval", "ready", "executing", "outcome_unknown"].includes(result.state)) {
    tracker.forget(trusted.signal, target, result.useId);
    return;
  }
  if (
    !tracker.track(
      trusted.signal,
      {
        target,
        useId: result.useId,
        requestDigest: result.requestDigest,
        taskRef: trusted.taskRef,
        attemptRef: trusted.attemptRef,
        resourceRef: trusted.resourceRef,
      },
      true,
    )
  ) {
    throw unavailable(
      "Warden cancellation tracking is full or this turn has ended. The known use is being revoked.",
    );
  }
}

/** Request and resume retain the broker's original request ID, digest and expiry. */
export async function requestBrokerUse(
  target: Target,
  query: SavedQuery,
  scope: McpInvocationScope,
  minutes: number,
  requestId: string,
  tls: BrokerTls,
  signal: AbortSignal,
  send: BrokerRequest = requestBroker,
  tracker: KnownUseRevocations = revocations,
) {
  const trusted = binding(target, scope);
  if (query.kind !== "loki" || !["development", "production"].includes(target.stage))
    throw unavailable("This saved query type or stage is not supported by Warden.");
  const request = decodeWardenReadRequest({
    requestId,
    credentialRef: query.credentialRef,
    action: "grafana.saved_query.read",
    resource: reference(target, "resource", target.id),
    taskRef: trusted.taskRef,
    attemptRef: trusted.attemptRef,
    payload: {
      queryRef: reference(target, "query", query.brokerQueryId),
      lookbackSeconds: minutes * 60,
    },
  });
  const result = snapshot(
    target,
    await send(
      new URL("/v1/uses", target.brokerEndpoint),
      tls,
      request,
      AbortSignal.any([signal, trusted.signal]),
      "POST",
      trusted.attemptRef,
    ),
  );
  if (result.requestId !== requestId) throw upstreamError();
  observeUse(target, trusted, result, tracker);
  return result;
}

export async function actOnBrokerUse(
  target: Target,
  scope: McpInvocationScope,
  input: WardenUseInput,
  action: "execute" | "status" | "revoke",
  tls: BrokerTls,
  signal: AbortSignal,
  send: BrokerRequest = requestBroker,
  tracker: KnownUseRevocations = revocations,
) {
  const trusted = binding(target, scope);
  const prefix = reference(target, "use", "");
  if (!input.useRef.startsWith(prefix))
    throw unavailable("This use belongs to a different Warden authority.");
  const useId = input.useRef.slice(prefix.length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(useId))
    throw unavailable("Invalid Warden use reference.");
  const url = new URL(
    `/v1/uses/${useId}${action === "status" ? "" : `/${action}`}`,
    target.brokerEndpoint,
  );
  const body = {
    resourceRef: trusted.resourceRef,
    taskRef: trusted.taskRef,
    attemptRef: trusted.attemptRef,
    expectedRequestDigest: input.expectedRequestDigest,
  };
  if (action === "status") {
    url.searchParams.set("resourceRef", trusted.resourceRef);
    url.searchParams.set("taskRef", trusted.taskRef);
    url.searchParams.set("attemptRef", trusted.attemptRef);
  }
  if (
    action === "execute" &&
    !tracker.track(trusted.signal, {
      target,
      useId,
      requestDigest: input.expectedRequestDigest,
      taskRef: trusted.taskRef,
      attemptRef: trusted.attemptRef,
      resourceRef: trusted.resourceRef,
    })
  ) {
    throw unavailable("Warden cancellation tracking is full or this turn has ended.");
  }
  const raw = await send(
    url,
    tls,
    action === "status" ? undefined : body,
    AbortSignal.any([signal, trusted.signal]),
    action === "status" ? "GET" : "POST",
    trusted.attemptRef,
  );
  const result = snapshot(target, raw);
  if (result.useId !== useId || result.requestDigest !== input.expectedRequestDigest)
    throw upstreamError();
  observeUse(target, trusted, result, tracker);
  if (action !== "execute" || result.state !== "succeeded") return result;
  if (
    typeof raw === "object" &&
    raw !== null &&
    "resultUnavailable" in raw &&
    raw.resultUnavailable === true
  ) {
    return { ...result, resultUnavailable: true };
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("queryId" in raw) ||
    !("stage" in raw) ||
    !target.queries.some(
      (query) => reference(target, "query", query.brokerQueryId) === raw.queryId,
    ) ||
    raw.stage !==
      (target.stage === "development" ? "dev" : target.stage === "production" ? "prod" : undefined)
  )
    throw upstreamError();
  const output = decodeOutput(raw);
  const start = Date.parse(output.startTime),
    end = Date.parse(output.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 3600000)
    throw upstreamError();
  return {
    ...result,
    startTime: output.startTime,
    endTime: output.endTime,
    text: output.content.slice(0, 24000),
    outputTruncated: output.outputTruncated || output.content.length > 24000,
  };
}

export async function readBrokerReceipts(
  target: Target,
  scope: McpInvocationScope,
  input: WardenReceiptsInput,
  tls: BrokerTls,
  signal: AbortSignal,
  send: BrokerRequest = requestBroker,
) {
  const trusted = binding(target, scope);
  const prefix = reference(target, "use", "");
  if (!input.useRef.startsWith(prefix))
    throw unavailable("This use belongs to a different Warden authority.");
  const id = input.useRef.slice(prefix.length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
    throw unavailable("Invalid Warden use reference.");
  const url = new URL(`/v1/uses/${id}/receipts`, target.brokerEndpoint);
  url.searchParams.set("resourceRef", trusted.resourceRef);
  url.searchParams.set("taskRef", trusted.taskRef);
  url.searchParams.set("attemptRef", trusted.attemptRef);
  if (input.cursor) url.searchParams.set("cursor", input.cursor);
  const result = decodeReceipts(
    await send(
      url,
      tls,
      undefined,
      AbortSignal.any([signal, trusted.signal]),
      "GET",
      trusted.attemptRef,
    ),
  );
  if (
    result.useId !== id ||
    result.resourceRef !== trusted.resourceRef ||
    result.receipts.some(
      (receipt) => receipt.useId !== id || receipt.requestDigest !== input.expectedRequestDigest,
    )
  )
    throw upstreamError();
  return result;
}

const withBroker = <A>(target: Target, run: (tls: BrokerTls, signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({
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
      try {
        return await run(tls, AbortSignal.any([signal, AbortSignal.timeout(20000)]));
      } finally {
        tls.key.fill(0);
      }
    },
    catch: (error) => (isInfrastructureError(error) ? error : upstreamError()),
  });

export const requestUse = Effect.fn("WardenBroker.requestUse")(function* (
  target: Target,
  query: SavedQuery,
  scope: McpInvocationScope,
  minutes: number,
  requestId: string,
) {
  return yield* withBroker(target, (tls, signal) =>
    requestBrokerUse(target, query, scope, minutes, requestId, tls, signal),
  );
});
export const useAction = Effect.fn("WardenBroker.useAction")(function* (
  target: Target,
  scope: McpInvocationScope,
  input: WardenUseInput,
  action: "execute" | "status" | "revoke",
) {
  return yield* withBroker(target, (tls, signal) =>
    actOnBrokerUse(target, scope, input, action, tls, signal),
  );
});

export const receipts = Effect.fn("WardenBroker.receipts")(function* (
  target: Target,
  scope: McpInvocationScope,
  input: WardenReceiptsInput,
) {
  return yield* withBroker(target, (tls, signal) =>
    readBrokerReceipts(target, scope, input, tls, signal),
  );
});

export class WardenBroker extends Context.Service<
  WardenBroker,
  {
    readonly requestUse: typeof requestUse;
    readonly useAction: typeof useAction;
    readonly receipts: typeof receipts;
  }
>()("t3/infrastructure/WardenBroker") {}
export const wardenBrokerLayer = Layer.succeed(WardenBroker, { requestUse, useAction, receipts });
