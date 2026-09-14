// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { ThreadId } from "@t3tools/contracts";
import { parse, stringify } from "yaml";
import type { ProviderResolvedSkill } from "../provider/Services/ProviderAdapter.ts";

export async function stageClaudeManagedSkills(input: {
  readonly stateDir: string;
  readonly threadId: ThreadId;
  readonly skills: readonly ProviderResolvedSkill[];
}): Promise<string> {
  const threadKey = NodeCrypto.createHash("sha256").update(String(input.threadId)).digest("hex");
  const fingerprint = NodeCrypto.createHash("sha256")
    .update(
      input.skills
        .map((skill) => `${skill.id ?? skill.name}:${skill.revision ?? "current"}`)
        .join("\0"),
    )
    .digest("hex");
  const threadRoot = NodePath.join(input.stateDir, "pulse", "skills-runtime", threadKey);
  const root = NodePath.join(threadRoot, fingerprint);
  await NodeFSP.rm(threadRoot, { recursive: true, force: true });
  await NodeFSP.mkdir(NodePath.join(root, ".claude-plugin"), { recursive: true });
  await NodeFSP.writeFile(
    NodePath.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "pulse-managed-skills" }),
    "utf8",
  );
  for (const skill of input.skills) {
    const nativeName = skill.id ?? skill.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const destination = NodePath.join(root, "skills", nativeName);
    await NodeFSP.rm(destination, { recursive: true, force: true });
    await NodeFSP.mkdir(NodePath.dirname(destination), { recursive: true });
    await NodeFSP.cp(skill.directory ?? NodePath.dirname(skill.path), destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    const skillFile = NodePath.join(destination, "SKILL.md");
    const markdown = await NodeFSP.readFile(skillFile, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
    if (!frontmatter) throw new Error("Managed skill staging requires valid frontmatter.");
    const metadata: unknown = parse(frontmatter[1]!, { maxAliasCount: 0 });
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
      throw new Error("Managed skill staging requires object frontmatter.");
    await NodeFSP.writeFile(
      skillFile,
      `---\n${stringify({ ...metadata, name: nativeName }).trimEnd()}\n---\n${markdown.slice(frontmatter[0].length)}`,
      "utf8",
    );
  }
  return root;
}

export async function clearClaudeManagedSkills(
  stateDir: string,
  threadId: ThreadId,
): Promise<void> {
  const threadKey = NodeCrypto.createHash("sha256").update(String(threadId)).digest("hex");
  await NodeFSP.rm(NodePath.join(stateDir, "pulse", "skills-runtime", threadKey), {
    recursive: true,
    force: true,
  });
}
