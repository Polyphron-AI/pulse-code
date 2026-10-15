import { describe, expect, it } from "vite-plus/test";
import { parseWorkspaceSearch } from "./_chat.workspace";

describe("parseWorkspaceSearch", () => {
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
