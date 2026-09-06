import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  type MailLink,
  type MailMessageActionInput,
  type MailMessageRef,
} from "@t3tools/contracts";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useEnvironmentServerConfig } from "../../state/entities";
import { mailEnvironment, useMailAlphaEnabled } from "../../state/mail";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { sanitizeWorkspaceFileName } from "../files/openWorkspaceFileWith";
import { MailButton, MailField, MailNotice, MailScreen } from "./MailControls";
import { MailPeoplePanel } from "./MailPeoplePanel";

export function MailMessageRouteScreen({
  route,
}: StaticScreenProps<{ environmentId: string; ref: MailMessageRef }>) {
  const navigation = useNavigation();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const ref = route.params.ref;
  const config = useEnvironmentServerConfig(environmentId);
  const optedIn = useMailAlphaEnabled();
  const supported = optedIn && config?.environment.capabilities.mail === true;
  const detail = useEnvironmentQuery(
    supported ? mailEnvironment.readMessage({ environmentId, input: ref }) : null,
  );
  const folders = useEnvironmentQuery(
    supported
      ? mailEnvironment.listFolders({ environmentId, input: { accountId: ref.accountId } })
      : null,
  );
  const act = useAtomCommand(mailEnvironment.actOnMessages, { reportFailure: false });
  const metadata = useAtomCommand(mailEnvironment.saveMetadata, { reportFailure: false });
  const attachment = useAtomCommand(mailEnvironment.downloadAttachment, { reportFailure: false });
  const original = useAtomCommand(mailEnvironment.downloadOriginal, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [tagText, setTagText] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkType, setLinkType] = useState<MailLink["type"]>("project");
  const message = detail.data?.message;
  const action = async (action: MailMessageActionInput["action"], destination?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await act({
      environmentId,
      input: { refs: [ref], action, ...(destination ? { destination } : {}) },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      setError(String(squashAtomCommandFailure(result)));
      return;
    }
    if (result.value.failed.length) {
      setError(result.value.failed.map((item) => item.detail).join("\n"));
      return;
    }
    if (["move", "archive", "trash", "restore"].includes(action)) navigation.goBack();
    else detail.refresh();
  };
  const saveMetadata = async (links: readonly MailLink[], tags: readonly string[]) => {
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    const result = await metadata({
      environmentId,
      input: { ref, revision: message.metadata.revision, links, tags },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      setError(String(squashAtomCommandFailure(result)));
      detail.refresh();
      return;
    }
    setTagText(null);
    setLinkLabel("");
    setLinkTarget("");
    detail.refresh();
  };
  const download = async (attachmentId?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = attachmentId
        ? await attachment({ environmentId, input: { ref, attachmentId } })
        : await original({ environmentId, input: ref });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      const fs = await import("expo-file-system/legacy");
      const sharing = await import("expo-sharing");
      if (!fs.cacheDirectory || !(await sharing.isAvailableAsync()))
        throw new Error("File sharing is unavailable on this device.");
      const directory = `${fs.cacheDirectory}pulse-mail-${randomUUID()}/`;
      const uri = directory + sanitizeWorkspaceFileName(result.value.filename);
      await fs.makeDirectoryAsync(directory, { intermediates: true });
      try {
        await fs.writeAsStringAsync(uri, result.value.base64, { encoding: fs.EncodingType.Base64 });
        await sharing.shareAsync(uri, { mimeType: result.value.contentType });
      } finally {
        await fs.deleteAsync(directory, { idempotent: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <MailScreen title="Message">
      {!supported ? (
        <MailNotice>
          Enable Mail alpha in Settings and connect to an environment with Mail support.
        </MailNotice>
      ) : null}
      {detail.error || error ? <MailNotice>{error ?? detail.error}</MailNotice> : null}
      <MailButton onPress={detail.refresh} disabled={busy}>
        Refresh message
      </MailButton>
      {detail.isPending && !message ? <MailNotice>Loading message…</MailNotice> : null}
      {message && detail.data ? (
        <>
          <Text selectable className="text-xl font-t3-bold text-foreground">
            {message.subject || "(No subject)"}
          </Text>
          <Text selectable className="text-sm text-foreground-muted">
            From: {message.from}
            {"\n"}To: {message.to.join(", ")}
            {message.cc.length ? `\nCc: ${message.cc.join(", ")}` : ""}
            {message.date ? `\n${new Date(message.date).toLocaleString()}` : ""}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(["reply", "replyAll", "forward"] as const).map((mode) => (
              <MailButton
                key={mode}
                disabled={busy}
                onPress={() =>
                  navigation.navigate("MailCompose", {
                    environmentId,
                    accountId: ref.accountId,
                    source: ref,
                    mode,
                  })
                }
              >
                {mode === "replyAll" ? "Reply all" : mode === "reply" ? "Reply" : "Forward"}
              </MailButton>
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            <MailButton
              disabled={busy}
              onPress={() => void action(message.flags.includes("\\Seen") ? "unread" : "read")}
            >
              {message.flags.includes("\\Seen") ? "Mark unread" : "Mark read"}
            </MailButton>
            <MailButton
              disabled={busy}
              onPress={() => void action(message.flags.includes("\\Flagged") ? "unflag" : "flag")}
            >
              {message.flags.includes("\\Flagged") ? "Unflag" : "Flag"}
            </MailButton>
            <MailButton disabled={busy} onPress={() => void action("archive")}>
              Archive
            </MailButton>
            <MailButton disabled={busy} onPress={() => void action("trash")}>
              Trash
            </MailButton>
            <MailButton disabled={busy} onPress={() => setMoving(!moving)}>
              Move / restore
            </MailButton>
          </View>
          {moving ? (
            <View className="gap-2">
              {folders.data
                ?.filter((item) => item.selectable && item.path !== ref.folder)
                .map((item) => (
                  <MailButton
                    key={item.path}
                    disabled={busy}
                    onPress={() => void action("move", item.path)}
                  >{`Move to ${item.name}`}</MailButton>
                ))}
            </View>
          ) : null}
          <Text selectable className="text-base leading-6 text-foreground">
            {detail.data.text || "This message has no plain-text content."}
          </Text>
          {config?.environment.capabilities.mailPeople && (
            <MailPeoplePanel
              key={`${ref.accountId}:${ref.folder}:${ref.uidValidity}:${ref.uid}`}
              environmentId={environmentId}
              reference={ref}
            />
          )}
          {detail.data.html ? (
            <MailNotice>Showing plain text. Remote images and HTML are not loaded.</MailNotice>
          ) : null}
          {detail.data.attachments.length ? (
            <Text className="text-lg font-t3-bold text-foreground">Attachments</Text>
          ) : null}
          {detail.data.attachments.map((item) => (
            <MailButton
              key={item.id}
              disabled={busy}
              onPress={() => void download(item.id)}
            >{`${item.filename || "Attachment"} · ${Math.ceil(item.size / 1024)} KB`}</MailButton>
          ))}
          <MailButton disabled={busy} onPress={() => void download()}>
            Download original message
          </MailButton>
          <Text className="text-lg font-t3-bold text-foreground">Context links</Text>
          {message.metadata.links.length === 0 ? (
            <MailNotice>
              No links yet. Links reference work without starting coding tasks.
            </MailNotice>
          ) : null}
          {message.metadata.links.map((link) => (
            <View key={link.id} className="gap-2 rounded-xl bg-subtle p-3">
              <Text selectable className="text-base text-foreground">
                {link.label} · {link.type}
                {link.inferred ? " · Inferred" : ""}
                {"\n"}
                {link.target}
              </Text>
              <MailButton
                disabled={busy}
                onPress={() =>
                  void saveMetadata(
                    message.metadata.links.filter((item) => item.id !== link.id),
                    message.metadata.tags,
                  )
                }
              >
                Remove link
              </MailButton>
            </View>
          ))}
          <MailField
            label="Tags (comma separated)"
            value={tagText ?? message.metadata.tags.join(", ")}
            onChangeText={setTagText}
          />
          <MailButton
            disabled={busy || tagText === null}
            onPress={() =>
              void saveMetadata(message.metadata.links, [
                ...new Set(
                  (tagText ?? "")
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                ),
              ])
            }
          >
            Save tags
          </MailButton>
          <MailField label="Link label" value={linkLabel} onChangeText={setLinkLabel} />
          <MailField
            label="Linked item ID or reference"
            value={linkTarget}
            onChangeText={setLinkTarget}
          />
          <View className="flex-row flex-wrap gap-2">
            {(["project", "customer", "department", "task", "sop", "file", "url"] as const).map(
              (type) => (
                <MailButton
                  key={type}
                  onPress={() => setLinkType(type)}
                >{`${linkType === type ? "✓ " : ""}${type}`}</MailButton>
              ),
            )}
          </View>
          <MailButton
            disabled={busy || !linkLabel.trim() || !linkTarget.trim()}
            onPress={() =>
              void saveMetadata(
                [
                  ...message.metadata.links,
                  {
                    id: randomUUID(),
                    label: linkLabel.trim(),
                    target: linkTarget.trim(),
                    type: linkType,
                    inferred: false,
                  },
                ],
                message.metadata.tags,
              )
            }
          >
            Add link
          </MailButton>
        </>
      ) : null}
    </MailScreen>
  );
}
