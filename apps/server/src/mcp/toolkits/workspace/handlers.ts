import { WorkspaceLinksError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { MailConfigService } from "../../../mail/MailConfigService.ts";
import type { MailConnectionOptions } from "../../../mail/MailConnection.ts";
import * as MailImapRead from "../../../mail/MailImapRead.ts";
import { MailOAuth } from "../../../mail/MailOAuth.ts";
import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import { WorkspaceLinks } from "../../../workspace/WorkspaceLinks.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { bounded, RESULT_MAX_BYTES } from "../mail/handlers.ts";
import { WorkspaceToolkit } from "./tools.ts";

const byteSize = (value: unknown) =>
  // @effect-diagnostics preferSchemaOverJson:off -- measures the payload McpServer will serialize
  Buffer.byteLength(JSON.stringify(value));

/** The agent cannot narrow this list, so it is cut to fit rather than refused. */
const fitList = (items: ReadonlyArray<Record<string, unknown>>, truncated: boolean) => {
  const kept: Array<Record<string, unknown>> = [];
  let size = byteSize({ items: [], truncated: true });
  for (const item of items) {
    const next = byteSize(item) + 1;
    if (size + next > RESULT_MAX_BYTES) break;
    kept.push(item);
    size += next;
  }
  return { items: kept, truncated: truncated || kept.length < items.length };
};

export const make = (options: { readonly imap?: MailConnectionOptions } = {}) =>
  Effect.gen(function* () {
    const links = yield* WorkspaceLinks;
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const config = yield* MailConfigService;
    const oauth = yield* MailOAuth;
    const imap = options.imap ?? {};

    /** The calling thread and its project; links on either count. */
    const owner = Effect.gen(function* () {
      const { threadId } = yield* McpInvocationContext.requireMcpCapability("workspace");
      const thread = yield* orchestrator
        .getThreadShell(threadId)
        .pipe(Effect.orElseSucceed(() => null));
      return { threadId, projectId: thread === null ? undefined : thread.projectId };
    });

    return WorkspaceToolkit.of({
      workspace_linked_items: () =>
        owner.pipe(
          Effect.flatMap(links.contextFor),
          Effect.map(({ items, truncated }) =>
            fitList(
              items.map(({ key, item }) => ({
                key,
                type: item.ref.type,
                ...(item.title !== undefined ? { title: item.title } : {}),
                ref: item.ref,
              })),
              truncated,
            ),
          ),
        ),
      workspace_read_item: ({ key, offset }) =>
        Effect.gen(function* () {
          const found = yield* links.resolveLinked(yield* owner, key);
          if (Option.isNone(found)) {
            return yield* new WorkspaceLinksError({
              kind: "not-found",
              message: "That item is not linked to this thread or its project.",
            });
          }
          const { ref, title } = found.value;
          switch (ref.type) {
            case "mail": {
              // The link grants this one message, even when its account is not granted to the project.
              const account = yield* config.getAccount(ref.accountId);
              const login = yield* oauth.login(account.id);
              const message = yield* MailImapRead.fetchByReference(
                account,
                login,
                {
                  messageId: ref.messageId,
                  location: ref.location,
                  ...(offset !== undefined ? { offset } : {}),
                },
                imap,
              );
              return yield* bounded({ key, type: "mail", ...message });
            }
            case "url":
              return { key, type: "url", url: ref.url, ...(title !== undefined ? { title } : {}) };
            default:
              return yield* new WorkspaceLinksError({
                kind: "unsupported",
                message: `Reading a linked ${ref.type} is not supported yet.`,
              });
          }
        }),
    });
  });

export const layer = (options?: Parameters<typeof make>[0]) =>
  WorkspaceToolkit.toLayer(make(options));
