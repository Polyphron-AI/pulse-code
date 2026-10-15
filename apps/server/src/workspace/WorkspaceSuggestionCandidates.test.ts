import { DriveService } from "../drive/DriveService.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServerConfig from "../config.ts";
import * as Secrets from "../auth/ServerSecretStore.ts";
import * as MailConfig from "../mail/MailConfigService.ts";
import { MailOAuth } from "../mail/MailOAuth.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  fakeImap,
  type MailPeerIo,
} from "../mail/testing/MailTestPeers.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Repository from "../persistence/WorkspaceLinks.ts";
import * as Candidates from "./WorkspaceSuggestionCandidates.ts";

const testLayer = () => {
  const config = ServerConfig.layerTest(process.cwd(), { prefix: "suggestion-discovery-" });
  return Layer.mergeAll(
    Repository.layer.pipe(Layer.provide(SqlitePersistenceMemory)),
    MailConfig.layer.pipe(
      Layer.provide(Secrets.layer.pipe(Layer.provide(config))),
      Layer.provide(config),
      Layer.provide(
        Layer.mock(Orchestrator.OrchestratorV2)({
          getThreadShell: () => Effect.die("User discovery does not borrow an agent project grant"),
        }),
      ),
    ),
    Layer.mock(MailOAuth)({
      login: () => Effect.succeed({ type: "password", password: "fixture" }),
    }),
  ).pipe(Layer.provideMerge(SqlitePersistenceMemory), Layer.provideMerge(NodeServices.layer));
};
it.effect(
  "searches only explicitly connected user accounts, caps mail candidates at twenty, and fetches candidate headers only",
  () =>
    Effect.gen(function* () {
      const config = yield* MailConfig.MailConfigService;
      const connected = yield* config.upsertAccount({
        nickname: "Connected",
        address: "me@mail.test",
        imap: { host: "mail.test", port: 993 },
        smtp: { host: "mail.test", port: 465 },
        auth: { kind: "password" },
        allowPrivateNetwork: true,
      });
      yield* config.setCredential(connected.id, { type: "password", password: "fixture" });
      yield* config.upsertAccount({
        nickname: "Not connected",
        address: "other@missing.test",
        imap: { host: "missing.test", port: 993 },
        smtp: { host: "missing.test", port: 465 },
        auth: { kind: "password" },
        allowPrivateNetwork: true,
      });
      const mailboxes = [
        {
          name: "INBOX",
          uidValidity: 4,
          uidNext: 31,
          messages: Array.from({ length: 30 }, (_, index) => ({
            uid: index + 1,
            modseq: 1,
            flags: new Set<string>(),
            raw: [
              `Message-ID: <m${index + 1}@mail.test>`,
              "From: Ana <ana@mail.test>",
              "To: me@mail.test",
              `Subject: Launch review ${index + 1}`,
              "",
              `PRIVATE CANDIDATE BODY ${index + 1}`,
              "",
            ].join("\r\n"),
          })),
        },
      ];
      const perConnection = new WeakMap<MailPeerIo, ReturnType<typeof fakeImap>>();
      const template = fakeImap(mailboxes);
      const peer = yield* MailTestPeers.imap({
        implicitTls: true,
        greeting: template.greeting,
        respond: (command, io) => {
          let script = perConnection.get(io);
          if (!script) {
            script = fakeImap(mailboxes);
            perConnection.set(io, script);
          }
          script.respond(command, io);
        },
      });
      const discovery = yield* Candidates.make({
        imap: {
          lookup: async () => [{ address: "127.0.0.1", family: 4 }],
          testPeer: { port: peer.port, ca: MAIL_TEST_CA },
        },
      });
      const source = yield* discovery.source({
        ref: { type: "mail", accountId: connected.id, messageId: "<m1@mail.test>" },
      });
      const result = yield* discovery.candidates(source.metadata);
      expect(result.items.length).toBeLessThanOrEqual(20);
      expect(result.items).toHaveLength(20);
      expect(result.incomplete).toBe(true);
      expect(
        result.items.every(
          (candidate) =>
            candidate.item.ref.type === "mail" && candidate.item.ref.accountId === connected.id,
        ),
      ).toBe(true);
      expect(
        result.items
          .map((candidate) => candidate.metadata)
          .some((candidate) => "body" in candidate || "snippet" in candidate),
      ).toBe(false);
      const fetches = peer.received.filter((command) => / FETCH /i.test(command.line));
      expect(fetches.filter((command) => /BODY\.PEEK\[\]/i.test(command.line))).toHaveLength(1);
      expect(fetches.some((command) => /HEADER\.FIELDS/i.test(command.line))).toBe(true);
    }).pipe(Effect.provide(testLayer()), Effect.scoped),
);

it.effect(
  "adds bounded Drive metadata from explicit user connections without binding or reading candidate bodies",
  () =>
    Effect.gen(function* () {
      let searches = 0;
      const drive = Layer.mock(DriveService)({
        listConnections: Effect.succeed(
          Array.from({ length: 4 }, (_, index) => ({
            id: `drv_${index}`,
            nickname: `Drive ${index}`,
            clientId: "fixture",
            clientSecretConfigured: false,
            connected: true,
          })),
        ),
        search: ({ limit }) => {
          searches++;
          expect(limit).toBe(20);
          return Effect.succeed({
            files: Array.from({ length: 20 }, (_, index) => ({
              id: `file-${index}`,
              name: `Launch ${index}`,
              mimeType: "text/plain",
              url: `https://drive.google.com/file/d/file-${index}/view`,
              owner: "Owner",
            })),
            incomplete: true,
          });
        },
        readFile: () => Effect.die("Candidate bodies must not be read"),
        bindFile: () => Effect.die("Suggestions must not bind accounts"),
      });
      const discovery = yield* Candidates.make().pipe(Effect.provide(drive));
      const result = yield* discovery.candidates({
        key: "url:https://example.test",
        title: "Launch",
        type: "url",
      });
      expect(searches).toBe(1);
      expect(result.items).toHaveLength(20);
      expect(result.incomplete).toBe(true);
      expect(
        result.items.every(
          (value) =>
            value.item.ref.type === "file" &&
            value.metadata.owner === "Owner" &&
            !("snippet" in value.metadata),
        ),
      ).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
);
