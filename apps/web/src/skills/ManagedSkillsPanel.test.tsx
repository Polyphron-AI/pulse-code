import type { PulseSkillRecord } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AlertDialog } from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
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
});
