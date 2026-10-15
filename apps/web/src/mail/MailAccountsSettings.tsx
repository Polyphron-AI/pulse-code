import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type MailAccount,
  type MailProjectAccess,
} from "@t3tools/contracts";
import { useEffect, useState, type ReactNode } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { resolveEnvironmentOptionLabel } from "../components/BranchToolbar.logic";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { SettingsPageContainer, SettingsSection } from "../components/settings/settingsLayout";
import { ensureLocalApi } from "../localApi";
import { resolveMcpEnvironmentId } from "../mcp/McpConnectionsSettings";
import { useProjects } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentSessionState } from "../state/session";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import {
  EMPTY_MAIL_ACCOUNT_DRAFT,
  accountUpdateInput,
  buildMailAccountInput,
  completePulseMailOAuth,
  mailHealthIsProblem,
  mailHealthLabel,
  pulseMailAccounts,
  pulseMailProjectAccess,
  removePulseMailAccount,
  disconnectPulseMailAccount,
  setProjectDefault,
  setPulseMailPassword,
  setPulseMailProjectAccess,
  startPulseMailOAuth,
  testPulseMailAccount,
  toggleProjectGrant,
  upsertPulseMailAccount,
  type MailAccountDraft,
} from "./mailState";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** Returns a command's value, or throws its redacted failure for the caller to show. */
function unwrap<A>(
  result:
    | { readonly _tag: "Success"; readonly value: A }
    | {
        readonly _tag: "Failure";
        readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
      },
): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

export function MailAccountsSettingsPanel() {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environmentId = resolveMcpEnvironmentId(
    environments.map(({ environmentId }) => environmentId),
    selectedEnvironmentId,
    primaryEnvironmentId,
  );
  return (
    <SettingsPageContainer>
      <SettingsSection id="email-accounts" title="Email accounts" variant="plain">
        <div className="space-y-4 p-3 sm:p-4">
          {!isReady ? (
            <p className="text-sm text-muted-foreground">Checking environments…</p>
          ) : !environmentId ? (
            <p className="text-sm text-muted-foreground">No environment is connected.</p>
          ) : (
            <MailEnvironment
              key={environmentId}
              environmentId={environmentId}
              environments={environments}
              primaryEnvironmentId={primaryEnvironmentId}
              onEnvironmentChange={setSelectedEnvironmentId}
            />
          )}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function MailEnvironment({
  environmentId,
  environments,
  primaryEnvironmentId,
  onEnvironmentChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly environments: ReturnType<typeof useEnvironments>["environments"];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onEnvironmentChange: (id: EnvironmentId) => void;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const liveConfigReady = projection?.source === "live";
  const supported = liveConfigReady && projection.config.pulseCapabilities?.mailManagement === true;
  const session = useEnvironmentSessionState(environmentId);
  const sessionFresh = !session.isPending && session.data?.authenticated === true;
  const canOperate =
    sessionFresh && session.data?.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const list = useEnvironmentQuery(
    supported && canOperate ? pulseMailAccounts({ environmentId, input: {} }) : null,
  );
  const [accounts, setAccounts] = useState<ReadonlyArray<MailAccount>>([]);
  useEffect(() => {
    if (list.data) setAccounts(list.data);
  }, [list.data]);
  const replace = (account: MailAccount) =>
    setAccounts((current) =>
      [...current.filter(({ id }) => id !== account.id), account].sort((a, b) =>
        a.nickname.localeCompare(b.nickname),
      ),
    );

  const label = (candidate: (typeof environments)[number]) =>
    resolveEnvironmentOptionLabel({
      isPrimary: candidate.environmentId === primaryEnvironmentId,
      environmentId: candidate.environmentId,
      runtimeLabel: candidate.label,
    });
  const selected = environments.find((environment) => environment.environmentId === environmentId)!;

  let body: ReactNode;
  if (!liveConfigReady) {
    body = <Muted>Waiting for current email support from this environment.</Muted>;
  } else if (!supported) {
    body = <Muted>Email accounts are not supported by this environment.</Muted>;
  } else if (session.isPending) {
    body = <Muted>Checking access…</Muted>;
  } else if (!canOperate) {
    body = <Muted>This session cannot manage email accounts on this environment.</Muted>;
  } else if (list.error) {
    body = (
      <ErrorLine message={`Could not load email accounts. ${list.error}`} onRetry={list.refresh} />
    );
  } else if (list.isPending && list.data === null) {
    body = <Muted>Loading email accounts…</Muted>;
  } else {
    body = (
      <>
        {accounts.length === 0 ? <Muted>No email accounts yet.</Muted> : null}
        {accounts.map((account) => (
          <MailAccountCard
            key={account.id}
            environmentId={environmentId}
            account={account}
            onChanged={replace}
            onRemoved={() =>
              setAccounts((current) => current.filter(({ id }) => id !== account.id))
            }
          />
        ))}
        <AddMailAccount environmentId={environmentId} onAdded={replace} />
        {accounts.length > 0 ? (
          <MailProjectGrants environmentId={environmentId} accounts={accounts} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Accounts and credentials are stored on one environment. Agents only see accounts granted
          to their project.
        </p>
        <Select
          value={environmentId}
          onValueChange={(value) => value && onEnvironmentChange(value as EnvironmentId)}
        >
          <SelectTrigger size="sm" className="w-full sm:w-52" aria-label="Email environment">
            <SelectValue>{label(selected)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {environments.map((environment) => (
              <SelectItem key={environment.environmentId} value={environment.environmentId}>
                {label(environment)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      {body}
    </>
  );
}

function Muted({ children }: { readonly children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ErrorLine({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <p className="text-error-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="compact" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function MailAccountCard({
  environmentId,
  account,
  onChanged,
  onRemoved,
}: {
  readonly environmentId: EnvironmentId;
  readonly account: MailAccount;
  readonly onChanged: (account: MailAccount) => void;
  readonly onRemoved: () => void;
}) {
  const upsert = useAtomCommand(upsertPulseMailAccount, { reportFailure: false });
  const remove = useAtomCommand(removePulseMailAccount, { reportFailure: false });
  const disconnect = useAtomCommand(disconnectPulseMailAccount, { reportFailure: false });
  const test = useAtomCommand(testPulseMailAccount, { reportFailure: false });
  const setPassword = useAtomCommand(setPulseMailPassword, { reportFailure: false });
  const startOAuth = useAtomCommand(startPulseMailOAuth, { reportFailure: false });
  const completeOAuth = useAtomCommand(completePulseMailOAuth, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [password, setPasswordValue] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const accountId = account.id;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const runTest = () =>
    run(async () => onChanged(unwrap(await test({ environmentId, input: { accountId } }))));
  const authenticate = () =>
    account.auth.kind === "password"
      ? Promise.resolve(setPasswordValue(""))
      : run(async () => {
          const flow = unwrap(await startOAuth({ environmentId, input: { accountId } }));
          setFlowId(flow.flowId);
          setRedirectUrl("");
          await ensureLocalApi().shell.openExternal(flow.authorizeUrl);
        });
  const problem = mailHealthIsProblem(account);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {account.nickname} <span className="text-muted-foreground">{account.address}</span>
          </p>
          <p
            className={problem ? "text-xs text-error-foreground" : "text-xs text-muted-foreground"}
          >
            {mailHealthLabel(account)}
            {account.health.message ? `: ${account.health.message}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="compact" disabled={busy} onClick={() => void runTest()}>
            {problem ? "Retry" : "Test"}
          </Button>
          <Button
            variant="outline"
            size="compact"
            disabled={busy}
            onClick={() => void authenticate()}
          >
            {account.credentialConfigured ? "Re-authenticate" : "Sign in"}
          </Button>
          <Button
            variant="outline"
            size="compact"
            disabled={busy}
            onClick={() => setNickname(account.nickname)}
          >
            Rename
          </Button>
          {account.credentialConfigured ? (
            <Button
              variant="outline"
              size="compact"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  onChanged(unwrap(await disconnect({ environmentId, input: { accountId } }))),
                )
              }
            >
              Disconnect
            </Button>
          ) : null}
          <Button
            variant="destructive-outline"
            size="compact"
            disabled={busy}
            onClick={() =>
              confirmRemove
                ? void run(async () => {
                    unwrap(await remove({ environmentId, input: { accountId } }));
                    onRemoved();
                  })
                : setConfirmRemove(true)
            }
          >
            {confirmRemove ? "Confirm remove" : "Remove"}
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch
          size="sm"
          checked={account.allowPrivateNetwork}
          disabled={busy}
          onCheckedChange={(checked) =>
            void run(async () =>
              onChanged(
                unwrap(
                  await upsert({
                    environmentId,
                    input: accountUpdateInput(account, { allowPrivateNetwork: checked }),
                  }),
                ),
              ),
            )
          }
        />
        Allow private network hosts
      </label>
      {nickname !== null ? (
        <InlineForm
          onCancel={() => setNickname(null)}
          submitLabel="Save"
          disabled={busy || nickname.trim().length === 0}
          onSubmit={() =>
            run(async () => {
              onChanged(
                unwrap(
                  await upsert({ environmentId, input: accountUpdateInput(account, { nickname }) }),
                ),
              );
              setNickname(null);
            })
          }
        >
          <Input
            size="sm"
            aria-label="Nickname"
            value={nickname}
            maxLength={64}
            onChange={(event) => setNickname(event.currentTarget.value)}
          />
        </InlineForm>
      ) : null}
      {password !== null ? (
        <InlineForm
          onCancel={() => setPasswordValue(null)}
          submitLabel="Save password"
          disabled={busy || password.length === 0}
          onSubmit={() =>
            run(async () => {
              onChanged(
                unwrap(await setPassword({ environmentId, input: { accountId, password } })),
              );
              setPasswordValue(null);
            })
          }
        >
          <Input
            size="sm"
            type="password"
            autoComplete="new-password"
            aria-label="Password or app password"
            placeholder="Password or app password"
            value={password}
            onChange={(event) => setPasswordValue(event.currentTarget.value)}
          />
        </InlineForm>
      ) : null}
      {flowId !== null ? (
        <InlineForm
          onCancel={() => setFlowId(null)}
          submitLabel="Finish sign-in"
          disabled={busy || redirectUrl.trim().length === 0}
          onSubmit={() =>
            run(async () => {
              onChanged(
                unwrap(
                  await completeOAuth({
                    environmentId,
                    input: { flowId, redirectUrl: redirectUrl.trim() },
                  }),
                ),
              );
              setFlowId(null);
            })
          }
        >
          <Input
            size="sm"
            aria-label="Redirect URL"
            placeholder="Paste the full URL from the browser after signing in"
            value={redirectUrl}
            onChange={(event) => setRedirectUrl(event.currentTarget.value)}
          />
        </InlineForm>
      ) : null}
      {error ? <ErrorLine message={error} /> : null}
    </div>
  );
}

function InlineForm({
  children,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  readonly children: ReactNode;
  readonly submitLabel: string;
  readonly disabled: boolean;
  readonly onSubmit: () => Promise<void>;
  readonly onCancel: () => void;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void onSubmit();
      }}
    >
      <div className="min-w-48 flex-1">{children}</div>
      <Button type="submit" size="compact" disabled={disabled}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

const AUTH_LABELS = {
  password: "Password",
  "oauth-google": "Google OAuth",
  "oauth-microsoft": "Microsoft OAuth",
} as const;

function AddMailAccount({
  environmentId,
  onAdded,
}: {
  readonly environmentId: EnvironmentId;
  readonly onAdded: (account: MailAccount) => void;
}) {
  const upsert = useAtomCommand(upsertPulseMailAccount, { reportFailure: false });
  const [draft, setDraft] = useState<MailAccountDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (draft === null)
    return (
      <Button variant="outline" size="compact" onClick={() => setDraft(EMPTY_MAIL_ACCOUNT_DRAFT)}>
        Add account
      </Button>
    );
  const set = <K extends keyof MailAccountDraft>(key: K, value: MailAccountDraft[K]) =>
    setDraft({ ...draft, [key]: value });
  const text = (
    key: "nickname" | "address" | "username" | "imapHost" | "smtpHost" | "clientId" | "tenant",
    label: string,
  ) => (
    <Input
      size="sm"
      aria-label={label}
      placeholder={label}
      value={draft[key]}
      onChange={(event) => set(key, event.currentTarget.value)}
    />
  );
  return (
    <form
      className="space-y-2 rounded-lg border border-border p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const built = buildMailAccountInput(draft);
        if ("error" in built) {
          setError(built.error);
          return;
        }
        setBusy(true);
        setError(null);
        void upsert({ environmentId, input: built.input })
          .then((result) => {
            onAdded(unwrap(result));
            setDraft(null);
          })
          .catch((cause: unknown) => setError(errorMessage(cause)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-medium">New email account</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {text("nickname", "Nickname")}
        {text("address", "Email address")}
        {text("username", "Username (defaults to address)")}
        <Select
          value={draft.authKind}
          onValueChange={(value) => value && set("authKind", value as MailAccountDraft["authKind"])}
        >
          <SelectTrigger size="sm" aria-label="Sign-in method">
            <SelectValue>{AUTH_LABELS[draft.authKind]}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {(Object.keys(AUTH_LABELS) as Array<keyof typeof AUTH_LABELS>).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {AUTH_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {text("imapHost", "IMAP host")}
        <PortSelect
          label="IMAP port"
          value={draft.imapPort}
          options={[993, 143] as const}
          onChange={(port) => set("imapPort", port)}
        />
        {text("smtpHost", "SMTP host")}
        <PortSelect
          label="SMTP port"
          value={draft.smtpPort}
          options={[465, 587] as const}
          onChange={(port) => set("smtpPort", port)}
        />
        {draft.authKind !== "password" ? (
          <>
            {text("clientId", "OAuth client ID")}
            <Input
              size="sm"
              type="password"
              autoComplete="new-password"
              aria-label="OAuth client secret (optional)"
              placeholder="OAuth client secret (optional)"
              value={draft.clientSecret}
              onChange={(event) => set("clientSecret", event.currentTarget.value)}
            />
            {draft.authKind === "oauth-microsoft" ? text("tenant", "Tenant (optional)") : null}
          </>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch
          size="sm"
          checked={draft.allowPrivateNetwork}
          onCheckedChange={(checked) => set("allowPrivateNetwork", checked)}
        />
        Allow private network hosts
      </label>
      <p className="text-xs text-muted-foreground">
        After adding, use Sign in to store a password or complete OAuth.
      </p>
      {error ? <ErrorLine message={error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" size="compact" disabled={busy}>
          Add account
        </Button>
        <Button type="button" variant="ghost" size="compact" onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PortSelect<P extends number>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: P;
  readonly options: ReadonlyArray<P>;
  readonly onChange: (port: P) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(next) => next && onChange(Number(next) as P)}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue>{`${label} ${value}`}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map((port) => (
          <SelectItem key={port} value={String(port)}>
            {`${label} ${port}`}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function MailProjectGrants({
  environmentId,
  accounts,
}: {
  readonly environmentId: EnvironmentId;
  readonly accounts: ReadonlyArray<MailAccount>;
}) {
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">Project access</p>
      {projects.length === 0 ? <Muted>No projects on this environment.</Muted> : null}
      {projects.map((project) => (
        <MailProjectGrant
          key={project.id}
          environmentId={environmentId}
          projectId={project.id}
          title={project.title}
          accounts={accounts}
        />
      ))}
    </div>
  );
}

const NO_DEFAULT = "__none__";

function MailProjectGrant({
  environmentId,
  projectId,
  title,
  accounts,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: MailProjectAccess["projectId"];
  readonly title: string;
  readonly accounts: ReadonlyArray<MailAccount>;
}) {
  const query = useEnvironmentQuery(
    pulseMailProjectAccess({ environmentId, input: { projectId } }),
  );
  const save = useAtomCommand(setPulseMailProjectAccess, { reportFailure: false });
  const [access, setAccess] = useState<MailProjectAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data) setAccess(query.data);
  }, [query.data]);
  const update = (next: MailProjectAccess) => {
    setBusy(true);
    setError(null);
    void save({ environmentId, input: next })
      .then((result) => setAccess(unwrap(result)))
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const defaultAccount = accounts.find(({ id }) => id === access?.defaultAccountId);
  return (
    <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate">{title}</p>
        {access ? (
          <Select
            value={access.defaultAccountId ?? NO_DEFAULT}
            onValueChange={(value) =>
              value && update(setProjectDefault(access, value === NO_DEFAULT ? null : value))
            }
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-52"
              aria-label={`Default account for ${title}`}
            >
              <SelectValue>
                {defaultAccount ? `Default: ${defaultAccount.nickname}` : "No default account"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value={NO_DEFAULT}>No default account</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.nickname}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
      </div>
      {query.error ? (
        <ErrorLine message={`Could not load access. ${query.error}`} onRetry={query.refresh} />
      ) : !access ? (
        <Muted>Loading…</Muted>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {accounts.map((account) => (
            <label key={account.id} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={access.accountIds.includes(account.id)}
                disabled={busy}
                onCheckedChange={(checked) =>
                  update(toggleProjectGrant(access, account.id, checked === true))
                }
              />
              {account.nickname}
            </label>
          ))}
        </div>
      )}
      {error ? <ErrorLine message={error} /> : null}
    </div>
  );
}
