import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";
import { WorkspaceSpaceSelector } from "./WorkspaceSpaceSelector";

const navigate = vi.fn();
const location = { pathname: "/settings/email", search: {}, href: "/settings/email" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useLocation: (options?: { select?: (input: typeof location) => unknown }) =>
    options?.select ? options.select(location) : location,
}));
vi.mock("../ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
}));
vi.mock("./mail/useMailCapabilities", () => ({ useMailCapabilities: () => ({ mailRead: true }) }));

it("keeps native rail controls available in Settings without compact button sizing", () => {
  const markup = renderToStaticMarkup(<WorkspaceSpaceSelector rail />);
  expect(markup).toContain('aria-label="Workspace spaces"');
  expect(markup.match(/<button/g)).toHaveLength(3);
  expect(markup.match(/min-h-14/g)).toHaveLength(3);
  expect(markup).toContain("Mail");
  expect(markup).toContain("Projects");
  expect(markup).toContain("Code");
  expect(markup).not.toContain('data-slot="button"');
});

it("enters Workspace from Code with a compact two-way switch", async () => {
  location.pathname = "/";
  location.href = "/";
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<WorkspaceSpaceSelector />);
  });
  const buttons = view.root.findAllByType("button");
  expect(buttons).toHaveLength(2);
  const workspace = buttons.find((button) => button.children.includes("Workspace"));
  expect(workspace).toBeDefined();
  await act(async () => workspace!.props.onClick());
  expect(navigate).toHaveBeenCalledWith({ to: "/workspace", search: { space: "projects" } });
  await act(async () => view.unmount());
  location.pathname = "/settings/email";
});
