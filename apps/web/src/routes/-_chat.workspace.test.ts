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
});
