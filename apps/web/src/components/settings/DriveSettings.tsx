import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type DriveConnection,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentSessionState } from "../../state/session";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { drive } from "../../state/drive";
import { useMailCapabilities } from "../workspace/mail/useMailCapabilities";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
export function DriveSettings() {
  const { environments } = useEnvironments();
  const primary = usePrimaryEnvironmentId();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const environmentId = environments.some((env) => env.environmentId === selected)
    ? selected
    : (primary ?? environments[0]?.environmentId ?? null);
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">
        Use your own Google OAuth registration to search and read Drive files. Pulse Code requests
        read-only access. Files stay in Google Drive; nothing is synced or uploaded.
      </p>
      <p className="text-sm text-muted-foreground">
        Create a Desktop app OAuth client in Google Cloud, enable the Drive API, and add your
        account as a test user if required. Google may require verification before other people can
        authorize your app.
      </p>
      {environments.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Environment
          <select
            aria-label="Drive environment"
            className="rounded-md border border-input bg-background p-2"
            value={environmentId ?? ""}
            onChange={(event) => setSelected(event.target.value as EnvironmentId)}
          >
            {environments.map((env) => (
              <option key={env.environmentId} value={env.environmentId}>
                {env.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {environmentId ? (
        <DriveEnvironment key={environmentId} environmentId={environmentId} />
      ) : (
        <p>No environment is connected.</p>
      )}
    </div>
  );
}
function DriveEnvironment({ environmentId }: { environmentId: EnvironmentId }) {
  const { ready, driveRead } = useMailCapabilities(environmentId);
  const session = useEnvironmentSessionState(environmentId);
  const canOperate =
    !session.isPending &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const connections = useEnvironmentQuery(
    ready && driveRead ? drive.connections({ environmentId, input: {} }) : null,
  );
  const upsert = useAtomCommand(drive.upsert, { reportFailure: false });
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready) return <p>Connecting...</p>;
  if (!driveRead)
    return (
      <p className="text-sm text-muted-foreground">
        Google Drive needs a newer server. Pasted file links still work.
      </p>
    );
  return (
    <div className="space-y-3">
      <form
        className="grid gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const result = await upsert({
            environmentId,
            input: {
              nickname: name.trim(),
              clientId: clientId.trim(),
              ...(secret ? { clientSecret: secret } : {}),
            },
          });
          setSecret("");
          setBusy(false);
          if (result._tag === "Success") {
            setName("");
            setClientId("");
          } else {
            const cause = squashAtomCommandFailure(result);
            setError(cause instanceof Error ? cause.message : "The connection could not be saved.");
          }
        }}
      >
        <Input
          aria-label="Drive connection name"
          placeholder="Connection name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy || !canOperate}
        />
        <Input
          aria-label="Google OAuth client ID"
          placeholder="Google OAuth client ID"
          maxLength={256}
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          disabled={busy || !canOperate}
        />
        <Input
          aria-label="Google OAuth client secret"
          placeholder="Client secret (if supplied by Google)"
          type="password"
          autoComplete="new-password"
          maxLength={2048}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          disabled={busy || !canOperate}
        />
        <Button
          size="sm"
          type="submit"
          className="justify-self-start"
          disabled={busy || !canOperate || !name.trim() || !clientId.trim()}
        >
          Save Drive connection
        </Button>
      </form>
      {!canOperate ? (
        <p className="text-xs text-muted-foreground">
          Managing Drive connections requires operate access.
        </p>
      ) : null}
      {error || connections.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? connections.error}
        </p>
      ) : null}
      {connections.error ? (
        <Button size="sm" variant="ghost" onClick={connections.refresh}>
          Retry loading connections
        </Button>
      ) : null}
      {connections.data?.map((connection) => (
        <DriveConnectionCard
          key={connection.id}
          environmentId={environmentId}
          connection={connection}
          canOperate={canOperate}
        />
      ))}
      {connections.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Drive connections saved.</p>
      ) : null}
    </div>
  );
}
function DriveConnectionCard({
  environmentId,
  connection,
  canOperate,
}: {
  environmentId: EnvironmentId;
  connection: DriveConnection;
  canOperate: boolean;
}) {
  const start = useAtomCommand(drive.startOAuth, { reportFailure: false });
  const complete = useAtomCommand(drive.completeOAuth, { reportFailure: false });
  const cancel = useAtomCommand(drive.cancelOAuth, { reportFailure: false });
  const disconnect = useAtomCommand(drive.disconnect, { reportFailure: false });
  const remove = useAtomCommand(drive.remove, { reportFailure: false });
  const [flow, setFlow] = useState<{ flowId: string; authorizeUrl: string } | null>(null);
  const [returnUrl, setReturnUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const failure = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
    const cause = squashAtomCommandFailure(result);
    setError(cause instanceof Error ? cause.message : "Drive sign-in did not finish.");
  };
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">{connection.nickname}</h3>
      <p className="break-all text-xs text-muted-foreground">{connection.clientId}</p>
      <p className="text-sm">
        {connection.connected ? "Connected" : "Disconnected"}
        {connection.identity ? ` · ${connection.identity.email ?? connection.identity.name}` : ""}
      </p>
      {connection.error || error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? connection.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !canOperate}
          onClick={() =>
            void run(async () => {
              const result = await start({ environmentId, input: { connectionId: connection.id } });
              if (result._tag === "Success") setFlow(result.value);
              else failure(result);
            })
          }
        >
          {connection.connected ? "Reconnect Google" : "Connect Google"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !canOperate || !connection.connected}
          onClick={() =>
            void run(async () => {
              const result = await disconnect({
                environmentId,
                input: { connectionId: connection.id },
              });
              if (result._tag === "Failure") failure(result);
            })
          }
        >
          Disconnect
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !canOperate}
          onClick={() =>
            void run(async () => {
              const result = await remove({
                environmentId,
                input: { connectionId: connection.id },
              });
              if (result._tag === "Failure") failure(result);
            })
          }
        >
          Remove connection
        </Button>
      </div>
      {flow ? (
        <div className="space-y-2">
          <a
            className="text-sm underline"
            href={flow.authorizeUrl}
            target="_blank"
            rel="noreferrer"
          >
            Authorize read-only Google Drive access
          </a>
          <p className="text-xs text-muted-foreground">
            Sign-in returns to a loopback address on the server. If you are using another device and
            that page cannot load, paste its full address below. This sign-in expires in ten
            minutes.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await complete({
                  environmentId,
                  input: { flowId: flow.flowId, redirectUrl: returnUrl },
                });
                setReturnUrl("");
                if (result._tag === "Success") setFlow(null);
                else failure(result);
              });
            }}
          >
            <Input
              aria-label="Google sign-in return URL"
              type="password"
              autoComplete="off"
              maxLength={8192}
              value={returnUrl}
              onChange={(event) => setReturnUrl(event.target.value)}
              disabled={busy || !canOperate}
            />
            <Button size="sm" type="submit" disabled={busy || !canOperate || !returnUrl.trim()}>
              Finish Google sign-in
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !canOperate}
              onClick={() =>
                void run(async () => {
                  const result = await cancel({ environmentId, input: { flowId: flow.flowId } });
                  if (result._tag === "Failure") failure(result);
                  else {
                    setFlow(null);
                    setReturnUrl("");
                  }
                })
              }
            >
              Cancel sign-in
            </Button>
          </form>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Disconnecting or removing this connection leaves file links intact. Choose a connection for
        each file before reading it. Signing in with a different Google account needs a separate
        connection.
      </p>
    </section>
  );
}
