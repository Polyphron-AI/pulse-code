import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
vi.mock("../../hooks/useResizableWidth", () => ({
  useResizableWidth: () => ({ width: 200, handlers: {}, setWidth: vi.fn() }),
}));
vi.mock("../ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  SheetPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
it("keeps context available before selection and mounts selected tools once", async () => {
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(
      <WorkspaceEngagement space="mail" selected={false} list={<p>Inbox</p>} linked={null}>
        <p>Select mail</p>
      </WorkspaceEngagement>,
    );
  });
  expect(view.root.findAllByType("aside")).toHaveLength(1);
  const opener = view.root
    .findAllByType("button")
    .find((button) => button.children.includes("Context"));
  expect(opener).toBeDefined();
  await act(async () => {
    opener!.props.onClick();
  });
  expect(JSON.stringify(view.toJSON())).toContain("Select an item");
  await act(async () => {
    view.update(
      <WorkspaceEngagement
        space="mail"
        selected
        list={<p>Inbox</p>}
        linked={<div data-tools="active" />}
      >
        <p>Mail</p>
      </WorkspaceEngagement>,
    );
  });
  expect(view.root.findAllByProps({ "data-tools": "active" })).toHaveLength(1);
  await act(async () => view.unmount());
});
