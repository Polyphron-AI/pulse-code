import { useNavigation, usePreventRemove, type StaticScreenProps } from "@react-navigation/native";
import {
  buildMailReply,
  createMailDraftContent,
  parseMailRecipients,
  splitMailRecipients,
} from "@t3tools/client-runtime/state/mail-compose";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  type MailDraft,
  type MailMessageRef,
  type MailSendReceipt,
} from "@t3tools/contracts";
import { randomUUID } from "expo-crypto";
import * as Effect from "effect/Effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useEnvironmentServerConfig } from "../../state/entities";
import { appAtomRegistry } from "../../state/atom-registry";
import { mailEnvironment, useMailAlphaEnabled } from "../../state/mail";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { MailButton, MailField, MailNotice, MailScreen } from "./MailControls";
import {
  isMailDraftConflict,
  locksMailDraft,
  resolveMailSendReceipt,
} from "./mailComposerRecovery";

type ComposeParams = {
  environmentId: string;
  accountId: string;
  draftId?: string;
  source?: MailMessageRef;
  mode?: "reply" | "replyAll" | "forward";
};

export function MailComposeRouteScreen({ route }: StaticScreenProps<ComposeParams>) {
  const navigation = useNavigation();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const config = useEnvironmentServerConfig(environmentId);
  const optedIn = useMailAlphaEnabled();
  const supported = optedIn && config?.environment.capabilities.mail === true;
  const status = useEnvironmentQuery(
    supported ? mailEnvironment.getStatus({ environmentId, input: {} }) : null,
  );
  const draftQuery = useEnvironmentQuery(
    supported && route.params.draftId
      ? mailEnvironment.getDraft({ environmentId, input: { id: route.params.draftId } })
      : null,
  );
  const source = useEnvironmentQuery(
    supported && route.params.source
      ? mailEnvironment.readMessage({ environmentId, input: route.params.source })
      : null,
  );
  const account = status.data?.accounts.find((item) => item.id === route.params.accountId);
  const draft = draftQuery.data ?? undefined;
  const initial = route.params.draftId
    ? draft?.content
    : route.params.source
      ? source.data && account
        ? buildMailReply(source.data, account, route.params.mode ?? "reply")
        : undefined
      : createMailDraftContent(route.params.accountId);
  const title = route.params.draftId ? "Draft" : "Compose";
  const notices = (
    <>
      {!supported ? (
        <MailNotice>
          Enable Mail alpha in Settings and connect to an environment with Mail support.
        </MailNotice>
      ) : null}
      {status.error || draftQuery.error || source.error ? (
        <MailNotice>{status.error ?? draftQuery.error ?? source.error}</MailNotice>
      ) : null}
      {account && !account.smtp && status.data?.enabled ? (
        <>
          <MailNotice>
            This account uses IMAP only. Save your draft and set up SMTP to send.
          </MailNotice>
          <MailButton
            onPress={() =>
              navigation.navigate("MailSetup", { environmentId, accountId: account.id })
            }
          >
            Set up sending
          </MailButton>
        </>
      ) : null}
    </>
  );
  return initial && status.data ? (
    <DraftEditor
      key={JSON.stringify([
        environmentId,
        route.params.accountId,
        route.params.draftId,
        route.params.source,
        route.params.mode,
      ])}
      environmentId={environmentId}
      initial={initial}
      draft={draft}
      canSend={status.data.enabled && account?.connected === true && account.smtp !== null}
      from={account?.email ?? route.params.accountId}
      forwarded={route.params.mode === "forward"}
      attachmentLimitBytes={status.data.attachmentLimitBytes}
      title={title}
      notices={notices}
    />
  ) : (
    <MailScreen title={title}>
      {notices}
      <MailNotice>Loading draft…</MailNotice>
    </MailScreen>
  );
}

function DraftEditor({
  environmentId,
  initial,
  draft,
  canSend,
  from,
  forwarded,
  attachmentLimitBytes,
  title,
  notices,
}: {
  environmentId: EnvironmentId;
  initial: MailDraft["content"];
  draft?: MailDraft;
  canSend: boolean;
  from: string;
  forwarded: boolean;
  attachmentLimitBytes: number;
  title: string;
  notices: ReactNode;
}) {
  const navigation = useNavigation();
  const saveDraft = useAtomCommand(mailEnvironment.saveDraft, { reportFailure: false });
  const sendDraft = useAtomCommand(mailEnvironment.sendDraft, { reportFailure: false });
  const deleteDraft = useAtomCommand(mailEnvironment.deleteDraft, { reportFailure: false });
  const outbox = useEnvironmentQuery(mailEnvironment.listOutbox({ environmentId, input: {} }));
  const [saved, setSaved] = useState(draft);
  const [to, setTo] = useState(initial.to.join(", "));
  const [cc, setCc] = useState(initial.cc.join(", "));
  const [bcc, setBcc] = useState(initial.bcc.join(", "));
  const [subject, setSubject] = useState(initial.subject);
  const [text, setText] = useState(initial.text);
  const [attachments, setAttachments] = useState(initial.attachments);
  const [dirty, setDirty] = useState(!draft && Boolean(initial.subject || initial.text));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const allowClose = useRef(false);
  const sendAttempt = useRef<{ draftId: string; revision: number; operationId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<MailSendReceipt | null>(null);
  const [sendUnknown, setSendUnknown] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const activeReceipt = resolveMailSendReceipt(saved?.id, receipt, outbox.data);
  const sentOrUncertain = locksMailDraft(activeReceipt);
  const edited = (set: (value: string) => void) => (value: string) => {
    set(value);
    setDirty(true);
    setError(null);
  };
  const persist = async (asNew = false) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const content = {
        ...(saved?.content ?? initial),
        to: splitMailRecipients(to),
        cc: splitMailRecipients(cc),
        bcc: splitMailRecipients(bcc),
        subject,
        text,
        attachments,
      };
      const result = await saveDraft({
        environmentId,
        input: {
          ...(!asNew && saved ? { id: saved.id } : {}),
          revision: asNew ? 0 : (saved?.revision ?? 0),
          content,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setSaved(result.value);
      setDirty(false);
      setSaveConflict(false);
      if (asNew) {
        setReceipt(null);
        sendAttempt.current = null;
      }
      appAtomRegistry.refresh(
        mailEnvironment.getDraft({ environmentId, input: { id: result.value.id } }),
      );
      return result.value;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaveConflict(isMailDraftConflict(cause));
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const reloadSaved = () => {
    if (!saved || busy) return;
    Alert.alert(
      "Reload saved draft?",
      "Discard your unsaved changes and load the latest version from this environment?",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard changes and reload",
          style: "destructive",
          onPress: () => {
            void (async () => {
              inFlight.current = true;
              setBusy(true);
              const atom = mailEnvironment.getDraft({ environmentId, input: { id: saved.id } });
              const unmount = appAtomRegistry.mount(atom);
              try {
                appAtomRegistry.refresh(atom);
                const latest = await Effect.runPromise(
                  AtomRegistry.getResult(appAtomRegistry, atom, { suspendOnWaiting: true }),
                );
                setSaved(latest);
                setTo(latest.content.to.join(", "));
                setCc(latest.content.cc.join(", "));
                setBcc(latest.content.bcc.join(", "));
                setSubject(latest.content.subject);
                setText(latest.content.text);
                setAttachments(latest.content.attachments);
                setDirty(false);
                setSaveConflict(false);
                setError(null);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                unmount();
                inFlight.current = false;
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };
  usePreventRemove(dirty || busy, ({ data }) => {
    if (allowClose.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (busy) {
      Alert.alert("Saving mail", "Wait for the current operation to finish before leaving.");
      return;
    }
    Alert.alert("Unsaved changes", "Save your draft before leaving?", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard changes",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
      {
        text: "Save draft",
        onPress: () => {
          void persist().then((result) => {
            if (result) navigation.dispatch(data.action);
          });
        },
      },
    ]);
  });
  // Autosave only a settled editor; navigation is guarded while a write is pending.
  useEffect(() => {
    if (!dirty || busy || sentOrUncertain || error || saveConflict) return;
    const timeout = setTimeout(() => {
      void persist();
    }, 1200);
    return () => clearTimeout(timeout);
  });
  const send = async () => {
    if (inFlight.current || sentOrUncertain || sendUnknown) return;
    try {
      parseMailRecipients(to);
      parseMailRecipients(cc);
      parseMailRecipients(bcc);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    const current = dirty || !saved ? await persist() : saved;
    if (!current) return;
    if (!current.content.to.length && !current.content.cc.length && !current.content.bcc.length) {
      setError("Add at least one recipient.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    if (
      sendAttempt.current?.draftId !== current.id ||
      sendAttempt.current.revision !== current.revision ||
      receipt?.state === "failed"
    ) {
      sendAttempt.current = {
        draftId: current.id,
        revision: current.revision,
        operationId: randomUUID(),
      };
    }
    const result = await sendDraft({
      environmentId,
      input: sendAttempt.current,
    });
    inFlight.current = false;
    setBusy(false);
    outbox.refresh();
    if (result._tag === "Failure") {
      setError(`${String(squashAtomCommandFailure(result))} Check Outbox before sending again.`);
      setSendUnknown(true);
      return;
    }
    setReceipt(result.value);
  };
  const attach = async () => {
    if (inFlight.current || sentOrUncertain || sendUnknown) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { File } = await import("expo-file-system");
      const picked = await File.pickFileAsync({ multipleFiles: false });
      if (picked.canceled) return;
      const file = picked.result;
      const previousBytes = attachments.reduce(
        (total, item) => total + Math.floor((item.base64.length * 3) / 4),
        0,
      );
      if (attachments.length >= 20 || file.size + previousBytes > attachmentLimitBytes)
        throw new Error(
          `Attachments must total at most ${Math.floor(attachmentLimitBytes / 1024 / 1024)} MB.`,
        );
      const base64 = await file.base64();
      setAttachments([
        ...attachments,
        {
          id: randomUUID(),
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
        },
      ]);
      setDirty(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const remove = () => {
    if (!saved || busy || sentOrUncertain || sendUnknown) return;
    Alert.alert("Delete draft?", "This removes the saved draft from this Pulse environment.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            inFlight.current = true;
            setBusy(true);
            const result = await deleteDraft({
              environmentId,
              input: { id: saved.id, revision: saved.revision },
            });
            inFlight.current = false;
            setBusy(false);
            if (result._tag === "Failure") setError(String(squashAtomCommandFailure(result)));
            else {
              allowClose.current = true;
              setDirty(false);
              navigation.goBack();
            }
          })();
        },
      },
    ]);
  };
  const footer = (
    <>
      <Text
        accessibilityLiveRegion="polite"
        numberOfLines={1}
        className="text-sm text-foreground-muted"
      >
        {busy
          ? "Saving or sending…"
          : dirty
            ? "Unsaved changes"
            : saved
              ? "Draft saved on your Pulse environment"
              : "New draft"}
      </Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <MailButton
            disabled={busy || sentOrUncertain || sendUnknown}
            onPress={() => void persist()}
          >
            Save draft
          </MailButton>
        </View>
        <View className="flex-1">
          <MailButton
            disabled={busy || !canSend || sentOrUncertain || sendUnknown || !outbox.data}
            onPress={() => void send()}
          >
            {receipt?.state === "failed" ? "Send again" : "Send"}
          </MailButton>
        </View>
      </View>
    </>
  );
  return (
    <MailScreen title={title} footer={footer}>
      {notices}
      <Text className="text-base text-foreground">From: {from}</Text>
      {!canSend ? (
        <MailNotice>
          Mail is disabled or this account is disconnected. Your saved draft remains available.
        </MailNotice>
      ) : null}
      {forwarded ? (
        <MailNotice>
          Forward includes the message text. Original attachments are not automatically included.
        </MailNotice>
      ) : null}
      {activeReceipt ? (
        <MailNotice>
          {activeReceipt.state.toUpperCase()}: {activeReceipt.detail}
          {"\n"}
          {activeReceipt.accepted.length ? `Accepted: ${activeReceipt.accepted.join(", ")}` : ""}
          {activeReceipt.rejected.length ? `\nRejected: ${activeReceipt.rejected.join(", ")}` : ""}
        </MailNotice>
      ) : null}
      {error ? <MailNotice>{error}</MailNotice> : null}
      {saveConflict && !sentOrUncertain && !sendUnknown ? (
        <View className="gap-2">
          <MailNotice>
            Your version is still here. Save it as a separate draft, or discard these edits and load
            the latest saved version.
          </MailNotice>
          <MailButton disabled={busy} onPress={() => void persist(true)}>
            Save my version as a new draft
          </MailButton>
          <MailButton disabled={busy || !saved} onPress={reloadSaved}>
            Reload saved draft
          </MailButton>
        </View>
      ) : null}
      <MailField
        label="To"
        value={to}
        onChangeText={edited(setTo)}
        disabled={busy || sentOrUncertain || sendUnknown}
      />
      <MailField
        label="Cc"
        value={cc}
        onChangeText={edited(setCc)}
        disabled={busy || sentOrUncertain || sendUnknown}
      />
      <MailField
        label="Bcc"
        value={bcc}
        onChangeText={edited(setBcc)}
        disabled={busy || sentOrUncertain || sendUnknown}
      />
      <MailField
        label="Subject"
        value={subject}
        onChangeText={edited(setSubject)}
        disabled={busy || sentOrUncertain || sendUnknown}
      />
      <MailField
        label="Message"
        value={text}
        onChangeText={edited(setText)}
        multiline
        disabled={busy || sentOrUncertain || sendUnknown}
      />
      {attachments.map((item) => (
        <View key={item.id} className="gap-2">
          <Text className="text-base text-foreground">{item.filename}</Text>
          <MailButton
            disabled={busy || sentOrUncertain}
            onPress={() => {
              setAttachments(attachments.filter((value) => value.id !== item.id));
              setDirty(true);
            }}
          >
            Remove attachment
          </MailButton>
        </View>
      ))}
      <MailButton disabled={busy || sentOrUncertain || sendUnknown} onPress={() => void attach()}>
        Attach file
      </MailButton>
      <MailButton disabled={busy || !saved || sentOrUncertain || sendUnknown} onPress={remove}>
        Delete draft
      </MailButton>
    </MailScreen>
  );
}
