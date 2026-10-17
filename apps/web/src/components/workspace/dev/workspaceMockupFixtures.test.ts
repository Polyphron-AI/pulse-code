import { Schema } from "effect";
import { WorkspaceLinkEndpoint, WorkspaceLinkId, WorkspaceLinkOrigin } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseWorkspaceSearch } from "../workspaceNavigation";
import {
  createWorkspaceMockupSeed,
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
  workspaceMockupRecipes,
} from "./workspaceMockupFixtures";

const isLinkId = Schema.is(WorkspaceLinkId);
const isEndpoint = Schema.is(WorkspaceLinkEndpoint);
const isOrigin = Schema.is(WorkspaceLinkOrigin);

it("admits the external Browser state only for the dev Browser recipe", () => {
  const url = (id: string, state = "external") =>
    new URL(`http://fixture.invalid/workspace?fixture=${id}&state=${state}`);
  expect(parseWorkspaceMockupRequest(url("05"), true)).toBe("05");
  expect(parseWorkspaceMockupRequest(url("05"), false)).toBeNull();
  expect(() => parseWorkspaceMockupRequest(url("01"), true)).toThrow("Unknown fixture state.");
  expect(() => parseWorkspaceMockupRequest(url("05", "unknown"), true)).toThrow();
});

it("resets memory and keeps Tuesday fixed after host time advances", async () => {
  vi.useFakeTimers();
  try {
    const first = createWorkspaceMockupSession("08");
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(first.clock.now().toISOString()).toBe("2026-10-13T08:30:00.000Z");
    expect(first.clock.today()).toBe("2026-10-13");
    expect(first.seed.tasks.filter((task) => !task.completed)).toHaveLength(4);
    first.storage.setItem("width", "300");
    await first.record("send", undefined, "sample reply");
    await first.settled();
    expect(first.operations).toEqual([{ kind: "send", item: null, value: "sample reply" }]);
    first.dispose();
    expect(first.storage.getItem("width")).toBeNull();
    await expect(first.record("save")).rejects.toThrow("Fixture session is disposed.");
    expect(() => first.storage.setItem("width", "500")).toThrow("Fixture session is disposed.");
    const next = createWorkspaceMockupSession("08");
    expect(next.operations).toHaveLength(0);
    expect(next.storage.getItem("width")).toBeNull();
    expect(next.seed).not.toBe(first.seed);
    expect(next.clock.now()).not.toBe(next.clock.now());
    next.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it("supplies independent typed records and the exact shared identities", () => {
  const seed = createWorkspaceMockupSeed();
  const next = createWorkspaceMockupSeed();
  expect(seed).toEqual(next);
  expect(seed.people).not.toBe(next.people);
  expect(seed.tasks[0]).not.toBe(next.tasks[0]);
  expect(seed.projects.map((project) => project.id)).toEqual([
    "fixture-synkek",
    "fixture-pulse-website",
    "fixture-brand-studio",
  ]);
  expect(seed.mail).toHaveLength(5);
  seed.mail.forEach((mail, index) => {
    expect(mail.messageId).toBe(`<fixture-${index + 1}@synkek.invalid>`);
    expect(mail.uid).toBe(index + 1);
    expect(mail.uidValidity).toBe(1);
    expect(mail.accountId).toBe("fixture-mail-maya");
  });
  expect(seed.mail[0]).toMatchObject({
    fromName: "Nina Patel",
    fromAddress: "nina@synkek.com",
    to: ["Maya", "Leo", "me"],
    displayTime: "10:24 AM",
    listDisplayTime: "10:24",
  });
  expect(seed.mail[0]?.body).toContain("Thanks,\nNina");
  expect(seed.drive.folders).toHaveLength(4);
  expect(seed.drive.documents).toHaveLength(4);
  expect(seed.channels.find((channel) => channel.id === "slack-marketing")).toMatchObject({
    knownUnread: 3,
    readMarkerMessageId: "message-1",
    memberCount: 8,
    memberCountComplete: true,
  });
  expect(seed.messages).toHaveLength(6);
  expect(
    seed.tasks.map((task) => [task.areaLabel, task.dueOn, task.owner, task.assigneeDisplayId]),
  ).toEqual([
    ["Marketing", "2026-10-13", "environment-owner", "maya"],
    ["Website", "2026-10-16", null, "leo"],
    ["Marketing", "2026-10-16", null, "nina"],
    ["Website", "2026-10-16", null, "alex"],
    ["Marketing", "2026-10-16", "environment-owner", "maya"],
  ]);
  expect(seed.events.map((event) => event.start)).toEqual([
    "2026-10-13T09:00:00+02:00",
    "2026-10-13T14:00:00+02:00",
    "2026-10-13T16:30:00+02:00",
  ]);
  for (const day of [
    ...seed.tasks.flatMap((task) => (task.dueOn ? [task.dueOn] : [])),
    ...seed.drive.folders.map((folder) => folder.modified),
    ...seed.drive.documents.map((doc) => doc.modified),
  ]) {
    expect(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(day);
  }
  expect(seed.sampleCopy.tasksFooter).toBe(
    "Shared statuses · One accountable owner · Project followers",
  );
  expect(seed.sampleCopy.browserFooter).toBe("synkek.com · Website preview");
  expect(seed.browser.body).toBe(
    "Meet the new collection. Thoughtful products, made for everyday life.",
  );
  for (const link of seed.links) {
    expect(isLinkId(link.id)).toBe(true);
    expect(isEndpoint(link.a)).toBe(true);
    expect(isEndpoint(link.b)).toBe(true);
    expect(isOrigin(link.origin)).toBe(true);
    expect(link.origin.viewing).toEqual(link.a);
  }
  const mailLinks = seed.links.filter((link) => link.a.ref.type === "mail");
  expect(mailLinks.map((link) => link.b.ref)).toEqual([
    { type: "project", projectId: "fixture-synkek" },
    { type: "file", provider: "google-drive", fileId: "folder-marketing" },
  ]);
  expect(mailLinks[0]?.a.ref).toMatchObject({
    messageId: seed.mail[0]?.messageId,
    location: { uid: 1, uidValidity: 1, mailbox: "INBOX" },
  });
  expect(
    seed.links.some(
      (link) =>
        link.a.ref.type === "project" &&
        link.b.ref.type === "file" &&
        link.b.ref.fileId === "folder-marketing" &&
        link.status === "confirmed",
    ),
  ).toBe(true);
  expect(
    seed.links.some(
      (link) =>
        link.a.ref.type === "provider-resource" &&
        link.a.ref.provider === "workspace-calendar" &&
        link.a.ref.resourceId === "event-review" &&
        link.b.ref.type === "provider-resource" &&
        link.b.ref.resourceId === seed.note.id,
    ),
  ).toBe(true);
  expect(seed.links.filter((link) => link.status !== "confirmed")).toHaveLength(2);
});

describe("capture recipes", () => {
  it.each([
    ["01", "mail", "inbox", "mail-1", "files", "mail", "drive"],
    ["02", "communications", "chats", "slack-marketing", "files", "communications", "drive"],
    ["03", "tasks", "all", null, "files", "tasks", "drive"],
    ["04", "projects", "projects", "fixture-synkek", "files", "projects", "drive"],
    ["05", "communications", "chats", "slack-marketing", "browser", "communications", "browser"],
    ["06", "communications", "chats", "slack-marketing", "agents", "communications", "agents"],
    ["07", "meetings", "upcoming", "event-review", "docs", "calendar", "notes"],
    ["08", "calendar", "agenda", null, "tasks", "calendar", "tasks"],
  ] as const)(
    "selects recipe %s",
    (id, space, view, selectedKey, resourceTab, centerArea, resourceArea) => {
      const recipe = workspaceMockupRecipes[id];
      expect(recipe).toMatchObject({
        space,
        view,
        selectedKey,
        resourceTab,
        centerArea,
        resourceArea,
        requiredAreas: [centerArea, resourceArea],
      });
      expect(recipe.route).toBe(`/workspace?space=${space}&fixture=${id}`);
      expect(
        parseWorkspaceMockupRequest(new URL(recipe.route, "http://fixture.invalid"), true),
      ).toBe(id);
      expect(
        parseWorkspaceMockupRequest(
          new URL(`/workspace?fixture=${id}`, "http://fixture.invalid"),
          true,
        ),
      ).toBe(id);
      if (["02", "05", "06"].includes(id)) expect(recipe.corrections).toContain("D03-tab");
    },
  );
});

it("rejects production selectors, ambiguous requests and every external state path", () => {
  const url = (query: string, path = "/workspace") =>
    new URL(`${path}${query}`, "http://fixture.invalid");
  expect(parseWorkspaceMockupRequest(url("?fixture=01&homeDir=/live"), false)).toBeNull();
  expect(parseWorkspaceMockupRequest(url("?space=mail"), true)).toBeNull();
  for (const query of ["?fixture=", "?fixture=99", "?fixture=../01", "?fixture=01#hash"]) {
    expect(() => parseWorkspaceMockupRequest(url(query), true)).toThrow("Unknown fixture.");
  }
  expect(() => parseWorkspaceMockupRequest(url("?fixture=01", "/other"), true)).toThrow(
    "Unknown fixture.",
  );
  for (const query of [
    "homeDir=C:/Users/qblaa/.t3/userdata",
    "path=../state.sqlite",
    "environment=x",
    "view=inbox",
    "fixture=01",
    "space=mail&space=mail",
  ]) {
    expect(() => parseWorkspaceMockupRequest(url(`?fixture=01&${query}`), true)).toThrow(
      "Fixture state is in memory only.",
    );
  }
  expect(() => parseWorkspaceMockupRequest(url("?fixture=01&space=tasks"), true)).toThrow(
    "Fixture space does not match recipe 01.",
  );
  expect(parseWorkspaceSearch({ space: "mail", fixture: "01", homeDir: "/live" })).toEqual({
    space: "mail",
  });
});

it.each(["01", "02", "03", "04", "05", "06"])(
  "rejects calendar handoff states for recipe %s",
  (id) => {
    for (const state of ["no-url", "desktop-reject"]) {
      expect(() =>
        parseWorkspaceMockupRequest(
          new URL(`https://fixture.invalid/workspace?fixture=${id}&state=${state}`),
          true,
        ),
      ).toThrow("Unknown fixture state.");
    }
  },
);
