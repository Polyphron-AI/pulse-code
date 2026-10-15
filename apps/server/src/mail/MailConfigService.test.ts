// @effect-diagnostics preferSchemaOverJson:off -- Tests inspect serialized public output for secret leaks.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId, ThreadId, type MailAccountInput } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as PubSub from "effect/PubSub";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as MailConfig from "./MailConfigService.ts";

const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");
const threadDeleted = ThreadId.make("thread-deleted");
const threadProjects: Record<string, ProjectId> = {
  [threadA]: projectA,
  [threadB]: projectB,
  [threadDeleted]: projectA,
};

const orchestratorLayer = Layer.mock(Orchestrator.OrchestratorV2)({
  getThreadShell: (threadId) =>
    Effect.succeed(
      threadProjects[threadId]
        ? ({
            projectId: threadProjects[threadId],
            deletedAt: threadId === threadDeleted ? "2026-10-15T00:00:00.000Z" : null,
          } as never)
        : null,
    ),
});

const makeLayer = (fileSystem?: FileSystem.FileSystem) => {
  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mail-config-test-" });
  const secretLayer = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
  const base = MailConfig.layer.pipe(
    Layer.provide(secretLayer),
    Layer.provide(configLayer),
    Layer.provide(orchestratorLayer),
  );
  const mail = fileSystem
    ? base.pipe(Layer.provide(Layer.succeed(FileSystem.FileSystem, fileSystem)))
    : base;
  return Layer.mergeAll(configLayer, secretLayer, mail).pipe(
    Layer.provideMerge(NodeServices.layer),
  );
};

const account = (nickname: string, address = `${nickname.toLowerCase()}@example.com`) =>
  ({
    nickname,
    address,
    imap: { host: "imap.example.com", port: 993 },
    smtp: { host: "smtp.example.com", port: 465 },
    auth: { kind: "password" },
  }) satisfies MailAccountInput;

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

describe("MailConfigService", () => {
  it.effect("resolves by selector, then thread selection, then project default (A02)", () =>
    Effect.gen(function* () {
      const mail = yield* MailConfig.MailConfigService;
      const work = yield* mail.upsertAccount(account("Work"));
      const home = yield* mail.upsertAccount(account("Home"));
      yield* mail.setProjectAccess({
        projectId: projectA,
        accountIds: [work.id, home.id],
        defaultAccountId: work.id,
      });

      expect((yield* mail.resolveAccount({ threadId: threadA })).account.id).toBe(work.id);
      yield* mail.setThreadSelection(threadA, home.id);
      expect((yield* mail.resolveAccount({ threadId: threadA })).account.id).toBe(home.id);
      expect((yield* mail.resolveAccount({ threadId: threadA, selector: "work" })).account.id).toBe(
        work.id,
      );
      yield* mail.setThreadSelection(threadA, null);
      expect((yield* mail.resolveAccount({ threadId: threadA })).account.id).toBe(work.id);
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect("denies ungranted, unknown, and ambiguous accounts without fallback (A03, A04)", () =>
    Effect.gen(function* () {
      const mail = yield* MailConfig.MailConfigService;
      const work = yield* mail.upsertAccount(account("Work"));
      const other = yield* mail.upsertAccount(account("Other"));
      yield* mail.setProjectAccess({
        projectId: projectA,
        accountIds: [work.id],
        defaultAccountId: work.id,
      });
      yield* mail.setProjectAccess({ projectId: projectB, accountIds: [other.id] });

      // The project comes from the thread, so a project-B thread cannot reach project A's account.
      expect(yield* kindOf(mail.resolveAccount({ threadId: threadB, selector: work.id }))).toBe(
        "access-denied",
      );
      expect(yield* kindOf(mail.resolveAccount({ threadId: threadA, selector: other.id }))).toBe(
        "access-denied",
      );
      expect(yield* kindOf(mail.resolveAccount({ threadId: threadA, selector: "acct_nope" }))).toBe(
        "access-denied",
      );
      expect(yield* kindOf(mail.resolveAccount({ threadId: threadB }))).toBe("access-denied");
      expect(
        yield* kindOf(
          mail.resolveAccount({ threadId: ThreadId.make("missing"), selector: work.id }),
        ),
      ).toBe("access-denied");

      // A thread selection that loses its grant is denied rather than replaced by the default.
      yield* mail.setThreadSelection(threadA, other.id);
      expect(yield* kindOf(mail.resolveAccount({ threadId: threadA }))).toBe("access-denied");

      yield* mail.upsertAccount(account("work", "second@example.com"));
      expect(yield* kindOf(mail.resolveAccount({ threadId: threadA, selector: "Work" }))).toBe(
        "ambiguous-account",
      );
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect("refuses a missing or deleted thread, even in a project with a grant", () =>
    Effect.gen(function* () {
      const mail = yield* MailConfig.MailConfigService;
      const work = yield* mail.upsertAccount(account("Work"));
      yield* mail.setProjectAccess({
        projectId: projectA,
        accountIds: [work.id],
        defaultAccountId: work.id,
      });
      expect((yield* mail.resolveAccount({ threadId: threadA })).account.id).toBe(work.id);

      for (const threadId of [threadDeleted, ThreadId.make("thread-missing")]) {
        expect(yield* kindOf(mail.resolveAccount({ threadId }))).toBe("access-denied");
        expect(yield* kindOf(mail.resolveAccount({ threadId, selector: work.id }))).toBe(
          "access-denied",
        );
        expect(yield* kindOf(mail.listThreadAccounts(threadId))).toBe("access-denied");
      }
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect("keeps secrets out of public views and the config file (A21)", () =>
    Effect.gen(function* () {
      const mail = yield* MailConfig.MailConfigService;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      const created = yield* mail.upsertAccount({
        ...account("Gmail"),
        auth: { kind: "oauth-google", clientId: "client-id", clientSecret: "client-shh" },
      });
      yield* mail.setCredential(created.id, { type: "oauth", refreshToken: "refresh-shh" });

      const listed = yield* mail.listAccounts;
      expect(listed[0]?.credentialConfigured).toBe(true);
      expect(listed[0]?.auth).toEqual({
        kind: "oauth-google",
        clientId: "client-id",
        clientSecretConfigured: true,
      });
      const file = yield* fs.readFileString(path.join(config.stateDir, "pulse-mail.json"));
      // The file holds secret references only; the public view holds neither bytes nor references.
      expect(file).not.toContain("shh");
      expect(JSON.stringify(listed)).not.toMatch(/shh|pulse-mail-/);
      expect(Option.getOrThrow(yield* mail.readCredential(created.id))).toEqual({
        type: "oauth",
        refreshToken: "refresh-shh",
      });
      expect(Option.getOrThrow(yield* mail.readClientSecret(created.id))).toBe("client-shh");

      // Removing the account also removes its secrets.
      yield* mail.removeAccount(created.id);
      const secretFiles = yield* fs.readDirectory(config.secretsDir);
      expect(secretFiles.filter((name) => name.startsWith("pulse-mail-"))).toEqual([]);
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect("reports revoked grants and removed accounts on the access change stream", () =>
    Effect.gen(function* () {
      const mail = yield* MailConfig.MailConfigService;
      const work = yield* mail.upsertAccount(account("Work"));
      const home = yield* mail.upsertAccount(account("Home"));
      yield* mail.setProjectAccess({ projectId: projectA, accountIds: [work.id, home.id] });
      const changes = yield* mail.subscribeAccessChanges;
      yield* mail.setProjectAccess({ projectId: projectA, accountIds: [home.id] });
      yield* mail.removeAccount(home.id);
      expect(yield* PubSub.takeAll(changes)).toEqual([
        { accountId: work.id, projectId: projectA },
        { accountId: home.id },
      ]);
      expect(yield* mail.getProjectAccess(projectA)).toEqual({
        projectId: projectA,
        accountIds: [],
      });
    }).pipe(Effect.scoped, Effect.provide(makeLayer())),
  );

  it.effect("removes a new secret when the config write fails", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const failing = FileSystem.FileSystem.of({
        ...fileSystem,
        rename: (from, to) =>
          String(to).endsWith("pulse-mail.json")
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "rename",
                  pathOrDescriptor: String(to),
                  description: "Injected rename failure.",
                }),
              )
            : fileSystem.rename(from, to),
      });
      yield* Effect.gen(function* () {
        const mail = yield* MailConfig.MailConfigService;
        const config = yield* ServerConfig.ServerConfig;
        const result = yield* Effect.exit(
          mail.upsertAccount({
            ...account("Gmail"),
            auth: { kind: "oauth-google", clientId: "id", clientSecret: "rollback-me" },
          }),
        );
        expect(result._tag).toBe("Failure");
        expect(yield* mail.listAccounts).toEqual([]);
        const secretFiles = yield* fileSystem
          .readDirectory(config.secretsDir)
          .pipe(Effect.orElseSucceed(() => []));
        expect(secretFiles.filter((name) => name.startsWith("pulse-mail-"))).toEqual([]);
      }).pipe(Effect.provide(makeLayer(failing)));
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
