import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { EnvironmentId, MailMessageRef, MailWork } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { mailEnvironment } from "../../state/mail";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { MailButton, MailField, MailNotice } from "./MailControls";

export function MailPeoplePanel({
  environmentId,
  reference,
}: {
  environmentId: EnvironmentId;
  reference: MailMessageRef;
}) {
  const navigation =
    useNavigation<
      NavigationProp<{ MailMessage: { environmentId: string; ref: MailMessageRef } }>
    >();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [feedback, setFeedback] = useState(false);
  const [editing, setEditing] = useState<MailWork | null>(null);
  const [past, setPast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useEnvironmentQuery(
    expanded
      ? mailEnvironment.getPeopleContext({
          environmentId,
          input: { accountId: reference.accountId, ref: reference },
        })
      : null,
  );
  const review = useAtomCommand(mailEnvironment.reviewPerson, { reportFailure: false });
  const save = useAtomCommand(mailEnvironment.savePeopleWork, { reportFailure: false });
  const people = query.data?.people ?? [];
  const person = people.find((item) => item.id === selected) ?? people[0];
  const work = (query.data?.work ?? []).filter(
    (item) =>
      item.personId === person?.id &&
      (past
        ? item.state === "done" || item.state === "dismissed"
        : item.state !== "done" && item.state !== "dismissed"),
  );
  async function reviewIdentity(state: "confirmed" | "candidate" | "dismissed") {
    if (!person) return;
    setBusy(true);
    setError(null);
    const result = await review({
      environmentId,
      input: { id: person.id, revision: person.revision, name: name?.trim() || person.name, state },
    });
    setBusy(false);
    if (result._tag === "Failure") setError(String(squashAtomCommandFailure(result)));
    query.refresh();
  }
  async function saveWork(item?: MailWork, state?: MailWork["state"]) {
    if (!person) return;
    setBusy(true);
    setError(null);
    const target = item ?? editing;
    const result = await save({
      environmentId,
      input: {
        ...(target ? { id: target.id } : {}),
        personId: person.id,
        revision: target?.revision ?? 0,
        title: item?.title ?? title.trim(),
        kind: item?.kind ?? (feedback ? "feedback" : "task"),
        state: state ?? target?.state ?? (feedback ? "waiting" : "open"),
        dueDate: item ? item.dueDate : dueDate || null,
        ref: target?.evidence.ref ?? reference,
      },
    });
    setBusy(false);
    if (result._tag === "Failure") setError(String(squashAtomCommandFailure(result)));
    else {
      setTitle("");
      setDueDate("");
      setEditing(null);
    }
    query.refresh();
  }
  return (
    <View className="gap-3 border-y border-input-border py-3">
      <MailButton onPress={() => setExpanded(!expanded)}>
        {expanded ? "Hide people and work" : "People, prior tasks and feedback"}
      </MailButton>
      {expanded && (
        <>
          {query.error || error ? <MailNotice>{error ?? query.error}</MailNotice> : null}
          <MailButton onPress={query.refresh} disabled={busy}>
            Refresh people
          </MailButton>
          {query.isPending && !query.data ? <MailNotice>Loading people…</MailNotice> : null}
          {query.data && !people.length ? (
            <MailNotice>No identifiable participants in this message.</MailNotice>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {people.map((item) => (
              <MailButton
                key={item.id}
                onPress={() => {
                  setSelected(item.id);
                  setName(null);
                  setEditing(null);
                  setTitle("");
                  setDueDate("");
                }}
              >{`${item.name}${item.id === person?.id ? " · Selected" : ""}`}</MailButton>
            ))}
          </View>
          {person && (
            <>
              <Text className="text-sm text-foreground-muted">
                {person.address} · {person.state}
              </Text>
              {person.state !== "confirmed" ? (
                <>
                  <MailField
                    label="Person or team name"
                    value={name ?? person.name}
                    onChangeText={setName}
                  />
                  <MailNotice>
                    Confirm who uses this address. Shared mailboxes can represent teams.
                  </MailNotice>
                  <MailButton
                    disabled={busy}
                    onPress={() =>
                      void reviewIdentity(person.state === "dismissed" ? "candidate" : "confirmed")
                    }
                  >
                    {person.state === "dismissed" ? "Restore identity" : "Confirm identity"}
                  </MailButton>
                  {person.state !== "dismissed" && (
                    <MailButton disabled={busy} onPress={() => void reviewIdentity("dismissed")}>
                      Dismiss identity
                    </MailButton>
                  )}
                </>
              ) : (
                <>
                  <MailButton disabled={busy} onPress={() => void reviewIdentity("candidate")}>
                    Correct identity
                  </MailButton>
                  <MailField
                    label={editing ? "Edit work" : "New task or feedback request"}
                    value={title}
                    onChangeText={setTitle}
                  />
                  <MailButton onPress={() => setFeedback(!feedback)}>
                    {feedback ? "Type: waiting for feedback" : "Type: task involving this person"}
                  </MailButton>
                  <MailField
                    label="Due date (optional, YYYY-MM-DD)"
                    value={dueDate}
                    onChangeText={setDueDate}
                  />
                  <MailButton disabled={busy || !title.trim()} onPress={() => void saveWork()}>
                    {busy ? "Saving…" : "Save work"}
                  </MailButton>
                  {editing && (
                    <MailButton
                      onPress={() => {
                        setEditing(null);
                        setTitle("");
                        setDueDate("");
                      }}
                    >
                      Cancel edit
                    </MailButton>
                  )}
                </>
              )}
              <Text className="text-lg font-t3-bold text-foreground">
                {past ? "Past and dismissed work" : "Outstanding work and suggestions"}
              </Text>
              <MailButton onPress={() => setPast(!past)}>
                {past ? "Show outstanding work" : "Show past and dismissed work"}
              </MailButton>
              {!work.length && <MailNotice>No recorded work in this view.</MailNotice>}
              {work.map((item) => (
                <View key={item.id} className="gap-2 border-b border-input-border py-3">
                  <Text className="text-base font-t3-bold text-foreground">{item.title}</Text>
                  <Text className="text-sm text-foreground-muted">
                    {item.state === "waiting" ? "Waiting for feedback" : item.state}
                    {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  </Text>
                  {item.evidence.excerpt ? (
                    <Text selectable className="text-sm text-foreground">
                      {item.evidence.excerpt}
                    </Text>
                  ) : null}
                  <MailButton
                    onPress={() =>
                      navigation.navigate("MailMessage", { environmentId, ref: item.evidence.ref })
                    }
                  >{`Source: ${item.evidence.subject || "(No subject)"}`}</MailButton>
                  {person.state === "confirmed" && (
                    <>
                      <MailButton
                        disabled={busy}
                        onPress={() =>
                          void saveWork(
                            item,
                            item.state === "open" || item.state === "waiting"
                              ? "done"
                              : item.kind === "feedback"
                                ? "waiting"
                                : "open",
                          )
                        }
                      >
                        {item.state === "suggested"
                          ? "Confirm request"
                          : item.state === "done"
                            ? "Reopen"
                            : item.state === "dismissed"
                              ? "Restore"
                              : "Mark resolved"}
                      </MailButton>
                      <MailButton
                        disabled={busy}
                        onPress={() => {
                          setEditing(item);
                          setTitle(item.title);
                          setFeedback(item.kind === "feedback");
                          setDueDate(item.dueDate ?? "");
                        }}
                      >
                        Edit work
                      </MailButton>
                      {item.state !== "dismissed" && (
                        <MailButton
                          disabled={busy}
                          onPress={() => void saveWork(item, "dismissed")}
                        >
                          Dismiss
                        </MailButton>
                      )}
                    </>
                  )}
                </View>
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}
