import { describe, expect, it } from "vite-plus/test";
import type { MailMessageDetail, MailWorkSaveInput } from "@t3tools/contracts";
import { emptyMailState } from "./MailStore.ts";
import {
  applyDiscovery,
  discoveryFingerprint,
  getPeopleContext,
  observePeople,
  peopleData,
  relocatePeople,
  reviewPerson,
  savePeopleWork,
} from "./MailPeople.ts";

const detail: MailMessageDetail = {
  message: {
    id: "message",
    messageId: null,
    ref: { accountId: "account", folder: "INBOX", uidValidity: "1", uid: 1 },
    from: "Alex <alex@example.test>",
    to: ["Sam <sam@example.test>"],
    cc: [],
    subject: "Proposal review",
    date: "2026-09-06T12:00:00Z",
    flags: [],
    size: 100,
    metadata: { revision: 0, tags: [], links: [], suppressedLinks: [] },
  },
  text: "Sam, please review the proposal. Alex introduced Sam.",
  html: null,
  replyTo: [],
  attachments: [],
};
function fixture() {
  let state = observePeople(emptyMailState(), detail);
  for (const person of peopleData(state).people)
    state = reviewPerson(state, {
      id: person.id,
      revision: person.revision,
      name: person.name,
      state: "confirmed",
    });
  return state;
}
describe("mail people and work", () => {
  it("creates candidates, preserves corrected identities and keeps bodies out of observations", () => {
    const observed = observePeople(emptyMailState(), detail);
    expect(peopleData(observed).people.every((person) => person.state === "candidate")).toBe(true);
    expect(JSON.stringify(observed)).not.toContain(detail.text);
    const person = peopleData(observed).people[0]!;
    const corrected = reviewPerson(observed, {
      id: person.id,
      revision: 0,
      name: "Alex Jones",
      state: "confirmed",
    });
    const rescanned = observePeople(corrected, {
      ...detail,
      message: { ...detail.message, from: "Wrong Name <alex@example.test>" },
    });
    expect(peopleData(rescanned).people[0]).toMatchObject({
      id: person.id,
      name: "Alex Jones",
      state: "confirmed",
    });
    expect(() =>
      reviewPerson(rescanned, { id: person.id, revision: 0, name: "Stale", state: "dismissed" }),
    ).toThrow();
  });
  it("requires confirmed identity and supports feedback completion, reopening and stale-write rejection", () => {
    const observed = observePeople(emptyMailState(), detail);
    const person = peopleData(observed).people[0]!;
    const input: MailWorkSaveInput = {
      personId: person.id,
      revision: 0,
      title: "Review proposal",
      kind: "feedback",
      state: "waiting",
      dueDate: "2026-09-10",
      ref: detail.message.ref,
    };
    expect(() => savePeopleWork(observed, input, detail)).toThrow();
    const confirmed = reviewPerson(observed, {
      id: person.id,
      revision: 0,
      name: person.name,
      state: "confirmed",
    });
    const saved = savePeopleWork(confirmed, input, detail);
    const done = savePeopleWork(saved.state, {
      ...input,
      id: saved.result.id,
      revision: 1,
      state: "done",
    });
    expect(done.result.state).toBe("done");
    expect(() =>
      savePeopleWork(done.state, { ...input, id: saved.result.id, revision: 1 }),
    ).toThrow();
    const reopened = savePeopleWork(done.state, { ...input, id: saved.result.id, revision: 2 });
    expect(reopened.result).toMatchObject({ state: "waiting", revision: 3 });
    expect(() => savePeopleWork(confirmed, { ...input, dueDate: "2026-02-31" }, detail)).toThrow();
  });
  it("rejects invented endpoints and excerpts; rescans preserve dismissals even if the title changes", () => {
    let state = fixture();
    const [alex, sam] = peopleData(state).people;
    const output = {
      work: [
        {
          personId: sam!.id,
          title: "Review proposal",
          kind: "feedback",
          excerpt: "Sam, please review the proposal.",
        },
        { personId: "invented", title: "Ghost", kind: "task", excerpt: "Sam" },
        { personId: alex!.id, title: "Made up", kind: "task", excerpt: "Never said this" },
      ],
      connections: [
        {
          fromPersonId: alex!.id,
          toPersonId: sam!.id,
          type: "introduced",
          excerpt: "Alex introduced Sam.",
        },
      ],
    };
    state = applyDiscovery(state, detail, output, discoveryFingerprint(state, detail));
    expect(peopleData(state).work).toHaveLength(1);
    expect(peopleData(state).connections).toHaveLength(1);
    const item = peopleData(state).work[0]!;
    state = savePeopleWork(state, {
      id: item.id,
      personId: item.personId,
      revision: item.revision,
      title: "My correction",
      kind: item.kind,
      state: "dismissed",
      dueDate: null,
      ref: item.evidence.ref,
    }).state;
    state = applyDiscovery(
      state,
      detail,
      { ...output, work: [{ ...output.work[0], title: "Please check proposal" }] },
      "new-model",
    );
    expect(peopleData(state).work).toHaveLength(1);
    expect(peopleData(state).work[0]).toMatchObject({ title: "My correction", state: "dismissed" });
  });
  it("keeps account history separate and carries evidence through verified moves", () => {
    let state = fixture();
    const personId = peopleData(state).people[0]!.id;
    const saved = savePeopleWork(
      state,
      {
        personId,
        title: "Prior task",
        revision: 0,
        kind: "task",
        state: "open",
        dueDate: null,
        ref: detail.message.ref,
      },
      detail,
    );
    state = observePeople(saved.state, {
      ...detail,
      message: {
        ...detail.message,
        id: "other-message",
        ref: { ...detail.message.ref, accountId: "other" },
      },
    });
    expect(getPeopleContext(state, { accountId: "other" }, false).work).toHaveLength(0);
    const to = { ...detail.message.ref, folder: "Archive", uid: 8 };
    state = relocatePeople(state, detail.message.ref, to);
    expect(
      getPeopleContext(state, { accountId: "account", ref: to }, false).work[0]?.evidence.ref,
    ).toEqual(to);
  });
});
