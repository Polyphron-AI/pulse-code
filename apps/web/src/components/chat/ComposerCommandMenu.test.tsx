import { renderToStaticMarkup } from "react-dom/server";
import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { ComposerCommandMenu, type ComposerCommandItem } from "./ComposerCommandMenu";

const skill: ComposerCommandItem = {
  id: "skill:codex:review-code",
  type: "skill",
  provider: ProviderDriverKind.make("codex"),
  skill: {
    name: "review-code",
    displayName: "Review Code",
    enabled: true,
    scope: "repo",
    path: "/workspace/.agents/skills/review-code/SKILL.md",
  },
  label: "Review Code",
  description: "Review the current changes",
};

function renderMenu(
  items: ComposerCommandItem[],
  triggerKind: "skill" | "slash-command",
  groupSlashCommandSections = true,
) {
  return renderToStaticMarkup(
    <ComposerCommandMenu
      items={items}
      triggerKind={triggerKind}
      groupSlashCommandSections={groupSlashCommandSections}
      resolvedTheme="dark"
      isLoading={false}
      activeItemId={skill.id}
      onHighlightedItemChange={() => {}}
      onSelect={() => {}}
    />,
  );
}

describe("ComposerCommandMenu skills", () => {
  it("retains skill rows alongside built-in and provider groups", () => {
    const markup = renderMenu(
      [
        {
          id: "model",
          type: "slash-command",
          command: "model",
          label: "/model",
          description: "Select model",
        },
        {
          id: "status",
          type: "provider-slash-command",
          provider: ProviderDriverKind.make("codex"),
          command: { name: "status" },
          label: "/status",
          description: "Provider status",
        },
        skill,
      ],
      "slash-command",
    );
    expect(markup).toContain("Built-in");
    expect(markup).toContain("/status");
    expect(markup).toContain("skill:codex:review-code");
    expect(markup).toContain('<span class="text-secondary-label">/skill:</span>Review Code');
    expect(markup).toContain("Review the current changes");
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain("Repo");
  });

  it("shows source badges in dollar results and retains ungrouped results", () => {
    const appSkill: ComposerCommandItem = {
      ...skill,
      skill: { ...skill.skill, path: "/user/.codex/plugins/review/SKILL.md" },
    };
    expect(renderMenu([appSkill], "skill")).toContain("App Skill");
    expect(renderMenu([skill], "slash-command", false)).toContain("Review Code");
  });
});
