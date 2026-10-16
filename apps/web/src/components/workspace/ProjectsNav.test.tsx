import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { ProjectsNav } from "./ProjectsNav";
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), close: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ project: "p", environment: "remote" }),
  useNavigate: () => mocks.navigate,
  Link: "a",
}));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../sidebar/SidebarChrome", () => ({ SidebarChromeHeader: () => null }));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("../ui/sidebar", () => ({
  SidebarContent: "div",
  SidebarGroup: "div",
  useSidebar: () => ({ setOpenMobile: mocks.close }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote" }),
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "p", title: "Remote project", environmentId: "remote" },
    { id: "other", title: "Other environment", environmentId: "local" },
  ],
}));
vi.mock("../ui/combobox", () => ({
  Combobox: ({
    children,
    filteredItems,
    onValueChange,
  }: {
    children: ReactNode;
    filteredItems: { value: string; label: string }[];
    onValueChange: (item: { value: string; label: string }) => void;
  }) => (
    <div>
      {children}
      {filteredItems.map((item) => (
        <button key={item.value} onClick={() => onValueChange(item)}>
          {item.label}
        </button>
      ))}
    </div>
  ),
  ComboboxTrigger: "div",
  ComboboxPopup: "div",
  ComboboxSearchInput: "input",
  ComboboxEmpty: "p",
  ComboboxList: () => null,
  ComboboxItem: "div",
}));
it("searches only the selected environment and navigates scoped selections and All projects", async () => {
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<ProjectsNav />);
  });
  expect(
    view.root
      .findAllByType("button")
      .some((button) => button.children.includes("Other environment")),
  ).toBe(false);
  await act(async () =>
    view.root.findByType("input").props.onChange({ target: { value: "Remote" } }),
  );
  expect(view.root.findAllByType("button")).toHaveLength(1);
  await act(async () => view.root.findByType("button").props.onClick());
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "p" },
  });
  expect(mocks.close).toHaveBeenCalledWith(false);
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((button) => button.children.includes("All projects"))!
      .props.onClick(),
  );
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote" },
  });
  await act(async () =>
    view.root.findByType("input").props.onChange({ target: { value: "missing" } }),
  );
  expect(view.root.findAllByType("button")).toHaveLength(0);
  await act(async () => view.unmount());
});
