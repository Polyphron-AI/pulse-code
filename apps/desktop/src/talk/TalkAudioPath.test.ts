import { expect, it } from "vite-plus/test";
import { recordingAudioPath } from "./TalkAudioPath.ts";

it("accepts native canonical Windows WAV paths while rejecting escapes", () => {
  const root = String.raw`C:\Users\Test\Pulse\talk`;
  const file = `${root}\\recordings\\meeting.wav`;
  expect(recordingAudioPath(root, file, "win32")).toBe(file);
  expect(recordingAudioPath(root, `\\\\?\\${file}`, "win32")).toBe(file);
  expect(recordingAudioPath(`\\\\?\\${root}`, file, "win32")).toBe(file);
  for (const outside of [
    String.raw`C:\Users\Test\Pulse\talk-other\meeting.wav`,
    String.raw`D:\meeting.wav`,
    `${root}\\..\\private.wav`,
    `${root}\\recording.exe`,
  ])
    expect(() => recordingAudioPath(root, outside, "win32")).toThrow("outside Talk storage");
  const unc = String.raw`\\server\share\talk`;
  expect(
    recordingAudioPath(unc, String.raw`\\?\UNC\server\share\talk\recording.wav`, "win32"),
  ).toBe(`${unc}\\recording.wav`);
});
