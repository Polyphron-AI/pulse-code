import {
  EnvironmentId,
  IntegrationConnectionId,
  type IntegrationConnectionSnapshot,
  IntegrationProviderId,
  type ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

vi.mock("../connection/runtime", async () => {
  const Layer = await import("effect/Layer");
  const { Atom } = await import("effect/unstable/reactivity");
  return { connectionAtomRuntime: Atom.runtime(Layer.empty) };
});

import { aggregateMobileIntegrationConnections, supportsMobileIntegrations } from "./integrations";

const environmentId = EnvironmentId.make("mobile-environment");

const descriptor = (integrations?: boolean): ExecutionEnvironmentDescriptor => ({
  environmentId,
  label: "Mobile environment",
  platform: { os: "windows", arch: "x64" },
  serverVersion: "0.0.33",
  capabilities: {
    repositoryIdentity: true,
    ...(integrations === undefined ? {} : { integrations }),
  },
});

const connection: IntegrationConnectionSnapshot = {
  connectionId: IntegrationConnectionId.make("connection-1"),
  environmentId,
  providerId: IntegrationProviderId.make("pulse"),
  state: "connected",
  accountHint: "eng@example.test",
  endpointHint: "https://pulse.example.test",
  credentialConfigured: true,
  capabilities: ["work.read", "work.write"],
  health: {
    state: "connected",
    lastCheckedAt: "2026-08-20T06:00:00.000Z",
    lastSuccessfulAt: "2026-08-20T06:00:00.000Z",
    failure: null,
  },
  mappings: [],
  updatedAt: "2026-08-20T06:00:00.000Z",
};

describe("mobile integration state", () => {
  it("gates integration RPCs on the advertised server capability", () => {
    expect(supportsMobileIntegrations(descriptor(true))).toBe(true);
    expect(supportsMobileIntegrations(descriptor(false))).toBe(false);
    expect(supportsMobileIntegrations(descriptor())).toBe(false);
  });

  it("keeps healthy environments visible through partial failures without credentials", () => {
    const failedEnvironmentId = EnvironmentId.make("offline-environment");
    const aggregate = aggregateMobileIntegrationConnections([
      { _tag: "success", environmentId, connections: [connection] },
      { _tag: "failure", environmentId: failedEnvironmentId, error: new Error("offline") },
    ]);

    expect(aggregate.connections).toEqual([connection]);
    expect(aggregate.connections[0]?.environmentId).toBe(environmentId);
    expect(aggregate.connections[0]?.health.state).toBe("connected");
    expect(aggregate.unavailable).toMatchObject([
      { environmentId: failedEnvironmentId, reason: "failure" },
    ]);

    const serialized = JSON.stringify(aggregate);
    expect(serialized).not.toMatch(/accessToken|refreshToken|clientSecret|authorization/i);
  });
});
