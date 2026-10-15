import { MailError, type ModelSelection, type ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { ProviderAdapterRegistryV2 } from "../orchestration-v2/ProviderAdapterRegistry.ts";
import type { ProviderRegistryShape } from "../provider/Services/ProviderRegistry.ts";
import type { MailConfigService } from "./MailConfigService.ts";

/** Built-in mail tools are granted by McpSessionRegistry; the adapter must actually support them. */
export const replyReadiness = (
  config: Pick<MailConfigService["Service"], "getProjectAccess" | "getAccount">,
  providers: Pick<ProviderRegistryShape, "getProviders">,
  adapters: Pick<ProviderAdapterRegistryV2["Service"], "getMetadata">,
  input: { projectId: ProjectId; accountId: string },
) =>
  Effect.gen(function* () {
    const access = yield* config.getProjectAccess(input.projectId);
    if (!access.accountIds.includes(input.accountId))
      return yield* new MailError({
        kind: "access-denied",
        message:
          "Grant this project access to the message's email account in Settings before drafting a reply.",
      });
    const account = yield* config.getAccount(input.accountId);
    if (
      !account.credentialRef ||
      account.health.status === "reauth-required" ||
      account.health.status === "auth-failed"
    )
      return yield* new MailError({
        kind: "auth-failed",
        message: "Connect this email account in Settings before drafting a reply.",
      });
    const choices: Array<{ label: string; modelSelection: ModelSelection }> = [];
    const unavailable: Array<string> = [];
    for (const provider of yield* providers.getProviders) {
      const name = provider.displayName ?? provider.instanceId;
      if (
        !provider.enabled ||
        !provider.installed ||
        provider.status === "error" ||
        provider.auth.status === "unauthenticated" ||
        provider.availability === "unavailable"
      ) {
        unavailable.push(`${name}: connect or enable this provider in Settings.`);
        continue;
      }
      const metadata = adapters.getMetadata
        ? yield* adapters.getMetadata(provider.instanceId).pipe(Effect.option)
        : undefined;
      if (
        !metadata ||
        metadata._tag === "None" ||
        !metadata.value.enabled ||
        !metadata.value.capabilities.tools.supportsMcpTools
      ) {
        unavailable.push(`${name}: this adapter cannot call Pulse Code mail tools.`);
        continue;
      }
      for (const model of provider.models.slice(0, 20))
        choices.push({
          label: `${name} / ${model.name}`,
          modelSelection: { instanceId: provider.instanceId, model: model.slug },
        });
    }
    return { choices: choices.slice(0, 100), unavailable };
  });
