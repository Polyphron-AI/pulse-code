# MCP Warden Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a managed MCP connection reference a Pulse Go Warden credential by URN, so the server releases the material from Pulse Go at turn preparation instead of storing it.

**Architecture:** A third value kind (`warden`) flows through contracts, the persisted `pulse-mcp.json` (as `warden-ref`), and the web editor. On the server a thin JSON client (`PulseWardenClient`) talks to Pulse Go, a grant index caches the active grant list for 30 seconds, and a material source releases each referenced credential and splices it into the resolved connection exactly where a stored secret would go. Per-connection Warden failures surface as `failed` prepared connections with a typed `reason`, so the existing send pause handles them.

**Tech Stack:** TypeScript, Effect (effect-smol; read `.repos/effect-smol/LLMS.md` before writing Effect code), Effect Schema and Rpc in `packages/contracts`, Node `fetch`, `@effect/vitest` on the server, `vite-plus/test` on the web, React with the existing `components/ui` primitives.

**Spec:** `docs/superpowers/specs/2026-09-18-mcp-warden-credentials-design.md`

## Global Constraints

- Start from a fresh worktree on freshly fetched `origin/develop`. Never work on `main`.
- Credential URN pattern, verbatim: `^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$`.
- PAT secret name in the server secret store: `pulse-warden-pat`. The PAT is never returned to any client and never logged.
- Released material is never persisted and never logged. Logs record reason and credential URN only.
- Warden call timeout: 5 seconds per call. Release concurrency: 4. Grant index cache: 30 seconds.
- Grant matches only when `status === "active"` and `scope === credentialRef` verbatim.
- Failed prepared connection reason codes, verbatim: `warden-not-configured`, `warden-unauthorized`, `warden-grant-required`, `warden-unavailable`.
- Pause copy, verbatim from the spec error table:
  - `warden-not-configured`: `Configure Pulse Go Warden in Settings > MCP.`
  - `warden-unauthorized` (HTTP 401): `Pulse Go rejected the token for this environment. Replace it in Settings.`
  - `warden-unauthorized` (other 4xx): `Pulse Go denied the release: <server message>.`
  - `warden-grant-required`: `Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry.`
  - `warden-unavailable`: `Pulse Go Warden is unreachable. Retry.`
- New RPC methods: `pulse.mcp.warden.get` (read scope), `pulse.mcp.warden.set`, `pulse.mcp.warden.test`, `pulse.mcp.warden.listCredentials` (operate scope for set and test; read scope for get and listCredentials).
- Capability flag: `pulseCapabilities.wardenCredentials`.
- No pulse-go changes, no MCP SDK dependency, no new npm dependencies.
- No repo-wide checks. Run `vp test run <file>` from the owning package directory and `vp run typecheck` from that package only.
- No em dashes in any authored prose, including code comments and docs.
- Conventional commit titles. Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Subagents run on Opus, never Sonnet. At most three spawned agents; one review of the frozen final revision.

## Two decisions the spec leaves to the plan

1. **Release memo.** `ProviderService.consumePulseMcpPreparation` re-resolves connections after `preparePulseMcp` to compare fingerprints, so a naive per-call release would hit Pulse Go twice per turn. The material source keeps released material in memory for 60 seconds keyed by `credentialRef` plus grant id. This stays within "release per turn" (one receipt per send) and revocation is still observed within a minute. The memo lives only inside `WardenMaterialSource`, the spec's swap point.
2. **Client error kinds to connection reasons.** The client distinguishes `denied` and `protocol`; the reason set does not. Map `denied` to `warden-unauthorized` with the "Pulse Go denied the release" copy, and `protocol` to `warden-unavailable` with `Pulse Go Warden returned an unexpected response. Retry.`

## File map

| File                                                                        | Responsibility                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/pulseMcp.ts`                                        | Value unions, Warden settings and credential schemas, reason codes, four new RPCs                        |
| `packages/contracts/src/rpc.ts`                                             | `WS_METHODS` entries for the four RPCs                                                                   |
| `packages/contracts/src/server.ts`                                          | `pulseCapabilities.wardenCredentials`                                                                    |
| `apps/server/src/auth/RpcAuthorization.ts`                                  | Scopes for the four RPCs                                                                                 |
| `apps/server/src/mcp/PulseWardenClient.ts` (new)                            | HTTP client for Pulse Go tool calls and release, error mapping                                           |
| `apps/server/src/mcp/PulseWardenMaterial.ts` (new)                          | Grant index, material source, reason mapping                                                             |
| `apps/server/src/mcp/PulseMcpConfigService.ts`                              | `warden-ref` stored values, Warden settings, PAT secret, splicing at resolution, per-connection failures |
| `apps/server/src/mcp/PulseMcpRpc.ts`                                        | Public `warden` value, four handlers                                                                     |
| `apps/server/src/provider/Layers/ProviderService.ts`                        | Consume `failures` from resolution                                                                       |
| `apps/server/src/ws.ts`                                                     | RPC wiring, capability flag                                                                              |
| `apps/web/src/mcp/mcpState.ts`                                              | Atoms for the four RPCs                                                                                  |
| `apps/web/src/mcp/mcpWardenForm.ts` (new)                                   | Pure helpers: settings input, grant badge label, worst grant, error copy                                 |
| `apps/web/src/mcp/McpWardenCard.tsx` (new)                                  | Origin, PAT, Test connection                                                                             |
| `apps/web/src/mcp/mcpForm.ts`                                               | `warden` draft kind                                                                                      |
| `apps/web/src/mcp/McpConnectionsPanel.tsx`                                  | Kind select, credential picker, list badge                                                               |
| `apps/web/src/mcp/McpConnectionsSettings.tsx`                               | Mount the card, pass credentials                                                                         |
| `apps/web/src/mcp/McpSendPause.tsx`, `useManagedMcpComposer.tsx`            | Pass `reason` through, Warden tag                                                                        |
| `docs/user/mcp-connections.md`, `docs/internals/pulse-next-mcp-behavior.md` | Warden section, one paragraph on per-turn release                                                        |
| `docs/internals/pulse-next-migration.json`                                  | `active` block for this feature                                                                          |

---

### Task 0: Worktree and ledger

**Files:**

- Modify: `docs/internals/pulse-next-migration.json` (the `active` block only)

- [ ] **Step 1: Create the worktree from fresh develop**

```bash
cd "F:/Dev Ops/T3/Pulse Code"
git fetch origin develop
git worktree add .worktrees/mcp-warden -b feat/mcp-warden-credentials origin/develop
cd .worktrees/mcp-warden
vp i
```

Expected: install completes. The `dbus-next` patch warning is harmless.

- [ ] **Step 2: Update the ledger active block**

Replace the `active` object at the top of `docs/internals/pulse-next-migration.json` with:

```json
{
  "policyVersion": "2026-09-17",
  "feature": "mcp-warden-credentials",
  "state": "in-progress",
  "branch": "feat/mcp-warden-credentials",
  "baseRevision": "<output of git rev-parse --short=10 origin/develop>",
  "implementationRevision": null,
  "spec": "docs/superpowers/specs/2026-09-18-mcp-warden-credentials-design.md",
  "plan": "docs/superpowers/plans/2026-09-18-mcp-warden-credentials.md",
  "acceptance": [
    "Grant matches only on exact scope and active status; pending and expired grants do not match",
    "Releases for several refs run in parallel and land in the right header or env slot for http and stdio",
    "Each spec error row yields the mapped reason on that connection only",
    "Missing PAT yields warden-not-configured without a network call",
    "Grant index cache expires after 30 seconds under the test clock",
    "pulse.mcp.warden.set stores the PAT in the secret store, public settings never expose it, empty PAT removes it",
    "Warden value round-trips through upsert, list, and public view",
    "Latency: two Warden values add p50 under 400 ms and p95 under 1 s against a local Pulse Go, else swap to expiry-scoped caching"
  ],
  "completionBlockers": [],
  "evidence": null,
  "nextAction": "Execute plan Task 1 (contracts).",
  "updatedAt": "<today, YYYY-MM-DD>"
}
```

- [ ] **Step 3: Commit**

```bash
git add docs/internals/pulse-next-migration.json
git commit -m "docs(ledger): start MCP Warden credentials feature

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Contracts

**Files:**

- Modify: `packages/contracts/src/pulseMcp.ts`
- Modify: `packages/contracts/src/rpc.ts:276-292`
- Modify: `packages/contracts/src/server.ts:548-563`
- Modify: `apps/server/src/auth/RpcAuthorization.ts:23-39`
- Test: `packages/contracts/src/pulseMcp.test.ts`

**Interfaces:**

- Produces: `WardenCredentialRef` (string schema), `PulseMcpWardenFailureReason`, `PulseMcpWardenSettings`, `PulseMcpWardenSettingsInput`, `PulseMcpWardenCredential`, `PulseMcpWardenTestResult`, `PulseMcpWardenError` (tagged error with `kind`), `PULSE_MCP_METHODS.wardenGet | wardenSet | wardenTest | wardenListCredentials`, `WS_METHODS.pulseMcpWardenGet | pulseMcpWardenSet | pulseMcpWardenTest | pulseMcpWardenListCredentials`.

- [ ] **Step 1: Write the failing contract tests**

Append to `packages/contracts/src/pulseMcp.test.ts` (keep the existing imports and add the new names to the import from `./pulseMcp.ts`):

```ts
import * as Schema from "effect/Schema";
import {
  PulseMcpConnection,
  PulseMcpConnectionInput,
  PulseMcpPrepareTurnResult,
  PulseMcpWardenCredential,
  PulseMcpWardenSettings,
} from "./pulseMcp.ts";

describe("Pulse MCP Warden contracts", () => {
  it("accepts a warden value by credential URN and rejects other URNs", () => {
    const decode = Schema.decodeUnknownSync(PulseMcpConnectionInput);
    const input = decode({
      id: "github",
      name: "GitHub",
      config: {
        transport: "http",
        url: "https://example.test/mcp",
        headers: {
          Authorization: { type: "warden", credentialRef: "urn:pulse:acme:credential:gh-token" },
        },
      },
    });
    expect(input.config.transport === "http" && input.config.headers?.Authorization).toEqual({
      type: "warden",
      credentialRef: "urn:pulse:acme:credential:gh-token",
    });
    expect(() =>
      decode({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test/mcp",
          headers: { Authorization: { type: "warden", credentialRef: "urn:pulse:acme:secret:x" } },
        },
      }),
    ).toThrow();
  });

  it("exposes warden values publicly by URN without a configured flag", () => {
    const connection = Schema.decodeUnknownSync(PulseMcpConnection)({
      id: "github",
      name: "GitHub",
      config: {
        transport: "http",
        url: "https://example.test/mcp",
        headers: {
          Authorization: { type: "warden", credentialRef: "urn:pulse:acme:credential:gh-token" },
        },
      },
    });
    expect(
      connection.config.transport === "http" && connection.config.headers.Authorization,
    ).toEqual({ type: "warden", credentialRef: "urn:pulse:acme:credential:gh-token" });
  });

  it("decodes warden settings, credentials, and failure reasons", () => {
    expect(
      Schema.decodeUnknownSync(PulseMcpWardenSettings)({
        origin: "https://go.example.test",
        patConfigured: true,
        principal: { id: "usr_1", name: "Ops bot" },
      }).principal?.name,
    ).toBe("Ops bot");
    expect(
      Schema.decodeUnknownSync(PulseMcpWardenCredential)({
        credentialRef: "urn:pulse:acme:credential:gh-token",
        resourceRef: "urn:pulse:acme:resource:github",
        available: true,
        grant: { status: "active", expiresAt: "2026-09-25T00:00:00.000Z" },
      }).grant.status,
    ).toBe("active");
    const result = Schema.decodeUnknownSync(PulseMcpPrepareTurnResult)({
      status: "failed",
      selectedConnectionIds: ["github"],
      connections: [
        {
          connectionId: "github",
          name: "GitHub",
          status: "failed",
          reason: "warden-grant-required",
          message: "Pulse Go has no active grant for this credential.",
        },
      ],
    });
    expect(
      result.status === "failed" &&
        result.connections[0]?.status === "failed" &&
        result.connections[0].reason,
    ).toBe("warden-grant-required");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/contracts && vp test run src/pulseMcp.test.ts`
Expected: FAIL, `PulseMcpWardenSettings` is not exported and the `warden` value type is rejected.

- [ ] **Step 3: Add the schemas to `packages/contracts/src/pulseMcp.ts`**

Below `const Value = ...` (line 11) add:

```ts
export const WardenCredentialRef = Schema.String.check(
  Schema.isPattern(/^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$/),
);
export type WardenCredentialRef = typeof WardenCredentialRef.Type;
const WardenValue = Schema.Struct({
  type: Schema.Literal("warden"),
  credentialRef: WardenCredentialRef,
});
```

Add `WardenValue` to both unions:

```ts
const Values = Schema.Record(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  Schema.Union([
    Schema.Struct({ type: Schema.Literal("literal"), value: Value }),
    Schema.Struct({ type: Schema.Literal("secret"), value: Value }),
    Schema.Struct({ type: Schema.Literal("retain-secret") }),
    WardenValue,
  ]),
).check(Schema.isMaxProperties(128));

const PublicValue = Schema.Union([
  Schema.Struct({ type: Schema.Literal("literal"), value: Value }),
  Schema.Struct({ type: Schema.Literal("secret"), configured: Schema.Literal(true) }),
  WardenValue,
]);
```

After `PulseMcpError` add:

```ts
export const PulseMcpWardenErrorKind = Schema.Literals([
  "not-configured",
  "unauthorized",
  "unavailable",
  "denied",
  "protocol",
]);
export type PulseMcpWardenErrorKind = typeof PulseMcpWardenErrorKind.Type;

/** Typed Warden failures for the test and credential listing RPCs. Never carries the PAT or material. */
export class PulseMcpWardenError extends Schema.TaggedError<PulseMcpWardenError>()(
  "PulseMcpWardenError",
  { kind: PulseMcpWardenErrorKind, message: Schema.String },
) {}

const WardenPrincipal = Schema.Struct({ id: Schema.String, name: Schema.String });
export const PulseMcpWardenSettings = Schema.Struct({
  origin: Schema.String,
  patConfigured: Schema.Boolean,
  principal: Schema.optionalKey(WardenPrincipal),
});
export type PulseMcpWardenSettings = typeof PulseMcpWardenSettings.Type;

/** Empty `pat` clears the stored token. Omitted `pat` keeps it. */
export const PulseMcpWardenSettingsInput = Schema.Struct({
  origin: Schema.String.check(Schema.isMaxLength(2_048)),
  pat: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4_096))),
});
export type PulseMcpWardenSettingsInput = typeof PulseMcpWardenSettingsInput.Type;

export const PulseMcpWardenTestResult = Schema.Struct({ principal: WardenPrincipal });
export type PulseMcpWardenTestResult = typeof PulseMcpWardenTestResult.Type;

export const PulseMcpWardenCredential = Schema.Struct({
  credentialRef: WardenCredentialRef,
  resourceRef: Schema.String,
  available: Schema.Boolean,
  grant: Schema.Struct({
    status: Schema.Literals(["active", "pending", "none"]),
    expiresAt: Schema.optionalKey(Schema.String),
  }),
});
export type PulseMcpWardenCredential = typeof PulseMcpWardenCredential.Type;

export const PulseMcpWardenFailureReason = Schema.Literals([
  "warden-not-configured",
  "warden-unauthorized",
  "warden-grant-required",
  "warden-unavailable",
]);
export type PulseMcpWardenFailureReason = typeof PulseMcpWardenFailureReason.Type;
```

Extend the method table:

```ts
  setDiscoveryFollow: "pulse.mcp.setDiscoveryFollow",
  wardenGet: "pulse.mcp.warden.get",
  wardenSet: "pulse.mcp.warden.set",
  wardenTest: "pulse.mcp.warden.test",
  wardenListCredentials: "pulse.mcp.warden.listCredentials",
} as const;
```

Widen the failed prepared connection:

```ts
  Schema.Struct({
    ...PreparedConnectionBase,
    status: Schema.Literal("failed"),
    message: Schema.String,
    /** Present for Warden failures so clients can point at the right fix. */
    reason: Schema.optionalKey(PulseMcpWardenFailureReason),
  }),
```

Append four RPCs to `PulseMcpRpcs` before the closing `] as const;`:

```ts
  Rpc.make(PULSE_MCP_METHODS.wardenGet, {
    payload: Schema.Struct({}),
    success: PulseMcpWardenSettings,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.wardenSet, {
    payload: PulseMcpWardenSettingsInput,
    success: PulseMcpWardenSettings,
    error: errors,
  }),
  Rpc.make(PULSE_MCP_METHODS.wardenTest, {
    payload: Schema.Struct({}),
    success: PulseMcpWardenTestResult,
    error: Schema.Union([PulseMcpWardenError, PulseMcpError, EnvironmentAuthorizationError]),
  }),
  Rpc.make(PULSE_MCP_METHODS.wardenListCredentials, {
    payload: Schema.Struct({}),
    success: Schema.Array(PulseMcpWardenCredential).check(Schema.isMaxLength(512)),
    error: Schema.Union([PulseMcpWardenError, PulseMcpError, EnvironmentAuthorizationError]),
  }),
```

- [ ] **Step 4: Register WS methods, scopes, and the capability flag**

`packages/contracts/src/rpc.ts`, after `pulseMcpSetDiscoveryFollow`:

```ts
  pulseMcpWardenGet: PULSE_MCP_METHODS.wardenGet,
  pulseMcpWardenSet: PULSE_MCP_METHODS.wardenSet,
  pulseMcpWardenTest: PULSE_MCP_METHODS.wardenTest,
  pulseMcpWardenListCredentials: PULSE_MCP_METHODS.wardenListCredentials,
```

`packages/contracts/src/server.ts`, inside `pulseCapabilities` after `openCodeManagedMcp`:

```ts
      wardenCredentials: Schema.optionalKey(Schema.Boolean),
```

`apps/server/src/auth/RpcAuthorization.ts`, after `pulseMcpSetDiscoveryFollow`:

```ts
  [WS_METHODS.pulseMcpWardenGet]: AuthOrchestrationReadScope,
  [WS_METHODS.pulseMcpWardenSet]: AuthOrchestrationOperateScope,
  [WS_METHODS.pulseMcpWardenTest]: AuthOrchestrationOperateScope,
  [WS_METHODS.pulseMcpWardenListCredentials]: AuthOrchestrationReadScope,
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd packages/contracts && vp test run src/pulseMcp.test.ts && vp run typecheck`
Expected: PASS. The server typecheck will fail until Task 5 wires the handlers; that is expected and not run here.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/pulseMcp.ts packages/contracts/src/pulseMcp.test.ts packages/contracts/src/rpc.ts packages/contracts/src/server.ts apps/server/src/auth/RpcAuthorization.ts
git commit -m "feat(contracts): add Warden credential values and RPCs to Pulse MCP

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: PulseWardenClient

**Files:**

- Create: `apps/server/src/mcp/PulseWardenClient.ts`
- Test: `apps/server/src/mcp/PulseWardenClient.test.ts`

**Interfaces:**

- Produces:

```ts
export type PulseWardenErrorKind =
  "not-configured" | "unauthorized" | "unavailable" | "denied" | "protocol";
export class PulseWardenError extends Error {
  readonly _tag: "PulseWardenError";
  readonly kind: PulseWardenErrorKind;
  readonly status?: number;
}
export interface PulseWardenAccess {
  readonly origin: string;
  readonly pat: string;
}
export interface PulseWardenClientShape {
  readonly callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Effect.Effect<unknown, PulseWardenError>;
  readonly release: (body: {
    requestId: string;
    grantId: string;
    credentialRef: string;
    scope: string;
  }) => Effect.Effect<
    { credentialRef: string; material: string; requestDigest: string },
    PulseWardenError
  >;
}
export const makePulseWardenClient: (
  access: PulseWardenAccess,
  options?: { fetch?: typeof fetch; timeoutMs?: number },
) => PulseWardenClientShape;
export const wardenArray: (value: unknown, key: string) => readonly unknown[]; // accepts a bare array or { [key]: array }
```

- [ ] **Step 1: Write the failing client tests**

Create `apps/server/src/mcp/PulseWardenClient.test.ts`:

```ts
import * as NodeHttp from "node:http";
import type * as NodeNet from "node:net";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { makePulseWardenClient, PulseWardenError, wardenArray } from "./PulseWardenClient.ts";

interface Seen {
  readonly path: string;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

const withServer = async (
  handler: (request: Seen, response: NodeHttp.ServerResponse) => void,
  run: (origin: string, seen: Seen[]) => Promise<void>,
) => {
  const seen: Seen[] = [];
  const server = NodeHttp.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const record: Seen = {
        path: request.url ?? "",
        authorization: request.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      };
      seen.push(record);
      handler(record, response);
    });
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as NodeNet.AddressInfo).port));
  });
  try {
    await run(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const json = (response: NodeHttp.ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const failureOf = async <A>(effect: Effect.Effect<A, PulseWardenError>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const cause = exit.cause;
  const error = cause.reasons.find((entry) => entry._tag === "Fail")?.error;
  if (!(error instanceof PulseWardenError)) throw new Error("expected PulseWardenError");
  return error;
};

describe("PulseWardenClient", () => {
  it("posts a JSON-RPC tools/call with the bearer token and returns structured content", () =>
    withServer(
      (request, response) =>
        json(response, 200, {
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: '{"principal":{"id":"u1","name":"Ops"}}' }],
            structuredContent: { principal: { id: "u1", name: "Ops" } },
          },
        }),
      async (origin, seen) => {
        const client = makePulseWardenClient({ origin, pat: "pat-secret" });
        const result = await Effect.runPromise(client.callTool("warden_capabilities", {}));
        expect(result).toEqual({ principal: { id: "u1", name: "Ops" } });
        expect(seen[0]?.path).toBe("/mcp");
        expect(seen[0]?.authorization).toBe("Bearer pat-secret");
        expect(seen[0]?.body).toMatchObject({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "warden_capabilities", arguments: {} },
        });
      },
    ));

  it("falls back to parsing text content when structuredContent is absent", () =>
    withServer(
      (_, response) =>
        json(response, 200, {
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: '[{"id":"g1"}]' }] },
        }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        expect(await Effect.runPromise(client.callTool("warden_grants_list", {}))).toEqual([
          { id: "g1" },
        ]);
      },
    ));

  it("maps HTTP 401 to unauthorized without echoing the token", () =>
    withServer(
      (_, response) => json(response, 401, { error: "unauthorized" }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat-secret" });
        const error = await failureOf(client.callTool("warden_capabilities", {}));
        expect(error.kind).toBe("unauthorized");
        expect(error.message).not.toContain("pat-secret");
      },
    ));

  it("maps 503 warden_unavailable and network failures to unavailable", async () => {
    await withServer(
      (_, response) => json(response, 503, { error: "warden_unavailable" }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        expect((await failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(
          "unavailable",
        );
      },
    );
    const closed = makePulseWardenClient({ origin: "http://127.0.0.1:1", pat: "pat" });
    expect((await failureOf(closed.callTool("warden_capabilities", {}))).kind).toBe("unavailable");
  });

  it("maps other 4xx to denied with the server message and malformed JSON to protocol", async () => {
    await withServer(
      (_, response) =>
        json(response, 403, { error: "invalid_project_id", message: "Project not allowed" }),
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        const error = await failureOf(
          client.release({ requestId: "r", grantId: "g", credentialRef: "c", scope: "c" }),
        );
        expect(error.kind).toBe("denied");
        expect(error.message).toBe("Project not allowed");
      },
    );
    await withServer(
      (_, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("not json");
      },
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        expect((await failureOf(client.callTool("warden_capabilities", {}))).kind).toBe("protocol");
      },
    );
  });

  it("posts a release and returns the material", () =>
    withServer(
      (request, response) =>
        request.path === "/api/warden/release"
          ? json(response, 200, {
              credentialRef: "urn:pulse:acme:credential:gh",
              material: "ghp_material",
              requestDigest: "sha256:abc",
            })
          : json(response, 404, {}),
      async (origin, seen) => {
        const client = makePulseWardenClient({ origin, pat: "pat" });
        const released = await Effect.runPromise(
          client.release({
            requestId: "req-1",
            grantId: "grant-1",
            credentialRef: "urn:pulse:acme:credential:gh",
            scope: "urn:pulse:acme:credential:gh",
          }),
        );
        expect(released.material).toBe("ghp_material");
        expect(seen[0]?.body).toEqual({
          requestId: "req-1",
          grantId: "grant-1",
          credentialRef: "urn:pulse:acme:credential:gh",
          scope: "urn:pulse:acme:credential:gh",
        });
      },
    ));

  it("times out slow calls as unavailable", () =>
    withServer(
      () => {
        /* never respond */
      },
      async (origin) => {
        const client = makePulseWardenClient({ origin, pat: "pat" }, { timeoutMs: 50 });
        expect((await failureOf(client.callTool("warden_capabilities", {}))).kind).toBe(
          "unavailable",
        );
      },
    ));

  it("reads a bare array or a keyed array", () => {
    expect(wardenArray([1], "grants")).toEqual([1]);
    expect(wardenArray({ grants: [2] }, "grants")).toEqual([2]);
    expect(() => wardenArray({ other: [] }, "grants")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/server && vp test run src/mcp/PulseWardenClient.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `apps/server/src/mcp/PulseWardenClient.ts`**

```ts
// @effect-diagnostics preferSchemaOverJson:off -- Pulse Go responses are validated at this module seam.
import * as Effect from "effect/Effect";

export type PulseWardenErrorKind =
  "not-configured" | "unauthorized" | "unavailable" | "denied" | "protocol";

/** Never carries the PAT or released material. `message` is safe to show to an operator. */
export class PulseWardenError extends Error {
  readonly _tag = "PulseWardenError";
  readonly kind: PulseWardenErrorKind;
  readonly status: number | undefined;

  constructor(kind: PulseWardenErrorKind, message: string, status?: number) {
    super(message);
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
  if (status === 401 || errorCode(body) === "unauthorized") {
    return new PulseWardenError("unauthorized", "Pulse Go rejected the token.", status);
  }
  const code = errorCode(body);
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
    return JSON.parse(text);
  } catch {
    throw new PulseWardenError("protocol", "Pulse Go returned a response that was not JSON.");
  }
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
    const text = Array.isArray(result.content)
      ? result.content.find((entry) => isRecord(entry) && typeof entry.text === "string")
      : undefined;
    throw new PulseWardenError(
      "denied",
      isRecord(text) && typeof text.text === "string" ? text.text : "Pulse Go tool call failed.",
    );
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (Array.isArray(result.content)) {
    const text = result.content.find((entry) => isRecord(entry) && typeof entry.text === "string");
    if (isRecord(text) && typeof text.text === "string") return parseJson(text.text);
  }
  throw new PulseWardenError("protocol", "Pulse Go tool result had no content.");
};

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
            parsed = text ? JSON.parse(text) : undefined;
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
    release: (body) =>
      post("/api/warden/release", body).pipe(
        Effect.flatMap((result) =>
          isRecord(result) &&
          typeof result.credentialRef === "string" &&
          typeof result.material === "string" &&
          typeof result.requestDigest === "string"
            ? Effect.succeed({
                credentialRef: result.credentialRef,
                material: result.material,
                requestDigest: result.requestDigest,
              })
            : Effect.fail(
                new PulseWardenError("protocol", "Pulse Go release response was malformed."),
              ),
        ),
      ),
  };
};
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/server && vp test run src/mcp/PulseWardenClient.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp/PulseWardenClient.ts apps/server/src/mcp/PulseWardenClient.test.ts
git commit -m "feat(server): add Pulse Go Warden HTTP client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Grant index and material source

**Files:**

- Create: `apps/server/src/mcp/PulseWardenMaterial.ts`
- Test: `apps/server/src/mcp/PulseWardenMaterial.test.ts`

**Interfaces:**

- Consumes: `PulseWardenClientShape`, `PulseWardenError`, `wardenArray` from Task 2.
- Produces:

```ts
export interface WardenGrant {
  readonly id: string;
  readonly scope: string;
  readonly status: string;
  readonly expiresAt?: string;
}
export interface WardenGrantIndex {
  readonly active: Effect.Effect<ReadonlyMap<string, WardenGrant>, PulseWardenError>;
  readonly invalidate: Effect.Effect<void>;
}
export const makeWardenGrantIndex: (
  client: PulseWardenClientShape,
  options?: { ttlMs?: number },
) => Effect.Effect<WardenGrantIndex>;
export type WardenResolution =
  | { readonly ok: true; readonly material: string }
  | { readonly ok: false; readonly reason: PulseMcpWardenFailureReason; readonly message: string };
export interface WardenMaterialSource {
  readonly resolve: (
    refs: readonly string[],
  ) => Effect.Effect<ReadonlyMap<string, WardenResolution>>;
}
export const makeWardenMaterialSource: (
  client: PulseWardenClientShape,
  grants: WardenGrantIndex,
  options?: { memoMs?: number; concurrency?: number },
) => Effect.Effect<WardenMaterialSource>;
export const wardenFailure: (error: PulseWardenError) => {
  reason: PulseMcpWardenFailureReason;
  message: string;
};
export const decodeWardenGrants: (value: unknown) => readonly WardenGrant[];
```

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/mcp/PulseWardenMaterial.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { PulseWardenError, type PulseWardenClientShape } from "./PulseWardenClient.ts";
import {
  makeWardenGrantIndex,
  makeWardenMaterialSource,
  wardenFailure,
} from "./PulseWardenMaterial.ts";

const REF_A = "urn:pulse:acme:credential:a";
const REF_B = "urn:pulse:acme:credential:b";

const fakeClient = (input: {
  readonly grants?: unknown;
  readonly release?: (body: { credentialRef: string }) => Effect.Effect<string, PulseWardenError>;
}) => {
  const calls = { grants: 0, releases: [] as string[] };
  const client: PulseWardenClientShape = {
    callTool: (name) => {
      if (name !== "warden_grants_list") return Effect.die(`unexpected tool ${name}`);
      calls.grants += 1;
      return Effect.succeed(input.grants ?? []);
    },
    release: (body) => {
      calls.releases.push(body.credentialRef);
      return (input.release ?? (() => Effect.succeed(`material-${body.credentialRef}`)))(body).pipe(
        Effect.map((material) => ({
          credentialRef: body.credentialRef,
          material,
          requestDigest: "sha256:x",
        })),
      );
    },
  };
  return { client, calls };
};

describe("WardenGrantIndex", () => {
  it.effect("matches only active grants with an exact scope and caches for 30 seconds", () =>
    Effect.gen(function* () {
      const { client, calls } = fakeClient({
        grants: {
          grants: [
            { id: "g1", scope: REF_A, status: "active", expiresAt: "2030-01-01T00:00:00Z" },
            { id: "g2", scope: REF_B, status: "pending" },
            { id: "g3", scope: "urn:pulse:acme:project:p", status: "active" },
            { id: "g4", scope: REF_B, status: "expired" },
          ],
        },
      });
      const index = yield* makeWardenGrantIndex(client);
      const active = yield* index.active;
      expect([...active.keys()]).toEqual([REF_A]);
      expect(active.get(REF_A)?.id).toBe("g1");
      yield* index.active;
      expect(calls.grants).toBe(1);
      yield* TestClock.adjust(29_999);
      yield* index.active;
      expect(calls.grants).toBe(1);
      yield* TestClock.adjust(1);
      yield* index.active;
      expect(calls.grants).toBe(2);
    }),
  );
});

describe("WardenMaterialSource", () => {
  it.effect(
    "releases each ref once with the matching grant and memoizes within the turn window",
    () =>
      Effect.gen(function* () {
        const { client, calls } = fakeClient({
          grants: [
            { id: "g1", scope: REF_A, status: "active" },
            { id: "g2", scope: REF_B, status: "active" },
          ],
        });
        const index = yield* makeWardenGrantIndex(client);
        const source = yield* makeWardenMaterialSource(client, index);
        const first = yield* source.resolve([REF_A, REF_B, REF_A]);
        expect(first.get(REF_A)).toEqual({ ok: true, material: `material-${REF_A}` });
        expect(first.get(REF_B)).toEqual({ ok: true, material: `material-${REF_B}` });
        expect(calls.releases.toSorted()).toEqual([REF_A, REF_B]);
        yield* source.resolve([REF_A]);
        expect(calls.releases.length).toBe(2);
        yield* TestClock.adjust(60_000);
        yield* source.resolve([REF_A]);
        expect(calls.releases.length).toBe(3);
      }),
  );

  it.effect(
    "reports grant-required for refs without an active grant and keeps others resolving",
    () =>
      Effect.gen(function* () {
        const { client } = fakeClient({ grants: [{ id: "g1", scope: REF_A, status: "active" }] });
        const index = yield* makeWardenGrantIndex(client);
        const source = yield* makeWardenMaterialSource(client, index);
        const resolved = yield* source.resolve([REF_A, REF_B]);
        expect(resolved.get(REF_A)?.ok).toBe(true);
        expect(resolved.get(REF_B)).toEqual({
          ok: false,
          reason: "warden-grant-required",
          message:
            "Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry.",
        });
      }),
  );

  it.effect("maps a failed grant listing onto every ref", () =>
    Effect.gen(function* () {
      const client: PulseWardenClientShape = {
        callTool: () =>
          Effect.fail(new PulseWardenError("unauthorized", "Pulse Go rejected the token.", 401)),
        release: () => Effect.die("unreachable"),
      };
      const index = yield* makeWardenGrantIndex(client);
      const source = yield* makeWardenMaterialSource(client, index);
      const resolved = yield* source.resolve([REF_A, REF_B]);
      expect(resolved.get(REF_A)).toEqual({
        ok: false,
        reason: "warden-unauthorized",
        message: "Pulse Go rejected the token for this environment. Replace it in Settings.",
      });
      expect(resolved.get(REF_B)?.ok).toBe(false);
    }),
  );

  it.effect("maps a release failure onto only that ref", () =>
    Effect.gen(function* () {
      const { client } = fakeClient({
        grants: [
          { id: "g1", scope: REF_A, status: "active" },
          { id: "g2", scope: REF_B, status: "active" },
        ],
        release: (body) =>
          body.credentialRef === REF_B
            ? Effect.fail(new PulseWardenError("denied", "Project not allowed", 403))
            : Effect.succeed("ok"),
      });
      const index = yield* makeWardenGrantIndex(client);
      const source = yield* makeWardenMaterialSource(client, index);
      const resolved = yield* source.resolve([REF_A, REF_B]);
      expect(resolved.get(REF_A)).toEqual({ ok: true, material: "ok" });
      expect(resolved.get(REF_B)).toEqual({
        ok: false,
        reason: "warden-unauthorized",
        message: "Pulse Go denied the release: Project not allowed.",
      });
    }),
  );
});

describe("wardenFailure", () => {
  it("maps every client kind to a reason and pause copy", () => {
    expect(wardenFailure(new PulseWardenError("not-configured", "x"))).toEqual({
      reason: "warden-not-configured",
      message: "Configure Pulse Go Warden in Settings > MCP.",
    });
    expect(wardenFailure(new PulseWardenError("unavailable", "x"))).toEqual({
      reason: "warden-unavailable",
      message: "Pulse Go Warden is unreachable. Retry.",
    });
    expect(wardenFailure(new PulseWardenError("protocol", "x"))).toEqual({
      reason: "warden-unavailable",
      message: "Pulse Go Warden returned an unexpected response. Retry.",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/server && vp test run src/mcp/PulseWardenMaterial.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `apps/server/src/mcp/PulseWardenMaterial.ts`**

```ts
import type { PulseMcpWardenFailureReason } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { PulseWardenError, wardenArray, type PulseWardenClientShape } from "./PulseWardenClient.ts";

export interface WardenGrant {
  readonly id: string;
  readonly scope: string;
  readonly status: string;
  readonly expiresAt?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const decodeWardenGrants = (value: unknown): readonly WardenGrant[] =>
  wardenArray(value, "grants").flatMap((entry) =>
    isRecord(entry) &&
    typeof entry.id === "string" &&
    typeof entry.scope === "string" &&
    typeof entry.status === "string"
      ? [
          {
            id: entry.id,
            scope: entry.scope,
            status: entry.status,
            ...(typeof entry.expiresAt === "string" ? { expiresAt: entry.expiresAt } : {}),
          },
        ]
      : [],
  );

export interface WardenGrantIndex {
  /** Active grants keyed by scope. Pulse Go's scope for a credential grant is the credential URN. */
  readonly active: Effect.Effect<ReadonlyMap<string, WardenGrant>, PulseWardenError>;
  readonly invalidate: Effect.Effect<void>;
}

export const makeWardenGrantIndex = (
  client: PulseWardenClientShape,
  options: { readonly ttlMs?: number } = {},
) =>
  Effect.gen(function* () {
    const ttlMs = options.ttlMs ?? 30_000;
    const cache = yield* Ref.make<
      { readonly expiresAt: number; readonly grants: ReadonlyMap<string, WardenGrant> } | undefined
    >(undefined);
    const load = client.callTool("warden_grants_list", {}).pipe(
      Effect.flatMap((raw) =>
        Effect.try({
          try: () => decodeWardenGrants(raw),
          catch: (cause) =>
            cause instanceof PulseWardenError
              ? cause
              : new PulseWardenError("protocol", "Pulse Go grants could not be decoded."),
        }),
      ),
      Effect.map((grants) => {
        const active = new Map<string, WardenGrant>();
        for (const grant of grants) {
          if (grant.status === "active" && !active.has(grant.scope)) active.set(grant.scope, grant);
        }
        return active as ReadonlyMap<string, WardenGrant>;
      }),
    );
    return {
      active: Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const cached = yield* Ref.get(cache);
        if (cached !== undefined && cached.expiresAt > now) return cached.grants;
        const grants = yield* load;
        yield* Ref.set(cache, { expiresAt: now + ttlMs, grants });
        return grants;
      }),
      invalidate: Ref.set(cache, undefined),
    } satisfies WardenGrantIndex;
  });

export type WardenResolution =
  | { readonly ok: true; readonly material: string }
  | { readonly ok: false; readonly reason: PulseMcpWardenFailureReason; readonly message: string };

export interface WardenMaterialSource {
  readonly resolve: (
    refs: readonly string[],
  ) => Effect.Effect<ReadonlyMap<string, WardenResolution>>;
}

export const GRANT_REQUIRED_MESSAGE =
  "Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry.";

/** Maps client failures onto the connection reason and the pause copy from the spec error table. */
export const wardenFailure = (
  error: PulseWardenError,
): { readonly reason: PulseMcpWardenFailureReason; readonly message: string } => {
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
        message: `Pulse Go denied the release: ${error.message.replace(/\.$/, "")}.`,
      };
    case "unavailable":
      return { reason: "warden-unavailable", message: "Pulse Go Warden is unreachable. Retry." };
    case "protocol":
      return {
        reason: "warden-unavailable",
        message: "Pulse Go Warden returned an unexpected response. Retry.",
      };
  }
};

/**
 * Releases material per turn. A short memo keyed by credential and grant lets the prepare and
 * consume steps of one send share a single release. Nothing outside this module sees the memo.
 */
export const makeWardenMaterialSource = (
  client: PulseWardenClientShape,
  grants: WardenGrantIndex,
  options: { readonly memoMs?: number; readonly concurrency?: number } = {},
) =>
  Effect.gen(function* () {
    const memoMs = options.memoMs ?? 60_000;
    const concurrency = options.concurrency ?? 4;
    const memo = yield* Ref.make(
      new Map<string, { readonly expiresAt: number; readonly material: string }>(),
    );
    const releaseOne = (ref: string, grant: WardenGrant): Effect.Effect<WardenResolution> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const key = `${ref}\n${grant.id}`;
        const cached = (yield* Ref.get(memo)).get(key);
        if (cached !== undefined && cached.expiresAt > now) {
          return { ok: true, material: cached.material } as const;
        }
        const released = yield* client.release({
          requestId: crypto.randomUUID(),
          grantId: grant.id,
          credentialRef: ref,
          scope: grant.scope,
        });
        yield* Ref.update(memo, (current) => {
          const next = new Map(current);
          next.set(key, { expiresAt: now + memoMs, material: released.material });
          return next;
        });
        return { ok: true, material: released.material } as const;
      }).pipe(
        Effect.catch((error) => Effect.succeed({ ok: false, ...wardenFailure(error) } as const)),
      );

    const resolve: WardenMaterialSource["resolve"] = (refs) =>
      Effect.gen(function* () {
        const unique = [...new Set(refs)];
        const result = new Map<string, WardenResolution>();
        if (unique.length === 0) return result;
        const active = yield* grants.active.pipe(
          Effect.map((map) => ({ ok: true as const, map })),
          Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
        );
        if (!active.ok) {
          const failure = { ok: false as const, ...wardenFailure(active.error) };
          for (const ref of unique) result.set(ref, failure);
          return result;
        }
        const resolved = yield* Effect.forEach(
          unique,
          (ref) => {
            const grant = active.map.get(ref);
            return grant === undefined
              ? Effect.succeed([
                  ref,
                  { ok: false, reason: "warden-grant-required", message: GRANT_REQUIRED_MESSAGE },
                ] as const)
              : releaseOne(ref, grant).pipe(Effect.map((entry) => [ref, entry] as const));
          },
          { concurrency },
        );
        for (const [ref, entry] of resolved) result.set(ref, entry);
        return result;
      });

    return { resolve } satisfies WardenMaterialSource;
  });
```

If `Effect.catch` does not exist under that name in the vendored effect-smol, check `.repos/effect-smol/LLMS.md` for the current catch-all combinator (`Effect.catch` is used in `PulseMcpConfigService.ts` today, so it should).

- [ ] **Step 4: Run the tests**

Run: `cd apps/server && vp test run src/mcp/PulseWardenMaterial.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp/PulseWardenMaterial.ts apps/server/src/mcp/PulseWardenMaterial.test.ts
git commit -m "feat(server): add Warden grant index and material source

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Config service: Warden settings, stored values, splicing, per-connection failures

**Files:**

- Modify: `apps/server/src/mcp/PulseMcpConfigService.ts`
- Modify: `apps/server/src/mcp/PulseMcpRpc.ts:17-18` (public value only; handlers are Task 5)
- Modify: `apps/server/src/provider/Layers/ProviderService.ts:1620-1660, 1857-1870, 1959-1970`
- Modify: `apps/server/src/provider/Layers/ProviderService.test.ts:454, 484` and any stub that returns an array from `resolveMcpConnections`
- Test: `apps/server/src/mcp/PulseMcpConfigService.test.ts`

**Interfaces:**

- Consumes: `makePulseWardenClient`, `PulseWardenError` (Task 2); `makeWardenGrantIndex`, `makeWardenMaterialSource`, `wardenFailure` (Task 3).
- Produces on `PulseMcpConfigServiceShape`:

```ts
readonly getWardenSettings: Effect.Effect<PulseMcpWardenSettings, PulseMcpConfigError>;
readonly setWardenSettings: (input: PulseMcpWardenSettingsInput) => Effect.Effect<PulseMcpWardenSettings, PulseMcpConfigError>;
readonly recordWardenPrincipal: (principal: { id: string; name: string }) => Effect.Effect<void, PulseMcpConfigError>;
/** None when origin or PAT is missing. */
readonly readWardenAccess: Effect.Effect<Option.Option<PulseWardenAccess>, PulseMcpConfigError>;
readonly resolveTurnConnections: (input) => Effect.Effect<PulseMcpTurnResolution, PulseMcpConfigError>;
```

```ts
export interface PulseMcpConnectionFailure {
  readonly connectionId: string;
  readonly name: string;
  readonly reason: PulseMcpWardenFailureReason;
  readonly message: string;
}
export interface PulseMcpTurnResolution {
  readonly connections: readonly PulseMcpResolvedConnection[];
  readonly failures: readonly PulseMcpConnectionFailure[];
}
export interface PulseMcpWardenReference {
  readonly type: "warden-ref";
  readonly credentialRef: string;
}
export type PulseMcpStoredValue =
  PulseMcpLiteralInput | PulseMcpSecretReference | PulseMcpWardenReference;
export interface PulseMcpWardenInput {
  readonly type: "warden";
  readonly credentialRef: string;
}
export const WARDEN_PAT_SECRET = "pulse-warden-pat";
```

- Layer option for tests: `PulseMcpConfig.layer` stays, plus `PulseMcpConfig.layerWith({ wardenClient: (access) => PulseWardenClientShape })` so tests can inject a fake client without a network.

- [ ] **Step 1: Write the failing tests**

Append to `apps/server/src/mcp/PulseMcpConfigService.test.ts` (add `import * as Option from "effect/Option";` is already present; add `import { PulseWardenError, type PulseWardenClientShape } from "./PulseWardenClient.ts";` and `import * as TestClock from "effect/testing/TestClock";`):

```ts
const REF_GH = "urn:pulse:acme:credential:gh-token";
const REF_DOCS = "urn:pulse:acme:credential:docs-token";

const wardenLayer = (client: PulseWardenClientShape, calls?: { count: number }) => {
  const pulse = PulseMcpConfig.layerWith({
    wardenClient: () => {
      if (calls) calls.count += 1;
      return client;
    },
  }).pipe(Layer.provide(secretLayer), Layer.provide(configLayer));
  return Layer.mergeAll(configLayer, secretLayer, pulse).pipe(
    Layer.provideMerge(NodeServices.layer),
  );
};

const grantingClient = (input: {
  readonly grants: readonly { id: string; scope: string; status: string }[];
  readonly releases?: string[];
  readonly fail?: (ref: string) => PulseWardenError | undefined;
}): PulseWardenClientShape => ({
  callTool: (name) =>
    name === "warden_grants_list"
      ? Effect.succeed({ grants: input.grants })
      : Effect.succeed({ principal: { id: "u1", name: "Ops" } }),
  release: (body) => {
    input.releases?.push(body.credentialRef);
    const failure = input.fail?.(body.credentialRef);
    return failure
      ? Effect.fail(failure)
      : Effect.succeed({
          credentialRef: body.credentialRef,
          material: `material:${body.credentialRef}`,
          requestDigest: "sha256:x",
        });
  },
});

const addWardenFixtures = Effect.fn(function* () {
  const service = yield* PulseMcpConfig.PulseMcpConfigService;
  yield* service.setWardenSettings({ origin: "https://go.example.test", pat: "pat-secret" });
  yield* service.upsertConnection({
    id: "github",
    name: "GitHub",
    config: {
      transport: "http",
      url: "https://mcp.example.test/github",
      headers: {
        Authorization: { type: "warden", credentialRef: REF_GH },
        "X-Pulse": { type: "literal", value: "enabled" },
      },
    },
  });
  yield* service.upsertConnection({
    id: "local_docs",
    name: "Local docs",
    config: {
      transport: "stdio",
      command: "docs-mcp",
      args: ["--stdio"],
      env: {
        DOCS_TOKEN: { type: "warden", credentialRef: REF_DOCS },
        DOCS_KEY: { type: "secret", value: "stored-secret" },
      },
    },
  });
  const instanceId = ProviderInstanceId.make("codex_warden");
  yield* service.setProviderDefault(instanceId, ["github", "local_docs"]);
  return { service, instanceId, threadId: ThreadId.make("thread-warden") };
});

describe("PulseMcpConfigService Warden", () => {
  it.effect("stores the PAT in the secret store and never exposes it", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const secrets = yield* ServerSecretStore.ServerSecretStore;
      expect(yield* service.getWardenSettings).toEqual({ origin: "", patConfigured: false });
      const set = yield* service.setWardenSettings({
        origin: "https://go.example.test/",
        pat: "pat-secret",
      });
      expect(set).toEqual({ origin: "https://go.example.test", patConfigured: true });
      expect(JSON.stringify(set)).not.toContain("pat-secret");
      const stored = yield* secrets.get(PulseMcpConfig.WARDEN_PAT_SECRET);
      expect(Option.isSome(stored) && new TextDecoder().decode(stored.value)).toBe("pat-secret");
      yield* service.recordWardenPrincipal({ id: "u1", name: "Ops" });
      expect((yield* service.getWardenSettings).principal).toEqual({ id: "u1", name: "Ops" });
      const kept = yield* service.setWardenSettings({ origin: "https://go.example.test" });
      expect(kept.patConfigured).toBe(true);
      const cleared = yield* service.setWardenSettings({
        origin: "https://go.example.test",
        pat: "",
      });
      expect(cleared.patConfigured).toBe(false);
      expect(Option.isNone(yield* secrets.get(PulseMcpConfig.WARDEN_PAT_SECRET))).toBe(true);
      expect(Option.isNone(yield* service.readWardenAccess)).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "round-trips a warden value through upsert and list without touching the secret store",
    () =>
      Effect.gen(function* () {
        const { service } = yield* addWardenFixtures();
        const listed = yield* service.listConnections;
        const github = listed.find(({ id }) => id === "github");
        expect(github?.config.transport === "http" && github.config.headers.Authorization).toEqual({
          type: "warden-ref",
          credentialRef: REF_GH,
        });
        yield* service.upsertConnection({
          id: "github",
          name: "GitHub",
          config: {
            transport: "http",
            url: "https://mcp.example.test/github",
            headers: { Authorization: { type: "secret", value: "now-a-secret" } },
          },
        });
        const again = (yield* service.listConnections).find(({ id }) => id === "github");
        expect(again?.config.transport === "http" && again.config.headers.Authorization?.type).toBe(
          "secret-ref",
        );
      }).pipe(Effect.provide(wardenLayer(grantingClient({ grants: [] })))),
  );

  it.effect("rejects retaining a secret over a warden value", () =>
    Effect.gen(function* () {
      const { service } = yield* addWardenFixtures();
      const exit = yield* Effect.exit(
        service.upsertConnection({
          id: "github",
          name: "GitHub",
          config: {
            transport: "http",
            url: "https://mcp.example.test/github",
            headers: { Authorization: { type: "retain-secret" } },
          },
        }),
      );
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(wardenLayer(grantingClient({ grants: [] })))),
  );

  it.effect("splices released material into http headers and stdio env in parallel", () =>
    Effect.gen(function* () {
      const releases: string[] = [];
      const { service, instanceId, threadId } = yield* addWardenFixtures();
      const resolution = yield* service.resolveTurnConnections({
        providerInstanceId: instanceId,
        threadId,
      });
      expect(resolution.failures).toEqual([]);
      const [github, docs] = resolution.connections;
      expect(github?.config.transport === "http" && github.config.headers).toEqual({
        Authorization: `material:${REF_GH}`,
        "X-Pulse": "enabled",
      });
      expect(docs?.config.transport === "stdio" && docs.config.env).toEqual({
        DOCS_TOKEN: `material:${REF_DOCS}`,
        DOCS_KEY: "stored-secret",
      });
      expect(releases.toSorted()).toEqual([REF_DOCS, REF_GH]);
      const persisted = yield* (yield* FileSystem.FileSystem).readFileString(
        `${(yield* ServerConfig.ServerConfig).stateDir}/pulse-mcp.json`,
      );
      expect(persisted).not.toContain("material:");
    }).pipe(
      Effect.provide(
        wardenLayer(
          grantingClient({
            grants: [
              { id: "g1", scope: REF_GH, status: "active" },
              { id: "g2", scope: REF_DOCS, status: "active" },
            ],
            releases: [],
          }),
        ),
      ),
    ),
  );

  it.effect("fails only the connection whose grant is missing", () =>
    Effect.gen(function* () {
      const { service, instanceId, threadId } = yield* addWardenFixtures();
      const resolution = yield* service.resolveTurnConnections({
        providerInstanceId: instanceId,
        threadId,
      });
      expect(resolution.connections.map(({ id }) => id)).toEqual(["github"]);
      expect(resolution.failures).toEqual([
        {
          connectionId: "local_docs",
          name: "Local docs",
          reason: "warden-grant-required",
          message:
            "Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry.",
        },
      ]);
    }).pipe(
      Effect.provide(
        wardenLayer(grantingClient({ grants: [{ id: "g1", scope: REF_GH, status: "active" }] })),
      ),
    ),
  );

  it.effect("reports warden-not-configured without calling Pulse Go when the PAT is missing", () =>
    Effect.gen(function* () {
      const calls = { count: 0 };
      const { service, instanceId, threadId } = yield* addWardenFixtures();
      yield* service.setWardenSettings({ origin: "https://go.example.test", pat: "" });
      const resolution = yield* service.resolveTurnConnections({
        providerInstanceId: instanceId,
        threadId,
      });
      expect(resolution.connections).toEqual([]);
      expect(resolution.failures.map(({ reason }) => reason)).toEqual([
        "warden-not-configured",
        "warden-not-configured",
      ]);
      expect(calls.count).toBe(0);
    }).pipe(Effect.provide(wardenLayer(grantingClient({ grants: [] }), { count: 0 }))),
  );

  it.effect("does not call Pulse Go when no selected connection uses Warden", () =>
    Effect.gen(function* () {
      const calls = { count: 0 };
      const service = yield* addFixtures();
      const instanceId = ProviderInstanceId.make("codex_plain");
      yield* service.setProviderDefault(instanceId, ["github"]);
      const resolution = yield* service.resolveTurnConnections({
        providerInstanceId: instanceId,
        threadId: ThreadId.make("thread-plain"),
      });
      expect(resolution.failures).toEqual([]);
      expect(calls.count).toBe(0);
    }).pipe(Effect.provide(wardenLayer(grantingClient({ grants: [] }), { count: 0 }))),
  );
});
```

Note for the not-configured test: `calls` must be the same object passed to `wardenLayer`. Hoist `const calls = { count: 0 };` above the `it.effect` and reference it in both places.

Also update the existing selection test at lines 272-299 so every `resolveTurnConnections` result reads `.connections` before `.map` or `toEqual([])`.

- [ ] **Step 2: Run to verify failures**

Run: `cd apps/server && vp test run src/mcp/PulseMcpConfigService.test.ts`
Expected: FAIL on `layerWith`, `setWardenSettings`, and `.connections`.

- [ ] **Step 3: Extend types and constants in `PulseMcpConfigService.ts`**

Add imports:

```ts
import type {
  PulseMcpWardenFailureReason,
  PulseMcpWardenSettings,
  PulseMcpWardenSettingsInput,
} from "@t3tools/contracts";
import {
  makePulseWardenClient,
  PulseWardenError,
  type PulseWardenAccess,
  type PulseWardenClientShape,
} from "./PulseWardenClient.ts";
import {
  makeWardenGrantIndex,
  makeWardenMaterialSource,
  wardenFailure,
  type WardenMaterialSource,
} from "./PulseWardenMaterial.ts";
```

Constants and types:

```ts
export const WARDEN_PAT_SECRET = "pulse-warden-pat";
const WARDEN_CREDENTIAL_REF = /^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$/;

export interface PulseMcpWardenInput {
  readonly type: "warden";
  readonly credentialRef: string;
}

export type PulseMcpValueInput =
  PulseMcpSecretInput | PulseMcpLiteralInput | PulseMcpRetainSecretInput | PulseMcpWardenInput;

export interface PulseMcpWardenReference {
  readonly type: "warden-ref";
  readonly credentialRef: string;
}

export type PulseMcpStoredValue =
  PulseMcpLiteralInput | PulseMcpSecretReference | PulseMcpWardenReference;

interface PulseMcpPersistedState {
  readonly version: 2;
  readonly connections: Readonly<Record<string, PulseMcpStoredConnection>>;
  readonly providerDefaults: Readonly<Record<string, readonly string[]>>;
  readonly projectDefaults: Readonly<Record<string, readonly string[]>>;
  readonly threadOverrides: Readonly<Record<string, readonly string[]>>;
  readonly warden?: {
    readonly origin: string;
    readonly principal?: { readonly id: string; readonly name: string };
  };
}

export interface PulseMcpConnectionFailure {
  readonly connectionId: string;
  readonly name: string;
  readonly reason: PulseMcpWardenFailureReason;
  readonly message: string;
}

export interface PulseMcpTurnResolution {
  readonly connections: readonly PulseMcpResolvedConnection[];
  readonly failures: readonly PulseMcpConnectionFailure[];
}
```

Service shape additions (replace the `resolveTurnConnections` return type and add the four Warden members):

```ts
  readonly resolveTurnConnections: (input: {
    readonly providerInstanceId: ProviderInstanceId;
    readonly projectId?: ProjectId;
    readonly threadId: ThreadId;
    readonly connectionIds?: readonly string[];
    readonly excludedConnectionIds?: readonly string[];
  }) => Effect.Effect<PulseMcpTurnResolution, PulseMcpConfigError>;
  readonly getWardenSettings: Effect.Effect<PulseMcpWardenSettings, PulseMcpConfigError>;
  readonly setWardenSettings: (
    input: PulseMcpWardenSettingsInput,
  ) => Effect.Effect<PulseMcpWardenSettings, PulseMcpConfigError>;
  readonly recordWardenPrincipal: (principal: {
    readonly id: string;
    readonly name: string;
  }) => Effect.Effect<void, PulseMcpConfigError>;
  readonly readWardenAccess: Effect.Effect<Option.Option<PulseWardenAccess>, PulseMcpConfigError>;
```

- [ ] **Step 4: Decode and encode the new stored shapes**

In `decodeStoredValues`, before the final `throw`:

```ts
if (
  entry.type === "warden-ref" &&
  hasOnlyKeys(entry, ["type", "credentialRef"]) &&
  typeof entry.credentialRef === "string" &&
  WARDEN_CREDENTIAL_REF.test(entry.credentialRef)
) {
  decoded[key] = { type: "warden-ref", credentialRef: entry.credentialRef };
  continue;
}
```

In `decodeState`, add `"warden"` to the `hasOnlyKeys` list and decode it:

```ts
    const warden = decodeWarden(value.warden);
    return { version: 2, connections, providerDefaults: ..., projectDefaults: ..., threadOverrides: ..., ...(warden ? { warden } : {}) };
```

with, above `decodeState`:

```ts
const decodeWarden = (value: unknown): PulseMcpPersistedState["warden"] => {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["origin", "principal"]) ||
    typeof value.origin !== "string"
  ) {
    throw new Error("invalid warden settings");
  }
  if (value.principal === undefined) return { origin: value.origin };
  if (
    !isRecord(value.principal) ||
    !hasOnlyKeys(value.principal, ["id", "name"]) ||
    typeof value.principal.id !== "string" ||
    typeof value.principal.name !== "string"
  ) {
    throw new Error("invalid warden principal");
  }
  return {
    origin: value.origin,
    principal: { id: value.principal.id, name: value.principal.name },
  };
};
```

In `validateInput` (the function that validates connection input; find it by `const validateInput =`), where each value entry is checked, add a branch: when `value.type === "warden"`, require `WARDEN_CREDENTIAL_REF.test(value.credentialRef)` else throw `new PulseMcpConfigError("validate", "Warden credential reference must be a Pulse credential URN.")`.

In `toStoredValues`, add a branch before the retain case:

```ts
      } else if (value.type === "warden") {
        stored[key] = { type: "warden-ref", credentialRef: value.credentialRef };
      }
```

The existing retain branch already throws when the previous value is not a `secret-ref`, which covers "retain over warden".

In `listConnections` redaction, `warden-ref` values pass through unchanged (they hold no secret); no change needed because the ternary only rewrites `secret-ref`.

- [ ] **Step 5: Warden settings and access**

Inside `make`, after `withWrite`:

```ts
const publicWarden = (
  state: PulseMcpPersistedState,
  patConfigured: boolean,
): PulseMcpWardenSettings => ({
  origin: state.warden?.origin ?? "",
  patConfigured,
  ...(state.warden?.principal ? { principal: state.warden.principal } : {}),
});

const patConfigured = secrets.get(WARDEN_PAT_SECRET).pipe(
  Effect.map(Option.isSome),
  Effect.mapError(
    (cause) => new PulseMcpConfigError("read-secret", "Failed to read the Warden token.", cause),
  ),
);

const getWardenSettings: PulseMcpConfigServiceShape["getWardenSettings"] = Effect.all([
  load,
  patConfigured,
]).pipe(Effect.map(([state, configured]) => publicWarden(state, configured)));

const setWardenSettings: PulseMcpConfigServiceShape["setWardenSettings"] = (input) =>
  Effect.gen(function* () {
    const origin = input.origin.trim().replace(/\/+$/, "");
    if (origin.length > 0 && !/^https?:\/\/[^\s/]+/.test(origin)) {
      return yield* Effect.fail(
        new PulseMcpConfigError("validate", "Warden origin must be an http(s) URL."),
      );
    }
    if (input.pat !== undefined) {
      const write =
        input.pat.length > 0
          ? secrets.set(WARDEN_PAT_SECRET, textEncoder.encode(input.pat))
          : secrets.remove(WARDEN_PAT_SECRET);
      yield* write.pipe(
        Effect.mapError(
          (cause) =>
            new PulseMcpConfigError("write-secret", "Failed to store the Warden token.", cause),
        ),
      );
    }
    yield* withWrite((state) =>
      Effect.succeed([
        undefined,
        {
          ...state,
          warden: {
            origin,
            // A new origin or token invalidates the recorded principal until the next test.
            ...(input.pat === undefined && state.warden?.origin === origin && state.warden.principal
              ? { principal: state.warden.principal }
              : {}),
          },
        },
      ] as const),
    );
    yield* Ref.set(wardenRuntime, Option.none());
    return yield* getWardenSettings;
  });

const recordWardenPrincipal: PulseMcpConfigServiceShape["recordWardenPrincipal"] = (principal) =>
  withWrite((state) =>
    Effect.succeed([
      undefined,
      { ...state, warden: { origin: state.warden?.origin ?? "", principal } },
    ] as const),
  );

const readWardenAccess: PulseMcpConfigServiceShape["readWardenAccess"] = Effect.gen(function* () {
  const state = yield* load;
  const origin = state.warden?.origin ?? "";
  if (origin.length === 0) return Option.none();
  const pat = yield* secrets
    .get(WARDEN_PAT_SECRET)
    .pipe(
      Effect.mapError(
        (cause) =>
          new PulseMcpConfigError("read-secret", "Failed to read the Warden token.", cause),
      ),
    );
  if (Option.isNone(pat)) return Option.none();
  return Option.some({ origin, pat: textDecoder.decode(pat.value) });
});
```

Add `import * as Ref from "effect/Ref";` and, near the top of `make`, the runtime holder used to keep the grant index and memo alive across turns:

```ts
const wardenRuntime =
  yield *
  Ref.make<Option.Option<{ readonly key: string; readonly source: WardenMaterialSource }>>(
    Option.none(),
  );

const wardenSource = (access: PulseWardenAccess) =>
  Effect.gen(function* () {
    const key = `${access.origin}\n${access.pat}`;
    const current = yield* Ref.get(wardenRuntime);
    if (Option.isSome(current) && current.value.key === key) return current.value.source;
    const client = options.wardenClient(access);
    const grants = yield* makeWardenGrantIndex(client);
    const source = yield* makeWardenMaterialSource(client, grants);
    yield* Ref.set(wardenRuntime, Option.some({ key, source }));
    return source;
  });
```

Change `const make = Effect.gen(...)` into a factory so tests can inject the client:

```ts
export interface PulseMcpConfigLayerOptions {
  readonly wardenClient: (access: PulseWardenAccess) => PulseWardenClientShape;
}

const defaultOptions: PulseMcpConfigLayerOptions = {
  wardenClient: (access) => makePulseWardenClient(access),
};

const make = (options: PulseMcpConfigLayerOptions) => Effect.gen(function* () { ... });

export const layer = Layer.effect(PulseMcpConfigService, make(defaultOptions));
export const layerWith = (options: Partial<PulseMcpConfigLayerOptions>) =>
  Layer.effect(PulseMcpConfigService, make({ ...defaultOptions, ...options }));
```

- [ ] **Step 6: Splice Warden material at resolution**

Replace `resolveValues` so it returns literal and secret values plus the Warden keys still to fill:

```ts
  const resolveValues = Effect.fn(function* (values: Readonly<Record<string, PulseMcpStoredValue>>) {
    const resolved: Record<string, string> = {};
    const wardenKeys: Record<string, string> = {};
    const loaded = new Map<string, Readonly<Record<string, string>>>();
    for (const [key, value] of Object.entries(values)) {
      if (value.type === "literal") {
        resolved[key] = value.value;
        continue;
      }
      if (value.type === "warden-ref") {
        wardenKeys[key] = value.credentialRef;
        continue;
      }
      // existing secret-ref branch unchanged
      ...
    }
    return { values: resolved, wardenKeys } as const;
  });
```

Replace `resolveConnection` with a two-phase version. Phase one returns the connection with its pending Warden keys; phase two fills them:

```ts
interface PendingConnection {
  readonly connection: PulseMcpStoredConnection;
  readonly values: Readonly<Record<string, string>>;
  readonly wardenKeys: Readonly<Record<string, string>>;
}

const resolvePending = Effect.fn(function* (
  connection: PulseMcpStoredConnection,
): Effect.Effect<PendingConnection, PulseMcpConfigError> {
  const source =
    connection.config.transport === "http" ? connection.config.headers : connection.config.env;
  const { values, wardenKeys } = yield* resolveValues(source);
  return { connection, values, wardenKeys };
});

const finish = (
  pending: PendingConnection,
  values: Readonly<Record<string, string>>,
): PulseMcpResolvedConnection =>
  pending.connection.config.transport === "http"
    ? Object.freeze({
        id: pending.connection.id,
        name: pending.connection.name,
        config: Object.freeze({
          transport: "http" as const,
          url: pending.connection.config.url,
          headers: Object.freeze(values),
        }),
      })
    : Object.freeze({
        id: pending.connection.id,
        name: pending.connection.name,
        config: Object.freeze({
          transport: "stdio" as const,
          command: pending.connection.config.command,
          args: Object.freeze([...pending.connection.config.args]),
          ...(pending.connection.config.cwd ? { cwd: pending.connection.config.cwd } : {}),
          env: Object.freeze(values),
        }),
      });

/** Resolves stored values, releases Warden material once per distinct ref, and splices it in. */
const resolveSelection = Effect.fn(function* (
  state: PulseMcpPersistedState,
  ids: readonly string[],
): Effect.Effect<PulseMcpTurnResolution, PulseMcpConfigError> {
  const pendings = yield* Effect.forEach(ids, (id) => {
    const connection = state.connections[id];
    return connection === undefined
      ? Effect.fail(new PulseMcpConfigError("prepare", `Unknown MCP connection '${id}'.`))
      : resolvePending(connection);
  });
  const refs = [...new Set(pendings.flatMap((pending) => Object.values(pending.wardenKeys)))];
  const connections: PulseMcpResolvedConnection[] = [];
  const failures: PulseMcpConnectionFailure[] = [];
  if (refs.length === 0) {
    return { connections: pendings.map((pending) => finish(pending, pending.values)), failures };
  }
  const access = yield* readWardenAccess;
  const materials = Option.isNone(access)
    ? new Map(
        refs.map((ref) => [
          ref,
          { ok: false as const, ...wardenFailure(new PulseWardenError("not-configured", "")) },
        ]),
      )
    : yield* (yield* wardenSource(access.value)).resolve(refs);
  for (const pending of pendings) {
    const values = { ...pending.values };
    let failure: PulseMcpConnectionFailure | undefined;
    for (const [key, ref] of Object.entries(pending.wardenKeys)) {
      const material = materials.get(ref);
      if (material?.ok) {
        values[key] = material.material;
        continue;
      }
      const failed = material ?? {
        ok: false as const,
        ...wardenFailure(new PulseWardenError("protocol", "")),
      };
      failure ??= {
        connectionId: pending.connection.id,
        name: pending.connection.name,
        reason: failed.reason,
        message: failed.message,
      };
      yield* Effect.logWarning("pulse mcp warden release failed").pipe(
        Effect.annotateLogs({
          connectionId: pending.connection.id,
          credentialRef: ref,
          reason: failed.reason,
        }),
      );
    }
    if (failure) failures.push(failure);
    else connections.push(finish(pending, values));
  }
  return { connections, failures };
});
```

Rewrite `resolveTurnConnections` to use it:

```ts
  const resolveTurnConnections: PulseMcpConfigServiceShape["resolveTurnConnections"] = (input) =>
    lock.withPermits(1)(
      load.pipe(
        Effect.flatMap((state) => {
          const selected = /* unchanged selection logic */;
          const excluded = new Set(input.excludedConnectionIds ?? []);
          return resolveSelection(state, unique(selected).filter((id) => !excluded.has(id)));
        }),
      ),
    );
```

Rewrite the body of `prepareTurn` so it calls `resolveSelection(state, selected)` and fails when `failures.length > 0` with `new PulseMcpConfigError("prepare", failures[0].message)`, otherwise maps `connections` as before. Add `getWardenSettings`, `setWardenSettings`, `recordWardenPrincipal`, `readWardenAccess` to the returned `PulseMcpConfigService.of({...})`.

- [ ] **Step 7: Update the public value in `PulseMcpRpc.ts`**

```ts
const publicValue = (value: PulseMcpStoredValue) =>
  value.type === "literal"
    ? value
    : value.type === "warden-ref"
      ? ({ type: "warden", credentialRef: value.credentialRef } as const)
      : ({ type: "secret", configured: true } as const);
```

- [ ] **Step 8: Consume `failures` in `ProviderService.ts`**

At `preparePulseMcp` (around line 1621), rename the result:

```ts
        const resolution = yield* pulseMcpConfig.value.resolveTurnConnections({...}).pipe(...);
        const connections = resolution.connections;
        if (resolution.failures.length > 0) {
          return {
            status: "failed",
            selectedConnectionIds: [
              ...connections.map((connection) => connection.id),
              ...resolution.failures.map((failure) => failure.connectionId),
            ],
            connections: [
              ...connections.map((connection) => ({
                connectionId: connection.id,
                name: connection.name,
                status: "unknown" as const,
              })),
              ...resolution.failures.map((failure) => ({
                connectionId: failure.connectionId,
                name: failure.name,
                status: "failed" as const,
                reason: failure.reason,
                message: failure.message,
              })),
            ],
          } as const;
        }
```

At both `consumePulseMcpPreparation` call sites (around lines 1857 and 1959), read `.connections` from the result and, when `failures.length > 0`, return `toValidationError("ProviderService.consumePulseMcpPreparation", failures[0].message)`.

In `ProviderService.test.ts`, every `resolveMcpConnections` stub that returns an array must now return `{ connections: [...], failures: [] }`. Search the file for `resolveMcpConnections:` and update each.

- [ ] **Step 9: Run the tests and typecheck**

Run:

```bash
cd apps/server
vp test run src/mcp/PulseMcpConfigService.test.ts src/mcp/PulseMcpRpc.test.ts src/provider/Layers/ProviderService.test.ts
vp run typecheck
```

Expected: PASS. Typecheck will still complain about the missing `wardenGet` etc. handlers only if `ws.ts` already references them; it does not yet, so the server should typecheck cleanly here.

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/mcp/PulseMcpConfigService.ts apps/server/src/mcp/PulseMcpConfigService.test.ts apps/server/src/mcp/PulseMcpRpc.ts apps/server/src/provider/Layers/ProviderService.ts apps/server/src/provider/Layers/ProviderService.test.ts
git commit -m "feat(server): release Warden material at MCP turn preparation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: RPC handlers, ws wiring, capability flag

**Files:**

- Modify: `apps/server/src/mcp/PulseMcpRpc.ts`
- Modify: `apps/server/src/ws.ts:1891-1904, 2555-2561`
- Test: `apps/server/src/mcp/PulseMcpRpc.test.ts`

**Interfaces:**

- Consumes: `service.getWardenSettings`, `setWardenSettings`, `recordWardenPrincipal`, `readWardenAccess` (Task 4); `makePulseWardenClient`, `wardenArray` (Task 2); `decodeWardenGrants` (Task 3); `PulseMcpWardenError` (Task 1).
- Produces: `pulseMcpHandlers(service, providerService?, discovery?, options?: { wardenClient?: (access) => PulseWardenClientShape })` with `wardenGet`, `wardenSet`, `wardenTest`, `wardenListCredentials`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/server/src/mcp/PulseMcpRpc.test.ts` (add imports for `Exit`, `PulseWardenError`, `type PulseWardenClientShape`, and `PulseMcpWardenError` from `@t3tools/contracts`):

```ts
const REF = "urn:pulse:acme:credential:gh-token";

const fakeWarden = (input: {
  readonly capabilities?: unknown;
  readonly credentials?: unknown;
  readonly grants?: unknown;
  readonly fail?: PulseWardenError;
}): PulseWardenClientShape => ({
  callTool: (name) => {
    if (input.fail) return Effect.fail(input.fail);
    if (name === "warden_capabilities") return Effect.succeed(input.capabilities ?? {});
    if (name === "warden_credentials_list") return Effect.succeed(input.credentials ?? []);
    if (name === "warden_grants_list") return Effect.succeed(input.grants ?? []);
    return Effect.die(`unexpected ${name}`);
  },
  release: () => Effect.die("unreachable"),
});

describe("Pulse MCP Warden RPC", () => {
  it.effect("exposes warden values publicly and settings without the PAT", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const rpc = pulseMcpHandlers(service);
      yield* rpc.upsert({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "warden", credentialRef: REF } },
        },
      });
      const listed = yield* rpc.list();
      expect(
        listed[0]?.config.transport === "http" && listed[0].config.headers.Authorization,
      ).toEqual({
        type: "warden",
        credentialRef: REF,
      });
      const settings = yield* rpc.wardenSet({
        origin: "https://go.example.test",
        pat: "pat-secret",
      });
      expect(settings).toEqual({ origin: "https://go.example.test", patConfigured: true });
      expect(JSON.stringify(yield* rpc.wardenGet())).not.toContain("pat-secret");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "tests the connection, records the principal, and lists credentials with grant state",
    () =>
      Effect.gen(function* () {
        const service = yield* PulseMcpConfig.PulseMcpConfigService;
        const rpc = pulseMcpHandlers(service, undefined, undefined, {
          wardenClient: () =>
            fakeWarden({
              capabilities: { principal: { id: "u1", name: "Ops bot" } },
              credentials: {
                credentials: [
                  {
                    credentialRef: REF,
                    resourceRef: "urn:pulse:acme:resource:gh",
                    queryRefs: [],
                    available: true,
                  },
                  {
                    credentialRef: "urn:pulse:acme:credential:other",
                    resourceRef: "urn:pulse:acme:resource:o",
                    queryRefs: [],
                    available: false,
                  },
                ],
              },
              grants: {
                grants: [
                  { id: "g1", scope: REF, status: "active", expiresAt: "2030-01-01T00:00:00Z" },
                  { id: "g2", scope: "urn:pulse:acme:credential:other", status: "pending" },
                ],
              },
            }),
        });
        yield* rpc.wardenSet({ origin: "https://go.example.test", pat: "pat" });
        expect(yield* rpc.wardenTest()).toEqual({ principal: { id: "u1", name: "Ops bot" } });
        expect((yield* rpc.wardenGet()).principal).toEqual({ id: "u1", name: "Ops bot" });
        expect(yield* rpc.wardenListCredentials()).toEqual([
          {
            credentialRef: REF,
            resourceRef: "urn:pulse:acme:resource:gh",
            available: true,
            grant: { status: "active", expiresAt: "2030-01-01T00:00:00Z" },
          },
          {
            credentialRef: "urn:pulse:acme:credential:other",
            resourceRef: "urn:pulse:acme:resource:o",
            available: false,
            grant: { status: "pending" },
          },
        ]);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("returns typed warden errors for missing configuration and rejected tokens", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const unconfigured = pulseMcpHandlers(service, undefined, undefined, {
        wardenClient: () => fakeWarden({}),
      });
      const missing = yield* Effect.exit(unconfigured.wardenTest());
      expect(Exit.isFailure(missing)).toBe(true);
      const error = Exit.isFailure(missing) ? missing.cause.reasons[0] : undefined;
      expect(
        error?._tag === "Fail" && error.error instanceof PulseMcpWardenError && error.error.kind,
      ).toBe("not-configured");
      yield* unconfigured.wardenSet({ origin: "https://go.example.test", pat: "pat-secret" });
      const rejected = pulseMcpHandlers(service, undefined, undefined, {
        wardenClient: () =>
          fakeWarden({
            fail: new PulseWardenError("unauthorized", "Pulse Go rejected the token.", 401),
          }),
      });
      const exit = yield* Effect.exit(rejected.wardenListCredentials());
      const failure = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
      expect(
        failure?._tag === "Fail" &&
          failure.error instanceof PulseMcpWardenError &&
          failure.error.kind,
      ).toBe("unauthorized");
      expect(JSON.stringify(exit)).not.toContain("pat-secret");
    }).pipe(Effect.provide(testLayer)),
  );
});
```

- [ ] **Step 2: Run to verify failures**

Run: `cd apps/server && vp test run src/mcp/PulseMcpRpc.test.ts`
Expected: FAIL, `wardenSet` is not a function.

- [ ] **Step 3: Implement the handlers in `PulseMcpRpc.ts`**

Add imports:

```ts
import {
  PulseMcpError,
  PulseMcpWardenError,
  type PulseMcpConnectionInput,
  type PulseMcpPrepareTurnInput,
  type PulseMcpWardenCredential,
  type PulseMcpWardenSettingsInput,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import {
  makePulseWardenClient,
  PulseWardenError,
  wardenArray,
  type PulseWardenAccess,
  type PulseWardenClientShape,
} from "./PulseWardenClient.ts";
import { decodeWardenGrants } from "./PulseWardenMaterial.ts";
```

Add helpers above `pulseMcpHandlers`:

```ts
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toWardenError = (error: PulseWardenError | PulseMcpConfigError) =>
  error instanceof PulseWardenError
    ? new PulseMcpWardenError({ kind: error.kind, message: error.message })
    : rpcFailure();

const decodePrincipal = (value: unknown) =>
  isRecord(value) &&
  isRecord(value.principal) &&
  typeof value.principal.id === "string" &&
  typeof value.principal.name === "string"
    ? { id: value.principal.id, name: value.principal.name }
    : undefined;

const decodeCredentials = (
  value: unknown,
  grants: readonly { id: string; scope: string; status: string; expiresAt?: string }[],
) => {
  const byScope = new Map(grants.map((grant) => [grant.scope, grant] as const));
  return wardenArray(value, "credentials").flatMap((entry): PulseMcpWardenCredential[] => {
    if (
      !isRecord(entry) ||
      typeof entry.credentialRef !== "string" ||
      typeof entry.resourceRef !== "string"
    )
      return [];
    const grant = byScope.get(entry.credentialRef);
    const status =
      grant === undefined
        ? "none"
        : grant.status === "active"
          ? "active"
          : grant.status === "pending"
            ? "pending"
            : "none";
    return [
      {
        credentialRef: entry.credentialRef,
        resourceRef: entry.resourceRef,
        available: entry.available === true,
        grant: {
          status,
          ...(grant?.expiresAt && status === "active" ? { expiresAt: grant.expiresAt } : {}),
        },
      },
    ];
  });
};
```

Extend the signature and add the handlers inside the returned object:

```ts
export function pulseMcpHandlers(
  service: PulseMcpConfigServiceShape,
  providerService?: ProviderServiceShape,
  discovery?: PulseMcpDiscoveryService,
  options: { readonly wardenClient?: (access: PulseWardenAccess) => PulseWardenClientShape } = {},
) {
  const wardenClient = options.wardenClient ?? ((access) => makePulseWardenClient(access));
  const withWarden = <A>(
    use: (client: PulseWardenClientShape) => Effect.Effect<A, PulseWardenError>,
  ) =>
    service.readWardenAccess.pipe(
      Effect.flatMap((access) =>
        Option.isNone(access)
          ? Effect.fail(
              new PulseWardenError(
                "not-configured",
                "Configure Pulse Go Warden in Settings > MCP.",
              ),
            )
          : use(wardenClient(access.value)),
      ),
      Effect.mapError(toWardenError),
      Effect.catchDefect(() => Effect.fail(rpcFailure())),
    );
  return {
    // ...existing handlers...
    wardenGet: () => redactFailure(service.getWardenSettings),
    wardenSet: (input: PulseMcpWardenSettingsInput) =>
      redactFailure(service.setWardenSettings(input)),
    wardenTest: () =>
      withWarden((client) =>
        client.callTool("warden_capabilities", {}).pipe(
          Effect.flatMap((raw) => {
            const principal = decodePrincipal(raw);
            return principal === undefined
              ? Effect.fail(
                  new PulseWardenError("protocol", "Pulse Go did not report a principal."),
                )
              : Effect.succeed(principal);
          }),
        ),
      ).pipe(
        Effect.tap((principal) => redactFailure(service.recordWardenPrincipal(principal))),
        Effect.map((principal) => ({ principal })),
      ),
    wardenListCredentials: () =>
      withWarden((client) =>
        Effect.all(
          [
            client.callTool("warden_credentials_list", {}),
            client.callTool("warden_grants_list", {}),
          ],
          {
            concurrency: 2,
          },
        ).pipe(
          Effect.flatMap(([credentials, grants]) =>
            Effect.try({
              try: () => decodeCredentials(credentials, decodeWardenGrants(grants)),
              catch: (cause) =>
                cause instanceof PulseWardenError
                  ? cause
                  : new PulseWardenError("protocol", "Pulse Go credentials could not be decoded."),
            }),
          ),
        ),
      ),
  };
}
```

`PulseMcpConfigError` must be imported as a type from `./PulseMcpConfigService.ts` for `toWardenError`.

- [ ] **Step 4: Wire `ws.ts`**

After the `pulseMcpPrepareTurn` entry (line 2557):

```ts
        [WS_METHODS.pulseMcpWardenGet]: () =>
          observeRpcEffect(WS_METHODS.pulseMcpWardenGet, pulseMcp.wardenGet(), {
            "rpc.aggregate": "pulse.mcp",
          }),
        [WS_METHODS.pulseMcpWardenSet]: (input) =>
          observeRpcEffect(WS_METHODS.pulseMcpWardenSet, pulseMcp.wardenSet(input), {
            "rpc.aggregate": "pulse.mcp",
          }),
        [WS_METHODS.pulseMcpWardenTest]: () =>
          observeRpcEffect(WS_METHODS.pulseMcpWardenTest, pulseMcp.wardenTest(), {
            "rpc.aggregate": "pulse.mcp",
          }),
        [WS_METHODS.pulseMcpWardenListCredentials]: () =>
          observeRpcEffect(WS_METHODS.pulseMcpWardenListCredentials, pulseMcp.wardenListCredentials(), {
            "rpc.aggregate": "pulse.mcp",
          }),
```

In `pulseCapabilities` (line 1891) add `wardenCredentials: true,` after `openCodeManagedMcp: true,`.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd apps/server && vp test run src/mcp/PulseMcpRpc.test.ts && vp run typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/mcp/PulseMcpRpc.ts apps/server/src/mcp/PulseMcpRpc.test.ts apps/server/src/ws.ts
git commit -m "feat(server): expose Warden settings, test, and credential RPCs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Web: state atoms, form helpers, Warden card

**Files:**

- Modify: `apps/web/src/mcp/mcpState.ts`
- Create: `apps/web/src/mcp/mcpWardenForm.ts`
- Create: `apps/web/src/mcp/McpWardenCard.tsx`
- Modify: `apps/web/src/mcp/McpConnectionsSettings.tsx:93-96, 210-244`
- Test: `apps/web/src/mcp/mcpWardenForm.test.ts`

**Interfaces:**

- Produces in `mcpState.ts`: `pulseMcpWardenSettings` (query family), `setPulseMcpWarden` (command), `testPulseMcpWarden` (command), `pulseMcpWardenCredentials` (query family).
- Produces in `mcpWardenForm.ts`:

```ts
export type WardenDraft = {
  readonly origin: string;
  readonly pat: string;
  readonly replacePat: boolean;
};
export const wardenDraftFromSettings: (settings: PulseMcpWardenSettings | null) => WardenDraft;
export const wardenInputFromDraft: (
  draft: WardenDraft,
  patConfigured: boolean,
  clearPat: boolean,
) => PulseMcpWardenSettingsInput;
export const grantBadgeLabel: (grant: PulseMcpWardenCredential["grant"], now?: Date) => string;
export const worstGrantStatus: (
  statuses: ReadonlyArray<"active" | "pending" | "none">,
) => "active" | "pending" | "none" | null;
export const describeWardenError: (error: unknown) => string;
```

- [ ] **Step 1: Write the failing helper tests**

Create `apps/web/src/mcp/mcpWardenForm.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";

import {
  describeWardenError,
  grantBadgeLabel,
  wardenDraftFromSettings,
  wardenInputFromDraft,
  worstGrantStatus,
} from "./mcpWardenForm";

describe("Warden settings form", () => {
  it("keeps a configured PAT unless replaced or cleared", () => {
    const draft = wardenDraftFromSettings({
      origin: "https://go.example.test",
      patConfigured: true,
    });
    expect(draft).toEqual({ origin: "https://go.example.test", pat: "", replacePat: false });
    expect(wardenInputFromDraft(draft, true, false)).toEqual({ origin: "https://go.example.test" });
    expect(wardenInputFromDraft({ ...draft, replacePat: true, pat: "new" }, true, false)).toEqual({
      origin: "https://go.example.test",
      pat: "new",
    });
    expect(wardenInputFromDraft(draft, true, true)).toEqual({
      origin: "https://go.example.test",
      pat: "",
    });
  });

  it("sends a new PAT when none is configured and trims the origin", () => {
    expect(
      wardenInputFromDraft(
        { origin: " https://go.example.test/ ", pat: "tok", replacePat: false },
        false,
        false,
      ),
    ).toEqual({ origin: "https://go.example.test", pat: "tok" });
  });

  it("labels grant states", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(
      grantBadgeLabel({ status: "active", expiresAt: "2026-09-25T12:00:00.000Z" }, now),
    ).toMatch(/^Active until /);
    expect(grantBadgeLabel({ status: "active" }, now)).toBe("Active");
    expect(grantBadgeLabel({ status: "pending" }, now)).toBe("Pending acceptance");
    expect(grantBadgeLabel({ status: "none" }, now)).toBe("No grant");
  });

  it("picks the worst grant state across a connection", () => {
    expect(worstGrantStatus([])).toBeNull();
    expect(worstGrantStatus(["active", "active"])).toBe("active");
    expect(worstGrantStatus(["active", "pending"])).toBe("pending");
    expect(worstGrantStatus(["pending", "none"])).toBe("none");
  });

  it("describes typed warden errors and falls back for unknown ones", () => {
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "unauthorized", message: "x" }),
    ).toBe("Pulse Go rejected the token for this environment. Replace it and test again.");
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "not-configured", message: "x" }),
    ).toBe("Enter the Pulse Go origin and a personal access token first.");
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "unavailable", message: "x" }),
    ).toBe("Pulse Go Warden is unreachable. Check the origin and try again.");
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "denied", message: "Nope" }),
    ).toBe("Pulse Go denied the request: Nope");
    expect(describeWardenError(new Error("boom"))).toBe("boom");
    expect(describeWardenError(42)).toBe("The Warden request failed.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && vp test run src/mcp/mcpWardenForm.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `mcpWardenForm.ts`**

```ts
import type {
  PulseMcpWardenCredential,
  PulseMcpWardenSettings,
  PulseMcpWardenSettingsInput,
} from "@t3tools/contracts";

export type WardenDraft = {
  readonly origin: string;
  readonly pat: string;
  readonly replacePat: boolean;
};

export const wardenDraftFromSettings = (settings: PulseMcpWardenSettings | null): WardenDraft => ({
  origin: settings?.origin ?? "",
  pat: "",
  replacePat: false,
});

/** Omits `pat` to keep the stored token; sends an empty string to clear it. */
export function wardenInputFromDraft(
  draft: WardenDraft,
  patConfigured: boolean,
  clearPat: boolean,
): PulseMcpWardenSettingsInput {
  const origin = draft.origin.trim().replace(/\/+$/, "");
  if (clearPat) return { origin, pat: "" };
  if (!patConfigured || draft.replacePat) return { origin, pat: draft.pat };
  return { origin };
}

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function grantBadgeLabel(
  grant: PulseMcpWardenCredential["grant"],
  now: Date = new Date(),
): string {
  if (grant.status === "pending") return "Pending acceptance";
  if (grant.status === "none") return "No grant";
  if (!grant.expiresAt) return "Active";
  const expires = new Date(grant.expiresAt);
  if (Number.isNaN(expires.getTime()) || expires <= now) return "Active";
  return `Active until ${formatter.format(expires)}`;
}

const RANK = { active: 0, pending: 1, none: 2 } as const;

export function worstGrantStatus(
  statuses: ReadonlyArray<"active" | "pending" | "none">,
): "active" | "pending" | "none" | null {
  let worst: "active" | "pending" | "none" | null = null;
  for (const status of statuses) {
    if (worst === null || RANK[status] > RANK[worst]) worst = status;
  }
  return worst;
}

const isWardenError = (
  error: unknown,
): error is { readonly kind: string; readonly message: string } =>
  typeof error === "object" &&
  error !== null &&
  (error as { _tag?: unknown })._tag === "PulseMcpWardenError" &&
  typeof (error as { kind?: unknown }).kind === "string";

export function describeWardenError(error: unknown): string {
  if (isWardenError(error)) {
    switch (error.kind) {
      case "not-configured":
        return "Enter the Pulse Go origin and a personal access token first.";
      case "unauthorized":
        return "Pulse Go rejected the token for this environment. Replace it and test again.";
      case "unavailable":
        return "Pulse Go Warden is unreachable. Check the origin and try again.";
      case "denied":
        return `Pulse Go denied the request: ${error.message}`;
      default:
        return "Pulse Go Warden returned an unexpected response.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "The Warden request failed.";
}
```

- [ ] **Step 4: Run the helper tests**

Run: `cd apps/web && vp test run src/mcp/mcpWardenForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Add atoms to `mcpState.ts`**

```ts
export const pulseMcpWardenSettings = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:warden-settings",
  tag: WS_METHODS.pulseMcpWardenGet,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const setPulseMcpWarden = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:warden-set",
  tag: WS_METHODS.pulseMcpWardenSet,
});

export const testPulseMcpWarden = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:warden-test",
  tag: WS_METHODS.pulseMcpWardenTest,
});

export const pulseMcpWardenCredentials = createEnvironmentRpcQueryAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:pulse-mcp:warden-credentials",
    tag: WS_METHODS.pulseMcpWardenListCredentials,
    staleTimeMs: 15_000,
    idleTtlMs: 60_000,
  },
);
```

- [ ] **Step 6: Create `McpWardenCard.tsx`**

```tsx
import type { EnvironmentId, PulseMcpWardenSettings } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useId, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { pulseMcpWardenSettings, setPulseMcpWarden, testPulseMcpWarden } from "./mcpState";
import {
  describeWardenError,
  wardenDraftFromSettings,
  wardenInputFromDraft,
} from "./mcpWardenForm";

export function McpWardenCard({
  environmentId,
  disabled,
  onSaved,
}: {
  readonly environmentId: EnvironmentId;
  readonly disabled: boolean;
  /** Credentials pickers re-fetch after the origin or token changes. */
  readonly onSaved: () => void;
}) {
  const fieldPrefix = useId();
  const settings = useEnvironmentQuery(pulseMcpWardenSettings({ environmentId, input: {} }));
  const save = useAtomCommand(setPulseMcpWarden, { reportFailure: false });
  const test = useAtomCommand(testPulseMcpWarden, { reportFailure: false });
  const [draft, setDraft] = useState(() => wardenDraftFromSettings(null));
  const [pending, setPending] = useState<"save" | "clear" | "test" | null>(null);
  const [notice, setNotice] = useState<{
    readonly tone: "ok" | "error";
    readonly text: string;
  } | null>(null);
  const current: PulseMcpWardenSettings | null = settings.data;
  useEffect(() => {
    if (current) setDraft(wardenDraftFromSettings(current));
  }, [current]);

  const run = async (kind: "save" | "clear" | "test", operation: () => Promise<string>) => {
    setPending(kind);
    setNotice(null);
    try {
      setNotice({ tone: "ok", text: await operation() });
    } catch (cause) {
      setNotice({ tone: "error", text: describeWardenError(cause) });
    } finally {
      setPending(null);
    }
  };

  const persist = (clearPat: boolean) =>
    run(clearPat ? "clear" : "save", async () => {
      const result = await save({
        environmentId,
        input: wardenInputFromDraft(draft, current?.patConfigured === true, clearPat),
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      settings.refresh();
      onSaved();
      return clearPat ? "Token cleared." : "Warden settings saved.";
    });

  const patConfigured = current?.patConfigured === true;
  const showPatInput = !patConfigured || draft.replacePat;
  return (
    <section className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Pulse Go Warden</h3>
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Release MCP credentials from Pulse Go at send time. The token stays on this environment.
          </p>
        </div>
        {current?.principal ? <Badge variant="outline">{current.principal.name}</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldPrefix}-origin`}>Pulse Go origin</Label>
          <Input
            id={`${fieldPrefix}-origin`}
            value={draft.origin}
            disabled={disabled || pending !== null}
            placeholder="https://go.example.com"
            onChange={(event) => setDraft({ ...draft, origin: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldPrefix}-pat`}>Personal access token</Label>
          {showPatInput ? (
            <Input
              id={`${fieldPrefix}-pat`}
              type="password"
              value={draft.pat}
              disabled={disabled || pending !== null}
              placeholder="Paste a Pulse Go PAT"
              onChange={(event) => setDraft({ ...draft, pat: event.target.value })}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Configured</Badge>
              <Button
                size="xs"
                variant="outline"
                disabled={disabled || pending !== null}
                onClick={() => setDraft({ ...draft, replacePat: true, pat: "" })}
              >
                Replace
              </Button>
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={disabled || pending !== null}
                onClick={() => void persist(true)}
              >
                {pending === "clear" ? "Clearing…" : "Clear"}
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={
            disabled || pending !== null || !draft.origin.trim() || (showPatInput && !draft.pat)
          }
          onClick={() => void persist(false)}
        >
          {pending === "save" ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || pending !== null || !patConfigured || !current?.origin}
          onClick={() =>
            void run("test", async () => {
              const result = await test({ environmentId, input: {} });
              if (result._tag === "Failure") throw squashAtomCommandFailure(result);
              settings.refresh();
              return `Connected as ${result.value.principal.name}.`;
            })
          }
        >
          {pending === "test" ? "Testing…" : "Test connection"}
        </Button>
        {notice ? (
          <p
            className={
              notice.tone === "error"
                ? "text-sm text-error-foreground"
                : "text-sm text-muted-foreground"
            }
          >
            {notice.text}
          </p>
        ) : null}
        {settings.error ? <p className="text-sm text-error-foreground">{settings.error}</p> : null}
      </div>
    </section>
  );
}
```

Check `squashAtomCommandFailure` preserves the tagged error so `describeWardenError` can read `_tag` and `kind`. If it wraps into a plain `Error` with only a message, read `result.cause` directly in the two `throw` sites instead: extract the first `Fail` failure from the cause and throw its `error`.

- [ ] **Step 7: Mount the card in `McpConnectionsSettings.tsx`**

Add near the capability reads:

```ts
const wardenEnabled = projection?.config.pulseCapabilities?.wardenCredentials === true;
const wardenCredentials = useEnvironmentQuery(
  wardenEnabled && canRead ? pulseMcpWardenCredentials({ environmentId, input: {} }) : null,
);
```

Import `pulseMcpWardenCredentials` from `./mcpState` and `McpWardenCard` from `./McpWardenCard`. Inside the success fragment, before `{canDiscover ? ...}`:

```tsx
{
  wardenEnabled ? (
    <McpWardenCard
      environmentId={environmentId}
      disabled={!canOperate}
      onSaved={wardenCredentials.refresh}
    />
  ) : null;
}
```

Do not touch the `McpConnectionsPanel` props in this task. Task 7 adds the `wardenCredentials` prop and passes it from here, so this task typechecks on its own.

- [ ] **Step 8: Typecheck and run the settings tests**

Run: `cd apps/web && vp test run src/mcp/mcpWardenForm.test.ts src/mcp/McpConnectionsSettings.test.tsx && vp run typecheck`
Expected: PASS. If `McpConnectionsSettings.test.tsx` mocks `./mcpState`, add the four new atoms to the mock.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/mcp/mcpState.ts apps/web/src/mcp/mcpWardenForm.ts apps/web/src/mcp/mcpWardenForm.test.ts apps/web/src/mcp/McpWardenCard.tsx apps/web/src/mcp/McpConnectionsSettings.tsx
git commit -m "feat(web): add Pulse Go Warden settings card to MCP settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Web: Warden value kind, credential picker, list badge

**Files:**

- Modify: `apps/web/src/mcp/mcpForm.ts`
- Modify: `apps/web/src/mcp/McpConnectionsPanel.tsx:44-58, 411-510` and the connection list row renderer
- Modify: `apps/web/src/mcp/McpConnectionsSettings.tsx` (pass `wardenCredentials`)
- Test: `apps/web/src/mcp/mcpForm.test.ts`

**Interfaces:**

- Consumes: `PulseMcpWardenCredential` (Task 1), `grantBadgeLabel`, `worstGrantStatus` (Task 6).
- Produces: `ValueDraft.kind: "literal" | "secret" | "warden"`, `ValueDraft.credentialRef: string`; `McpConnectionsPanel` prop `wardenCredentials: ReadonlyArray<PulseMcpWardenCredential> | null`; exported `connectionWardenRefs(connection): string[]` in `mcpForm.ts`.

- [ ] **Step 1: Write the failing form tests**

Append to `apps/web/src/mcp/mcpForm.test.ts` (add `connectionWardenRefs` to the import):

```ts
it("round-trips a warden value by credential URN", () => {
  const connection = {
    id: "github",
    name: "GitHub",
    config: {
      transport: "http" as const,
      url: "https://example.com/mcp",
      headers: {
        Authorization: { type: "warden" as const, credentialRef: "urn:pulse:acme:credential:gh" },
      },
    },
  };
  const draft = draftFromConnection(connection);
  expect(draft.values[0]).toMatchObject({
    key: "Authorization",
    kind: "warden",
    credentialRef: "urn:pulse:acme:credential:gh",
    value: "",
  });
  expect(connectionInputFromDraft(draft).config).toEqual(connection.config);
  expect(connectionWardenRefs(connection)).toEqual(["urn:pulse:acme:credential:gh"]);
});

it("requires a credential for warden rows", () => {
  const draft = {
    ...emptyConnectionDraft(),
    id: "github",
    name: "GitHub",
    url: "https://example.com/mcp",
    values: [
      {
        key: "Authorization",
        kind: "warden" as const,
        value: "",
        credentialRef: "",
        configuredSecret: false,
        replaceSecret: false,
      },
    ],
  };
  expect(validateConnectionDraft(draft)).toBe("Choose a Warden credential for each Warden row.");
  expect(
    validateConnectionDraft({
      ...draft,
      values: [{ ...draft.values[0]!, credentialRef: "urn:pulse:acme:credential:gh" }],
    }),
  ).toBeNull();
});
```

Every existing literal `ValueDraft` object in this test file gains `credentialRef: ""`.

- [ ] **Step 2: Run to verify failures**

Run: `cd apps/web && vp test run src/mcp/mcpForm.test.ts`
Expected: FAIL on `connectionWardenRefs` and the warden mapping.

- [ ] **Step 3: Update `mcpForm.ts`**

```ts
export type ValueDraft = {
  readonly key: string;
  readonly kind: "literal" | "secret" | "warden";
  readonly value: string;
  readonly credentialRef: string;
  readonly configuredSecret: boolean;
  readonly replaceSecret: boolean;
};

export const emptyValueDraft = (): ValueDraft => ({
  key: "",
  kind: "literal",
  value: "",
  credentialRef: "",
  configuredSecret: false,
  replaceSecret: false,
});

const WARDEN_REF = /^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$/;

export function connectionWardenRefs(connection: PulseMcpConnection): string[] {
  const values =
    connection.config.transport === "http" ? connection.config.headers : connection.config.env;
  return Object.values(values).flatMap((entry) =>
    entry.type === "warden" ? [entry.credentialRef] : [],
  );
}
```

In `draftFromConnection`, map entries:

```ts
  ).map(([key, entry]): ValueDraft =>
    entry.type === "secret"
      ? { ...emptyValueDraft(), key, kind: "secret", configuredSecret: true }
      : entry.type === "warden"
        ? { ...emptyValueDraft(), key, kind: "warden", credentialRef: entry.credentialRef }
        : { ...emptyValueDraft(), key, kind: "literal", value: entry.value },
  );
```

In `connectionInputFromDraft`:

```ts
      .map(({ key, kind, value, credentialRef, configuredSecret, replaceSecret }) => [
        key.trim(),
        kind === "literal"
          ? { type: "literal" as const, value }
          : kind === "warden"
            ? { type: "warden" as const, credentialRef }
            : configuredSecret && !replaceSecret
              ? { type: "retain-secret" as const }
              : { type: "secret" as const, value },
      ]),
```

In `validateConnectionDraft`, before the secret check:

```ts
if (
  draft.values.some((value) => value.kind === "warden" && !WARDEN_REF.test(value.credentialRef))
) {
  return "Choose a Warden credential for each Warden row.";
}
```

- [ ] **Step 4: Update `McpConnectionsPanel.tsx`**

Add the prop and thread it to the editor and list:

```ts
  readonly wardenCredentials: ReadonlyArray<PulseMcpWardenCredential> | null;
```

(`null` means the environment does not advertise `wardenCredentials`; the kind select then hides the Warden option.)

Import `type PulseMcpWardenCredential` from `@t3tools/contracts`, `emptyValueDraft` and `connectionWardenRefs` from `./mcpForm`, and `grantBadgeLabel`, `worstGrantStatus` from `./mcpWardenForm`.

`ValuesEditor` gains `wardenCredentials: ReadonlyArray<PulseMcpWardenCredential> | null`. Replace the "Add row" object with `emptyValueDraft()`. Replace the kind select and value cell:

```tsx
          <Select
            value={value.kind}
            disabled={disabled || value.configuredSecret}
            onValueChange={(kind) =>
              kind &&
              update(index, {
                kind: kind as ValueDraft["kind"],
                value: "",
                credentialRef: "",
              })
            }
          >
            <SelectTrigger aria-label={`${label} kind ${index + 1}`}>
              <SelectValue>
                {value.kind === "secret" ? "Secret" : value.kind === "warden" ? "Warden credential" : "Plain text"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="literal">Plain text</SelectItem>
              <SelectItem value="secret">Secret</SelectItem>
              {wardenCredentials !== null ? (
                <SelectItem value="warden">Warden credential</SelectItem>
              ) : null}
            </SelectPopup>
          </Select>
          {value.kind === "warden" ? (
            <WardenCredentialPicker
              label={`${label} credential ${index + 1}`}
              credentials={wardenCredentials ?? []}
              value={value.credentialRef}
              disabled={disabled}
              onChange={(credentialRef) => update(index, { credentialRef })}
            />
          ) : value.kind === "secret" && value.configuredSecret && !value.replaceSecret ? (
            /* existing Replace secret button */
          ) : (
            /* existing Input */
          )}
```

Add the picker component in the same file:

```tsx
function WardenCredentialPicker({
  label,
  credentials,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly credentials: ReadonlyArray<PulseMcpWardenCredential>;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (credentialRef: string) => void;
}) {
  const selected = credentials.find((credential) => credential.credentialRef === value);
  return (
    <div className="space-y-1">
      <Select value={value} disabled={disabled} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {selected ? selected.resourceRef : value ? value : "Choose a credential"}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {credentials.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No credentials. Test the Warden connection above.
            </div>
          ) : null}
          {credentials.map((credential) => (
            <SelectItem key={credential.credentialRef} value={credential.credentialRef}>
              <span className="flex flex-col">
                <span>{credential.resourceRef}</span>
                <span className="text-xs text-muted-foreground">
                  {credential.credentialRef} · {grantBadgeLabel(credential.grant)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {selected ? (
        <Badge variant={selected.grant.status === "active" ? "outline" : "destructive"}>
          {grantBadgeLabel(selected.grant)}
        </Badge>
      ) : null}
    </div>
  );
}
```

If `Badge` has no `destructive` variant, use the variant the file already uses for error states, or `outline` with `className="text-error-foreground"`.

In the connection list row (find where each connection's name and transport icon render), add a Warden badge:

```tsx
{
  (() => {
    const refs = connectionWardenRefs(connection);
    if (refs.length === 0 || wardenCredentials === null) return null;
    const worst = worstGrantStatus(
      refs.map(
        (ref) => wardenCredentials.find((c) => c.credentialRef === ref)?.grant.status ?? "none",
      ),
    );
    return (
      <Badge variant={worst === "active" ? "outline" : "destructive"} title={refs.join("\n")}>
        Warden{worst === "active" ? "" : worst === "pending" ? ": pending grant" : ": no grant"}
      </Badge>
    );
  })();
}
```

Prefer a small `WardenBadge({ connection, wardenCredentials })` component over the inline IIFE.

Pass `wardenCredentials` from the connection editor dialog down to both `ValuesEditor` instances (headers and env).

- [ ] **Step 5: Pass credentials from settings**

In `McpConnectionsSettings.tsx` add `wardenCredentials={wardenEnabled ? (wardenCredentials.data ?? []) : null}` to `<McpConnectionsPanel ... />`. Update `McpConnectionsPanel.test.tsx` to pass `wardenCredentials={null}` where it renders the panel.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/web && vp test run src/mcp/mcpForm.test.ts src/mcp/McpConnectionsPanel.test.tsx && vp run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/mcp/mcpForm.ts apps/web/src/mcp/mcpForm.test.ts apps/web/src/mcp/McpConnectionsPanel.tsx apps/web/src/mcp/McpConnectionsPanel.test.tsx apps/web/src/mcp/McpConnectionsSettings.tsx
git commit -m "feat(web): pick Warden credentials in MCP connection values

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Web: send pause carries the Warden reason

**Files:**

- Modify: `apps/web/src/mcp/McpSendPause.tsx:12-16, 37-42`
- Modify: `apps/web/src/mcp/useManagedMcpComposer.tsx:374-390`
- Test: `apps/web/src/mcp/McpSendPause.test.tsx`

**Interfaces:**

- Consumes: `PulseMcpWardenFailureReason` (Task 1).
- Produces: `FailedMcpConnection.reason?: PulseMcpWardenFailureReason`.

- [ ] **Step 1: Write the failing test**

Append to `McpSendPause.test.tsx`:

```tsx
it("labels Warden failures and keeps the server copy", () => {
  const markup = renderToStaticMarkup(
    <McpSendPauseContent
      failed={[
        {
          connectionId: "gh",
          name: "GitHub",
          reason: "warden-grant-required",
          message:
            "Pulse Go has no active grant for this credential. Issue and accept a grant-only grant in Pulse Go, then retry.",
        },
      ]}
      onRetry={() => {}}
      onContinueWithout={() => {}}
      onManage={() => {}}
    />,
  );
  expect(markup).toContain("Pulse Go Warden");
  expect(markup).toContain("no active grant for this credential");
});
```

This file already renders to static markup for copy assertions; keep the assertion to visible copy only.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && vp test run src/mcp/McpSendPause.test.tsx`
Expected: FAIL, typecheck error on `reason` or missing "Pulse Go Warden" text.

- [ ] **Step 3: Implement**

`McpSendPause.tsx`:

```ts
import type { PulseMcpWardenFailureReason } from "@t3tools/contracts";

export interface FailedMcpConnection {
  readonly connectionId: string;
  readonly name: string;
  readonly message: string;
  readonly reason?: PulseMcpWardenFailureReason;
}
```

In the list item:

```tsx
<div className="flex items-center gap-2 font-medium text-foreground">
  {connection.name}
  {connection.reason?.startsWith("warden-") ? (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
      Pulse Go Warden
    </span>
  ) : null}
</div>
```

`useManagedMcpComposer.tsx` at the failed mapping:

```ts
                    {
                      connectionId: connection.connectionId,
                      name: connection.name,
                      message: connection.message,
                      ...(connection.reason !== undefined ? { reason: connection.reason } : {}),
                    },
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd apps/web && vp test run src/mcp/McpSendPause.test.tsx src/mcp/useManagedMcpComposer.test.tsx && vp run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/mcp/McpSendPause.tsx apps/web/src/mcp/McpSendPause.test.tsx apps/web/src/mcp/useManagedMcpComposer.tsx
git commit -m "feat(web): show Warden reasons in the MCP send pause

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Docs

**Files:**

- Modify: `docs/user/mcp-connections.md` (new section before "Before sending")
- Modify: `docs/internals/pulse-next-mcp-behavior.md` (one paragraph at the end of "Configuration and UI")

- [ ] **Step 1: User doc**

Insert before `## Before sending`:

```markdown
## Pulse Go Warden credentials

A connection header or environment variable can reference a credential kept in
Pulse Go Warden instead of a value stored in Pulse Code. Pulse Code asks Pulse Go
for the material each time it prepares a turn and never saves it.

To set it up, open Settings > MCP, enter your Pulse Go origin and a personal
access token in the Pulse Go Warden card, and choose Test connection. Then edit a
connection, set a row's kind to Warden credential, and pick the credential.

Grants are issued and accepted in Pulse Go, not here. The picker shows whether
each credential has an active grant. A connection whose credential has no active
grant fails before sending with a message telling you what to fix in Pulse Go.
```

- [ ] **Step 2: Internal doc**

Append to the end of `## Configuration and UI`:

```markdown
Warden-backed values are released from Pulse Go during turn preparation and spliced
into the resolved connection in memory, so provider adapters see an ordinary header
or environment value and need no Warden awareness. Material is never written to
`pulse-mcp.json` or the secret store; only the credential URN is. Releases happen
per turn so that a revoked grant is observed on the next send, and a short in-memory
memo lets the prepare and consume steps of one send share a single release. If
per-turn release latency proves unacceptable, the swap point is
`WardenMaterialSource` in `apps/server/src/mcp/PulseWardenMaterial.ts`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/user/mcp-connections.md docs/internals/pulse-next-mcp-behavior.md
git commit -m "docs(mcp): describe Pulse Go Warden credentials

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Latency acceptance and ledger close

**Files:**

- Modify: `docs/internals/pulse-next-migration.json`
- Scratch (untracked, outside the worktree or under the gitignored `.codex-tmp/`): a timing script

Requires a running local Pulse Go on the `feat/warden-grant-acceptance` line with a PAT, two credentials, and two accepted grant-only grants. If none is available, record the acceptance as blocked in the ledger and say so in the final report; do not skip silently.

- [ ] **Step 1: Configure the worktree server against local Pulse Go**

Start the worktree dev server (`vp run dev` in the worktree; read the ports from the `[dev-runner]` line), open Settings > MCP in the browser only if the user has agreed to browser use; otherwise call the RPCs from a script. Set the Warden origin and PAT, create one http connection with two Warden headers.

- [ ] **Step 2: Measure**

Write `.codex-tmp/warden-latency.ts`:

```ts
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSecretStore from "../apps/server/src/auth/ServerSecretStore.ts";
import * as ServerConfig from "../apps/server/src/config.ts";
import * as PulseMcpConfig from "../apps/server/src/mcp/PulseMcpConfigService.ts";

// Point at the worktree's .t3/userdata state directory.
const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "warden-latency-" });
// layerTest is the same constructor the server tests use. Copy the worktree's .t3/userdata
// pulse-mcp.json and secrets into the directory it prints before running, or point stateDir at it.
const secretLayer = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
const pulseLayer = PulseMcpConfig.layer.pipe(
  Layer.provide(secretLayer),
  Layer.provide(configLayer),
);
const layer = Layer.mergeAll(configLayer, secretLayer, pulseLayer).pipe(
  Layer.provideMerge(NodeServices.layer),
);

const program = Effect.gen(function* () {
  const service = yield* PulseMcpConfig.PulseMcpConfigService;
  const samples: number[] = [];
  for (let i = 0; i < 30; i++) {
    const started = performance.now();
    const result = yield* service.resolveTurnConnections({
      // The provider instance you set the Warden connection as a default for in Step 1.
      providerInstanceId: ProviderInstanceId.make("codex_default"),
      threadId: ThreadId.make(`latency-${i}`),
    });
    if (result.failures.length > 0) throw new Error(JSON.stringify(result.failures));
    samples.push(performance.now() - started);
    yield* Effect.sleep("2 seconds"); // step past the 60 s memo often enough to exercise real releases
  }
  samples.sort((a, b) => a - b);
  console.log({ p50: samples[15], p95: samples[28], max: samples[29] });
});

Effect.runPromise(program.pipe(Effect.provide(layer)));
```

Run with `node --experimental-strip-types .codex-tmp/warden-latency.ts` (or `bun`, whichever the repo's server scripts use). Compare against a run with the Warden headers swapped to stored secrets to get the added time.

- [ ] **Step 3: Decide**

If added p50 is under 400 ms and p95 under 1 s, record the numbers in the ledger. Otherwise raise `memoMs` in `makeWardenMaterialSource` to the grant `expiresAt` (cache until expiry, invalidate on `setWardenSettings`), rerun the material source tests with the new expectation, and record the swap in the ledger and the internal doc paragraph.

- [ ] **Step 4: Close the ledger**

Update the `active` block: `state: "implemented"`, `implementationRevision` to `git rev-parse --short=10 HEAD`, `evidence` to an object with the latency numbers (or `"blocked: no local Pulse Go"`), `nextAction: "Review frozen revision, then merge feat/mcp-warden-credentials into develop."`.

- [ ] **Step 5: Commit**

```bash
git add docs/internals/pulse-next-migration.json
git commit -m "docs(ledger): record MCP Warden credentials acceptance

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Surface checklist (from AGENTS.md "Hit every surface")

- Entry points: Settings > MCP card and editor rows; the send pause. No command palette or keybinding entry exists for MCP values today, so none is added.
- Clients: web and desktop share the code. Mobile reads `PulseMcpConnection`, so the new public `warden` value must not break its rendering; mobile shows status only and does not edit Warden settings (spec). Check `apps/mobile` for any exhaustive switch over value `type` and add a `warden` branch that renders the URN.
- Providers: Codex, Claude, OpenCode consume `PulseMcpResolvedConnection`, unchanged. Cursor, Grok, Antigravity do not support managed MCP, unchanged.
- Contracts: Task 1.
- Reverse states: Clear PAT, switch a row back to Plain text or Secret, remove the connection.
- Connection modes: the PAT lives on the environment's server; remote and tunnel clients never see it.
- Docs: Task 9.
