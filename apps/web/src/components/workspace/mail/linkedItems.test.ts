import { ProjectId, type WorkspaceLinkView } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  canOpenLinkedItem,
  endpointTitle,
  linkedItemLabel,
  originText,
  pickedProject,
  projectItemRef,
  projectMenuItems,
} from "./linkedItems";

const ONE = ProjectId.make("project-1");
const TWO = ProjectId.make("project-2");
const MESSAGE = { type: "mail", accountId: "acct_1", messageId: "<a@b>" } as const;

const view = (item: WorkspaceLinkView["item"]): WorkspaceLinkView => ({
  id: "wl_00000000-0000-4000-8000-000000000001",
  item,
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-14T12:00:00.000Z",
});

describe("originText", () => {
  it("says when the link was made and what was open", () => {
    expect(
      originText(
        {
          confirmedAt: "2026-10-14T12:00:00.000Z",
          viewing: { ref: MESSAGE, title: "Re: Q3 brief" },
        },
        "en-GB",
      ),
    ).toBe("You linked this on 14 Oct while viewing 'Re: Q3 brief'");
    expect(originText({ confirmedAt: "2026-10-14T12:00:00.000Z" }, "en-GB")).toBe(
      "You linked this on 14 Oct",
    );
    expect(originText(undefined, "en-GB")).toBeUndefined();
  });
});

describe("linkedItemLabel", () => {
  const project = view({ ref: projectItemRef(ONE), title: "Old name" });

  it("shows a project's current name", () => {
    expect(linkedItemLabel(project, new Map([[ONE, "Q3 launch"]]))).toEqual({
      title: "Q3 launch",
    });
  });

  it("says a removed project is unavailable, but only once projects have loaded", () => {
    expect(linkedItemLabel(project, new Map([[TWO, "Hiring"]]))).toEqual({
      title: "Old name",
      unavailable: "Unavailable: this project was removed.",
    });
    expect(linkedItemLabel(project, null)).toEqual({ title: "Old name" });
  });

  it("never shows an empty title", () => {
    expect(linkedItemLabel(view({ ref: MESSAGE }), null)).toEqual({
      title: "Message with no subject",
    });
  });
});

describe("canOpenLinkedItem", () => {
  it("opens what Wave 1 can show and nothing else", () => {
    expect(canOpenLinkedItem(MESSAGE)).toBe(true);
    expect(canOpenLinkedItem(projectItemRef(ONE))).toBe(true);
    expect(canOpenLinkedItem({ type: "url", url: "https://a.test/brief" })).toBe(true);
    expect(canOpenLinkedItem({ type: "task", taskId: "task-1" })).toBe(false);
  });
});

describe("projectMenuItems", () => {
  const projects = [
    { id: ONE, title: "Q3 launch" },
    { id: TWO, title: "Hiring" },
  ];

  it("marks linked projects and finds the one picked", () => {
    const items = projectMenuItems(projects, new Set([ONE]));
    expect(items).toEqual([
      { id: "project:project-1", label: "Q3 launch", checked: true, disabled: true },
      { id: "project:project-2", label: "Hiring" },
    ]);
    expect(pickedProject(projects, items[1]?.id ?? null)).toBe(projects[1]);
    expect(pickedProject(projects, null)).toBeUndefined();
    expect(pickedProject(projects, "open")).toBeUndefined();
  });

  it("says so when there is no project to link to", () => {
    expect(projectMenuItems([], new Set())).toEqual([
      { id: "no-projects", label: "No projects yet", disabled: true },
    ]);
  });
});

describe("endpointTitle", () => {
  it("does not split a surrogate pair at the title boundary", () => {
    expect(endpointTitle("x".repeat(298) + "\u{1F600}tail")).toBe("x".repeat(298) + "\u2026");
    expect(endpointTitle("x".repeat(297) + "\u{1F600}tail")).toBe(
      "x".repeat(297) + "\u{1F600}\u2026",
    );
  });
  it("fits a long subject into a link title", () => {
    const title = endpointTitle("x".repeat(500));
    expect(title).toHaveLength(300);
    expect(title.endsWith("…")).toBe(true);
    expect(endpointTitle("Q3 brief")).toBe("Q3 brief");
  });
});
