import {
  MailAccountHealth,
  MailError,
  MailFolderOverrides,
  MailImapEndpoint,
  MailSmtpEndpoint,
  type MailAccount,
  type MailAccountInput,
  type MailProjectAccess,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import type * as Scope from "effect/Scope";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";

const CONFIG_FILE = "pulse-mail.json";
const MAX_ACCOUNTS = 32;

const StoredAuth = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("password") }),
  Schema.Struct({
    kind: Schema.Literals(["oauth-google", "oauth-microsoft"]),
    clientId: Schema.String,
    tenant: Schema.optionalKey(Schema.String),
    clientSecretRef: Schema.optionalKey(Schema.String),
  }),
]);

const StoredAccount = Schema.Struct({
  id: Schema.String,
  nickname: Schema.String,
  address: Schema.String,
  username: Schema.String,
  imap: MailImapEndpoint,
  smtp: MailSmtpEndpoint,
  auth: StoredAuth,
  allowPrivateNetwork: Schema.Boolean,
  appendToSent: Schema.Boolean,
  folders: MailFolderOverrides,
  credentialRef: Schema.optionalKey(Schema.String),
  health: MailAccountHealth,
});
export type StoredMailAccount = typeof StoredAccount.Type;

const PersistedState = Schema.Struct({
  version: Schema.Literal(1),
  accounts: Schema.Record(Schema.String, StoredAccount),
  projects: Schema.Record(
    Schema.String,
    Schema.Struct({
      accountIds: Schema.Array(Schema.String),
      defaultAccountId: Schema.optionalKey(Schema.String),
    }),
  ),
  threads: Schema.Record(Schema.String, Schema.String),
});
type PersistedState = typeof PersistedState.Type;

const PersistedStateJson = Schema.fromJsonString(PersistedState);
const decodeState = Schema.decodeUnknownEffect(PersistedStateJson);
const encodeState = Schema.encodeSync(PersistedStateJson);

export const MailCredential = Schema.Union([
  Schema.Struct({ type: Schema.Literal("password"), password: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("oauth"),
    refreshToken: Schema.String,
    accessToken: Schema.optionalKey(Schema.String),
    /** Epoch milliseconds. */
    expiresAt: Schema.optionalKey(Schema.Number),
  }),
]);
export type MailCredential = typeof MailCredential.Type;
const MailCredentialJson = Schema.fromJsonString(MailCredential);
const decodeCredential = Schema.decodeUnknownEffect(MailCredentialJson);
const encodeCredential = Schema.encodeSync(MailCredentialJson);

const emptyState = (): PersistedState => ({ version: 1, accounts: {}, projects: {}, threads: {} });

/** The account a mail operation runs against, after grant checks. */
export interface ResolvedMailAccount {
  readonly account: StoredMailAccount;
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
}

/** Emitted when an account's reach shrinks, so pending sends can be invalidated. */
export type MailAccessChange =
  | { readonly accountId: string }
  | { readonly accountId: string; readonly projectId: string };

const fail = (kind: MailError["kind"], message: string) => new MailError({ kind, message });

const toPublic = (account: StoredMailAccount): MailAccount => ({
  id: account.id,
  nickname: account.nickname,
  address: account.address,
  username: account.username,
  imap: account.imap,
  smtp: account.smtp,
  auth:
    account.auth.kind === "password"
      ? { kind: "password" }
      : account.auth.kind === "oauth-google"
        ? {
            kind: "oauth-google",
            clientId: account.auth.clientId,
            clientSecretConfigured: account.auth.clientSecretRef !== undefined,
          }
        : {
            kind: "oauth-microsoft",
            clientId: account.auth.clientId,
            ...(account.auth.tenant ? { tenant: account.auth.tenant } : {}),
            clientSecretConfigured: account.auth.clientSecretRef !== undefined,
          },
  allowPrivateNetwork: account.allowPrivateNetwork,
  appendToSent: account.appendToSent,
  folders: account.folders,
  credentialConfigured: account.credentialRef !== undefined,
  health: account.health,
});

const normalizeNickname = (value: string) => value.trim().toLowerCase();

export class MailConfigService extends Context.Service<
  MailConfigService,
  {
    readonly listAccounts: Effect.Effect<ReadonlyArray<MailAccount>, MailError>;
    readonly getAccount: (accountId: string) => Effect.Effect<StoredMailAccount, MailError>;
    readonly upsertAccount: (input: MailAccountInput) => Effect.Effect<MailAccount, MailError>;
    readonly removeAccount: (accountId: string) => Effect.Effect<void, MailError>;
    /** Deletes the stored sign-in but keeps the account, its grants, and its nickname. */
    readonly disconnectAccount: (accountId: string) => Effect.Effect<MailAccount, MailError>;
    readonly setCredential: (
      accountId: string,
      credential: MailCredential,
    ) => Effect.Effect<MailAccount, MailError>;
    /** Server-internal. Never return the result to a client or a tool. */
    readonly readCredential: (
      accountId: string,
    ) => Effect.Effect<Option.Option<MailCredential>, MailError>;
    /** Server-internal. Never return the result to a client or a tool. */
    readonly readClientSecret: (
      accountId: string,
    ) => Effect.Effect<Option.Option<string>, MailError>;
    readonly setHealth: (
      accountId: string,
      health: MailAccountHealth,
    ) => Effect.Effect<MailAccount, MailError>;
    readonly getProjectAccess: (
      projectId: ProjectId,
    ) => Effect.Effect<MailProjectAccess, MailError>;
    readonly setProjectAccess: (
      access: MailProjectAccess,
    ) => Effect.Effect<MailProjectAccess, MailError>;
    readonly getThreadSelection: (
      threadId: ThreadId,
    ) => Effect.Effect<string | undefined, MailError>;
    readonly setThreadSelection: (
      threadId: ThreadId,
      accountId: string | null,
    ) => Effect.Effect<void, MailError>;
    /**
     * Picks the account for a thread: explicit selector, then thread selection, then project
     * default. The project always comes from the thread record, never from the caller. A missing,
     * ungranted, or ambiguous choice fails; there is no fallback to another account.
     */
    readonly resolveAccount: (input: {
      readonly threadId: ThreadId;
      readonly selector?: string | undefined;
    }) => Effect.Effect<ResolvedMailAccount, MailError>;
    /** Accounts granted to a thread's project, for listing. */
    readonly listThreadAccounts: (
      threadId: ThreadId,
    ) => Effect.Effect<
      { readonly accounts: ReadonlyArray<MailAccount>; readonly projectId: ProjectId },
      MailError
    >;
    /** Subscribes before returning, so no change published afterwards is missed. */
    readonly subscribeAccessChanges: Effect.Effect<
      PubSub.Subscription<MailAccessChange>,
      never,
      Scope.Scope
    >;
  }
>()("t3/mail/MailConfigService") {}

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const config = yield* ServerConfig.ServerConfig;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const lock = yield* Semaphore.make(1);
  const changes = yield* PubSub.unbounded<MailAccessChange>();
  const configPath = path.join(config.stateDir, CONFIG_FILE);

  const ioError = (action: string) => () =>
    fail("unavailable", `Failed to ${action} mail configuration.`);

  const load = fs.exists(configPath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(configPath).pipe(Effect.flatMap((raw) => decodeState(raw)))
        : Effect.succeed(emptyState()),
    ),
    Effect.mapError(ioError("read")),
  );

  const persist = (state: PersistedState) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(config.stateDir, { recursive: true, mode: 0o700 });
      const temporaryPath = `${configPath}.${yield* crypto.randomUUIDv4}.tmp`;
      yield* fs.writeFileString(temporaryPath, `${encodeState(state)}\n`, { mode: 0o600 });
      yield* fs
        .rename(temporaryPath, configPath)
        .pipe(Effect.tapError(() => fs.remove(temporaryPath).pipe(Effect.ignore)));
    }).pipe(Effect.mapError(ioError("write")));

  const withState = <A>(
    update: (state: PersistedState) => Effect.Effect<readonly [A, PersistedState], MailError>,
  ) =>
    lock.withPermits(1)(
      load.pipe(
        Effect.flatMap(update),
        Effect.tap(([, state]) => persist(state)),
        Effect.map(([value]) => value),
      ),
    );

  const readOnly = <A>(read: (state: PersistedState) => Effect.Effect<A, MailError>) =>
    lock.withPermits(1)(load.pipe(Effect.flatMap(read)));

  const requireAccount = (
    state: PersistedState,
    accountId: string,
  ): Effect.Effect<StoredMailAccount, MailError> => {
    const account = state.accounts[accountId];
    return account === undefined
      ? Effect.fail(fail("not-found", "That mail account does not exist on this environment."))
      : Effect.succeed(account);
  };

  const newSecretName = (prefix: string, accountId: string) =>
    crypto.randomUUIDv4.pipe(
      Effect.map((uuid) => `pulse-mail-${prefix}-${accountId}-${uuid}`),
      Effect.mapError(ioError("write")),
    );

  /** Writes a new secret, then the config that references it, removing the secret if that fails. */
  const commitWithSecret = <A>(
    secretName: string | undefined,
    secretValue: Uint8Array | undefined,
    nextState: PersistedState,
    value: A,
  ) =>
    Effect.uninterruptibleMask(() =>
      (secretName && secretValue
        ? secrets.create(secretName, secretValue).pipe(Effect.mapError(ioError("store secret for")))
        : Effect.void
      ).pipe(
        Effect.flatMap(() => persist(nextState)),
        Effect.tapError(() =>
          secretName ? secrets.remove(secretName).pipe(Effect.ignore) : Effect.void,
        ),
        Effect.as(value),
      ),
    );

  const removeSecrets = (names: ReadonlyArray<string | undefined>) =>
    Effect.forEach(
      names.filter((name): name is string => name !== undefined),
      (name) => secrets.remove(name).pipe(Effect.ignore),
      { discard: true },
    );

  const publish = (change: MailAccessChange) => PubSub.publish(changes, change);

  const listAccounts = readOnly((state) =>
    Effect.succeed(Object.values(state.accounts).map(toPublic)),
  );

  const upsertAccount = (input: MailAccountInput) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* load;
        const previous = input.id === undefined ? undefined : state.accounts[input.id];
        if (input.id !== undefined && previous === undefined) {
          return yield* fail("not-found", "That mail account does not exist on this environment.");
        }
        if (previous === undefined && Object.keys(state.accounts).length >= MAX_ACCOUNTS) {
          return yield* fail(
            "limit-exceeded",
            `At most ${MAX_ACCOUNTS} mail accounts are supported.`,
          );
        }
        const id =
          previous?.id ??
          `acct_${(yield* crypto.randomUUIDv4.pipe(Effect.mapError(ioError("write")))).replaceAll("-", "").slice(0, 16)}`;
        const authKindChanged = previous !== undefined && previous.auth.kind !== input.auth.kind;
        const previousClientSecretRef =
          previous?.auth.kind !== "password" && !authKindChanged
            ? previous?.auth.clientSecretRef
            : undefined;
        let clientSecretRef = previousClientSecretRef;
        let newSecret: { name: string; value: Uint8Array } | undefined;
        if (input.auth.kind !== "password" && input.auth.clientSecret !== undefined) {
          if (input.auth.clientSecret === "") clientSecretRef = undefined;
          else {
            const name = yield* newSecretName("client", id);
            newSecret = { name, value: new TextEncoder().encode(input.auth.clientSecret) };
            clientSecretRef = name;
          }
        }
        const endpointChanged =
          previous !== undefined &&
          (previous.imap.host !== input.imap.host ||
            previous.imap.port !== input.imap.port ||
            previous.smtp.host !== input.smtp.host ||
            previous.smtp.port !== input.smtp.port ||
            previous.address !== input.address);
        // A credential belongs to one sign-in method; switching methods requires signing in again.
        const credentialRef = authKindChanged ? undefined : previous?.credentialRef;
        const account: StoredMailAccount = {
          id,
          nickname: input.nickname.trim(),
          address: input.address,
          username: input.username ?? input.address,
          imap: input.imap,
          smtp: input.smtp,
          auth:
            input.auth.kind === "password"
              ? { kind: "password" }
              : {
                  kind: input.auth.kind,
                  clientId: input.auth.clientId,
                  ...(input.auth.kind === "oauth-microsoft" && input.auth.tenant
                    ? { tenant: input.auth.tenant }
                    : {}),
                  ...(clientSecretRef ? { clientSecretRef } : {}),
                },
          allowPrivateNetwork: input.allowPrivateNetwork ?? false,
          appendToSent: input.appendToSent ?? input.auth.kind !== "oauth-google",
          folders: input.folders ?? {},
          ...(credentialRef ? { credentialRef } : {}),
          health:
            previous === undefined || endpointChanged || authKindChanged
              ? { status: "unknown" }
              : previous.health,
        };
        const nextState = { ...state, accounts: { ...state.accounts, [id]: account } };
        yield* commitWithSecret(newSecret?.name, newSecret?.value, nextState, undefined);
        yield* removeSecrets([
          clientSecretRef !== previousClientSecretRef ? previousClientSecretRef : undefined,
          previous?.auth.kind !== "password" && authKindChanged
            ? previous?.auth.clientSecretRef
            : undefined,
          authKindChanged ? previous?.credentialRef : undefined,
        ]);
        if (previous !== undefined && (endpointChanged || authKindChanged)) {
          yield* publish({ accountId: id });
        }
        return toPublic(account);
      }),
    );

  const removeAccount = (accountId: string) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* load;
        const account = yield* requireAccount(state, accountId);
        const { [accountId]: _removed, ...accounts } = state.accounts;
        const projects = Object.fromEntries(
          Object.entries(state.projects).map(([projectId, access]) => [
            projectId,
            {
              accountIds: access.accountIds.filter((id) => id !== accountId),
              ...(access.defaultAccountId && access.defaultAccountId !== accountId
                ? { defaultAccountId: access.defaultAccountId }
                : {}),
            },
          ]),
        );
        const threads = Object.fromEntries(
          Object.entries(state.threads).filter(([, id]) => id !== accountId),
        );
        yield* persist({ ...state, accounts, projects, threads });
        yield* removeSecrets([
          account.credentialRef,
          account.auth.kind === "password" ? undefined : account.auth.clientSecretRef,
        ]);
        yield* publish({ accountId });
      }),
    );

  const disconnectAccount = (accountId: string) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* load;
        const { credentialRef, ...account } = yield* requireAccount(state, accountId);
        const next: StoredMailAccount = {
          ...account,
          health: { status: "reauth-required", message: "Signed out. Sign in again to use it." },
        };
        yield* persist({ ...state, accounts: { ...state.accounts, [accountId]: next } });
        yield* removeSecrets([credentialRef]);
        // Pending sends for this account become unusable (A05).
        yield* publish({ accountId });
        return toPublic(next);
      }),
    );

  const setCredential = (accountId: string, credential: MailCredential) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* load;
        const account = yield* requireAccount(state, accountId);
        if ((credential.type === "password") !== (account.auth.kind === "password")) {
          return yield* fail(
            "invalid-input",
            "This credential does not match the account's sign-in method.",
          );
        }
        const name = yield* newSecretName("credential", accountId);
        const next: StoredMailAccount = {
          ...account,
          credentialRef: name,
          health: { status: "unknown" },
        };
        yield* commitWithSecret(
          name,
          new TextEncoder().encode(encodeCredential(credential)),
          { ...state, accounts: { ...state.accounts, [accountId]: next } },
          undefined,
        );
        yield* removeSecrets([account.credentialRef]);
        return toPublic(next);
      }),
    );

  const readSecret = (name: string | undefined) =>
    name === undefined
      ? Effect.succeed(Option.none<Uint8Array>())
      : secrets.get(name).pipe(Effect.mapError(ioError("read secret for")));

  const readCredential = (accountId: string) =>
    readOnly((state) => requireAccount(state, accountId)).pipe(
      Effect.flatMap((account) => readSecret(account.credentialRef)),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (bytes) =>
            decodeCredential(new TextDecoder().decode(bytes)).pipe(
              Effect.map(Option.some),
              Effect.mapError(ioError("read secret for")),
            ),
        }),
      ),
    );

  const readClientSecret = (accountId: string) =>
    readOnly((state) => requireAccount(state, accountId)).pipe(
      Effect.flatMap((account) =>
        readSecret(account.auth.kind === "password" ? undefined : account.auth.clientSecretRef),
      ),
      Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes))),
    );

  const setHealth = (accountId: string, health: MailAccountHealth) =>
    withState((state) =>
      requireAccount(state, accountId).pipe(
        Effect.map((account) => {
          const next = { ...account, health };
          return [
            toPublic(next),
            { ...state, accounts: { ...state.accounts, [accountId]: next } },
          ] as const;
        }),
      ),
    );

  const accessOf = (state: PersistedState, projectId: ProjectId): MailProjectAccess => {
    const stored = state.projects[projectId];
    return {
      projectId,
      accountIds: stored?.accountIds ?? [],
      ...(stored?.defaultAccountId ? { defaultAccountId: stored.defaultAccountId } : {}),
    };
  };

  const getProjectAccess = (projectId: ProjectId) =>
    readOnly((state) => Effect.succeed(accessOf(state, projectId)));

  const setProjectAccess = (access: MailProjectAccess) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const state = yield* load;
        const accountIds = [...new Set(access.accountIds)];
        for (const id of accountIds) yield* requireAccount(state, id);
        if (
          access.defaultAccountId !== undefined &&
          !accountIds.includes(access.defaultAccountId)
        ) {
          return yield* fail(
            "invalid-input",
            "The default account must be one of the granted accounts.",
          );
        }
        const previous = accessOf(state, access.projectId);
        const next = {
          accountIds,
          ...(access.defaultAccountId ? { defaultAccountId: access.defaultAccountId } : {}),
        };
        yield* persist({ ...state, projects: { ...state.projects, [access.projectId]: next } });
        for (const revoked of previous.accountIds.filter((id) => !accountIds.includes(id))) {
          yield* publish({ accountId: revoked, projectId: access.projectId });
        }
        return { projectId: access.projectId, ...next };
      }),
    );

  const getThreadSelection = (threadId: ThreadId) =>
    readOnly((state) => Effect.succeed(state.threads[threadId]));

  const setThreadSelection = (threadId: ThreadId, accountId: string | null) =>
    withState((state) =>
      Effect.gen(function* () {
        if (accountId === null) {
          const { [threadId]: _cleared, ...threads } = state.threads;
          return [undefined, { ...state, threads }] as const;
        }
        yield* requireAccount(state, accountId);
        return [
          undefined,
          { ...state, threads: { ...state.threads, [threadId]: accountId } },
        ] as const;
      }),
    );

  const projectOfThread = (threadId: ThreadId) =>
    orchestrator.getThreadShell(threadId).pipe(
      Effect.mapError(() => fail("unavailable", "Could not read the thread.")),
      Effect.flatMap((thread) =>
        thread === null || thread.deletedAt !== null
          ? Effect.fail(fail("access-denied", "This thread is not available."))
          : Effect.succeed(thread.projectId),
      ),
    );

  const denied = () => fail("access-denied", "That mail account is not available to this project.");

  const resolveAccount = (input: {
    readonly threadId: ThreadId;
    readonly selector?: string | undefined;
  }) =>
    Effect.gen(function* () {
      const projectId = yield* projectOfThread(input.threadId);
      const state = yield* readOnly(Effect.succeed);
      const access = accessOf(state, projectId);
      const granted = (id: string | undefined) =>
        id !== undefined && access.accountIds.includes(id) ? state.accounts[id] : undefined;

      let chosen: StoredMailAccount | undefined;
      const selector = input.selector?.trim();
      if (selector) {
        const byId = state.accounts[selector];
        const byNickname = Object.values(state.accounts).filter(
          (account) => normalizeNickname(account.nickname) === normalizeNickname(selector),
        );
        if (byId === undefined && byNickname.length > 1) {
          return yield* fail(
            "ambiguous-account",
            `More than one mail account is named "${selector}". Use the account ID instead.`,
          );
        }
        const match = byId ?? byNickname[0];
        chosen = granted(match?.id);
        if (chosen === undefined) return yield* denied();
      } else {
        const selected = state.threads[input.threadId];
        if (selected !== undefined) {
          chosen = granted(selected);
          if (chosen === undefined) return yield* denied();
        } else {
          chosen = granted(access.defaultAccountId);
          if (chosen === undefined) {
            return yield* fail(
              "access-denied",
              "No mail account is selected for this thread. Name an account or set a project default.",
            );
          }
        }
      }
      return { account: chosen, projectId, threadId: input.threadId } satisfies ResolvedMailAccount;
    });

  const listThreadAccounts = (threadId: ThreadId) =>
    Effect.gen(function* () {
      const projectId = yield* projectOfThread(threadId);
      const state = yield* readOnly(Effect.succeed);
      const access = accessOf(state, projectId);
      return {
        projectId,
        accounts: access.accountIds.flatMap((id) => {
          const account = state.accounts[id];
          return account ? [toPublic(account)] : [];
        }),
      };
    });

  return MailConfigService.of({
    listAccounts,
    getAccount: (accountId) => readOnly((state) => requireAccount(state, accountId)),
    upsertAccount,
    removeAccount,
    disconnectAccount,
    setCredential,
    readCredential,
    readClientSecret,
    setHealth,
    getProjectAccess,
    setProjectAccess,
    getThreadSelection,
    setThreadSelection,
    resolveAccount,
    listThreadAccounts,
    subscribeAccessChanges: PubSub.subscribe(changes),
  });
});

export const layer = Layer.effect(MailConfigService, make);
