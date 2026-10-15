import { expect, it } from "vite-plus/test";
import {
  workspaceNativeAction,
  workspaceNativeMenu,
  workspaceProjectNativeMenu,
} from "./WorkspaceNativeActions.logic";
import { buildThreadActionMenuItems } from "../threadActionMenu.logic";
it("adds a scoped workspace action group while preserving native thread actions", () => {
  const native = buildThreadActionMenuItems({
    branch: "feature",
    projectFilter: null,
    isPinned: false,
    isSettled: false,
    autoSettleEnabled: true,
    isSnoozed: false,
    canSnoozeNow: true,
    isRegeneratingTitle: false,
    isRunning: false,
    supports: {
      settlement: true,
      autoSettleOptOut: true,
      snooze: true,
      pinning: true,
      titleRegeneration: true,
    },
    snoozePresets: [],
    handoffTargets: [],
  });
  const merged = [
    ...native,
    ...workspaceNativeMenu(false, {
      workspaceLinks: true,
      workspaceItemContext: true,
      workspaceTools: true,
    }),
  ];
  expect(merged.slice(0, native.length)).toEqual(native);
  expect(merged[native.length]?.children?.map((item) => item.id)).toEqual([
    "workspace:start-thread",
    "workspace:add-to-project",
    "workspace:start-project",
    "workspace:start-automation",
  ]);
  expect(native.some((item) => item.id === "new-thread-on-branch")).toBe(true);
  expect(native.some((item) => item.id === "delete")).toBe(true);
  expect(workspaceNativeAction("delete")).toBeNull();
  expect(workspaceNativeAction("workspace:start-automation")).toBe("start-automation");
});
it("hides optional actions for older servers and excludes adding a project to itself", () => {
  expect(workspaceNativeMenu(false, {})).toEqual([]);
  const project = workspaceNativeMenu(true, { workspaceLinks: true });
  expect(project[0]?.children?.map((item) => item.id)).toEqual([
    "workspace:start-thread",
    "workspace:start-automation",
  ]);
  expect(project[0]?.children?.every((item) => item.disabled)).toBe(true);
});

it("keeps grouped-project choices in their original environment and omits unsupported members", () => {
  expect(
    workspaceProjectNativeMenu([
      { label: "Old one", capabilities: {} },
      { label: "Old two", capabilities: {} },
    ]),
  ).toEqual([]);
  const menu = workspaceProjectNativeMenu([
    { label: "Old", capabilities: {} },
    {
      label: "Remote",
      capabilities: { workspaceLinks: true, workspaceTools: true, workspaceItemContext: true },
    },
  ]);
  expect(menu[0]?.children?.map((member) => member.label)).toEqual(["Remote"]);
  expect(menu[0]?.children?.[0]?.children?.[0]?.id).toBe("member:1:workspace:start-thread");
});
