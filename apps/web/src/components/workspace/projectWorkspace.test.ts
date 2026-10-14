import { describe, expect, it } from "vite-plus/test";
import { driveResourceId, projectFolderPath } from "./projectWorkspace";

describe("name-only project folders", () => {
  it("uses the configured project directory and a unique suffix", () => {
    expect(projectFolderPath("C:\\Projects\\", "SynKEK", "abcdef12-3456-7890")).toBe(
      "C:\\Projects/SynKEK-abcdef12-345",
    );
  });
  it("cannot turn a display name into parent traversal or an absolute path", () => {
    expect(projectFolderPath("", "../../C:\\outside", "123")).toBe(
      "~/Pulse Projects/C-outside-123",
    );
    expect(projectFolderPath("", "...", "123")).toBe("~/Pulse Projects/project-123");
  });
  it("keeps equal names distinct", () => {
    expect(projectFolderPath("", "Marketing", "first")).not.toBe(
      projectFolderPath("", "Marketing", "second"),
    );
  });
});

describe("Drive resource links", () => {
  it.each([
    ["folder-id", "folder-id"],
    ["https://drive.google.com/drive/u/0/folders/folder-id?usp=sharing", "folder-id"],
    ["https://docs.google.com/document/d/doc_123/edit", "doc_123"],
    ["https://drive.google.com/open?id=doc_123", "doc_123"],
  ])("recognizes %s", (input, expected) => expect(driveResourceId(input)).toBe(expected));
  it.each([
    "https://drive.google.com.evil.test/folders/file",
    "http://drive.google.com/folders/file",
    "https://user@drive.google.com/folders/file",
    "https://drive.google.com:444/folders/file",
    "https://drive.google.com/folders/file%20bad",
    "javascript:alert(1)",
    "https://drive.google.com/open?id=invalid/id",
  ])("rejects malformed or unsafe links %s", (input) => expect(driveResourceId(input)).toBeNull());
});
