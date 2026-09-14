// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";
import { stageClaudeManagedSkills } from "./ManagedSkillClaudePlugin.ts";

it("stages only selected immutable skill directories as a minimal Claude plugin", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOs.tmpdir(), "pulse-claude-skill-"));
  try {
    const source = NodePath.join(root, "source");
    await NodeFSP.mkdir(source);
    await NodeFSP.writeFile(
      NodePath.join(source, "SKILL.md"),
      "---\r\n'name': Code Review\r\ndescription: Review code\r\ndisable-model-invocation: true\r\n---\r\nUse references.\r\n",
    );
    await NodeFSP.writeFile(NodePath.join(source, "reference.md"), "reference");
    const plugin = await stageClaudeManagedSkills({
      stateDir: root,
      threadId: ThreadId.make("thread-one"),
      skills: [
        {
          id: "review",
          name: "Code Review",
          revision: "a".repeat(64),
          path: NodePath.join(source, "SKILL.md"),
          directory: source,
        },
      ],
    });
    expect(
      JSON.parse(
        await NodeFSP.readFile(NodePath.join(plugin, ".claude-plugin", "plugin.json"), "utf8"),
      ),
    ).toEqual({ name: "pulse-managed-skills" });
    const staged = await NodeFSP.readFile(
      NodePath.join(plugin, "skills", "review", "SKILL.md"),
      "utf8",
    );
    expect(staged).toContain("name: review");
    expect(staged).toContain("disable-model-invocation: true");
    expect(
      await NodeFSP.readFile(NodePath.join(plugin, "skills", "review", "reference.md"), "utf8"),
    ).toBe("reference");
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("keeps hostile thread ids inside the managed runtime directory", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOs.tmpdir(), "pulse-claude-path-"));
  try {
    const source = NodePath.join(root, "source");
    await NodeFSP.mkdir(source);
    await NodeFSP.writeFile(
      NodePath.join(source, "SKILL.md"),
      "---\nname: review\ndescription: Review\n---\nReview.\n",
    );
    const plugin = await stageClaudeManagedSkills({
      stateDir: root,
      threadId: ThreadId.make("../../outside"),
      skills: [
        {
          id: "review",
          name: "Review",
          path: NodePath.join(source, "SKILL.md"),
          directory: source,
        },
      ],
    });
    expect(NodePath.relative(NodePath.join(root, "pulse", "skills-runtime"), plugin)).not.toMatch(
      /^\.\.|^[\\/]/,
    );
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
