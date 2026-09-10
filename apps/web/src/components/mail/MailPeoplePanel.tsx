import type {
  EnvironmentId,
  MailMessageRef,
  MailPerson,
  MailWork,
  MailWorkSaveInput,
  MailEvidence,
} from "@t3tools/contracts";
import { useState } from "react";
import { ChevronDownIcon, UsersIcon } from "lucide-react";
import { useEnvironments } from "../../state/environments";
import { mailEnvironment } from "../../state/mail";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { mailFailure, mailInputClass } from "./MailSetup";
import { formatMailDate } from "./mailPresentation";

type Props = { environmentId: EnvironmentId; accountId: string; reference?: MailMessageRef };
export function MailPeoplePanel(props: Props) {
  const { environments } = useEnvironments();
  if (
    !environments.some(
      (item) =>
        item.environmentId === props.environmentId &&
        item.serverConfig?.environment.capabilities.mailPeople,
    )
  )
    return null;
  return <PeoplePanel {...props} />;
}

function PeoplePanel({ environmentId, accountId, reference }: Props) {
  const [expanded, setExpanded] = useState(!reference);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MailWork | "new" | null>(null);
  const query = useEnvironmentQuery(
    expanded
      ? mailEnvironment.getPeopleContext({
          environmentId,
          input: { accountId, ...(reference ? { ref: reference } : {}) },
        })
      : null,
  );
  const review = useAtomCommand(mailEnvironment.reviewPerson, { reportFailure: false });
  const save = useAtomCommand(mailEnvironment.savePeopleWork, { reportFailure: false });
  const reviewEdge = useAtomCommand(mailEnvironment.reviewConnection, { reportFailure: false });
  const people = query.data?.people ?? [];
  const person =
    people.find((item) => item.id === selected) ??
    people.find((item) => item.state !== "dismissed") ??
    people[0];
  const work = (query.data?.work ?? [])
    .filter((item) => item.personId === person?.id)
    .sort(
      (a, b) =>
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        (b.evidence.date ?? "").localeCompare(a.evidence.date ?? ""),
    );
  const outstanding = work.filter((item) => item.state === "open" || item.state === "waiting");
  const suggested = work.filter((item) => item.state === "suggested");
  const past = work.filter((item) => item.state === "done");
  const dismissed = work.filter((item) => item.state === "dismissed");
  const edges = (query.data?.connections ?? []).filter(
    (item) => item.fromPersonId === person?.id || item.toPersonId === person?.id,
  );
  async function updatePerson(
    target: MailPerson,
    state: "confirmed" | "dismissed" | "candidate",
    name = target.name,
  ) {
    setBusy(true);
    setError(null);
    const result = await review({
      environmentId,
      input: { id: target.id, revision: target.revision, name, state },
    });
    setBusy(false);
    if (result._tag === "Failure") setError(mailFailure(result));
    query.refresh();
  }
  async function saveWork(input: MailWorkSaveInput) {
    setBusy(true);
    setError(null);
    const result = await save({ environmentId, input });
    setBusy(false);
    if (result._tag === "Failure") setError(mailFailure(result));
    else setEditing(null);
    query.refresh();
  }
  const changeState = (item: MailWork, state: MailWork["state"]) =>
    saveWork({
      id: item.id,
      personId: item.personId,
      revision: item.revision,
      title: item.title,
      kind: item.kind,
      state,
      dueDate: item.dueDate,
      ref: item.evidence.ref,
    });
  function rows(items: readonly MailWork[]) {
    return (
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <p className="break-words text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.state === "waiting"
                ? "Waiting for feedback"
                : item.state === "suggested"
                  ? "Luna suggestion"
                  : item.state === "done"
                    ? "Completed"
                    : item.state === "dismissed"
                      ? "Dismissed"
                      : "Open task"}
              {item.dueDate ? ` · Due ${item.dueDate}` : ""}
            </p>
            <MailSourceEvidence environmentId={environmentId} evidence={item.evidence} />
            {person?.state === "confirmed" && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.state === "suggested" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void changeState(item, item.kind === "feedback" ? "waiting" : "open")
                    }
                  >
                    Confirm {item.kind === "feedback" ? "request" : "task"}
                  </Button>
                ) : item.state === "done" || item.state === "dismissed" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void changeState(item, item.kind === "feedback" ? "waiting" : "open")
                    }
                  >
                    {item.state === "done" ? "Reopen" : "Restore"}
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void changeState(item, "done")}
                  >
                    {item.kind === "feedback" ? "Mark resolved" : "Complete"}
                  </Button>
                )}
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => setEditing(item)}>
                  Edit
                </Button>
                {item.state !== "dismissed" && (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void changeState(item, "dismissed")}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section aria-label="People and work" className="border-y border-border py-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-9 w-full items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UsersIcon className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold">People and work</span>
        <ChevronDownIcon className={`size-4 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {!expanded && (
        <p className="text-xs text-muted-foreground">
          Participants, prior tasks and outstanding feedback
        </p>
      )}
      {expanded && (
        <div className="mt-3 min-w-0">
          {(error || query.error) && (
            <div role="alert" className="mb-3 text-sm text-destructive">
              {error ?? query.error}
              <Button size="xs" variant="outline" className="ml-2" onClick={query.refresh}>
                Refresh
              </Button>
            </div>
          )}
          {query.isPending && !query.data && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading people and work…
            </p>
          )}
          {query.data && !people.length && (
            <p className="text-sm leading-6 text-muted-foreground">
              Open a message to find its participants. Confirm a person to start keeping their tasks
              and feedback together.
            </p>
          )}
          {people.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1" aria-label="Choose a participant">
                {people.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={person?.id === item.id ? "secondary" : "ghost"}
                    aria-pressed={person?.id === item.id}
                    onClick={() => {
                      setSelected(item.id);
                      setEditing(null);
                    }}
                    className="max-w-full"
                  >
                    <span className="truncate">{item.name}</span>
                    {item.state === "dismissed"
                      ? " · Dismissed"
                      : item.state === "candidate"
                        ? " · Review"
                        : ""}
                  </Button>
                ))}
              </div>
              {person && (
                <div className="mt-4">
                  <p className="break-all text-xs text-muted-foreground">{person.address}</p>
                  {person.state !== "confirmed" ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm leading-6">
                        {person.state === "dismissed"
                          ? "This identity is dismissed. Restore it to review again."
                          : "Confirm who uses this address before recording work. A shared mailbox can represent a team."}
                      </p>
                      {person.state === "dismissed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void updatePerson(person, "candidate")}
                        >
                          Restore identity
                        </Button>
                      ) : (
                        <form
                          key={person.id}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const name = String(
                              new FormData(event.currentTarget).get("name") ?? "",
                            ).trim();
                            if (name) void updatePerson(person, "confirmed", name);
                          }}
                          className="flex flex-wrap gap-2"
                        >
                          <Input
                            nativeInput
                            name="name"
                            aria-label="Person or team name"
                            defaultValue={person.name}
                            required
                            maxLength={500}
                            className="min-w-0 flex-1"
                          />
                          <Button size="sm" disabled={busy}>
                            Confirm identity
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void updatePerson(person, "dismissed")}
                          >
                            Dismiss
                          </Button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reference && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setEditing("new")}
                          >
                            Add task or feedback
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void updatePerson(person, "candidate")}
                        >
                          Correct identity
                        </Button>
                      </div>
                      {editing && (
                        <WorkEditor
                          key={
                            editing === "new"
                              ? `new-${person.id}`
                              : `${editing.id}:${editing.revision}`
                          }
                          person={person}
                          item={editing === "new" ? undefined : editing}
                          reference={editing === "new" ? reference! : editing.evidence.ref}
                          busy={busy}
                          onSave={saveWork}
                          onCancel={() => setEditing(null)}
                        />
                      )}
                    </>
                  )}
                  <h3 className="mt-5 text-sm font-semibold">Outstanding work</h3>
                  {outstanding.length ? (
                    rows(outstanding)
                  ) : (
                    <p className="py-3 text-sm text-muted-foreground">
                      No recorded outstanding work with {person.name}.
                    </p>
                  )}
                  {suggested.length > 0 && (
                    <>
                      <h3 className="mt-4 text-sm font-semibold">Suggested from correspondence</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Review the request before confirming work.
                      </p>
                      {rows(suggested)}
                    </>
                  )}
                  <details className="mt-3 border-t border-border pt-3">
                    <summary className="cursor-pointer text-sm">Recent correspondence</summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                      From messages opened in Pulse. A reply does not automatically resolve a
                      request.
                    </p>
                    {query.data?.recent
                      .filter((item) => item.personId === person.id)
                      .map((item) => (
                        <MailSourceEvidence
                          key={`${item.evidence.ref.folder}:${item.evidence.ref.uidValidity}:${item.evidence.ref.uid}`}
                          environmentId={environmentId}
                          evidence={item.evidence}
                        />
                      ))}
                  </details>
                  <details className="mt-3 border-t border-border pt-3">
                    <summary className="cursor-pointer text-sm">Past work ({past.length})</summary>
                    {past.length ? (
                      rows(past)
                    ) : (
                      <p className="py-3 text-sm text-muted-foreground">
                        Completed tasks and resolved feedback will appear here.
                      </p>
                    )}
                  </details>
                  {edges.length > 0 && (
                    <details className="mt-3 border-t border-border pt-3">
                      <summary className="cursor-pointer text-sm">
                        Connections ({edges.length})
                      </summary>
                      <ul className="divide-y divide-border">
                        {edges.map((edge) => (
                          <li className="py-3" key={edge.id}>
                            <p className="text-sm">
                              {people.find((item) => item.id === edge.fromPersonId)?.name ??
                                "Confirmed contact"}{" "}
                              {edge.type.replaceAll("_", " ")}{" "}
                              {people.find((item) => item.id === edge.toPersonId)?.name ??
                                "Confirmed contact"}{" "}
                              · {edge.state}
                            </p>
                            <MailSourceEvidence
                              environmentId={environmentId}
                              evidence={edge.evidence}
                            />
                            <div className="mt-2 flex gap-2">
                              {(edge.state === "dismissed"
                                ? ["suggested" as const]
                                : edge.state === "confirmed"
                                  ? ["dismissed" as const]
                                  : (["confirmed", "dismissed"] as const)
                              ).map((state) => (
                                <Button
                                  key={state}
                                  size="xs"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={async () => {
                                    setBusy(true);
                                    setError(null);
                                    const result = await reviewEdge({
                                      environmentId,
                                      input: { id: edge.id, revision: edge.revision, state },
                                    });
                                    setBusy(false);
                                    if (result._tag === "Failure") setError(mailFailure(result));
                                    query.refresh();
                                  }}
                                >
                                  {state === "suggested"
                                    ? "Restore"
                                    : state === "confirmed"
                                      ? "Confirm"
                                      : "Dismiss"}
                                </Button>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {dismissed.length > 0 && (
                    <details className="mt-3 border-t border-border pt-3">
                      <summary className="cursor-pointer text-sm">
                        Dismissed work ({dismissed.length})
                      </summary>
                      {rows(dismissed)}
                    </details>
                  )}
                </div>
              )}
            </>
          )}
          {query.data?.truncated && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing a limited history. Open a message to narrow the people shown.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function WorkEditor({
  person,
  item,
  reference,
  busy,
  onSave,
  onCancel,
}: {
  person: MailPerson;
  item: MailWork | undefined;
  reference: MailMessageRef;
  busy: boolean;
  onSave: (input: MailWorkSaveInput) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-4 space-y-3 border-y border-border py-4"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const kind = values.get("kind") === "feedback" ? "feedback" : "task";
        void onSave({
          ...(item ? { id: item.id } : {}),
          personId: person.id,
          revision: item?.revision ?? 0,
          title: String(values.get("title") ?? "").trim(),
          kind,
          state:
            item && ["suggested", "done", "dismissed"].includes(item.state)
              ? item.state
              : kind === "feedback"
                ? "waiting"
                : "open",
          dueDate: String(values.get("due") ?? "") || null,
          ref: reference,
        });
      }}
    >
      <label className="block text-xs">
        Task or requested feedback
        <Input
          nativeInput
          name="title"
          required
          maxLength={500}
          defaultValue={item?.title ?? ""}
          className="mt-1"
        />
      </label>
      <label className="block text-xs">
        Type
        <select
          name="kind"
          className={`${mailInputClass} mt-1`}
          defaultValue={item?.kind ?? "task"}
        >
          <option value="task">Task involving this person</option>
          <option value="feedback">Waiting for their feedback</option>
        </select>
      </label>
      <label className="block text-xs">
        Due date (optional)
        <Input
          nativeInput
          type="date"
          name="due"
          defaultValue={item?.dueDate ?? ""}
          className="mt-1"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Saved with this correspondence. No message will be sent.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save work"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MailSourceEvidence({
  environmentId,
  evidence,
}: {
  environmentId: EnvironmentId;
  evidence: typeof MailEvidence.Type;
}) {
  const [open, setOpen] = useState(false);
  const source = useEnvironmentQuery(
    open ? mailEnvironment.readMessage({ environmentId, input: evidence.ref }) : null,
  );
  return (
    <details className="mt-2 text-xs" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer break-words text-muted-foreground underline underline-offset-4">
        Source: {evidence.subject || "(No subject)"} · {formatMailDate(evidence.date)}
      </summary>
      {evidence.excerpt && (
        <blockquote className="mt-2 whitespace-pre-wrap break-words text-sm">
          {evidence.excerpt}
        </blockquote>
      )}
      {source.error && (
        <p role="alert" className="mt-2 text-destructive">
          Source unavailable. {source.error}
        </p>
      )}
      {source.isPending && !source.data && (
        <p role="status" className="mt-2">
          Loading correspondence…
        </p>
      )}
      {source.data && (
        <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">
          <p className="mb-2 font-medium">{source.data.message.from}</p>
          {source.data.text || "This source has no plain-text body."}
        </div>
      )}
    </details>
  );
}
