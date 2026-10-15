import { describe, expect, it } from "@effect/vitest";
import {
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ServerProvider,
  type OrchestrationV2ProviderCapabilities,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { MailConfigService } from "./MailConfigService.ts";
import type { ProviderRegistryShape } from "../provider/Services/ProviderRegistry.ts";
import type { ProviderAdapterRegistryV2 } from "../orchestration-v2/ProviderAdapterRegistry.ts";
import { replyReadiness } from "./MailReply.ts";

const projectId = ProjectId.make("project");
const provider = (id: string, patch: Partial<ServerProvider> = {}): ServerProvider =>
  ({
    instanceId: ProviderInstanceId.make(id),
    displayName: id,
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    models: [{ slug: "model", name: "Model" }],
    ...patch,
  }) as ServerProvider;
const setup = (granted = true, connected = true) => {
  const config = {
    getProjectAccess: () => Effect.succeed({ projectId, accountIds: granted ? ["acct"] : [] }),
    getAccount: () =>
      Effect.succeed({ credentialRef: connected ? "secret" : undefined, health: { status: "ok" } }),
  } as unknown as MailConfigService["Service"];
  const providers = {
    getProviders: Effect.succeed([
      provider("supported"),
      provider("unsupported"),
      provider("offline", { installed: false }),
    ]),
  } as unknown as ProviderRegistryShape;
  const adapters = {
    getMetadata: (id: ProviderInstanceId) =>
      Effect.succeed({
        enabled: true,
        driver: ProviderDriverKind.make("codex"),
        continuationKey: id,
        capabilities: {
          tools: { supportsMcpTools: id === "supported" },
        } as OrchestrationV2ProviderCapabilities,
      }),
  } as unknown as ProviderAdapterRegistryV2["Service"];
  return replyReadiness(config, providers, adapters, { projectId, accountId: "acct" });
};
describe("reply readiness", () => {
  it.effect("offers only live adapters that support the built-in mail toolkit", () =>
    Effect.gen(function* () {
      const result = yield* setup();
      expect(result.choices.map(({ modelSelection }) => modelSelection.instanceId)).toEqual([
        "supported",
      ]);
      expect(result.unavailable).toEqual([
        "unsupported: this adapter cannot call Pulse Code mail tools.",
        "offline: connect or enable this provider in Settings.",
      ]);
    }),
  );
  it.effect("requires the source account's grant rather than another default", () =>
    Effect.gen(function* () {
      expect((yield* setup(false).pipe(Effect.flip)).kind).toBe("access-denied");
    }),
  );
  it.effect("refuses disconnected credentials", () =>
    Effect.gen(function* () {
      expect((yield* setup(true, false).pipe(Effect.flip)).kind).toBe("auth-failed");
    }),
  );
});
