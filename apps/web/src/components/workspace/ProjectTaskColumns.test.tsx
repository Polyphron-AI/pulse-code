import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ThreadId, type ProjectOffice } from "@t3tools/contracts";
import { ProjectTaskColumns } from "./ProjectTaskColumns";

const office: ProjectOffice = {
  conversations: [
    { provider: "slack", accountId: "account", conversationId: "channel", title: "Launch" },
  ],
  agentThreadIds: [ThreadId.make("agent")],
  drive: { accountId: "google", folderId: "folder", folderName: "Marketing" },
  taskColumns: [{ id: "writing", name: "Writing", status: "in_progress" }],
};
let renderer: ReactTestRenderer;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("saves edited column names and shared statuses while preserving current project connections", async () => {
  const save = vi.fn().mockResolvedValue(true);
  await act(async () => {
    renderer = create(<ProjectTaskColumns office={office} onSave={save} />);
  });
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Column 1 name" })
      .props.onChange({ target: { value: "  Ready for review  " } }),
  );
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Column 1 status" })
      .props.onChange({ target: { value: "review" } }),
  );
  const refreshed: ProjectOffice = {
    ...office,
    drive: { ...office.drive!, folderName: "Updated folder" },
  };
  await act(async () => renderer.update(<ProjectTaskColumns office={refreshed} onSave={save} />));
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
  expect(save).toHaveBeenCalledWith({
    ...refreshed,
    taskColumns: [{ id: "writing", name: "Ready for review", status: "review" }],
  });
});
it("removes custom columns without removing other project associations", async () => {
  const save = vi.fn().mockResolvedValue(true);
  await act(async () => {
    renderer = create(<ProjectTaskColumns office={office} onSave={save} />);
  });
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.props.children === "Remove")!
      .props.onClick(),
  );
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
  expect(save).toHaveBeenCalledWith({ ...office, taskColumns: [] });
});
it("retains edits after a rejected save so the user can retry", async () => {
  const save = vi.fn().mockResolvedValue(false);
  await act(async () => {
    renderer = create(<ProjectTaskColumns office={office} onSave={save} />);
  });
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Column 1 name" })
      .props.onChange({ target: { value: "Edited" } }),
  );
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
  expect(renderer.root.findByProps({ "aria-label": "Column 1 name" }).props.value).toBe("Edited");
  expect(JSON.stringify(renderer.toJSON())).toContain("Your changes are still here");
});
it("keeps unsaved edits after an external column update and requires explicit reload before saving", async () => {
  const save = vi.fn().mockResolvedValue(true);
  await act(async () => {
    renderer = create(<ProjectTaskColumns office={office} onSave={save} />);
  });
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Column 1 name" })
      .props.onChange({ target: { value: "My unsaved edit" } }),
  );
  const external: ProjectOffice = {
    ...office,
    taskColumns: [{ id: "writing", name: "Team update", status: "review" }],
  };
  await act(async () => renderer.update(<ProjectTaskColumns office={external} onSave={save} />));
  expect(renderer.root.findByProps({ "aria-label": "Column 1 name" }).props.value).toBe(
    "My unsaved edit",
  );
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.props.children === "Replace editor with saved columns")!
      .props.onClick(),
  );
  expect(renderer.root.findByProps({ "aria-label": "Column 1 name" }).props.value).toBe(
    "Team update",
  );
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
  expect(save).toHaveBeenCalledWith(external);
});
