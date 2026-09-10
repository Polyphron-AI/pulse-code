import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  MailMessage,
  MailMessageActionInput,
  MailMessageRef,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useEnvironments } from "../../state/environments";
import { mailEnvironment } from "../../state/mail";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useDebouncedValue } from "../../state/queries";
import { MailButton, MailField, MailNotice, MailScreen } from "./MailControls";

export function MailRouteScreen() {
  const { environments } = useEnvironments();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const capable = environments.filter(
    (item) => item.serverConfig?.environment.capabilities.mail === true,
  );
  const environment = capable.find((item) => item.environmentId === selected) ?? capable[0];
  return (
    <MailScreen title="Mail · Alpha">
      <View className="flex-row flex-wrap gap-2">
        {capable.map((item) => (
          <MailButton
            key={item.environmentId}
            onPress={() => setSelected(item.environmentId)}
          >{`${item.environmentId === environment?.environmentId ? "✓ " : ""}${item.label}`}</MailButton>
        ))}
      </View>
      {!environment ? (
        <MailNotice>
          Connect an environment with Mail support to set up your mailbox. Mail alpha is independent
          of Stable and Nightly updates.
        </MailNotice>
      ) : environment.connection.phase !== "connected" ? (
        <MailNotice>Reconnect {environment.label} to access its mail accounts.</MailNotice>
      ) : (
        <EnvironmentMailbox
          key={environment.environmentId}
          environmentId={environment.environmentId}
        />
      )}
    </MailScreen>
  );
}

function EnvironmentMailbox({ environmentId }: { environmentId: EnvironmentId }) {
  const navigation = useNavigation();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const optedIn = AsyncResult.isSuccess(preferences) && preferences.value.mailAlphaEnabled === true;
  const status = useEnvironmentQuery(mailEnvironment.getStatus({ environmentId, input: {} }));
  const setEnabled = useAtomCommand(mailEnvironment.setEnabled, { reportFailure: false });
  const createFolder = useAtomCommand(mailEnvironment.createFolder, { reportFailure: false });
  const renameFolder = useAtomCommand(mailEnvironment.renameFolder, { reportFailure: false });
  const deleteFolder = useAtomCommand(mailEnvironment.deleteFolder, { reportFailure: false });
  const actOnMessages = useAtomCommand(mailEnvironment.actOnMessages, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folder, setFolder] = useState("INBOX");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [beforeUid, setBeforeUid] = useState<number | undefined>(undefined);
  const [section, setSection] = useState<"mail" | "drafts" | "outbox">("mail");
  const [manageFolders, setManageFolders] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [selectedMessages, setSelectedMessages] = useState<readonly MailMessageRef[]>([]);
  const account =
    status.data?.accounts.find((item) => item.id === accountId) ?? status.data?.accounts[0];
  const active = optedIn && status.data?.enabled === true;
  const search = useDebouncedValue(query.trim(), 250);
  const folders = useEnvironmentQuery(
    active && account?.connected
      ? mailEnvironment.listFolders({ environmentId, input: { accountId: account.id } })
      : null,
  );
  const messages = useEnvironmentQuery(
    active && account?.connected && section === "mail"
      ? mailEnvironment.listMessages({
          environmentId,
          input: {
            accountId: account.id,
            folder,
            limit: 50,
            ...(beforeUid ? { beforeUid } : {}),
            ...(search ? { query: search } : {}),
            unreadOnly,
            flaggedOnly,
          },
        })
      : null,
  );
  const drafts = useEnvironmentQuery(
    optedIn && section === "drafts"
      ? mailEnvironment.listDrafts({ environmentId, input: {} })
      : null,
  );
  const outbox = useEnvironmentQuery(
    optedIn && section === "outbox"
      ? mailEnvironment.listOutbox({ environmentId, input: {} })
      : null,
  );
  const refresh = useCallback(() => {
    status.refresh();
    folders.refresh();
    messages.refresh();
    drafts.refresh();
    outbox.refresh();
  }, [status.refresh, folders.refresh, messages.refresh, drafts.refresh, outbox.refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const enable = async () => {
    setBusy(true);
    if (!status.data?.enabled) {
      const result = await setEnabled({ environmentId, input: { enabled: true } });
      if (result._tag === "Failure") {
        setBusy(false);
        Alert.alert("Could not enable Mail", String(squashAtomCommandFailure(result)));
        return;
      }
    }
    savePreferences({ mailAlphaEnabled: true });
    setBusy(false);
    status.refresh();
  };
  const disable = () =>
    Alert.alert(
      "Disable Mail on this environment?",
      "This stops new mail operations for everyone using this environment. Accounts, drafts, links and send history are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          onPress: () => {
            void (async () => {
              setBusy(true);
              const result = await setEnabled({ environmentId, input: { enabled: false } });
              setBusy(false);
              if (result._tag === "Failure")
                Alert.alert("Could not disable Mail", String(squashAtomCommandFailure(result)));
              status.refresh();
            })();
          },
        },
      ],
    );
  const editFolder = async (action: "create" | "rename" | "delete") => {
    if (!account || busy) return;
    setBusy(true);
    const result =
      action === "create"
        ? await createFolder({
            environmentId,
            input: { accountId: account.id, folder: folderName.trim() },
          })
        : action === "rename"
          ? await renameFolder({
              environmentId,
              input: { accountId: account.id, folder, newPath: folderName.trim() },
            })
          : await deleteFolder({ environmentId, input: { accountId: account.id, folder } });
    setBusy(false);
    if (result._tag === "Failure") {
      Alert.alert("Could not change folder", String(squashAtomCommandFailure(result)));
      return;
    }
    setFolder(action === "delete" ? "INBOX" : folderName.trim());
    setFolderName("");
    setBeforeUid(undefined);
    setSelectedMessages([]);
    refresh();
  };
  const bulkAction = async (action: MailMessageActionInput["action"]) => {
    if (busy || !selectedMessages.length) return;
    setBusy(true);
    const result = await actOnMessages({
      environmentId,
      input: { refs: selectedMessages, action },
    });
    setBusy(false);
    if (result._tag === "Failure")
      Alert.alert("Could not update messages", String(squashAtomCommandFailure(result)));
    else {
      setSelectedMessages(result.value.failed.map((item) => item.ref));
      if (result.value.failed.length)
        Alert.alert(
          "Some messages were not updated",
          result.value.failed.map((item) => item.detail).join("\n"),
        );
    }
    messages.refresh();
  };
  const openMessage = async (message: MailMessage) => {
    if (busy) return;
    if (!message.flags.includes("\\Seen")) {
      setBusy(true);
      const result = await actOnMessages({
        environmentId,
        input: { refs: [message.ref], action: "read" },
      });
      setBusy(false);
      if (result._tag === "Failure")
        Alert.alert("Could not mark message read", String(squashAtomCommandFailure(result)));
      else if (result.value.failed.length)
        Alert.alert(
          "Could not mark message read",
          result.value.failed.map((item) => item.detail).join("\n"),
        );
      messages.refresh();
    }
    navigation.navigate("MailMessage", { environmentId, ref: message.ref });
  };
  return (
    <>
      {status.error ? <MailNotice>{status.error}</MailNotice> : null}
      {status.isPending && !status.data ? (
        <ActivityIndicator accessibilityLabel="Loading mail accounts" />
      ) : null}
      {!active ? (
        <>
          <MailNotice>
            Enable Mail alpha to connect IMAP and SMTP accounts. Credentials remain on this
            environment. An environment administrator must enable server access. Existing drafts and
            send history remain available when the server disables Mail.
          </MailNotice>
          <MailButton disabled={busy || !status.data} onPress={() => void enable()}>
            {busy ? "Enabling…" : "Enable Mail alpha"}
          </MailButton>
        </>
      ) : null}
      {optedIn ? (
        <View className="flex-row flex-wrap gap-2">
          <MailButton
            onPress={() => {
              if (section === "mail") refresh();
              else setSection("mail");
            }}
          >
            Mailbox
          </MailButton>
          <MailButton onPress={() => setSection("drafts")}>Drafts</MailButton>
          <MailButton onPress={() => setSection("outbox")}>Outbox</MailButton>
          <MailButton onPress={refresh}>Refresh</MailButton>
          <MailButton onPress={() => savePreferences({ mailAlphaEnabled: false })}>
            Hide Mail alpha
          </MailButton>
          {active ? (
            <MailButton disabled={busy} onPress={disable}>
              Disable on this environment
            </MailButton>
          ) : null}
        </View>
      ) : null}
      {active ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            {status.data?.accounts.map((item) => (
              <MailButton
                key={item.id}
                onPress={() => {
                  setAccountId(item.id);
                  setFolder("INBOX");
                  setShowFolders(false);
                  setBeforeUid(undefined);
                  setSelectedMessages([]);
                }}
              >{`${account?.id === item.id ? "✓ " : ""}${item.name}`}</MailButton>
            ))}
            <MailButton onPress={() => navigation.navigate("MailSetup", { environmentId })}>
              Add account
            </MailButton>
          </View>
          {account ? (
            <View className="flex-row flex-wrap gap-2">
              <MailButton
                onPress={() =>
                  navigation.navigate("MailSetup", { environmentId, accountId: account.id })
                }
              >
                Account settings
              </MailButton>
              <MailButton
                disabled={!account.connected}
                onPress={() =>
                  navigation.navigate("MailCompose", { environmentId, accountId: account.id })
                }
              >
                Compose
              </MailButton>
            </View>
          ) : (
            <MailNotice>Add your first email account to get started.</MailNotice>
          )}
          {account && !account.connected ? (
            <MailNotice>
              This account is disconnected. Open account settings to reconnect it.
            </MailNotice>
          ) : null}
        </>
      ) : null}
      {active && section === "mail" && account?.connected ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Folder: ${folder}. ${showFolders ? "Hide" : "Choose"} folders`}
            accessibilityState={{ expanded: showFolders }}
            className="min-h-11 flex-row items-center justify-between rounded-xl border border-input-border bg-subtle px-3 py-2"
            onPress={() => setShowFolders(!showFolders)}
          >
            <Text numberOfLines={1} className="flex-1 text-base font-t3-bold text-foreground">
              {folders.data?.find((item) => item.path === folder)?.name ?? folder}
            </Text>
            <Text className="text-sm text-foreground-muted">
              {showFolders ? "Hide folders ▴" : "Choose folder ▾"}
            </Text>
          </Pressable>
          {showFolders ? (
            <>
              <View className="flex-row flex-wrap gap-2">
                {folders.data
                  ?.filter((item) => item.selectable)
                  .map((item) => (
                    <MailButton
                      key={item.path}
                      onPress={() => {
                        setFolder(item.path);
                        setBeforeUid(undefined);
                        setSelectedMessages([]);
                        setShowFolders(false);
                        setManageFolders(false);
                      }}
                    >{`${folder === item.path ? "✓ " : ""}${item.name}`}</MailButton>
                  ))}
                <MailButton onPress={() => setManageFolders(!manageFolders)}>
                  Manage folders
                </MailButton>
              </View>
              {manageFolders ? (
                <>
                  <MailField
                    label="Folder name or path"
                    value={folderName}
                    onChangeText={setFolderName}
                  />
                  <View className="flex-row flex-wrap gap-2">
                    <MailButton
                      disabled={busy || !folderName.trim()}
                      onPress={() => void editFolder("create")}
                    >
                      Create folder
                    </MailButton>
                    <MailButton
                      disabled={busy || !folderName.trim()}
                      onPress={() => void editFolder("rename")}
                    >
                      Rename current folder
                    </MailButton>
                    <MailButton
                      disabled={busy}
                      onPress={() =>
                        Alert.alert(
                          "Delete folder?",
                          `Delete ${folder}? Only empty non-system folders can be deleted.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => void editFolder("delete"),
                            },
                          ],
                        )
                      }
                    >
                      Delete current folder
                    </MailButton>
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          <MailField
            label="Search this folder"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setBeforeUid(undefined);
              setSelectedMessages([]);
            }}
          />
          <View className="flex-row flex-wrap gap-2">
            <MailButton
              onPress={() => {
                setUnreadOnly(!unreadOnly);
                setBeforeUid(undefined);
                setSelectedMessages([]);
              }}
            >
              {unreadOnly ? "✓ Unread" : "Unread"}
            </MailButton>
            <MailButton
              onPress={() => {
                setFlaggedOnly(!flaggedOnly);
                setBeforeUid(undefined);
                setSelectedMessages([]);
              }}
            >
              {flaggedOnly ? "✓ Flagged" : "Flagged"}
            </MailButton>
          </View>
          {folders.error || messages.error ? (
            <MailNotice>{folders.error ?? messages.error}</MailNotice>
          ) : null}
          {messages.isPending ? <ActivityIndicator accessibilityLabel="Loading messages" /> : null}
          {selectedMessages.length ? (
            <>
              <Text className="text-sm text-foreground-muted">
                {selectedMessages.length} selected
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(["read", "unread", "flag", "unflag", "archive", "trash"] as const).map(
                  (action) => (
                    <MailButton
                      key={action}
                      disabled={busy}
                      onPress={() => void bulkAction(action)}
                    >
                      {action}
                    </MailButton>
                  ),
                )}
                <MailButton onPress={() => setSelectedMessages([])}>Clear selection</MailButton>
              </View>
            </>
          ) : null}
          {messages.data?.messages.map((message) => {
            const selected = selectedMessages.some(
              (ref) =>
                ref.uid === message.ref.uid &&
                ref.uidValidity === message.ref.uidValidity &&
                ref.folder === message.ref.folder &&
                ref.accountId === message.ref.accountId,
            );
            return (
              <View
                key={message.id}
                className="flex-row items-center gap-2 border-b border-input-border"
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Select ${message.subject || "message"}`}
                  accessibilityState={{ checked: selected }}
                  className="min-h-11 min-w-11 items-center justify-center"
                  onPress={() =>
                    setSelectedMessages(
                      selected
                        ? selectedMessages.filter(
                            (ref) =>
                              ref.uid !== message.ref.uid ||
                              ref.uidValidity !== message.ref.uidValidity ||
                              ref.folder !== message.ref.folder ||
                              ref.accountId !== message.ref.accountId,
                          )
                        : [...selectedMessages, message.ref],
                    )
                  }
                >
                  <Text className="text-lg text-foreground">{selected ? "☑" : "☐"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void openMessage(message)}
                  className="flex-1 gap-1 py-3"
                >
                  <Text className="text-sm text-foreground-muted" numberOfLines={1}>
                    {message.from}
                  </Text>
                  <Text
                    className={`${message.flags.includes("\\Seen") ? "" : "font-t3-bold"} text-base text-foreground`}
                    numberOfLines={2}
                  >
                    {message.flags.includes("\\Flagged") ? "★ " : ""}
                    {message.subject || "(No subject)"}
                  </Text>
                  <Text className="text-xs text-foreground-muted">
                    {message.date ? new Date(message.date).toLocaleString() : ""}
                    {message.metadata.links.length
                      ? ` · ${message.metadata.links.length} links`
                      : ""}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {messages.data?.messages.length === 0 && !messages.isPending ? (
            <MailNotice>
              {messages.data.nextBeforeUid
                ? "No matches in this batch. Load older messages to keep searching."
                : "No matching messages in this page."}
            </MailNotice>
          ) : null}
          <View className="flex-row gap-2">
            {beforeUid ? (
              <MailButton
                onPress={() => {
                  setBeforeUid(undefined);
                  setSelectedMessages([]);
                }}
              >
                Newest
              </MailButton>
            ) : null}
            {messages.data?.nextBeforeUid ? (
              <MailButton
                onPress={() => {
                  setBeforeUid(messages.data?.nextBeforeUid ?? undefined);
                  setSelectedMessages([]);
                }}
              >
                Older messages
              </MailButton>
            ) : null}
          </View>
        </>
      ) : null}
      {section === "drafts" && optedIn ? (
        <>
          {drafts.error ? <MailNotice>{drafts.error}</MailNotice> : null}
          {drafts.data?.map((draft) => (
            <MailButton
              key={draft.id}
              onPress={() =>
                navigation.navigate("MailCompose", {
                  environmentId,
                  accountId: draft.content.accountId,
                  draftId: draft.id,
                })
              }
            >
              {draft.content.subject || "(No subject)"}
            </MailButton>
          ))}
          {drafts.data?.length === 0 ? <MailNotice>No saved drafts.</MailNotice> : null}
        </>
      ) : null}
      {section === "outbox" && optedIn ? (
        <>
          {outbox.error ? <MailNotice>{outbox.error}</MailNotice> : null}
          {outbox.data?.map((receipt) => (
            <MailNotice key={receipt.operationId}>
              {receipt.state.toUpperCase()}: {receipt.detail}
              {"\n"}
              {receipt.accepted.length ? `Accepted: ${receipt.accepted.join(", ")}` : ""}
              {receipt.rejected.length ? `\nRejected: ${receipt.rejected.join(", ")}` : ""}
            </MailNotice>
          ))}
          {outbox.data?.length === 0 ? <MailNotice>No send history.</MailNotice> : null}
        </>
      ) : null}
    </>
  );
}
