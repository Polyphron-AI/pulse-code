import { describe, expect, it } from "vite-plus/test";
import { parseWorkspaceSearch } from "./_chat.workspace";

describe("parseWorkspaceSearch", () => {
  it("requires explicit development preview selection inside Office", () => {
    expect(parseWorkspaceSearch({ space: "office", demo: "other" })).toEqual({ space: "office" });
    expect(parseWorkspaceSearch({ demo: "synkek" })).toEqual({});
    expect(parseWorkspaceSearch({ space: "office", demo: "synkek" })).toEqual({
      space: "office",
      ...(import.meta.env.DEV ? { demo: "synkek" } : {}),
    });
  });
  it("retains bounded task source and meeting note destinations", () => {
    const search = {
      space: "office",
      officeView: "meetings",
      notes: "1",
      sourceAccount: "google",
      sourceMessage: "event",
      sourceEnvironment: "local",
    };
    expect(parseWorkspaceSearch(search)).toEqual(search);
    expect(
      parseWorkspaceSearch({
        space: "office",
        sourceAccount: [],
        sourceMessage: "x".repeat(1025),
        sourceThread: "",
        notes: "0",
      }),
    ).toEqual({ space: "office" });
    for (const officeView of ["tasks", "calendar", "email"]) {
      expect(parseWorkspaceSearch({ space: "office", officeView })).toEqual({
        space: "office",
        officeView,
      });
    }
  });
  it("opens project management inside Office", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "projects" })).toEqual({
      space: "office",
      officeView: "projects",
    });
    expect(parseWorkspaceSearch({ officeView: "projects" })).toEqual({});
  });
  it("opens the Office communications view", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "communications" })).toEqual({
      space: "office",
      officeView: "communications",
    });
  });

  it("drops unsupported views and communications outside Office", () => {
    expect(parseWorkspaceSearch({ space: "office", officeView: "unknown" })).toEqual({
      space: "office",
    });
    expect(parseWorkspaceSearch({ space: "code", officeView: "communications" })).toEqual({});
    expect(parseWorkspaceSearch({ officeView: "communications" })).toEqual({});
  });
});
