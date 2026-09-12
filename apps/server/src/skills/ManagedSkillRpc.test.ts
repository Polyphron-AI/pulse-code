// @effect-diagnostics nodeBuiltinImport:off - Boundary tests use disposable directories.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ManagedSkillLibrary } from "./ManagedSkillLibrary.ts";
import { managedSkillHandlers } from "./ManagedSkillRpc.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true })));
});

async function handlers() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-skill-rpc-"));
  roots.push(root);
  return managedSkillHandlers(new ManagedSkillLibrary(root));
}

describe("managed skill RPC bridge", () => {
  it("returns durable inventory after upload and removal", async () => {
    const rpc = await handlers();
    const records = await Effect.runPromise(
      rpc.mutate({
        operation: "import-upload",
        id: "review",
        files: [
          {
            path: "SKILL.md",
            base64: Buffer.from(
              "---\nname: Review\ndescription: Review code\n---\n\nRead code.\n",
            ).toString("base64"),
          },
        ],
      }),
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe("review");
    expect(await Effect.runPromise(rpc.list())).toEqual(records);
    expect(await Effect.runPromise(rpc.mutate({ operation: "remove", id: "review" }))).toEqual([]);
  });

  it("redacts storage failures into a typed domain error", async () => {
    const rpc = await handlers();
    const error = await Effect.runPromise(
      rpc.mutate({ operation: "sync", id: "missing" }).pipe(Effect.flip),
    );
    expect(error._tag).toBe("PulseSkillsError");
    expect(error.message).not.toContain(roots[0]);
    expect(await Effect.runPromise(rpc.list())).toEqual([]);
  });
});
