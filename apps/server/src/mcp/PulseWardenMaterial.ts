import type { PulseMcpWardenFailureReason } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import * as Ref from "effect/Ref";

import {
  PulseWardenError,
  WARDEN_ISOLATED_EXECUTION_REQUIRED,
  wardenArray,
  type PulseWardenClientShape,
} from "./PulseWardenClient.ts";

/** How long a grant listing stays usable before Pulse Go is asked again. */
const GRANT_TTL_MS = 30_000;

export interface WardenGrant {
  readonly id: string;
  readonly scope: string;
  readonly expiresAt: string | undefined;
}

export interface WardenFailure {
  readonly reason: PulseMcpWardenFailureReason;
  readonly message: string;
}

export type WardenMaterial = { readonly ok: false } & WardenFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Credential-scoped metadata for the settings surface, never execution authority. */
const CREDENTIAL_SCOPE = /^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$/;

const trimPeriod = (message: string) => message.replace(/\.+$/, "");

/** Turns a client error into the reason code and the pause copy the clients render. */
export const wardenFailure = (error: PulseWardenError): WardenFailure => {
  switch (error.kind) {
    case "not-configured":
      return {
        reason: "warden-not-configured",
        message: "Configure Pulse Go Warden in Settings > MCP.",
      };
    case "unauthorized":
      return {
        reason: "warden-unauthorized",
        message: "Pulse Go rejected the token for this environment. Replace it in Settings.",
      };
    case "denied":
      return {
        reason: "warden-unauthorized",
        message: `Pulse Go denied the release: ${trimPeriod(error.message)}.`,
      };
    case "protocol":
      return {
        reason: "warden-unavailable",
        message: "Pulse Go Warden returned an unexpected response. Retry.",
      };
    default:
      return {
        reason: "warden-unavailable",
        message: "Pulse Go Warden is unreachable. Retry.",
      };
  }
};

/** Keeps only grants Pulse Go will honour: active, and scoped to the credential verbatim. */
export const decodeWardenGrants = (value: unknown): ReadonlyMap<string, WardenGrant> => {
  const grants = new Map<string, WardenGrant>();
  for (const entry of wardenArray(value, "grants")) {
    if (!isRecord(entry)) continue;
    const { id, scope, status, expiresAt } = entry;
    if (typeof id !== "string" || typeof scope !== "string" || status !== "active") continue;
    if (!CREDENTIAL_SCOPE.test(scope)) continue;
    if (grants.has(scope)) continue;
    grants.set(scope, {
      id,
      scope,
      expiresAt: typeof expiresAt === "string" ? expiresAt : undefined,
    });
  }
  return grants;
};

export interface WardenGrantIndex {
  /** The active grants by credential ref, refreshed at most once per TTL window. */
  readonly active: Effect.Effect<ReadonlyMap<string, WardenGrant>, PulseWardenError>;
  readonly invalidate: Effect.Effect<void>;
}

export const makeWardenGrantIndex = (
  client: PulseWardenClientShape,
): Effect.Effect<WardenGrantIndex> =>
  Effect.gen(function* () {
    const cache = yield* Ref.make<
      { readonly grants: ReadonlyMap<string, WardenGrant>; readonly fetchedAt: number } | undefined
    >(undefined);

    const active = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const cached = yield* Ref.get(cache);
      if (cached !== undefined && now - cached.fetchedAt < GRANT_TTL_MS) return cached.grants;
      const raw = yield* client.callTool("warden_grants_list", {});
      const grants = yield* Effect.try({
        try: () => decodeWardenGrants(raw),
        catch: (cause) =>
          cause instanceof PulseWardenError
            ? cause
            : new PulseWardenError("protocol", "Pulse Go returned grants that could not be read."),
      });
      yield* Ref.set(cache, { grants, fetchedAt: now });
      return grants;
    });

    return { active, invalidate: Ref.set(cache, undefined) };
  });

export interface WardenMaterialSource {
  /** Resolves every ref, isolating failures so one bad credential cannot sink a turn. */
  readonly resolve: (
    refs: readonly string[],
  ) => Effect.Effect<ReadonlyMap<string, WardenMaterial>, never>;
}

/** Compatibility boundary for stored Warden references; never fetches or caches material. */
export const makeWardenMaterialSource = (
  _client: PulseWardenClientShape,
  _index: WardenGrantIndex,
): Effect.Effect<WardenMaterialSource> =>
  Effect.succeed({
    resolve: (refs) =>
      Effect.succeed(
        new Map<string, WardenMaterial>(
          refs.map((ref) => [
            ref,
            {
              ok: false,
              reason: "warden-unavailable",
              message: WARDEN_ISOLATED_EXECUTION_REQUIRED,
            },
          ]),
        ),
      ),
  });
