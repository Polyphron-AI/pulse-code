import { describe, expect, it } from "vite-plus/test";
import { parseWorkspaceSearch } from "./_chat.workspace";

describe("parseWorkspaceSearch", () => {
  it("preserves the environment and exact Telegram source when opening a remote linked message", () => {
    const search = {
      space: "office",
      officeView: "communications",
      communicationProvider: "telegram",
      environment: "remote-env",
      account: "telegram_1000",
      item: "telegram_1000/-42/2",
    };
    expect(parseWorkspaceSearch(search)).toEqual({
      space: "communications",
      communicationProvider: "telegram",
      environment: "remote-env",
      account: "telegram_1000",
      item: "telegram_1000/-42/2",
    });
    expect(parseWorkspaceSearch({ ...search, space: "mail" })).not.toHaveProperty(
      "communicationProvider",
    );
  });
  it("opens a project hub", () =>
    expect(parseWorkspaceSearch({ space: "projects", project: "project-1" })).toEqual({
      space: "projects",
      project: "project-1",
    }));
  it("opens the Office communications view", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "communications" })).toEqual({
      space: "communications",
    });
  });

  it("keeps a canonical destination's environment and valid view", () => {
    expect(
      parseWorkspaceSearch({
        space: "tasks",
        view: "open",
        environment: "remote-a",
        project: "project-a",
      }),
    ).toEqual({ space: "tasks", view: "open", environment: "remote-a", project: "project-a" });
    expect(
      parseWorkspaceSearch({ space: "calendar", view: "open", environment: "remote-a" }),
    ).toEqual({ space: "calendar", environment: "remote-a" });
  });

  it.each([
    ["communications", ["chats", "unread", "later"]],
    ["meetings", ["upcoming", "recordings"]],
    ["calendar", ["agenda", "week"]],
    ["mail", ["inbox", "unread", "later"]],
    ["tasks", ["all", "open", "done"]],
    ["projects", ["projects", "linked"]],
  ])("accepts only %s's views", (space, views) => {
    for (const view of views)
      expect(parseWorkspaceSearch({ space, view })).toEqual({ space, view });
    for (const view of ["unknown", "", 7, null, "x".repeat(1025)])
      expect(parseWorkspaceSearch({ space, view })).toEqual({ space });
  });

  it("strips fixture, resource and alternative view selectors", () => {
    expect(
      parseWorkspaceSearch({
        space: "mail",
        view: "inbox",
        fixture: "01",
        workspaceMockup: "01",
        resourceProject: "other",
        resourceTab: "files",
        selectedKey: "mail-1",
        taskView: "open",
        calendarView: "week",
      }),
    ).toEqual({ space: "mail", view: "inbox" });
    for (const space of ["", undefined, 7, "unknown", "constructor", "__proto__"])
      expect(parseWorkspaceSearch({ space, environment: "a", view: "open" })).toEqual({});
  });

  it("preserves bounded mail and Telegram identities without interpreting their contents", () => {
    expect(
      parseWorkspaceSearch({ space: "mail", item: "x".repeat(8192), account: "a".repeat(1024) }),
    ).toEqual({ space: "mail", item: "x".repeat(8192), account: "a".repeat(1024) });
    expect(
      parseWorkspaceSearch({
        space: "mail",
        item: "x".repeat(8193),
        account: false,
        folder: [],
        environment: "x".repeat(1025),
      }),
    ).toEqual({ space: "mail" });
    expect(
      parseWorkspaceSearch({
        space: "communications",
        communicationProvider: "telegram",
        environment: "remote-a",
        account: "bot-1",
        item: "bot-1/-42/2",
      }),
    ).toEqual({
      space: "communications",
      communicationProvider: "telegram",
      environment: "remote-a",
      account: "bot-1",
      item: "bot-1/-42/2",
    });
  });

  it("drops unsupported views and communications outside Office", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "unknown" })).toEqual({
      space: "office",
    });
    expect(parseWorkspaceSearch({ space: "code", officeView: "communications" })).toEqual({});
    expect(parseWorkspaceSearch({ officeView: "communications" })).toEqual({});
  });
  it("opens Mail with its account, folder and project", () => {
    expect(
      parseWorkspaceSearch({
        space: "mail",
        account: "acct_1",
        folder: "[Gmail]/All Mail",
        project: "project-1",
      }),
    ).toEqual({
      space: "mail",
      account: "acct_1",
      folder: "[Gmail]/All Mail",
      project: "project-1",
    });
  });

  it("drops Mail params outside Mail and values that are not text", () => {
    expect(parseWorkspaceSearch({ space: "office", account: "acct_1", folder: "INBOX" })).toEqual({
      space: "office",
    });
    expect(
      parseWorkspaceSearch({ space: "mail", account: 7, folder: "", project: "x".repeat(1_025) }),
    ).toEqual({ space: "mail" });
    expect(parseWorkspaceSearch({ space: "mail", officeView: "communications" })).toEqual({
      space: "mail",
    });
  });
});
