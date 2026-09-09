// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import {
  findSavedSessionOutput,
  outputAccessError,
  readSessionOutput,
  resolveSessionOutputFile,
  saveSessionOutput,
  sessionOutputLinks,
  sessionOutputPaths,
} from "./sessionOutputStore.ts";

describe("saved session outputs", () => {
  let root: string;
  let cwd: string;
  let storeRoot: string;
  beforeEach(async () => {
    root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-output-"));
    cwd = NodePath.join(root, "work tree");
    storeRoot = NodePath.join(root, "state", "session-outputs");
    await NodeFSP.mkdir(cwd);
  });
  afterEach(async () => {
    await NodeFSP.rm(root, { recursive: true, force: true });
  });
  const save = (sourcePath: string, messageId = "message-1") =>
    saveSessionOutput({
      storeRoot,
      cwd,
      sourcePath,
      messageId,
      threadId: "thread-1",
      turnId: "turn-1",
    });

  it("keeps the delivered version after edits, restart, and deleted worktree", async () => {
    await NodeFSP.writeFile(NodePath.join(cwd, "report.txt"), "first version");
    const first = await save("report.txt");
    await NodeFSP.writeFile(NodePath.join(cwd, "report.txt"), "second version");
    expect((await save("report.txt")).id).toBe(first.id);
    const second = await save("report.txt", "message-2");
    expect(second.id).not.toBe(first.id);
    await NodeFSP.rm(cwd, { recursive: true });
    expect(await readSessionOutput(storeRoot, first.id)).toEqual(first);
    const saved = await resolveSessionOutputFile(storeRoot, first.id, "report.txt");
    expect(await NodeFSP.readFile(saved!.filePath, "utf8")).toBe("first version");
    expect(first.files[0]).toMatchObject({
      bytes: 13,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect((await save("report.txt")).id).toBe(first.id);
  });

  it("preserves HTML and nested CSS/image dependencies, ignoring unrelated files", async () => {
    await NodeFSP.mkdir(NodePath.join(cwd, "assets"));
    await NodeFSP.writeFile(
      NodePath.join(cwd, "report.html"),
      '<link href="assets/style.css"><a href="unrelated.txt">source</a><a href="../index.html">Back</a><a href="/">Home</a>',
    );
    await NodeFSP.writeFile(
      NodePath.join(cwd, "assets", "style.css"),
      'body { background: url("logo.svg") }',
    );
    await NodeFSP.writeFile(NodePath.join(cwd, "assets", "logo.svg"), "<svg/>");
    await NodeFSP.writeFile(NodePath.join(cwd, "unrelated.txt"), "private");
    const result = await save("report.html");
    expect(result.files.map((file) => file.path)).toEqual([
      "report.html",
      "assets/style.css",
      "assets/logo.svg",
    ]);
    await NodeFSP.rm(cwd, { recursive: true });
    expect(await resolveSessionOutputFile(storeRoot, result.id, "assets/style.css")).not.toBeNull();
    expect(await resolveSessionOutputFile(storeRoot, result.id, "unrelated.txt")).toBeNull();
    expect(await resolveSessionOutputFile(storeRoot, result.id, "../metadata.json")).toBeNull();
    const download = await resolveSessionOutputFile(storeRoot, result.id, "report.html.zip", true);
    expect(download?.name).toBe("report.html.zip");
    expect((await NodeFSP.readFile(download!.filePath)).subarray(0, 4).toString("hex")).toBe(
      "504b0304",
    );
  });

  it("rejects escaping report dependencies and does not publish partial snapshots", async () => {
    await NodeFSP.writeFile(NodePath.join(cwd, "report.html"), '<img src="../secret.svg">');
    await NodeFSP.writeFile(NodePath.join(root, "secret.svg"), "secret");
    await expect(save("report.html")).rejects.toMatchObject({ code: "denied" });
    expect(await NodeFSP.readdir(storeRoot)).toEqual([]);
  });

  it("saves explicitly linked outputs outside the workspace and preserves spaces", async () => {
    const outside = NodePath.join(root, "final report.pdf");
    await NodeFSP.writeFile(outside, "pdf bytes");
    const result = await save(outside);
    expect(result.name).toBe("final report.pdf");
    expect(await resolveSessionOutputFile(storeRoot, result.id, result.name)).not.toBeNull();
  });

  it("deduplicates concurrent saves without losing the committed output", async () => {
    await NodeFSP.writeFile(NodePath.join(cwd, "report.csv"), "a,b\n1,2");
    const results = await Promise.all([save("report.csv"), save("report.csv")]);
    expect(results[0]).toEqual(results[1]);
    expect(await NodeFSP.readdir(storeRoot)).toEqual([results[0]!.id]);
  });

  it("finds the original saved relative link after the thread changes workspace", async () => {
    await NodeFSP.writeFile(NodePath.join(cwd, "report.txt"), "original worktree");
    const input = {
      storeRoot,
      cwd,
      threadId: "thread-1",
      messageId: "message-1",
      turnId: "turn-1",
      sourcePath: "report.txt",
      reference: "report.txt",
    };
    const first = await saveSessionOutput(input);
    await NodeFSP.rm(cwd, { recursive: true });
    const reopened = await saveSessionOutput({
      ...input,
      cwd: NodePath.join(root, "different workspace"),
    });
    expect(reopened).toEqual(first);
    expect(
      await findSavedSessionOutput({
        storeRoot,
        threadId: input.threadId,
        messageId: input.messageId,
        requestedPath: first.sourcePath,
        links: sessionOutputLinks(
          "[report](report.txt)",
          NodePath.join(root, "different workspace"),
        ),
      }),
    ).toEqual(first);
  });

  it("rejects oversized files before copying and classifies permanent failures", async () => {
    const source = NodePath.join(cwd, "big.bin");
    await NodeFSP.writeFile(source, "");
    await NodeFSP.truncate(source, 65 * 1024 * 1024);
    await expect(save(source)).rejects.toMatchObject({ code: "too-large" });
    expect(outputAccessError({ code: "ENOENT" }).code).toBe("missing");
    expect(outputAccessError({ code: "EACCES" }).code).toBe("denied");
  });

  it("extracts explicit local links and code paths without URLs or fenced examples", () => {
    expect(sessionOutputPaths("[Report](<Final Report.pdf>)", cwd)).toHaveLength(1);
    const paths = sessionOutputPaths(
      "[report](<reports/final report.pdf>) [line](src/app.ts:12) `output/data.csv` [web](https://example.com/test.pdf)\n```\n[example](fake.pdf)\n```",
      cwd,
    );
    expect(paths).toHaveLength(3);
    const normalize = (value: string) => (NodePath.sep === "\\" ? value.toLowerCase() : value);
    expect(paths[0]).toBe(normalize(NodePath.resolve(cwd, "reports/final report.pdf")));
    expect(paths[1]).toBe(normalize(NodePath.resolve(cwd, "src/app.ts")));
    expect(paths[2]).toBe(normalize(NodePath.resolve(cwd, "output/data.csv")));
  });
});
