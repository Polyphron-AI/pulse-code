import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ChatAccount, ChatRequest, EnvironmentId } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

const desktopDestination = { kind: "desktop" } as const;

export function ConnectCommunicationsDialog({
  onClose,
  onConnected,
  destination = desktopDestination,
}: {
  destination?:
    | { kind: "desktop" }
    | {
        kind: "server";
        environmentId: EnvironmentId;
        label: string;
        connect: (input: {
          environmentId: EnvironmentId;
          provider: "slack" | "discord";
          token: string;
        }) => Promise<ChatAccount>;
      };
  onClose: () => void;
  onConnected: (account: ChatAccount) => void;
}) {
  const [provider, setProvider] = useState<"slack" | "discord">("slack");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const invoke = window.desktopBridge?.communicationsInvoke;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function close() {
    active.current = false;
    setToken("");
    onClose();
  }
  async function submit() {
    if ((destination.kind === "desktop" && !invoke) || busy) return;
    const request: ChatRequest = {
      operation: "accounts.connectToken",
      provider,
      token: token.trim(),
    };
    setToken("");
    setBusy(true);
    setError(undefined);
    try {
      const result =
        destination.kind === "server"
          ? {
              ok: true as const,
              account: await destination.connect({
                environmentId: destination.environmentId,
                provider,
                token: request.token,
              }),
            }
          : await invoke!(request);
      if (!active.current) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.account) onConnected(result.account);
      else setError("The service did not confirm an account. Try again.");
    } catch {
      if (active.current)
        setError(
          destination.kind === "server"
            ? "The selected environment could not be reached. Try again."
            : "The desktop communications service could not be reached. Try again.",
        );
    } finally {
      if (active.current) {
        setBusy(false);
        setToken("");
      }
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPopup className="w-full">
        <DialogHeader>
          <DialogTitle>Connect a communications account</DialogTitle>
          <DialogDescription>
            {destination.kind === "desktop"
              ? "Credentials are sent directly to the desktop service. They are not stored in browser storage."
              : `Credentials stay in the selected environment. Source: ${destination.label}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>Service</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={provider}
                disabled={busy}
                onChange={(event) => {
                  const selected = event.target.value;
                  if (selected === "slack" || selected === "discord") setProvider(selected);
                  setToken("");
                  setError(undefined);
                }}
              >
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
              </select>
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {provider === "slack" ? (
                <>
                  Connect a Slack user or bot token. Only conversations allowed by that token’s
                  scopes are available.{" "}
                  <a
                    className="underline"
                    href="https://api.slack.com/authentication/token-types"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Slack tokens and permissions
                  </a>
                </>
              ) : (
                <>
                  Discord connects as a bot and can access only team channels available to that bot.
                  Personal inbox access is not supported.{" "}
                  <a
                    className="underline"
                    href="https://discord.com/developers/docs/quick-start/getting-started"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Set up a Discord bot
                  </a>
                </>
              )}
            </p>
            <label className="block space-y-2 text-sm">
              <span>{provider === "slack" ? "Slack user or bot token" : "Discord bot token"}</span>
              <Input
                type="password"
                autoComplete="off"
                value={token}
                disabled={busy}
                onChange={(event) => setToken(event.target.value)}
                required
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Telegram now uses a server bot.{" "}
              <Link
                to="/settings/integrations"
                hash="telegram"
                onClick={close}
                className="underline"
              >
                Connect Telegram in Settings
              </Link>
              .
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
