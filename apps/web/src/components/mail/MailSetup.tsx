import type { EnvironmentId, MailAccount } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { mailEnvironment } from "../../state/mail";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function mailFailure(result: Parameters<typeof squashAtomCommandFailure>[0]): string {
  const error = squashAtomCommandFailure(result);
  return error && typeof error === "object" && "detail" in error && typeof error.detail === "string"
    ? error.detail
    : error instanceof Error
      ? error.message
      : "Mail could not complete this request.";
}

export const mailInputClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MailSetup({
  environmentId,
  account,
  onSaved,
  onCancel,
}: {
  environmentId: EnvironmentId;
  account?: MailAccount;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const save = useAtomCommand(mailEnvironment.saveAccount, { reportFailure: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(account ? account.smtp !== null : true);
  return (
    <form
      className="mx-auto w-full max-w-2xl space-y-5 p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const get = (name: string) => String(values.get(name) ?? "").trim();
        const password = (name: string) => String(values.get(name) ?? "");
        setPending(true);
        setError(null);
        const result = await save({
          environmentId,
          input: {
            ...(account ? { id: account.id } : {}),
            name: get("name"),
            email: get("email"),
            imap: {
              host: get("imapHost"),
              port: Number(get("imapPort")),
              username: get("imapUsername"),
              security: get("imapSecurity") === "starttls" ? "starttls" : "tls",
            },
            smtp: sending
              ? {
                  host: get("smtpHost"),
                  port: Number(get("smtpPort")),
                  username: get("smtpUsername"),
                  security: get("smtpSecurity") === "tls" ? "tls" : "starttls",
                }
              : null,
            ...(password("imapPassword") ? { imapPassword: password("imapPassword") } : {}),
            ...(password("smtpPassword") ? { smtpPassword: password("smtpPassword") } : {}),
          },
        });
        setPending(false);
        if (result._tag === "Failure") {
          setError(mailFailure(result));
          return;
        }
        form.reset();
        onSaved();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">
          {account ? "Account settings" : "Connect your email"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your provider’s IMAP and SMTP settings. Passwords are saved on this Pulse environment,
          never in browser storage. Providers that require OAuth are not supported in this alpha.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          People with access to this Pulse environment can access its mail accounts.
          {account &&
            " To connect a different email address or incoming server, add another account."}
        </p>
      </div>
      <fieldset disabled={pending} className="space-y-4">
        <label className="block space-y-1 text-sm">
          Account name
          <Input
            nativeInput
            name="name"
            required
            defaultValue={account?.name}
            placeholder="Work"
            maxLength={500}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Email address
          <Input
            nativeInput
            type="email"
            name="email"
            readOnly={Boolean(account)}
            required
            defaultValue={account?.email}
            autoComplete="email"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sending}
            onChange={(event) => setSending(event.target.checked)}
          />
          Set up sending with SMTP
        </label>
        {!sending && (
          <p className="text-xs text-muted-foreground">
            You can read mail and save drafts now, then set up sending later.
          </p>
        )}
        {(["imap", "smtp"] as const)
          .filter((kind) => kind === "imap" || sending)
          .map((kind) => (
            <fieldset key={kind} className="space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">
                {kind === "imap" ? "Incoming mail · IMAP" : "Outgoing mail · SMTP"}
              </legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                <label className="space-y-1 text-sm">
                  Server
                  <Input
                    nativeInput
                    name={`${kind}Host`}
                    readOnly={Boolean(account) && kind === "imap"}
                    required
                    defaultValue={account?.[kind]?.host}
                    placeholder={`${kind}.example.com`}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  Port
                  <Input
                    nativeInput
                    name={`${kind}Port`}
                    type="number"
                    min={1}
                    max={65535}
                    required
                    defaultValue={account?.[kind]?.port ?? (kind === "imap" ? 993 : 587)}
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                Encryption
                <select
                  name={`${kind}Security`}
                  className={mailInputClass}
                  defaultValue={account?.[kind]?.security ?? (kind === "imap" ? "tls" : "starttls")}
                >
                  <option value="tls">TLS</option>
                  <option value="starttls">STARTTLS</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Username
                <Input
                  nativeInput
                  name={`${kind}Username`}
                  readOnly={Boolean(account) && kind === "imap"}
                  required
                  defaultValue={account?.[kind]?.username ?? account?.email}
                  autoComplete="username"
                />
              </label>
              <label className="block space-y-1 text-sm">
                {account
                  ? "New password (leave blank to keep existing)"
                  : "Password or app password"}
                <Input
                  nativeInput
                  name={`${kind}Password`}
                  type="password"
                  required={!account || (kind === "smtp" && !account.smtp)}
                  autoComplete="new-password"
                />
              </label>
            </fieldset>
          ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Checking connection…" : "Test and save account"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
