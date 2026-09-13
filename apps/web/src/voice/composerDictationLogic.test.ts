import { describe, expect, it } from "vite-plus/test";

import { appendDictationTranscript, dictationFileName } from "./composerDictationLogic";

describe("composer dictation text insertion", () => {
  it("appends to edits made while transcription was pending", () => {
    expect(appendDictationTranscript("Keep this new edit", " dictated words ")).toBe(
      "Keep this new edit dictated words",
    );
  });

  it("does not alter the draft for an empty transcript", () => {
    expect(appendDictationTranscript("existing", "  ")).toBe("existing");
  });

  it("does not add another separator after whitespace", () => {
    expect(appendDictationTranscript("existing\n", "next")).toBe("existing\nnext");
  });
});

describe("dictation upload filename", () => {
  it("matches the captured media container", () => {
    expect(dictationFileName(new Blob([], { type: "audio/mp4" }))).toBe("dictation.mp4");
    expect(dictationFileName(new Blob([], { type: "audio/ogg;codecs=opus" }))).toBe(
      "dictation.ogg",
    );
    expect(dictationFileName(new Blob([], { type: "audio/webm;codecs=opus" }))).toBe(
      "dictation.webm",
    );
  });
});
