import { ProjectOffice, PulseTask, PulseTaskMutation, PulseTasksError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { nextTaskDueDate } from "./taskRecurrence.ts";

const recordSchema = Schema.fromJsonString(PulseTask);
const decodeRecord = Schema.decodeUnknownEffect(recordSchema);
const encodeRecord = Schema.encodeEffect(recordSchema);
const decodeMutation = Schema.decodeEffect(PulseTaskMutation);
const isTasksError = Schema.is(PulseTasksError);
const decodeOffice = Schema.decodeUnknownEffect(Schema.fromJsonString(ProjectOffice));
const validSourceUrl = (value: string) => {
  if (!value) return true;
  if (
    [...value].some(
      (character) =>
        character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    if (value === "/workspace" || value.startsWith("/workspace?")) {
      const url = new URL(value, "https://pulse.invalid");
      return url.origin === "https://pulse.invalid" && url.pathname === "/workspace" && !url.hash;
    }
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
};

/** One instance per environment, shared by all connected clients. */
export const makePulseTasks = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const changes = yield* SubscriptionRef.make(0);
  const failure = () =>
    new PulseTasksError({ message: "Tasks could not be saved or loaded. Try again." });
  const list = Effect.gen(function* () {
    const rows = yield* sql<{
      record_json: string;
    }>`SELECT record_json FROM pulse_tasks ORDER BY id`;
    return yield* Effect.forEach(rows, (row) => decodeRecord(row.record_json));
  }).pipe(Effect.mapError(failure));
  const mutate = Effect.fn("PulseTasks.mutate")(function* (raw: PulseTaskMutation) {
    const input = yield* decodeMutation(raw).pipe(
      Effect.mapError(
        () => new PulseTasksError({ message: "Check the task title, project and tags." }),
      ),
    );
    const result = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          let previous: PulseTask | undefined;
          if (input.operation !== "create") {
            const rows = yield* sql<{
              record_json: string;
            }>`SELECT record_json FROM pulse_tasks WHERE id = ${input.id}`;
            if (!rows[0])
              return yield* new PulseTasksError({ message: "This task no longer exists." });
            previous = yield* decodeRecord(rows[0].record_json);
            if (previous.revision !== input.revision)
              return yield* new PulseTasksError({
                message:
                  "This task changed elsewhere. Close and reopen it to load the latest version.",
              });
          }
          if (
            input.operation !== "archive" &&
            input.projectId !== null &&
            input.projectId !== previous?.projectId
          ) {
            const projects =
              yield* sql`SELECT project_id FROM projection_projects WHERE project_id = ${input.projectId} AND deleted_at IS NULL`;
            if (projects.length === 0)
              return yield* new PulseTasksError({
                message: "Choose an existing project in this environment.",
              });
          }
          const nowValue = yield* DateTime.now;
          const now = DateTime.formatIso(nowValue);
          const id = previous?.id ?? (yield* crypto.randomUUIDv4);
          if (input.operation !== "archive") {
            if (input.source && !validSourceUrl(input.source.url))
              return yield* new PulseTasksError({
                message:
                  "Use an HTTP, HTTPS or Pulse workspace source link without a username or password.",
              });
            const people = [...(input.assignee ? [input.assignee] : []), ...input.followers];
            // ponytail: membership is checked by the desktop picker; the server validates linked
            // channel references only. Server-owned provider credentials would enable live verification.
            if (input.projectId === null && (people.length > 0 || input.columnId !== null))
              return yield* new PulseTasksError({
                message: "Choose a project before assigning people or a project column.",
              });
            if (input.projectId !== null && (people.length > 0 || input.columnId !== null)) {
              const rows = yield* sql<{
                office_json: string | null;
              }>`SELECT office_json FROM projection_projects WHERE project_id = ${input.projectId} AND deleted_at IS NULL`;
              if (!rows[0])
                return yield* new PulseTasksError({
                  message: "Choose an existing project before assigning people or a column.",
                });
              const office = rows[0].office_json ? yield* decodeOffice(rows[0].office_json) : null;
              if (
                people.some(
                  (person) =>
                    !office?.conversations.some(
                      (conversation) =>
                        conversation.provider === person.provider &&
                        conversation.accountId === person.accountId &&
                        conversation.conversationId === person.conversationId,
                    ),
                )
              )
                return yield* new PulseTasksError({
                  message:
                    "Assignees and followers must come from this project's linked channels. Remove people from unlinked channels.",
                });
              if (input.columnId !== null) {
                const column = office?.taskColumns?.find((column) => column.id === input.columnId);
                if (
                  (!column &&
                    (previous?.columnId !== input.columnId ||
                      previous?.projectId !== input.projectId)) ||
                  (column && column.status !== input.status)
                )
                  return yield* new PulseTasksError({
                    message: "Choose a project column that matches the task status.",
                  });
              }
            }
            if (input.recurrence?.mode === "fixed" && !input.dueDate)
              return yield* new PulseTasksError({
                message: "A fixed recurrence needs a due date to anchor its schedule.",
              });
            if (input.dueDate) {
              const date = DateTime.make(`${input.dueDate}T00:00:00Z`);
              if (Option.isNone(date) || DateTime.formatIsoDateUtc(date.value) !== input.dueDate)
                return yield* new PulseTasksError({ message: "Choose a valid due date." });
            }
            const all = yield* list;
            const graph = new Map(all.map((task) => [task.id, task]));
            const references = [
              ...input.dependencyIds,
              ...(input.parentTaskId ? [input.parentTaskId] : []),
            ];
            if (references.some((ref) => ref === id || !graph.has(ref)))
              return yield* new PulseTasksError({
                message: "Choose other existing tasks for the parent and dependencies.",
              });
            const visited = new Set<string>();
            const pending = [...references];
            while (pending.length) {
              const reference = pending.pop()!;
              if (reference === id)
                return yield* new PulseTasksError({
                  message: "Task relationships cannot form a cycle.",
                });
              if (visited.has(reference)) continue;
              visited.add(reference);
              const target = graph.get(reference);
              if (target)
                pending.push(
                  ...target.dependencyIds,
                  ...(target.parentTaskId ? [target.parentTaskId] : []),
                );
            }
          }
          const next: PulseTask =
            input.operation === "archive"
              ? {
                  ...previous!,
                  archived: input.archived,
                  updatedAt: now,
                  revision: previous!.revision + 1,
                }
              : {
                  id,
                  title: input.title,
                  description: input.description,
                  status: input.status,
                  columnId: input.columnId,
                  assignee: input.assignee,
                  followers: input.followers,
                  source: input.source,
                  projectId: input.projectId,
                  dueDate: input.dueDate,
                  recurrence: input.recurrence,
                  recurrenceAnchorDate:
                    input.recurrence?.mode === "fixed"
                      ? previous?.recurrence?.mode === "fixed" &&
                        previous.recurrence.frequency === input.recurrence.frequency &&
                        previous.recurrence.interval === input.recurrence.interval &&
                        previous.dueDate === input.dueDate
                        ? (previous.recurrenceAnchorDate ?? input.dueDate)
                        : input.dueDate
                      : null,
                  nextOccurrenceId: previous?.nextOccurrenceId ?? null,
                  parentTaskId: input.parentTaskId,
                  dependencyIds: [...new Set(input.dependencyIds)],
                  tags: [...new Set(input.tags)],
                  archived: previous?.archived ?? false,
                  revision: (previous?.revision ?? -1) + 1,
                  createdAt: previous?.createdAt ?? now,
                  updatedAt: now,
                };
          let saved = next;
          if (
            input.operation !== "archive" &&
            next.recurrence &&
            next.status === "done" &&
            previous?.status !== "done" &&
            !next.nextOccurrenceId
          ) {
            const completionDate = DateTime.formatIsoDate(
              DateTime.setZone(nowValue, DateTime.zoneMakeLocal()),
            );
            const dueDate = nextTaskDueDate(
              next.recurrence,
              next.recurrenceAnchorDate,
              next.dueDate,
              completionDate,
            );
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
              return yield* new PulseTasksError({
                message:
                  "The next recurrence is outside the supported date range. Shorten the interval or turn off recurrence.",
              });
            const nextId = yield* crypto.randomUUIDv4;
            const successor: PulseTask = {
              ...next,
              id: nextId,
              status: "todo",
              columnId: null,
              archived: false,
              dueDate,
              parentTaskId: null,
              dependencyIds: [],
              revision: 0,
              nextOccurrenceId: null,
              createdAt: now,
              updatedAt: now,
            };
            const successorEncoded = yield* encodeRecord(successor);
            yield* sql`INSERT INTO pulse_tasks (id, revision, record_json) VALUES (${nextId}, ${0}, ${successorEncoded})`;
            saved = { ...next, nextOccurrenceId: nextId };
          }
          const encoded = yield* encodeRecord(saved);
          yield* sql`INSERT INTO pulse_tasks (id, revision, record_json) VALUES (${next.id}, ${next.revision}, ${encoded}) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, record_json = excluded.record_json`;
          return saved;
        }),
      )
      .pipe(Effect.mapError((error) => (isTasksError(error) ? error : failure())));
    yield* SubscriptionRef.update(changes, (revision) => revision + 1);
    return result;
  });
  return {
    list,
    mutate,
    subscribe: SubscriptionRef.changes(changes).pipe(Stream.mapEffect(() => list)),
  };
});
export type PulseTasks = Effect.Success<typeof makePulseTasks>;
