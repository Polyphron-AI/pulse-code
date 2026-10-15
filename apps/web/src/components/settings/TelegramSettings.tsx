import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type TelegramConnection,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentSessionState } from "../../state/session";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { telegram } from "../../state/telegram";
import { useMailCapabilities } from "../workspace/mail/useMailCapabilities";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Link } from "@tanstack/react-router";

export function TelegramSettings() {
  const { environments } = useEnvironments();
  const primary = usePrimaryEnvironmentId();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const environmentId = environments.some((entry) => entry.environmentId === selected)
    ? selected
    : (primary ?? environments[0]?.environmentId ?? null);
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">
        Connect a Telegram bot, then pair the direct messages or groups you want to read here. Your
        personal Telegram session stays separate. Each bot belongs to one environment.
      </p>
      {environments.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          Environment
          <select
            className="rounded-md border border-input bg-background p-2"
            aria-label="Telegram environment"
            value={environmentId ?? ""}
            onChange={(event) => setSelected(event.target.value as EnvironmentId)}
          >
            {environments.map((entry) => (
              <option key={entry.environmentId} value={entry.environmentId}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {environmentId ? (
        <TelegramEnvironment key={environmentId} environmentId={environmentId} />
      ) : (
        <p>No environment is connected.</p>
      )}
    </div>
  );
}
function TelegramEnvironment({ environmentId }: { environmentId: EnvironmentId }) {
  const { ready, telegramRead } = useMailCapabilities(environmentId);
  const session = useEnvironmentSessionState(environmentId);
  const canOperate =
    !session.isPending &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const connections = useEnvironmentQuery(
    ready && telegramRead ? telegram.connections({ environmentId, input: {} }) : null,
  );
  const connect = useAtomCommand(telegram.connect, { reportFailure: false });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready) return <p className="text-sm text-muted-foreground">Connecting...</p>;
  if (!telegramRead)
    return <p className="text-sm text-muted-foreground">Telegram bots need a newer server.</p>;
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const result = await connect({ environmentId, input: { token: token.trim() } });
          setToken("");
          setBusy(false);
          if (result._tag === "Failure") {
            const failure = squashAtomCommandFailure(result);
            setError(failure instanceof Error ? failure.message : "Could not connect this bot.");
          }
        }}
      >
        <Input
          aria-label="Telegram bot token"
          type="password"
          autoComplete="new-password"
          placeholder="Bot token from BotFather"
          maxLength={256}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          disabled={!canOperate || busy}
        />
        <Button type="submit" size="sm" disabled={!canOperate || busy || !token.trim()}>
          Connect bot
        </Button>
      </form>
      {!canOperate ? (
        <p className="text-sm text-muted-foreground">
          This connection can read bots. Managing them requires operate access.
        </p>
      ) : null}
      {error || connections.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? connections.error}
        </p>
      ) : null}
      {connections.error ? (
        <Button size="sm" variant="ghost" onClick={connections.refresh}>
          Retry loading bots
        </Button>
      ) : null}
      {connections.data === null ? (
        <p className="text-sm text-muted-foreground">Loading bots...</p>
      ) : connections.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bots connected. Create a bot with BotFather and paste its token above.
        </p>
      ) : (
        connections.data.map((connection) => (
          <TelegramConnectionCard
            key={connection.id}
            environmentId={environmentId}
            connection={connection}
            canOperate={canOperate}
          />
        ))
      )}
      <p className="text-xs text-muted-foreground">
        Only received messages from approved chats are stored. Group members cannot issue agent
        commands. Photos and files show a media label; their contents are not downloaded.
      </p>
    </div>
  );
}
function TelegramConnectionCard({
  environmentId,
  connection,
  canOperate,
}: {
  environmentId: EnvironmentId;
  connection: TelegramConnection;
  canOperate: boolean;
}) {
  const startPairing = useAtomCommand(telegram.startPairing, { reportFailure: false });
  const cancelPairing = useAtomCommand(telegram.cancelPairing, { reportFailure: false });
  const disconnect = useAtomCommand(telegram.disconnect, { reportFailure: false });
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt: number;
    privateLink: string;
    groupLink: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">
          {connection.title} (@{connection.username})
        </strong>
        <span className="text-xs text-muted-foreground">
          {connection.connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      {connection.error || error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? connection.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canOperate || busy || !connection.connected || pairing !== null}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await startPairing({
              environmentId,
              input: { connectionId: connection.id },
            });
            setBusy(false);
            if (result._tag === "Success") setPairing(result.value);
            else {
              const cause = squashAtomCommandFailure(result);
              setError(cause instanceof Error ? cause.message : "Could not create a pairing code.");
            }
          }}
        >
          Start pairing
        </Button>
        <Link
          to="/workspace"
          search={{
            space: "office",
            officeView: "communications",
            communicationProvider: "telegram",
            environment: environmentId,
            account: connection.id,
          }}
          className="self-center text-sm underline underline-offset-4"
        >
          Open chats
        </Link>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canOperate || busy || !connection.connected}
          onClick={async () => {
            setBusy(true);
            const result = await disconnect({
              environmentId,
              input: { connectionId: connection.id },
            });
            setBusy(false);
            if (result._tag === "Success") setPairing(null);
            else setError("Could not disconnect. Try again.");
          }}
        >
          Disconnect bot
        </Button>
      </div>
      {pairing ? (
        <div className="space-y-2 text-sm">
          <p>
            Send <code>/start pair_{pairing.code}</code> to this bot in the chat to approve it. Code
            expires {new Date(pairing.expiresAt).toLocaleTimeString()}.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={pairing.privateLink} target="_blank" rel="noreferrer" className="underline">
              Pair direct messages
            </a>
            <a href={pairing.groupLink} target="_blank" rel="noreferrer" className="underline">
              Pair a group
            </a>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await cancelPairing({
                  environmentId,
                  input: { connectionId: connection.id, code: pairing.code },
                });
                setBusy(false);
                if (result._tag === "Success") setPairing(null);
                else setError("Could not cancel pairing. Retry or disconnect this bot.");
              }}
            >
              Cancel pairing
            </Button>
          </div>
        </div>
      ) : null}
      {!connection.connected ? (
        <p className="text-xs text-muted-foreground">
          Paste this bot's current token above to reconnect. Stored messages and links are retained.
        </p>
      ) : null}
    </section>
  );
}
