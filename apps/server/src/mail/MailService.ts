import * as Path from "effect/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { MailOperationError } from "@t3tools/contracts";
import * as ServerConfig from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { MailEngine } from "./MailEngine.ts";
import { ImapSmtpMailAdapter } from "./MailAdapter.ts";
import { MailStore } from "./MailStore.ts";

const Credentials = Schema.Struct({ imapPassword: Schema.String, smtpPassword: Schema.String });
const decodeCredentials = Schema.decodeUnknownSync(Credentials);
const isMailOperationError = Schema.is(MailOperationError);
type MailMethods = {
  [K in keyof MailEngine]: MailEngine[K] extends (input: infer I) => Promise<infer O>
    ? (input: I) => Effect.Effect<O, MailOperationError>
    : never;
};
export class MailService extends Context.Service<MailService, MailMethods>()(
  "t3/mail/MailService",
) {}
export const layer = Layer.effect(
  MailService,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const path = yield* Path.Path;
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    const context = yield* Effect.context<never>();
    const runPromise = Effect.runPromiseWith(context);
    const engine = new MailEngine(
      new MailStore(path.join(config.stateDir, "mail", "state.json")),
      new ImapSmtpMailAdapter(),
      {
        get: async (id) => {
          const stored = await runPromise(secrets.get(`mail-${id}`));
          return Option.isSome(stored)
            ? decodeCredentials(JSON.parse(new TextDecoder().decode(stored.value)))
            : undefined;
        },
        set: (id, credentials) =>
          runPromise(
            secrets.set(`mail-${id}`, new TextEncoder().encode(JSON.stringify(credentials))),
          ),
        remove: (id) => runPromise(secrets.remove(`mail-${id}`)),
      },
    );
    const wrap =
      <I, O>(run: (input: I) => Promise<O>) =>
      (input: I) =>
        Effect.tryPromise({
          try: () => run(input),
          catch: (cause) =>
            isMailOperationError(cause)
              ? cause
              : new MailOperationError({
                  reason: "connection",
                  detail:
                    "The mail operation could not be confirmed. Check the account settings and connection, then refresh before retrying.",
                }),
        });
    return MailService.of({
      getPeopleContext: wrap(engine.getPeopleContext.bind(engine)),
      reviewPerson: wrap(engine.reviewPerson.bind(engine)),
      savePeopleWork: wrap(engine.savePeopleWork.bind(engine)),
      reviewConnection: wrap(engine.reviewConnection.bind(engine)),
      getDraft: wrap(engine.getDraft.bind(engine)),
      getStatus: wrap(engine.getStatus.bind(engine)),
      setEnabled: wrap(engine.setEnabled.bind(engine)),
      saveAccount: wrap(engine.saveAccount.bind(engine)),
      disconnectAccount: wrap(engine.disconnectAccount.bind(engine)),
      listFolders: wrap(engine.listFolders.bind(engine)),
      createFolder: wrap(engine.createFolder.bind(engine)),
      renameFolder: wrap(engine.renameFolder.bind(engine)),
      deleteFolder: wrap(engine.deleteFolder.bind(engine)),
      listMessages: wrap(engine.listMessages.bind(engine)),
      readMessage: wrap(engine.readMessage.bind(engine)),
      downloadAttachment: wrap(engine.downloadAttachment.bind(engine)),
      downloadOriginal: wrap(engine.downloadOriginal.bind(engine)),
      actOnMessages: wrap(engine.actOnMessages.bind(engine)),
      saveMetadata: wrap(engine.saveMetadata.bind(engine)),
      listDrafts: wrap(engine.listDrafts.bind(engine)),
      saveDraft: wrap(engine.saveDraft.bind(engine)),
      deleteDraft: wrap(engine.deleteDraft.bind(engine)),
      sendDraft: wrap(engine.sendDraft.bind(engine)),
      listOutbox: wrap(engine.listOutbox.bind(engine)),
    });
  }),
);
