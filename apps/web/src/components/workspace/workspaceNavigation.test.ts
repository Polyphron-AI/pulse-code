import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  parseWorkspaceSearch,
  codeReturnHref,
  rememberCodeLocation,
  getLastCodeEnvironmentId,
  rememberWorkspaceLocation,
  workspaceReturnSearch,
  workspaceDestinationSearch,
  workspaceDestinations,
  workspaceViews,
} from "./workspaceNavigation";

describe("workspace navigation", () => {
  it("orders the six canonical destinations and uses their first view", () => {
    expect(workspaceDestinations.map(({ id }) => id)).toEqual([
      "communications",
      "meetings",
      "calendar",
      "mail",
      "tasks",
      "projects",
    ]);
    for (const { id } of workspaceDestinations) {
      expect(workspaceDestinationSearch(id, EnvironmentId.make("remote-a"))).toEqual({
        space: id,
        view: workspaceViews[id][0],
        environment: "remote-a",
      });
    }
  });

  it("remembers Code by environment without substituting another environment's thread", () => {
    const a = EnvironmentId.make("return-a");
    const b = EnvironmentId.make("return-b");
    rememberCodeLocation(a, "/return-a/thread-a?diff=1#change");
    rememberCodeLocation(b, "/return-b/thread-b");
    expect(codeReturnHref(a)).toBe("/return-a/thread-a?diff=1#change");
    expect(codeReturnHref(b)).toBe("/return-b/thread-b");
    expect(codeReturnHref(EnvironmentId.make("unvisited"))).toBe("/");
  });

  it("never stores Settings, Workspace, external or malformed hrefs as Code", () => {
    const environment = EnvironmentId.make("invalid-return");
    for (const href of [
      "/settings",
      "/settings/email",
      "/workspace?space=projects",
      "https://elsewhere.invalid/thread",
      "//elsewhere.invalid/thread",
      "http://[",
      "/unknown",
      "/other/thread",
      "/pair",
      "/usage",
    ]) {
      expect(() => rememberCodeLocation(environment, href)).not.toThrow();
      expect(codeReturnHref(environment)).toBe("/");
    }
  });

  it("retains deleted thread routes for the router's unavailable handling", () => {
    const environment = EnvironmentId.make("deleted");
    rememberCodeLocation(environment, "/deleted/missing-thread");
    rememberCodeLocation(environment, "/workspace?space=projects");
    expect(codeReturnHref(environment)).toBe("/deleted/missing-thread");
  });
});

it("changes the last Code environment only after storing a valid Code location", () => {
  const a = EnvironmentId.make("last-code-a");
  const b = EnvironmentId.make("last-code-b");
  rememberCodeLocation(a, "/last-code-a/thread");
  rememberCodeLocation(b, "/settings/email");
  expect(getLastCodeEnvironmentId()).toBe(a);
  rememberCodeLocation(b, "/pull-requests?state=open#review");
  expect(getLastCodeEnvironmentId()).toBe(b);
  expect(codeReturnHref(b)).toBe("/pull-requests?state=open#review");
  expect(codeReturnHref(a)).toBe("/last-code-a/thread");
});

it("shares normalized Workspace returns by environment and defaults to Projects", () => {
  const a = EnvironmentId.make("workspace-return-a");
  const b = EnvironmentId.make("workspace-return-b");
  rememberWorkspaceLocation(a, {
    space: "office",
    officeView: "communications",
    communicationProvider: "telegram",
    account: "bot-1",
    item: "bot-1/-42/2",
    environment: "stale-environment",
  });
  rememberWorkspaceLocation(b, { space: "mail", view: "later", account: "acct", folder: "Sent" });
  expect(workspaceReturnSearch(a)).toEqual({
    space: "communications",
    communicationProvider: "telegram",
    account: "bot-1",
    item: "bot-1/-42/2",
    environment: "workspace-return-a",
  });
  expect(workspaceReturnSearch(b)).toEqual({
    space: "mail",
    view: "later",
    account: "acct",
    folder: "Sent",
    environment: "workspace-return-b",
  });
  expect(workspaceReturnSearch(EnvironmentId.make("workspace-unvisited"))).toEqual({
    space: "projects",
    view: "projects",
    environment: "workspace-unvisited",
  });
  expect(workspaceReturnSearch()).toEqual({ space: "projects", view: "projects" });
});

it("does not replace a canonical Workspace return with legacy Office or invalid search", () => {
  const environment = EnvironmentId.make("workspace-no-office");
  rememberWorkspaceLocation(environment, { space: "tasks", view: "open" });
  rememberWorkspaceLocation(environment, { space: "office" });
  rememberWorkspaceLocation(environment, {});
  expect(workspaceReturnSearch(environment)).toEqual({
    space: "tasks",
    view: "open",
    environment: "workspace-no-office",
  });
  const unvisited = EnvironmentId.make("workspace-office-only");
  rememberWorkspaceLocation(unvisited, { space: "office" });
  expect(workspaceReturnSearch(unvisited)).toEqual({
    space: "projects",
    view: "projects",
    environment: "workspace-office-only",
  });
});

it("retains valid task scope and drops unknown filters", () => {
  expect(
    parseWorkspaceSearch({
      space: "tasks",
      environment: "remote",
      project: "p",
      view: "open",
      taskLayout: "list",
      taskText: "launch",
      taskOwner: "unassigned",
      taskDueFrom: "2026-10-13",
      taskDueTo: "2026-10-16",
      item: "task-ref",
    }),
  ).toEqual({
    space: "tasks",
    environment: "remote",
    project: "p",
    view: "open",
    taskLayout: "list",
    taskText: "launch",
    taskOwner: "unassigned",
    taskDueFrom: "2026-10-13",
    taskDueTo: "2026-10-16",
    item: "task-ref",
  });
  expect(
    parseWorkspaceSearch({
      space: "tasks",
      view: "bad",
      taskOwner: "Maya",
      taskText: "x".repeat(241),
      taskDueFrom: "2026-02-30",
    }),
  ).toEqual({ space: "tasks" });
  expect(
    parseWorkspaceSearch({ space: "tasks", taskDueFrom: "2026-10-18", taskDueTo: "2026-10-17" }),
  ).toEqual({ space: "tasks" });
  expect(
    parseWorkspaceSearch({
      space: "mail",
      taskLayout: "board",
      taskText: "launch",
      taskOwner: "all",
    }),
  ).toEqual({ space: "mail" });
});

it("bounds page size in Tasks URLs and strips it outside Tasks", () => {
  for (const value of [1, 100, "25"])
    expect(parseWorkspaceSearch({ space: "tasks", taskLimit: value }).taskLimit).toBe(
      Number(value),
    );
  for (const value of [0, 101, -1, 1.5, "1e2", "01.5", "NaN", null])
    expect(parseWorkspaceSearch({ space: "tasks", taskLimit: value })).not.toHaveProperty(
      "taskLimit",
    );
  expect(parseWorkspaceSearch({ space: "tasks", taskLimit: 50 })).not.toHaveProperty("taskLimit");
  expect(parseWorkspaceSearch({ space: "projects", taskLimit: 25 })).not.toHaveProperty(
    "taskLimit",
  );
});
