import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import {
  MailDiscoveryResult,
  MailOperationError,
  type MailConnectionReviewInput,
  type MailMessageDetail,
  type MailMessageRef,
  type MailPeopleContextInput,
  type MailPeopleState,
  type MailPersonReviewInput,
  type MailWork,
  type MailWorkSaveInput,
} from "@t3tools/contracts";
import type { MailState } from "./MailStore.ts";

export const emptyPeople = (): typeof MailPeopleState.Type => ({
  people: [],
  work: [],
  connections: [],
  scans: {},
  sources: [],
});
const fail = (detail: string): never => {
  throw new MailOperationError({ reason: "conflict", detail });
};
const hash = (value: unknown) =>
  NodeCrypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decodeDiscovery = Schema.decodeUnknownSync(MailDiscoveryResult);
export const peopleData = (state: MailState) => state.peopleContext ?? emptyPeople();
const sourceId = (state: MailState, detail: MailMessageDetail) =>
  state.aliases[detail.message.id] ?? detail.message.id;
const evidence = (detail: MailMessageDetail, excerpt = "") => ({
  ref: detail.message.ref,
  subject: detail.message.subject.slice(0, 1000),
  date: detail.message.date,
  excerpt,
});

/** Headers create candidates only. A shared address never silently becomes a confirmed person. */
export function observePeople(state: MailState, detail: MailMessageDetail): MailState {
  const data = peopleData(state);
  const people = [...data.people];
  const personIds: string[] = [];
  for (const value of [detail.message.from, ...detail.message.to, ...detail.message.cc].slice(
    0,
    100,
  )) {
    const match = value.trim().match(/^(?:([^<>]*)<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))$/);
    if (!match) continue;
    const address = (match[2] ?? match[3] ?? "").toLowerCase();
    if (address.length > 500) continue;
    let person = people.find((item) => item.address === address);
    if (!person) {
      if (people.length >= 2000) continue;
      person = {
        id: NodeCrypto.randomUUID(),
        address,
        name: match[1]?.trim().replace(/^"|"$/g, "").slice(0, 500) || address,
        state: "candidate",
        revision: 0,
      };
      people.push(person);
    }
    if (!personIds.includes(person.id)) personIds.push(person.id);
  }
  const id = sourceId(state, detail);
  const source = { id, evidence: evidence(detail), personIds };
  const previous = data.sources.find((item) => item.id === id);
  if (people.length === data.people.length && JSON.stringify(previous) === JSON.stringify(source))
    return state;
  return {
    ...state,
    peopleContext: {
      ...data,
      people,
      sources: [...data.sources.filter((item) => item.id !== id), source].slice(-2000),
    },
  };
}

export function getPeopleContext(
  state: MailState,
  input: MailPeopleContextInput,
  available: boolean,
) {
  const data = peopleData(state);
  const sources = data.sources.filter(
    (source) => source.evidence.ref.accountId === input.accountId,
  );
  const selectedSource =
    input.ref &&
    sources.find(
      (source) =>
        source.evidence.ref.folder === input.ref?.folder &&
        source.evidence.ref.uid === input.ref?.uid &&
        source.evidence.ref.uidValidity === input.ref?.uidValidity,
    );
  const ids = new Set(
    (input.ref ? (selectedSource ? [selectedSource] : []) : sources).flatMap(
      (source) => source.personIds,
    ),
  );
  const people = data.people.filter((person) => ids.has(person.id));
  const work = data.work.filter(
    (item) => ids.has(item.personId) && item.evidence.ref.accountId === input.accountId,
  );
  const connections = data.connections.filter(
    (item) =>
      (ids.has(item.fromPersonId) || ids.has(item.toPersonId)) &&
      item.evidence.ref.accountId === input.accountId,
  );
  return {
    people: people.slice(0, 100),
    work: work
      .toSorted((a, b) => {
        const rank = { waiting: 0, open: 1, suggested: 2, done: 3, dismissed: 4 };
        return (
          rank[a.state] - rank[b.state] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
        );
      })
      .slice(0, 300),
    connections: connections.slice(-300),
    discoveryAvailable: available,
    recent: people.slice(0, 100).flatMap((person) =>
      sources
        .filter((source) => source.personIds.includes(person.id))
        .sort((a, b) => (b.evidence.date ?? "").localeCompare(a.evidence.date ?? ""))
        .slice(0, 3)
        .map((source) => ({ personId: person.id, evidence: source.evidence })),
    ),
    truncated: people.length > 100 || work.length > 300 || connections.length > 300,
  };
}

export function reviewPerson(state: MailState, input: MailPersonReviewInput): MailState {
  const data = peopleData(state);
  const person = data.people.find((item) => item.id === input.id);
  if (!person || person.revision !== input.revision)
    return fail("This person changed. Refresh before reviewing again.");
  return {
    ...state,
    peopleContext: {
      ...data,
      people: data.people.map((item) =>
        item.id === input.id
          ? { ...item, name: input.name, state: input.state, revision: item.revision + 1 }
          : item,
      ),
    },
  };
}

export function savePeopleWork(
  state: MailState,
  input: MailWorkSaveInput,
  detail?: MailMessageDetail,
): { state: MailState; result: MailWork } {
  const data = peopleData(state);
  const previous = data.work.find((item) => item.id === input.id);
  if ((input.id && !previous) || (previous?.revision ?? 0) !== input.revision)
    return fail("This work changed on another device. Refresh before saving.");
  if (
    previous &&
    (previous.personId !== input.personId ||
      previous.evidence.ref.accountId !== input.ref.accountId)
  )
    return fail("Keep this work with its original person and account.");
  if (!data.people.some((person) => person.id === input.personId && person.state === "confirmed"))
    return fail("Confirm this person's identity before recording work.");
  if (
    !previous &&
    (!detail ||
      !data.sources.some(
        (source) =>
          source.id === sourceId(state, detail) && source.personIds.includes(input.personId),
      ))
  )
    return fail("Choose a participant in this message.");
  if (!previous && data.work.length >= 2000) return fail("This alpha supports 2,000 work records.");
  if (input.dueDate) {
    const date = DateTime.make(input.dueDate);
    if (Option.isNone(date) || DateTime.formatIsoDateUtc(date.value) !== input.dueDate)
      return fail("Enter a valid due date.");
  }
  const result: MailWork = {
    id: previous?.id ?? NodeCrypto.randomUUID(),
    personId: input.personId,
    title: input.title,
    kind: input.kind,
    state: input.state,
    dueDate: input.dueDate,
    evidence: previous?.evidence ?? evidence(detail!),
    revision: input.revision + 1,
    origin: previous?.origin ?? "user",
  };
  return {
    state: {
      ...state,
      peopleContext: {
        ...data,
        work: [...data.work.filter((item) => item.id !== result.id), result],
      },
    },
    result,
  };
}

/** Only provider-confirmed moves may transfer source identity and its correction history. */
export function relocatePeople(
  state: MailState,
  from: MailMessageRef,
  to: MailMessageRef,
): MailState {
  if (!state.peopleContext) return state;
  const update = <T extends { evidence: { ref: MailMessageRef } }>(item: T): T => {
    const ref = item.evidence.ref;
    return ref.accountId === from.accountId &&
      ref.folder === from.folder &&
      ref.uidValidity === from.uidValidity &&
      ref.uid === from.uid
      ? { ...item, evidence: { ...item.evidence, ref: to } }
      : item;
  };
  const data = state.peopleContext;
  return {
    ...state,
    peopleContext: {
      ...data,
      sources: data.sources.map(update),
      work: data.work.map(update),
      connections: data.connections.map(update),
    },
  };
}

export function reviewConnection(state: MailState, input: MailConnectionReviewInput): MailState {
  const data = peopleData(state);
  const edge = data.connections.find((item) => item.id === input.id);
  if (!edge || edge.revision !== input.revision)
    return fail("This connection changed. Refresh before reviewing again.");
  if (
    input.state === "confirmed" &&
    [edge.fromPersonId, edge.toPersonId].some(
      (id) => !data.people.some((person) => person.id === id && person.state === "confirmed"),
    )
  )
    return fail("Confirm both people before confirming their connection.");
  return {
    ...state,
    peopleContext: {
      ...data,
      connections: data.connections.map((item) =>
        item.id === input.id ? { ...item, state: input.state, revision: item.revision + 1 } : item,
      ),
    },
  };
}

export const discoveryFingerprint = (state: MailState, detail: MailMessageDetail) =>
  hash([
    sourceId(state, detail),
    detail.text.slice(0, 24000),
    peopleData(state)
      .people.filter((person) => person.state === "confirmed")
      .map((person) => [person.id, person.revision]),
  ]);

/** Replays retain user corrections and dismissals, even when the model rephrases a suggestion. */
export function applyDiscovery(
  state: MailState,
  detail: MailMessageDetail,
  output: unknown,
  fingerprint: string,
): MailState {
  const result = decodeDiscovery(output);
  const data = peopleData(state);
  const ids = new Set(
    data.people.filter((person) => person.state === "confirmed").map((person) => person.id),
  );
  const id = sourceId(state, detail);
  const text = detail.text.slice(0, 24000);
  const valid = (excerpt: string) => excerpt.trim().length > 0 && text.indexOf(excerpt) >= 0;
  const work = [...data.work];
  const connections = [...data.connections];
  for (const item of result.work) {
    if (!ids.has(item.personId) || !valid(item.excerpt)) continue;
    // One proposal of each kind per participant and source keeps rescans from multiplying work.
    const key = hash([id, item.personId, item.kind]);
    if (work.some((entry) => entry.id === key) || work.length >= 2000) continue;
    work.push({
      id: key,
      personId: item.personId,
      title: item.title,
      kind: item.kind,
      state: "suggested",
      dueDate: null,
      evidence: evidence(detail, item.excerpt),
      revision: 0,
      origin: "luna",
    });
  }
  for (const item of result.connections) {
    if (
      !ids.has(item.fromPersonId) ||
      !ids.has(item.toPersonId) ||
      item.fromPersonId === item.toPersonId ||
      !valid(item.excerpt)
    )
      continue;
    const key = hash([id, item.fromPersonId, item.toPersonId, item.type]);
    if (connections.some((entry) => entry.id === key) || connections.length >= 2000) continue;
    connections.push({
      id: key,
      fromPersonId: item.fromPersonId,
      toPersonId: item.toPersonId,
      type: item.type,
      state: "suggested",
      evidence: evidence(detail, item.excerpt),
      revision: 0,
    });
  }
  return {
    ...state,
    peopleContext: { ...data, work, connections, scans: { ...data.scans, [id]: fingerprint } },
  };
}
