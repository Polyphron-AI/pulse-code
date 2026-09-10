// @effect-diagnostics nodeBuiltinImport:off - The loopback fixture proves native HTTPS client certificate authentication.
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as NodeHttps from "node:https";
import * as NodePath from "node:path";
import type { McpInvocationScope } from "../mcp/McpInvocationContext.ts";
import type { Target } from "./catalog.ts";
import {
  KnownUseRevocations,
  readBrokerReceipts,
  requestBrokerUse,
  actOnBrokerUse,
  requestBroker,
  type BrokerRequest,
} from "./WardenBroker.ts";

const scope: McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
  providerSessionId: "session-1",
  providerInstanceId: ProviderInstanceId.make("codex"),
  issuedAt: 123,
  capabilities: new Set(["warden"]),
  wardenAttempt: {
    id: "33333333-3333-4333-8333-333333333333",
    signal: new AbortController().signal,
  },
};
const query = {
  id: "errors",
  label: "Errors",
  kind: "loki" as const,
  brokerQueryId: "ttdev-errors-v1",
  credentialRef: "urn:pulse:example:credential:grafana",
};
const target: Target = {
  id: "ttdev",
  label: "TechTraders development",
  stage: "development",
  service: "web",
  repository: "techtraders",
  queries: [query],
  environmentId: scope.environmentId,
  enabled: true,
  allowedThreadIds: [scope.threadId],
  wardenAuthority: "example",
  brokerEndpoint: "https://warden.test",
  clientCertificateFile: NodePath.resolve("client.crt"),
  clientKeyFile: NodePath.resolve("client.key"),
  caFile: NodePath.resolve("ca.crt"),
};
const tls = {
  cert: Buffer.from("test-cert"),
  key: Buffer.from("test-key"),
  ca: Buffer.from("test-ca"),
};
const requestId = "11111111-1111-4111-8111-111111111111";
const useId = "22222222-2222-4222-8222-222222222222";
const use = () => ({
  version: "pulse-warden/read-v1" as const,
  requestId,
  useId,
  resourceRef: "urn:pulse:example:resource:ttdev",
  state: "ready" as const,
  expiresAt: 4070908800,
  requestDigest: "a".repeat(64),
  revoked: false,
});
const result = {
  ...use(),
  state: "succeeded",
  queryId: `urn:pulse:example:query:${query.brokerQueryId}`,
  stage: "dev",
  startTime: "2026-09-09T10:00:00Z",
  endTime: "2026-09-09T10:05:00Z",
  content: "redacted error",
  outputTruncated: false,
};
const input = {
  targetId: target.id,
  useRef: `urn:pulse:example:use:${useId}`,
  expectedRequestDigest: use().requestDigest,
};
const request = (send: BrokerRequest, bound = scope) =>
  requestBrokerUse(target, query, bound, 5, requestId, tls, new AbortController().signal, send);
const act = (
  send: BrokerRequest,
  action: "execute" | "status" | "revoke" = "execute",
  bound = scope,
) => actOnBrokerUse(target, bound, input, action, tls, new AbortController().signal, send);

it("requests one canonical saved query then resumes the same use and digest", async () => {
  const calls: Array<{
    path: string;
    body: object | undefined;
    method: string | undefined;
    attemptRef: string | undefined;
  }> = [];
  const send: BrokerRequest = async (url, credentials, body, _signal, method, attemptRef) => {
    expect(credentials).toBe(tls);
    calls.push({ path: url.pathname, body, method, attemptRef });
    return calls.length === 1 ? use() : { ...result, content: "x".repeat(25000) };
  };
  const created = await request(send);
  expect(created.useRef).toBe(input.useRef);
  const output = await act(send);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    path: "/v1/uses",
    method: "POST",
    body: {
      requestId,
      credentialRef: query.credentialRef,
      action: "grafana.saved_query.read",
      taskRef: "urn:pulse:example:task:thread-1",
      attemptRef: `urn:pulse:example:attempt:${scope.wardenAttempt!.id}`,
      resource: "urn:pulse:example:resource:ttdev",
      payload: { queryRef: "urn:pulse:example:query:ttdev-errors-v1", lookbackSeconds: 300 },
    },
  });
  expect(calls[1]).toMatchObject({
    path: `/v1/uses/${useId}/execute`,
    body: { expectedRequestDigest: input.expectedRequestDigest },
  });
  expect(calls[0]?.attemptRef).toBe(calls[1]?.attemptRef);
  expect(JSON.stringify(calls)).not.toContain("test-key");
  expect(output).toMatchObject({
    useRef: input.useRef,
    text: "x".repeat(24000),
    outputTruncated: true,
  });
});

it("returns pending and terminal metadata without another request or provider execution", async () => {
  for (const state of ["pending_approval", "expired", "denied", "revoked"] as const) {
    let calls = 0;
    expect(
      await request(async () => {
        calls++;
        return { ...use(), state };
      }),
    ).toMatchObject({ state, requestId, useRef: input.useRef });
    expect(calls).toBe(1);
  }
  const status = await act(async (url, _tls, body, _signal, method) => {
    expect(method).toBe("GET");
    expect(body).toBeUndefined();
    expect(url.searchParams.get("taskRef")).toBe("urn:pulse:example:task:thread-1");
    expect(url.searchParams.get("attemptRef")).toBe(
      `urn:pulse:example:attempt:${scope.wardenAttempt!.id}`,
    );
    return { ...use(), state: "pending_approval" };
  }, "status");
  expect(status.state).toBe("pending_approval");
  expect(
    await act(async () => ({ ...use(), state: "revoked", revoked: true }), "revoke"),
  ).toMatchObject({ state: "revoked", revoked: true });
});

it("refuses foreign scope, preview-only, missing and aborted attempts before sending", async () => {
  const { wardenAttempt: _attempt, ...idle } = scope;
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  for (const changed of [
    { ...scope, threadId: ThreadId.make("other") },
    { ...scope, environmentId: EnvironmentId.make("other") },
    { ...scope, capabilities: new Set(["preview"] as const) },
    idle,
    { ...scope, wardenAttempt: { id: scope.wardenAttempt!.id, signal: controller.signal } },
  ]) {
    const send: BrokerRequest = async () => {
      calls++;
      return use();
    };
    await expect(request(send, changed)).rejects.toMatchObject({ code: "unavailable" });
    await expect(act(send, "execute", changed)).rejects.toMatchObject({ code: "unavailable" });
  }
  expect(calls).toBe(0);
});

it("propagates attempt revocation to an in-flight broker request", async () => {
  const controller = new AbortController();
  await expect(
    request(
      async (_url, _tls, _body, signal) => {
        controller.abort();
        expect(signal.aborted).toBe(true);
        throw new Error("cancelled");
      },
      { ...scope, wardenAttempt: { id: scope.wardenAttempt!.id, signal: controller.signal } },
    ),
  ).rejects.toThrow("cancelled");
});

it("rejects mismatched request, digest, use and malformed result without retrying", async () => {
  await expect(
    request(async () => ({ ...use(), requestId: "44444444-4444-4444-8444-444444444444" })),
  ).rejects.toMatchObject({ code: "upstream" });
  for (const bad of [
    { ...result, useId: "44444444-4444-4444-8444-444444444444" },
    { ...result, requestDigest: "b".repeat(64) },
    { ...result, expiresAt: "invalid" },
    { ...result, state: "invented" },
    { ...result, endTime: "2026-09-09T11:01:00Z" },
    { ...result, startTime: "invalid" },
  ]) {
    let calls = 0;
    await expect(
      act(async () => {
        calls++;
        return bad;
      }),
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
  }
  let calls = 0;
  await expect(
    act(async () => {
      calls++;
      throw new Error("provider failure");
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  expect(
    await act(async () => ({ ...use(), state: "succeeded", resultUnavailable: true })),
  ).toMatchObject({ state: "succeeded", resultUnavailable: true });
});

it("binds paginated receipts to the requested use and digest", async () => {
  const receipt = {
    receiptId: requestId,
    useId,
    principalId: "principal",
    requestDigest: input.expectedRequestDigest,
    version: "pulse-warden/read-v1",
    action: "execute",
    outcome: "succeeded",
    createdAt: 1800000000,
  };
  const page = {
    version: "pulse-warden/read-v1",
    useId,
    resourceRef: "urn:pulse:example:resource:ttdev",
    receipts: [receipt],
    nextCursor: requestId,
  };
  const read = (send: BrokerRequest) =>
    readBrokerReceipts(
      target,
      scope,
      { ...input, cursor: requestId },
      tls,
      new AbortController().signal,
      send,
    );
  expect(
    await read(async (url, _tls, body, _signal, method) => {
      expect(method).toBe("GET");
      expect(body).toBeUndefined();
      expect(url.pathname).toBe(`/v1/uses/${useId}/receipts`);
      expect(url.searchParams.get("cursor")).toBe(requestId);
      return page;
    }),
  ).toEqual(page);
  await expect(
    read(async () => ({ ...page, receipts: [{ ...receipt, requestDigest: "b".repeat(64) }] })),
  ).rejects.toMatchObject({ code: "upstream" });
});

it("cannot resume a use through a different target sharing the same broker authority", async () => {
  const other = { ...target, id: "other" };
  for (const action of ["execute", "status", "revoke"] as const) {
    await expect(
      actOnBrokerUse(
        other,
        scope,
        { ...input, targetId: other.id },
        action,
        tls,
        new AbortController().signal,
        async (url, _tls, body) => {
          if (action === "status")
            expect(url.searchParams.get("resourceRef")).toBe("urn:pulse:example:resource:other");
          else expect(body).toMatchObject({ resourceRef: "urn:pulse:example:resource:other" });
          return result;
        },
      ),
    ).rejects.toMatchObject({ code: "upstream" });
  }
  await expect(
    readBrokerReceipts(
      other,
      scope,
      { ...input, targetId: other.id },
      tls,
      new AbortController().signal,
      async (url) => {
        expect(url.searchParams.get("resourceRef")).toBe("urn:pulse:example:resource:other");
        return {
          version: "pulse-warden/read-v1",
          useId,
          resourceRef: "urn:pulse:example:resource:ttdev",
          receipts: [],
          nextCursor: "",
        };
      },
    ),
  ).rejects.toMatchObject({ code: "upstream" });
});

it("revokes an aborted pending use from its original binding without retaining key bytes", async () => {
  const controller = new AbortController();
  const bound = {
    ...scope,
    wardenAttempt: { id: scope.wardenAttempt!.id, signal: controller.signal },
  };
  const revoked: unknown[] = [];
  const tracker = new KnownUseRevocations(async (known) => {
    revoked.push(known);
  });
  await requestBrokerUse(
    target,
    query,
    bound,
    5,
    requestId,
    tls,
    new AbortController().signal,
    async () => ({ ...use(), state: "pending_approval" }),
    tracker,
  );
  expect(revoked).toHaveLength(0);
  controller.abort();
  await tracker.drain(controller.signal);
  expect(revoked).toHaveLength(1);
  expect(revoked[0]).toMatchObject({
    useId,
    requestDigest: input.expectedRequestDigest,
    resourceRef: "urn:pulse:example:resource:ttdev",
    attemptRef: `urn:pulse:example:attempt:${bound.wardenAttempt.id}`,
    taskRef: "urn:pulse:example:task:thread-1",
  });
  expect(JSON.stringify(revoked)).not.toContain("test-key");
  controller.abort();
  await tracker.drain(controller.signal);
  expect(revoked).toHaveLength(1);
});

it("forgets completed uses and retains known transport failures for end-turn cleanup", async () => {
  for (const completed of [true, false]) {
    const controller = new AbortController();
    const bound = {
      ...scope,
      wardenAttempt: { id: scope.wardenAttempt!.id, signal: controller.signal },
    };
    const revoked: unknown[] = [];
    const tracker = new KnownUseRevocations(async (known) => {
      revoked.push(known);
    });
    let executions = 0;
    const execution = actOnBrokerUse(
      target,
      bound,
      input,
      "execute",
      tls,
      new AbortController().signal,
      async () => {
        executions++;
        if (!completed) throw new Error("transport lost");
        return result;
      },
      tracker,
    );
    if (completed) await execution;
    else await expect(execution).rejects.toThrow("transport lost");
    controller.abort();
    await tracker.drain(controller.signal);
    expect(revoked).toHaveLength(completed ? 0 : 1);
    expect(executions).toBe(1);
  }
});

it("bounds outstanding known uses and revokes overflow instead of tracking it", async () => {
  const controller = new AbortController();
  const revoked: string[] = [];
  const tracker = new KnownUseRevocations(async (known) => {
    revoked.push(known.useId);
  }, 2);
  const known = {
    target,
    useId,
    requestDigest: input.expectedRequestDigest,
    resourceRef: use().resourceRef,
    taskRef: "urn:pulse:example:task:thread-1",
    attemptRef: "urn:pulse:example:attempt:turn-1",
  };
  expect(tracker.track(controller.signal, known)).toBe(true);
  expect(tracker.track(controller.signal, { ...known, useId: "second" })).toBe(true);
  expect(tracker.track(controller.signal, { ...known, useId: "overflow" })).toBe(false);
  await tracker.drain(controller.signal);
  expect(revoked).toEqual(["overflow"]);
  controller.abort();
  await tracker.drain(controller.signal);
  expect(new Set(revoked)).toEqual(new Set([useId, "second", "overflow"]));
});

it("does not let a forged execute digest replace an already known revocation binding", async () => {
  const controller = new AbortController();
  const revoked: string[] = [];
  const tracker = new KnownUseRevocations(async (known) => {
    revoked.push(known.requestDigest);
  });
  const known = {
    target,
    useId,
    requestDigest: input.expectedRequestDigest,
    resourceRef: use().resourceRef,
    taskRef: "urn:pulse:example:task:thread-1",
    attemptRef: "urn:pulse:example:attempt:turn-1",
  };
  tracker.track(controller.signal, known, true);
  tracker.track(controller.signal, { ...known, requestDigest: "b".repeat(64) });
  controller.abort();
  await tracker.drain(controller.signal);
  expect(revoked).toEqual([input.expectedRequestDigest]);
});

it("runs at most four cancellation revocations concurrently and drains their completion", async () => {
  const controller = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fourStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    fourStarted = resolve;
  });
  let active = 0,
    maximum = 0,
    count = 0;
  const tracker = new KnownUseRevocations(async () => {
    active++;
    count++;
    maximum = Math.max(maximum, active);
    if (count === 4) fourStarted();
    await gate;
    active--;
  });
  for (let i = 0; i < 8; i++)
    tracker.track(controller.signal, {
      target,
      useId: String(i),
      requestDigest: input.expectedRequestDigest,
      resourceRef: use().resourceRef,
      taskRef: "urn:pulse:example:task:thread-1",
      attemptRef: "urn:pulse:example:attempt:turn-1",
    });
  controller.abort();
  await started;
  expect(maximum).toBe(4);
  release();
  await tracker.drain(controller.signal);
  expect(count).toBe(8);
  expect(active).toBe(0);
  expect(maximum).toBe(4);
});

it("verifies mTLS, rejects redirects and denial responses, bounds bytes and sanitizes transport errors", async () => {
  let status = 200;
  let body = JSON.stringify(result);
  let calls = 0;
  const server = NodeHttps.createServer(
    {
      key: testKey,
      cert: testCertificate,
      ca: testCertificate,
      requestCert: true,
      rejectUnauthorized: true,
    },
    (req, res) => {
      expect(req.socket).toHaveProperty("authorized", true);
      calls++;
      req.resume();
      req.on("end", () => {
        res.writeHead(status, {
          "content-type": "application/json",
          location: "https://leak.invalid",
        });
        res.end(body);
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test address");
    const url = new URL(`https://127.0.0.1:${address.port}/v1/uses`);
    const credentials = {
      key: Buffer.from(testKey),
      cert: Buffer.from(testCertificate),
      ca: Buffer.from(testCertificate),
    };
    const send = (client = credentials) =>
      requestBroker(url, client, { threadId: "thread-1" }, AbortSignal.timeout(5000));
    expect(await send()).toEqual(result);
    for (const denied of [401, 403, 409, 410]) {
      status = denied;
      body = "secret provider diagnostics";
      await expect(send()).rejects.toMatchObject({ code: "unavailable" });
    }
    status = 302;
    await expect(send()).rejects.toMatchObject({ code: "upstream" });
    expect(calls).toBe(6);
    status = 200;
    body = "x".repeat(1_048_577);
    await expect(send()).rejects.toMatchObject({ code: "upstream" });
    body = "invalid JSON secret";
    await expect(send()).rejects.toMatchObject({ code: "upstream" });
    const before = calls;
    await expect(
      send({ ...credentials, cert: Buffer.alloc(0), key: Buffer.alloc(0) }),
    ).rejects.toMatchObject({ code: "upstream" });
    await expect(send({ ...credentials, ca: Buffer.from("not a CA") })).rejects.toMatchObject({
      code: "upstream",
    });
    expect(calls).toBe(before);
    const controller = new AbortController();
    controller.abort();
    await expect(requestBroker(url, credentials, {}, controller.signal)).rejects.toMatchObject({
      code: "upstream",
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

// Public synthetic fixtures, used only by the loopback transport test.
const testKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDLHnhHdxFvHNy8
rkRR5y2VYq5i69RLJufZMia+65QxgOTPMIE1rZf97oCIR7gUKO3keh2mMQxquDnq
lC/iiC5PO6Tq4Eu8y4m88GiSY8XP2X5oqClFFwGejt5UhYbXZeROUNXTNpA8a+T3
N65k28tEeUIVUEk/oZHRy3LKjS7EcVXF4DEc065C1rIKRr1rzk9vZ30RMSNwYGnH
8Ib0haISiGTY2avLjT0Go4ohJTkweRwyOoOg3QVVsx5sHRM6/sCDF6N5yvNFsmY9
SoooULGPhtU8rpeucmgTlPrgXmKICLd8lcHLjRhR68qCs+jayt37D2lxGPiZG34Q
Y7c5r6WdAgMBAAECggEAHs6cR5qTllq2UBfOXO3HSCUTdgV2yX85IwQsREDO1UNL
cPFWZ6HQr78A16qpDMW4bzLmVFKUI4uVnTKkoKMvAu108frbAeONHI8KDUn8sq22
MoFu4P/ASyA4MHGgJgNaQVaZV9OqxL9IlwZm+P0tM1GA6GKo+XG0ADHvUzFeqoSQ
3fcl996WjbKaL/k9Gxk0W5VYDSpmflaPSXXcj5g1C1BtnFTWrYiPCD+hThuG2dT5
RqfevQXG3Es+ivZX2rWVQdooegJ6vCYtCeeLS6UJ9f0NBs9KG8FcAPnOYQNyc3n/
ty2wHZM3h0mjWl6+HdZDNIatSZ5nB3aeG9ZBAu6jgQKBgQDq5K+CXgGQionVUMM7
E//Hk5N11ag6gIf2fTSaZiyuDt9Syg7/YW9WqWvD3UXfTty9pk+0XPDofvRqBhia
6uEsFugUVFkqDn4QcwAK2vW9WCf3zQPIv8hyHNofAiEHAekZp15BdAuGyQVj8vH2
jUPR4VeZM0m9bR6mbO9RxgKOmQKBgQDdXt8ybYZwOuW+eVkkEp9CZ3oaVEyM0dcR
u7ciFoSDbYZuwSfuLpeMt7PErNOVFOsZHzQfY/KbFfGgJm62TYDJfdEidTUW0tdh
11v6vR8PIQqEvb8uqSPwwLOqCaqSDFgxvI8wHBT1gDdoamk8QUI0TwhuDrz68Yiz
UBqK637FpQKBgCIujz/YcD/ZeT9all6FhYZEeoP+SJHi3GZJSBtj3QKjVWpVzyLo
yewBkZYaIC3j6wmKJzUnBUPAHc9D/dalcYkZ+EHlGGifXUcFhS8POA2Kw54y7mcL
SZ8ZhcBXbfj4FTTPf07lFTxTCn7F/uITIphrQ3Ue2o8/TuOHHLh4qSyZAoGAeBgZ
+h+VCZnKPbVTeNBpefrtMQ9+n/7PMJ2n0mRo62wlvDwpz3uTWBHpAs/H0V8R1AUr
n8P3P8990CZJdblCHw2UwZ7YeFNV6YyOJ88l5G1GaZEPAN9d0iSY06x+ztDHn+Pt
wmnZrP4sEQd5o+i7Y+lkZ2CzgWg7gxv36lmr4skCgYEAk6UT//wfIFjpiZ8W3vpN
cL7bFUghBhI6nyCXOLWe47wS1sr3kZDwJVIrpWZHxJ+G4JH3chQxv92+7/CoOKY0
z1FIRKCTuZbRagpYrmSv1y3q/uBIFI5Uc3sRGWzVxf58hDSSHhhHWz3eUs2hQexc
dCe9IfOx1nTNvP2AWqrDvfE=
-----END PRIVATE KEY-----
`;
const testCertificate = `-----BEGIN CERTIFICATE-----
MIIDSDCCAjCgAwIBAgIUNEaZaxHqQNOO6rqouUX0aw4swX4wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDkwOTIwNTUyNVoYDzIxMjYw
ODE2MjA1NTI1WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDLHnhHdxFvHNy8rkRR5y2VYq5i69RLJufZMia+65Qx
gOTPMIE1rZf97oCIR7gUKO3keh2mMQxquDnqlC/iiC5PO6Tq4Eu8y4m88GiSY8XP
2X5oqClFFwGejt5UhYbXZeROUNXTNpA8a+T3N65k28tEeUIVUEk/oZHRy3LKjS7E
cVXF4DEc065C1rIKRr1rzk9vZ30RMSNwYGnH8Ib0haISiGTY2avLjT0Go4ohJTkw
eRwyOoOg3QVVsx5sHRM6/sCDF6N5yvNFsmY9SoooULGPhtU8rpeucmgTlPrgXmKI
CLd8lcHLjRhR68qCs+jayt37D2lxGPiZG34QY7c5r6WdAgMBAAGjgY8wgYwwHQYD
VR0OBBYEFBArTRE8FVURytKfIMC8EWXb2V78MB8GA1UdIwQYMBaAFBArTRE8FVUR
ytKfIMC8EWXb2V78MA8GA1UdEwEB/wQFMAMBAf8wGgYDVR0RBBMwEYcEfwAAAYIJ
bG9jYWxob3N0MB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjANBgkqhkiG
9w0BAQsFAAOCAQEApLER0FPe6N7375qj6x0eo8KjGtfmHPG7xOZ1d9bNOgTYK00a
WjgR8p5/+zdZiKFp5JfF6RcHDl7PDEiLey1C7uJAaXxe5S1HBO+qVEayxnoE/6AK
Y8MDXfXe30C0ebSoHfZ0rJ2wKYpGWs0JSl4qTDKWssjBxt5R91JmyLxcQoLBaWh0
BlTuzMuON1Lb73oWGNnZ2C/9a0k1AZrCzY/kHdB5DFzi5CiaWBYO32SJzsuYOw9x
TtI7Psfb5jfXm+g2LcWzx5gS8L71wLNpEbrvOEpKd8TPRKJrfO7UJ+irGsor/l9n
brIetMIIXdQre3HsqExVQ3Aqfgm/9HKB1irHtQ==
-----END CERTIFICATE-----
`;
