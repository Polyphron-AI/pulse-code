import { useEffect, useRef, useState } from "react";
import type { ChatAccount, ChatChallenge, ChatRequest } from "@t3tools/contracts";
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

export function ConnectCommunicationsDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (account: ChatAccount) => void;
}) {
  const [provider, setProvider] = useState<"slack" | "discord" | "telegram">("slack");
  const [token, setToken] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<ChatChallenge>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const pendingChallenge = useRef<ChatChallenge | undefined>(undefined);
  const invoke = window.desktopBridge?.communicationsInvoke;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (pendingChallenge.current && invoke)
        void invoke({
          operation: "accounts.telegram.cancel",
          challengeId: pendingChallenge.current.id,
        }).catch(() => undefined);
      pendingChallenge.current = undefined;
    };
  }, [invoke]);
  async function submit() {
    if (!invoke || busy) return;
    let request: ChatRequest;
    if (challenge)
      request = {
        operation: "accounts.telegram.complete",
        challengeId: challenge.id,
        ...(challenge.prompt === "password" ? { password } : { code }),
      };
    else if (provider === "telegram") {
      const id = Number(apiId);
      if (!Number.isSafeInteger(id) || id <= 0 || !apiHash.trim() || !phone.trim()) {
        setError(
          "Enter a valid Telegram API ID, API hash, and phone number including country code.",
        );
        return;
      }
      request = {
        operation: "accounts.telegram.begin",
        apiId: id,
        apiHash: apiHash.trim(),
        phone: phone.trim(),
      };
    } else request = { operation: "accounts.connectToken", provider, token: token.trim() };
    setBusy(true);
    setError(undefined);
    try {
      const result = await invoke(request);
      if (!active.current) {
        if (result.ok && result.challenge)
          void invoke({
            operation: "accounts.telegram.cancel",
            challengeId: result.challenge.id,
          }).catch(() => undefined);
        return;
      }
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.challenge) {
        pendingChallenge.current = result.challenge;
        setChallenge(result.challenge);
      } else if (result.account) {
        pendingChallenge.current = undefined;
        onConnected(result.account);
      } else setError("The service did not confirm an account or a login challenge. Try again.");
    } catch {
      if (active.current)
        setError("The desktop communications service could not be reached. Try again.");
    } finally {
      if (active.current) {
        setBusy(false);
        setToken("");
        setApiHash("");
        setCode("");
        setPassword("");
      }
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="w-full">
        <DialogHeader>
          <DialogTitle>Connect a communications account</DialogTitle>
          <DialogDescription>
            Credentials are sent directly to the desktop service. They are not stored in browser
            storage.
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
            {!challenge && (
              <>
                <label className="block space-y-2 text-sm">
                  <span>Service</span>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    value={provider}
                    disabled={busy}
                    onChange={(event) => {
                      const selected = event.target.value;
                      if (selected === "slack" || selected === "discord" || selected === "telegram")
                        setProvider(selected);
                      setToken("");
                      setApiHash("");
                      setError(undefined);
                    }}
                  >
                    <option value="slack">Slack</option>
                    <option value="discord">Discord</option>
                    <option value="telegram">Telegram · personal account</option>
                  </select>
                </label>
                {provider === "telegram" ? (
                  <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Use your personal Telegram account to access its chats and history. Get an API
                      ID and hash from{" "}
                      <a
                        className="underline"
                        href="https://my.telegram.org/apps"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Telegram API development tools
                      </a>
                      .
                    </p>
                    <label className="block space-y-2 text-sm">
                      <span>API ID</span>
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        value={apiId}
                        disabled={busy}
                        onChange={(event) => setApiId(event.target.value)}
                        required
                      />
                    </label>
                    <label className="block space-y-2 text-sm">
                      <span>API hash</span>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={apiHash}
                        disabled={busy}
                        onChange={(event) => setApiHash(event.target.value)}
                        required
                      />
                    </label>
                    <label className="block space-y-2 text-sm">
                      <span>Phone number with country code</span>
                      <Input
                        type="tel"
                        autoComplete="off"
                        value={phone}
                        disabled={busy}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+27…"
                        required
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {provider === "slack" ? (
                        <>
                          Connect a Slack user or bot token. Only conversations allowed by that
                          token’s scopes are available.{" "}
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
                          Discord connects as a bot and can access only team channels available to
                          that bot. Personal inbox access is not supported.{" "}
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
                      <span>
                        {provider === "slack" ? "Slack user or bot token" : "Discord bot token"}
                      </span>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={token}
                        disabled={busy}
                        onChange={(event) => setToken(event.target.value)}
                        required
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {challenge && (
              <>
                <p className="text-sm">
                  {challenge.prompt === "password"
                    ? "Telegram requires your two-step verification password."
                    : "Enter the login code Telegram sent to you."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Challenge expires: {new Date(challenge.expiresAt).toLocaleString()}
                </p>
                <label className="block space-y-2 text-sm">
                  <span>
                    {challenge.prompt === "password"
                      ? "Two-step verification password"
                      : "Telegram login code"}
                  </span>
                  <Input
                    type={challenge.prompt === "password" ? "password" : "text"}
                    autoComplete="off"
                    value={challenge.prompt === "password" ? password : code}
                    disabled={busy}
                    onChange={(event) =>
                      challenge.prompt === "password"
                        ? setPassword(event.target.value)
                        : setCode(event.target.value)
                    }
                    required
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Connecting…"
                  : challenge
                    ? "Complete sign-in"
                    : provider === "telegram"
                      ? "Request login code"
                      : "Connect"}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
