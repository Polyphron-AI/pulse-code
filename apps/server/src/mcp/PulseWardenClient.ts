// @effect-diagnostics preferSchemaOverJson:off -- Pulse Go uses an untyped JSON-RPC boundary.

import * as Effect from "effect/Effect";

export type PulseWardenErrorKind =
  | "not-configured"
  | "unauthorized"
  | "unavailable"
  | "denied"
  | "protocol";

/** Never carries the PAT or released material. `message` is safe to show to an operator. */
export class PulseWardenError extends Error {
  readonly _tag = "PulseWardenError";
  readonly kind: PulseWardenErrorKind;
  readonly status: number | undefined;

  constructor(kind: PulseWardenErrorKind, message: string, status?: number) {
    super(message);
    this.name = "PulseWardenError";
    this.kind = kind;
    this.status = status;
  }
}

export interface PulseWardenAccess {
  readonly origin: string;
  readonly pat: string;
}

export interface PulseWardenReleaseRequest {
  readonly requestId: string;
  readonly grantId: string;
  readonly credentialRef: string;
  readonly scope: string;
}

export interface PulseWardenReleaseResult {
  readonly credentialRef: string;
  readonly material: string;
  readonly requestDigest: string;
}

export interface PulseWardenClientShape {
  readonly callTool: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<unknown, PulseWardenError>;
  readonly release: (
    body: PulseWardenReleaseRequest,
  ) => Effect.Effect<PulseWardenReleaseResult, PulseWardenError>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export const WARDEN_ISOLATED_EXECUTION_REQUIRED =
  "Warden credential injection into MCP connections is disabled. Use an approved operation through the Pulse Go Warden MCP server.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Pulse Go tools return either a bare array or an object keyed by the collection name. */
export const wardenArray = (value: unknown, key: string): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value[key])) return value[key] as unknown[];
  throw new PulseWardenError("protocol", `Pulse Go returned an unexpected ${key} shape.`);
};

const serverMessage = (body: unknown, fallback: string) => {
  if (isRecord(body)) {
    if (typeof body.message === "string" && body.message.length > 0) return body.message;
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
  }
  return fallback;
};

const errorCode = (body: unknown) =>
  isRecord(body) && typeof body.error === "string" ? body.error : undefined;

const httpFailure = (status: number, body: unknown): PulseWardenError => {
  const code = errorCode(body);
  if (status === 401 || code === "unauthorized") {
    return new PulseWardenError("unauthorized", "Pulse Go rejected the token.", status);
  }
  if (status === 503 || code === "warden_unsupported" || code === "warden_unavailable") {
    return new PulseWardenError("unavailable", "Pulse Go Warden is unavailable.", status);
  }
  if (status >= 400 && status < 500) {
    return new PulseWardenError(
      "denied",
      serverMessage(body, "Pulse Go denied the request."),
      status,
    );
  }
  return new PulseWardenError("unavailable", "Pulse Go returned a server error.", status);
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PulseWardenError("protocol", "Pulse Go returned a response that was not JSON.");
  }
};

const textContent = (content: unknown) => {
  if (!Array.isArray(content)) return undefined;
  const entry = content.find((item) => isRecord(item) && typeof item.text === "string");
  return isRecord(entry) && typeof entry.text === "string" ? entry.text : undefined;
};

const decodeToolResult = (body: unknown): unknown => {
  if (!isRecord(body))
    throw new PulseWardenError("protocol", "Pulse Go returned no JSON-RPC body.");
  if (body.error !== undefined) {
    throw new PulseWardenError("protocol", serverMessage(body.error, "Pulse Go tool call failed."));
  }
  const result = body.result;
  if (!isRecord(result))
    throw new PulseWardenError("protocol", "Pulse Go returned no tool result.");
  if (result.isError === true) {
    throw new PulseWardenError(
      "denied",
      textContent(result.content) ?? "Pulse Go tool call failed.",
    );
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = textContent(result.content);
  if (text !== undefined) return parseJson(text);
  throw new PulseWardenError("protocol", "Pulse Go tool result had no content.");
};

/**
 * Talks to Pulse Go through `/mcp`. Legacy material release fails locally: protected
 * credentials belong in Warden's isolated operation runner, never in a provider process.
 */
export const makePulseWardenClient = (
  access: PulseWardenAccess,
  options: { readonly fetch?: typeof fetch; readonly timeoutMs?: number } = {},
): PulseWardenClientShape => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const origin = access.origin.replace(/\/+$/, "");

  const post = (path: string, body: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const response = await doFetch(`${origin}${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${access.pat}`,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        if (!response.ok) {
          let parsed: unknown;
          try {
            parsed = text ? (JSON.parse(text) as unknown) : undefined;
          } catch {
            parsed = undefined;
          }
          throw httpFailure(response.status, parsed);
        }
        return parseJson(text);
      },
      catch: (cause) =>
        cause instanceof PulseWardenError
          ? cause
          : new PulseWardenError("unavailable", "Pulse Go Warden is unreachable."),
    });

  let nextId = 1;
  return {
    callTool: (name, args) =>
      post("/mcp", {
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      }).pipe(
        Effect.flatMap((body) =>
          Effect.try({
            try: () => decodeToolResult(body),
            catch: (cause) =>
              cause instanceof PulseWardenError
                ? cause
                : new PulseWardenError("protocol", "Pulse Go tool result could not be decoded."),
          }),
        ),
      ),
    release: () => Effect.fail(new PulseWardenError("denied", WARDEN_ISOLATED_EXECUTION_REQUIRED)),
  };
};
