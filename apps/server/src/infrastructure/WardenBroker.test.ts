// @effect-diagnostics nodeBuiltinImport:off - The loopback fixture proves native HTTPS client certificate authentication.
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as NodeHttps from "node:https";
import * as NodePath from "node:path";
import type { McpInvocationScope } from "../mcp/McpInvocationContext.ts";
import type { Target } from "./catalog.ts";
import {
  brokerAttemptId,
  executeBrokerQuery,
  requestBroker,
  type BrokerRequest,
} from "./WardenBroker.ts";

const scope: McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
  providerSessionId: "session-1",
  providerInstanceId: ProviderInstanceId.make("codex"),
  issuedAt: 123,
  capabilities: new Set(),
};
const query = {
  id: "errors",
  label: "Errors",
  kind: "loki" as const,
  brokerQueryId: "ttdev-errors-v1",
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
const use = () => ({
  useId: "use-1",
  state: "ready",
  expiresAt: "2099-01-01T00:00:00Z",
});
const result = {
  useId: "use-1",
  state: "succeeded",
  queryId: query.brokerQueryId,
  stage: "dev",
  startTime: "2026-09-09T10:00:00Z",
  endTime: "2026-09-09T10:05:00Z",
  content: "redacted error",
  outputTruncated: false,
};
const run = (send: BrokerRequest, bound = scope) =>
  executeBrokerQuery(
    target,
    query,
    bound,
    5,
    tls,
    new AbortController().signal,
    1788948000000,
    send,
  );

it("creates then executes a single use with fixed query and trusted session bindings", async () => {
  const calls: Array<{ path: string; body: object }> = [];
  const output = await run(async (url, credentials, body) => {
    expect(credentials).toBe(tls);
    calls.push({ path: url.pathname, body });
    return calls.length === 1 ? use() : { ...result, content: "x".repeat(25000) };
  });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    path: "/v1/uses",
    body: {
      threadId: scope.threadId,
      attemptId: brokerAttemptId(scope),
      queryId: query.brokerQueryId,
      lookbackMinutes: 5,
    },
  });
  expect(calls[1]).toEqual({
    path: "/v1/uses/use-1/execute",
    body: { threadId: scope.threadId, attemptId: brokerAttemptId(scope) },
  });
  expect(JSON.stringify(calls)).not.toContain("test-key");
  expect(output.text).toHaveLength(24000);
  expect(output.text).toMatch(/^Warden receipt: use-1\n/);
  expect(output.outputTruncated).toBe(true);
  for (const changed of [
    { ...scope, environmentId: EnvironmentId.make("other") },
    { ...scope, providerSessionId: "other" },
    { ...scope, issuedAt: 124 },
  ])
    expect(brokerAttemptId(changed)).not.toBe(brokerAttemptId(scope));
});

it("refuses other threads and environments before sending", async () => {
  let calls = 0;
  for (const changed of [
    { ...scope, threadId: ThreadId.make("other") },
    { ...scope, environmentId: EnvironmentId.make("other") },
  ])
    await expect(
      run(async () => {
        calls++;
        return use();
      }, changed),
    ).rejects.toMatchObject({ code: "unavailable" });
  expect(calls).toBe(0);
});

it("does not execute pending, expired or invalid grants", async () => {
  for (const response of [
    { ...use(), state: "pending" },
    { ...use(), expiresAt: "2020-01-01T00:00:00Z" },
    { ...use(), expiresAt: "invalid" },
  ]) {
    let calls = 0;
    await expect(
      run(async () => {
        calls++;
        return response;
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(calls).toBe(1);
  }
});

it("rejects mismatched evidence and never retries reserved provider failures", async () => {
  for (const bad of [
    { ...result, useId: "other" },
    { ...result, stage: "prod" },
    { ...result, queryId: "other" },
    { ...result, endTime: "2026-09-09T10:06:00Z" },
    { ...result, startTime: "invalid" },
    { ...result, state: "failed" },
  ]) {
    let calls = 0;
    await expect(run(async () => (++calls === 1 ? use() : bad))).rejects.toBeDefined();
    expect(calls).toBe(2);
  }
  let calls = 0;
  await expect(
    run(async () => {
      if (++calls === 1) return use();
      throw new Error("provider failure");
    }),
  ).rejects.toThrow();
  expect(calls).toBe(2);
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
