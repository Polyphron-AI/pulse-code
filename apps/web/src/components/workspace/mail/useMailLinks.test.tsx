// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, type WorkspaceLinkList, type WorkspaceLinkView } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { LinkedSection } from "./LinkedSection";
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  list: { linked: [], suggested: [], truncated: false } as WorkspaceLinkList,
  operate: true,
}));
vi.mock("../../../state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => [],
  useAllEnvironmentProjectSnapshotsReady: () => true,
}));
vi.mock("../../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../../../state/workspaceLinks", () => ({
  workspaceLinks: { list: () => "list", link: "link", unlink: "unlink" },
}));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: mocks.list, error: null, refresh() {} }),
}));
vi.mock("../../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (input: unknown) => mocks.command(command, input),
}));
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceLinks: true, workspaceSuggestions: false }),
}));
vi.mock("../DriveFiles", () => ({ DriveSearch: () => null, DriveFileAccess: () => null }));
vi.mock("../WorkspaceToolsPanel", () => ({ WorkspaceToolsPanel: () => null }));
vi.mock("../WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
}));

it("links, unlinks and relinks through the real hook with the captured viewing endpoint and returned origin", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const environmentId = EnvironmentId.make("remote");
  const source = {
    ref: { type: "url" as const, url: "https://example.invalid/source" },
    title: "Source",
  };
  const id = "wslk_00000000-0000-0000-0000-000000000001";
  const origin = { confirmedAt: "2026-10-13T08:30:00Z", viewing: source };
  mocks.list = { linked: [], suggested: [], truncated: false };
  mocks.command.mockImplementation(
    async (command: string, request: { input: { b: WorkspaceLinkView["item"] } }) => {
      mocks.list = {
        ...mocks.list,
        linked:
          command === "unlink"
            ? []
            : [
                {
                  id,
                  item: request.input.b,
                  status: "confirmed",
                  source: { type: "user" },
                  updatedAt: origin.confirmedAt,
                  origin,
                },
              ],
      };
      return { _tag: "Success", value: { id, origin } };
    },
  );
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const render = () =>
    act(() =>
      root.render(
        <LinkedSection
          mode="context"
          environmentId={environmentId}
          item={source.ref}
          title={source.title}
          onOpen={() => {}}
        />,
      ),
    );
  async function link() {
    await act(() => {
      const input = getByRole(node, "textbox", { name: "Paste a link" }) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "https://example.invalid/linked",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => getByRole(node, "button", { name: /^Link$/ }).click());
    await render();
  }
  try {
    await render();
    await link();
    expect(mocks.command).toHaveBeenLastCalledWith("link", {
      environmentId,
      input: {
        a: source,
        b: { ref: { type: "url", url: "https://example.invalid/linked" } },
        viewing: source,
      },
    });
    expect(node.textContent).toContain("while viewing 'Source'");
    await act(() => getByRole(node, "button", { name: "Unlink" }).click());
    await render();
    expect(mocks.command).toHaveBeenLastCalledWith("unlink", { environmentId, input: { id } });
    expect(queryByRole(node, "button", { name: "Unlink" })).toBeNull();
    await link();
    expect(mocks.list.linked[0]).toMatchObject({ id, origin });
    expect(node.textContent).toContain("while viewing 'Source'");
    mocks.command.mockClear();
    mocks.operate = false;
    await render();
    await act(() => getByRole(node, "button", { name: "Unlink" }).click());
    expect(mocks.command).not.toHaveBeenCalled();
    expect(node.textContent).toContain("permission");
  } finally {
    await act(() => root.unmount());
    node.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.operate = true;
  }
});
