import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId, type MailAccount, type MailAccountSaveInput } from "@t3tools/contracts";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useEnvironmentServerConfig } from "../../state/entities";
import { mailEnvironment, useMailAlphaEnabled } from "../../state/mail";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { MailButton, MailField, MailNotice, MailScreen } from "./MailControls";

export function MailSetupRouteScreen({
  route,
}: StaticScreenProps<{ environmentId: string; accountId?: string }>) {
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const config = useEnvironmentServerConfig(environmentId);
  const optedIn = useMailAlphaEnabled();
  const status = useEnvironmentQuery(
    optedIn && config?.environment.capabilities.mail
      ? mailEnvironment.getStatus({ environmentId, input: {} })
      : null,
  );
  const account = status.data?.accounts.find((item) => item.id === route.params.accountId);
  return (
    <MailScreen title="Mail account">
      {status.error ? <MailNotice>{status.error}</MailNotice> : null}
      {!status.data?.enabled ? (
        <MailNotice>Enable Mail alpha on this environment before changing accounts.</MailNotice>
      ) : route.params.accountId && !account ? (
        <MailNotice>Account not found. Return to Mail and refresh your accounts.</MailNotice>
      ) : (
        <AccountForm
          key={JSON.stringify([environmentId, account?.id])}
          environmentId={environmentId}
          account={account}
        />
      )}
    </MailScreen>
  );
}

function AccountForm({
  environmentId,
  account,
}: {
  environmentId: EnvironmentId;
  account?: MailAccount;
}) {
  const navigation = useNavigation();
  const saveAccount = useAtomCommand(mailEnvironment.saveAccount, { reportFailure: false });
  const disconnect = useAtomCommand(mailEnvironment.disconnectAccount, { reportFailure: false });
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [imapHost, setImapHost] = useState(account?.imap.host ?? "");
  const [imapPort, setImapPort] = useState(String(account?.imap.port ?? 993));
  const [imapUser, setImapUser] = useState(account?.imap.username ?? "");
  const [imapSecurity, setImapSecurity] = useState<"tls" | "starttls">(
    account?.imap.security ?? "tls",
  );
  const [imapPassword, setImapPassword] = useState("");
  const [setupSending, setSetupSending] = useState(account ? account.smtp !== null : true);
  const [smtpHost, setSmtpHost] = useState(account?.smtp?.host ?? "");
  const [smtpPort, setSmtpPort] = useState(String(account?.smtp?.port ?? 465));
  const [smtpUser, setSmtpUser] = useState(account?.smtp?.username ?? "");
  const [smtpSecurity, setSmtpSecurity] = useState<"tls" | "starttls">(
    account?.smtp?.security ?? "tls",
  );
  const [smtpPassword, setSmtpPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    if (
      !(setupSending ? [imapPort, smtpPort] : [imapPort]).every(
        (port) => /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535,
      )
    ) {
      setError("Enter a valid port between 1 and 65535.");
      return;
    }
    setBusy(true);
    setError(null);
    const input: MailAccountSaveInput = {
      ...(account ? { id: account.id } : {}),
      name: name.trim(),
      email: email.trim(),
      imap: {
        host: imapHost.trim(),
        port: Number(imapPort),
        security: imapSecurity,
        username: imapUser.trim() || email.trim(),
      },
      smtp: setupSending
        ? {
            host: smtpHost.trim(),
            port: Number(smtpPort),
            security: smtpSecurity,
            username: smtpUser.trim() || email.trim(),
          }
        : null,
      ...(imapPassword ? { imapPassword } : {}),
      ...(setupSending && smtpPassword ? { smtpPassword } : {}),
    };
    const result = await saveAccount({ environmentId, input });
    setBusy(false);
    if (result._tag === "Failure") {
      setError(String(squashAtomCommandFailure(result)));
      return;
    }
    setImapPassword("");
    setSmtpPassword("");
    navigation.goBack();
  };
  const disconnectAccount = () => {
    if (!account || busy) return;
    Alert.alert(
      "Disconnect account?",
      "Pulse will stop accessing this mailbox. Saved drafts, links and send history remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              const result = await disconnect({ environmentId, input: { accountId: account.id } });
              setBusy(false);
              if (result._tag === "Failure") setError(String(squashAtomCommandFailure(result)));
              else navigation.goBack();
            })();
          },
        },
      ],
    );
  };
  return (
    <>
      <MailNotice>
        Use your provider's IMAP and SMTP settings and an app password where required. Credentials
        are stored on the selected Pulse environment. Saving verifies connections without sending an
        email. People with access to this Pulse environment can access its mail accounts.
        {account
          ? " Leave passwords blank to keep existing credentials. To use a different email address or incoming mailbox source, add another account."
          : ""}
      </MailNotice>
      <MailField label="Account name" value={name} onChangeText={setName} disabled={busy} />
      <MailField
        label="Email address"
        value={email}
        onChangeText={setEmail}
        disabled={busy || !!account}
      />
      <Text className="text-lg font-t3-bold text-foreground">Incoming mail (IMAP)</Text>
      <MailField
        label="IMAP host"
        value={imapHost}
        onChangeText={setImapHost}
        disabled={busy || !!account}
      />
      <MailField
        label="IMAP port"
        value={imapPort}
        onChangeText={setImapPort}
        numeric
        disabled={busy}
      />
      <MailField
        label="IMAP username (defaults to email)"
        value={imapUser}
        onChangeText={setImapUser}
        disabled={busy || !!account}
      />
      <MailField
        label="IMAP password"
        value={imapPassword}
        onChangeText={setImapPassword}
        secure
        disabled={busy}
      />
      <MailButton
        disabled={busy}
        onPress={() => {
          const next = imapSecurity === "tls" ? "starttls" : "tls";
          setImapSecurity(next);
          setImapPort(next === "tls" ? "993" : "143");
        }}
      >{`IMAP security: ${imapSecurity.toUpperCase()}`}</MailButton>
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-t3-bold text-foreground">Set up sending (SMTP)</Text>
        <Switch
          accessibilityLabel="Set up sending"
          value={setupSending}
          onValueChange={setSetupSending}
          disabled={busy}
        />
      </View>
      {!setupSending ? (
        <MailNotice>
          You can read mail and save drafts with IMAP only. Add SMTP here when you are ready to
          send.
        </MailNotice>
      ) : (
        <>
          <MailField
            label="SMTP host"
            value={smtpHost}
            onChangeText={setSmtpHost}
            disabled={busy}
          />
          <MailField
            label="SMTP port"
            value={smtpPort}
            onChangeText={setSmtpPort}
            numeric
            disabled={busy}
          />
          <MailField
            label="SMTP username (defaults to email)"
            value={smtpUser}
            onChangeText={setSmtpUser}
            disabled={busy}
          />
          <MailField
            label="SMTP password"
            value={smtpPassword}
            onChangeText={setSmtpPassword}
            secure
            disabled={busy}
          />
          <MailButton
            disabled={busy}
            onPress={() => {
              const next = smtpSecurity === "tls" ? "starttls" : "tls";
              setSmtpSecurity(next);
              setSmtpPort(next === "tls" ? "465" : "587");
            }}
          >{`SMTP security: ${smtpSecurity.toUpperCase()}`}</MailButton>
        </>
      )}
      {error ? <MailNotice>{error}</MailNotice> : null}
      <View className="flex-row flex-wrap gap-2">
        <MailButton
          disabled={
            busy ||
            !name.trim() ||
            !email.trim() ||
            !imapHost.trim() ||
            (setupSending && !smtpHost.trim()) ||
            (!account && !imapPassword) ||
            (setupSending && !account?.smtp && !smtpPassword)
          }
          onPress={() => void save()}
        >
          {busy ? "Connecting…" : "Verify and save account"}
        </MailButton>
        {account?.connected ? (
          <MailButton disabled={busy} onPress={disconnectAccount}>
            Disconnect
          </MailButton>
        ) : null}
      </View>
    </>
  );
}
