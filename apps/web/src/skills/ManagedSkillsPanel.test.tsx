import type { PulseSkillRecord } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../components/ui/dialog", () => {
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Dialog = ({ children }: { children?: ReactNode; open?: boolean }) => <div>{children}</div>;
  return {
    Dialog,
    DialogDescription: Part,
    DialogFooter: Part,
    DialogHeader: Part,
    DialogPanel: Part,
    DialogPopup: Part,
    DialogTitle: Part,
  };
});

import { AlertDialog } from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog } from "../components/ui/dialog";
import { Radio, RadioGroup } from "../components/ui/radio-group";
import { ManagedSkillsPanel } from "./ManagedSkillsPanel";

const skill: PulseSkillRecord = {
  id: "review",
  name: "Review",
  description: "Review code",
  revision: "a".repeat(64),
  source: { type: "github", repository: "team/skills", ref: "main", directory: "review" },
  updatePolicy: "pinned",
  resolvedCommit: "b".repeat(40),
  invocation: {},
  updatedAt: "2026-09-12T00:00:00.000Z",
  checkedAt: "2026-09-12T00:00:00.000Z",
};

let renderer: ReactTestRenderer | undefined;

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

function button(label: string) {
  return renderer!.root
    .findAllByType(Button)
    .find((candidate) => candidate.props.children?.includes?.(label));
}

describe("ManagedSkillsPanel environment ownership", () => {
  it("locks source fields while GitHub resolution is pending", async () => {
    let finish!: (value: {
      repository: string;
      ref: string;
      directories: readonly string[];
    }) => void;
    const resolveGitHub = vi.fn(
      () =>
        new Promise<{
          repository: string;
          ref: string;
          directories: readonly string[];
        }>((resolve) => {
          finish = resolve;
        }),
    );
    await act(() => {
      renderer = create(
        <ManagedSkillsPanel
          environmentKey="env-a"
          skills={[]}
          mutate={vi.fn().mockResolvedValue([])}
          resolveGitHub={resolveGitHub}
        />,
      );
    });
    await act(async () => button("Import from GitHub")!.props.onClick());
    await act(() =>
      renderer!.root
        .findByProps({ placeholder: "https://github.com/owner/repository" })
        .props.onChange({ target: { value: "https://github.com/team/skills" } }),
    );
    act(() => button("Resolve")!.props.onClick());

    expect(renderer!.root.findByProps({ placeholder: "owner/repository" }).props.disabled).toBe(
      true,
    );
    expect(renderer!.root.findByProps({ placeholder: "skills/review" }).props.disabled).toBe(true);
    await act(async () =>
      finish({ repository: "team/skills", ref: "main", directories: ["skills/review"] }),
    );
    expect(renderer!.root.findByProps({ placeholder: "owner/repository" }).props.disabled).toBe(
      false,
    );
  });

  it("keeps generated IDs valid when a numeric directory collides", async () => {
    const mutate = vi.fn().mockResolvedValue([]);
    const numericSkill = { ...skill, id: "skill-123", name: "Numeric skill" };
    await act(() => {
      renderer = create(
        <ManagedSkillsPanel
          environmentKey="env-a"
          skills={[numericSkill]}
          mutate={mutate}
          resolveGitHub={() =>
            Promise.resolve({
              repository: "team/skills",
              ref: "main",
              directories: ["skills/123", "other/release"],
            })
          }
        />,
      );
    });
    await act(async () => button("Import from GitHub")!.props.onClick());
    await act(() =>
      renderer!.root
        .findByProps({ placeholder: "https://github.com/owner/repository" })
        .props.onChange({ target: { value: "https://github.com/team/skills" } }),
    );
    await act(async () => button("Resolve")!.props.onClick());

    expect(renderer!.root.findAllByProps({ children: "skill-123-2" })).toHaveLength(1);
    await act(() => button("Select all")!.props.onClick());
    await act(async () => button("Import 2 skills")!.props.onClick());
    expect(mutate.mock.calls[0]?.[1].id).toBe("skill-123-2");
  });

  it("pins fixed commit URLs and disables automatic updates", async () => {
    const commit = "a".repeat(40);
    await act(() => {
      renderer = create(
        <ManagedSkillsPanel
          environmentKey="env-a"
          skills={[]}
          mutate={vi.fn().mockResolvedValue([])}
          resolveGitHub={() =>
            Promise.resolve({
              repository: "team/skills",
              ref: commit,
              directories: ["skills/review"],
            })
          }
        />,
      );
    });
    await act(async () => button("Import from GitHub")!.props.onClick());
    await act(() =>
      renderer!.root
        .findByProps({ placeholder: "https://github.com/owner/repository" })
        .props.onChange({ target: { value: "https://github.com/team/skills/tree/commit" } }),
    );
    await act(async () => button("Resolve")!.props.onClick());

    expect(renderer!.root.findByType(RadioGroup).props.value).toBe("pinned");
    expect(
      renderer!.root.findAllByType(Radio).find((radio) => radio.props.value === "keep-updated")!
        .props.disabled,
    ).toBe(true);
    expect(
      renderer!.root.findAllByProps({
        children:
          "Fixed commit URLs can only be pinned. Use a branch or tag to keep a skill updated.",
      }),
    ).toHaveLength(1);
  });

  it("imports each checked skill returned by GitHub resolution", async () => {
    const mutate = vi.fn().mockResolvedValue([]);
    const resolveGitHub = vi.fn().mockResolvedValue({
      repository: "team/skills",
      ref: "main",
      directories: ["skills/review", "skills/release", "special/review"],
    });
    await act(() => {
      renderer = create(
        <ManagedSkillsPanel
          environmentKey="env-a"
          skills={[skill]}
          mutate={mutate}
          resolveGitHub={resolveGitHub}
        />,
      );
    });

    await act(async () => button("Import from GitHub")!.props.onClick());
    await act(() =>
      renderer!.root
        .findByProps({ placeholder: "https://github.com/owner/repository" })
        .props.onChange({ target: { value: "https://github.com/team/skills" } }),
    );
    await act(async () => button("Resolve")!.props.onClick());

    const choices = renderer!.root.findAllByType(Checkbox);
    expect(choices).toHaveLength(3);
    expect(choices.every((choice) => !choice.props.checked)).toBe(true);
    expect(button("Import 0 skills")!.props.disabled).toBe(true);
    await act(() => button("Select all")!.props.onClick());
    expect(renderer!.root.findAllByType(Checkbox).every((choice) => choice.props.checked)).toBe(
      true,
    );
    const selectedChoices = renderer!.root.findAllByType(Checkbox);
    await act(() => selectedChoices[1]!.props.onCheckedChange(false));
    const policy = renderer!.root.findByType(RadioGroup);
    expect(policy.props.value).toBe("pinned");
    await act(() => policy.props.onValueChange("keep-updated"));
    await act(async () => button("Import 2 skills")!.props.onClick());

    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenNthCalledWith(1, "env-a", {
      operation: "import-github",
      id: "review-2",
      source: {
        type: "github",
        repository: "team/skills",
        ref: "main",
        directory: "skills/review",
      },
      updatePolicy: "keep-updated",
    });
    expect(mutate).toHaveBeenNthCalledWith(2, "env-a", {
      operation: "import-github",
      id: "review-3",
      source: {
        type: "github",
        repository: "team/skills",
        ref: "main",
        directory: "special/review",
      },
      updatePolicy: "keep-updated",
    });
  });

  it("captures the environment key and ignores a completion after switching environments", async () => {
    let finish!: (value: readonly PulseSkillRecord[]) => void;
    const mutate = vi.fn(
      () =>
        new Promise<readonly PulseSkillRecord[]>((resolve) => {
          finish = resolve;
        }),
    );
    await act(() => {
      renderer = create(
        <ManagedSkillsPanel environmentKey="env-a" skills={[skill]} mutate={mutate} />,
      );
    });

    await act(async () => button("Check now")!.props.onClick());
    expect(mutate).toHaveBeenCalledWith("env-a", { operation: "sync", id: "review" });

    await act(() => {
      renderer!.update(<ManagedSkillsPanel environmentKey="env-b" skills={[]} mutate={mutate} />);
    });
    await act(async () => finish([skill]));

    expect(renderer!.root.findAllByProps({ children: "Skill change failed" })).toHaveLength(0);
  });

  it("closes open editors and removal confirmation when the panel becomes read-only", async () => {
    const mutate = vi.fn().mockResolvedValue([]);
    await act(() => {
      renderer = create(
        <ManagedSkillsPanel environmentKey="env-a" skills={[skill]} mutate={mutate} />,
      );
    });
    await act(async () => button("Upload")!.props.onClick());
    expect(renderer!.root.findAllByType(Dialog).some((dialog) => dialog.props.open)).toBe(true);
    await act(async () =>
      renderer!.root.findByProps({ "aria-label": "Remove Review" }).props.onClick(),
    );
    expect(renderer!.root.findByType(AlertDialog).props.open).toBe(true);

    await act(() => {
      renderer!.update(
        <ManagedSkillsPanel environmentKey="env-a" skills={[skill]} mutate={mutate} disabled />,
      );
    });

    expect(renderer!.root.findAllByType(Dialog).every((dialog) => !dialog.props.open)).toBe(true);
    expect(renderer!.root.findByType(AlertDialog).props.open).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("locks the upload dialog after mutation starts and cannot resubmit while it settles", async () => {
    let finish!: (value: readonly PulseSkillRecord[]) => void;
    const mutate = vi.fn(
      () =>
        new Promise<readonly PulseSkillRecord[]>((resolve) => {
          finish = resolve;
        }),
    );
    await act(() => {
      renderer = create(<ManagedSkillsPanel environmentKey="env-a" skills={[]} mutate={mutate} />);
    });
    await act(async () => button("Upload")!.props.onClick());
    await act(async () => {
      renderer!.root.findByProps({ placeholder: "code-review" }).props.onChange({
        target: { value: "review" },
      });
      renderer!.root.findByProps({ type: "file" }).props.onChange({
        currentTarget: {
          files: [
            new File(
              ["---\nname: Review\ndescription: Review code\n---\n\nInstructions.\n"],
              "SKILL.md",
            ),
          ],
        },
      });
    });
    await act(async () => button("Upload skill")!.props.onClick());

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(button("Cancel")!.props.disabled).toBe(true);
    expect(button("Upload")!.props.disabled).toBe(true);
    await act(async () => button("Saving skill…")!.props.onClick());
    const openDialog = renderer!.root.findAllByType(Dialog).find((dialog) => dialog.props.open)!;
    await act(async () => openDialog.props.onOpenChange(false));
    expect(renderer!.root.findAllByType(Dialog).some((dialog) => dialog.props.open)).toBe(true);
    expect(mutate).toHaveBeenCalledTimes(1);

    await act(async () => finish([]));
    expect(renderer!.root.findAllByType(Dialog).every((dialog) => !dialog.props.open)).toBe(true);
  });
});
