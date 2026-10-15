import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";
import { WorkspaceSpaceSelector } from "./WorkspaceSpaceSelector";

const location = { pathname: "/settings/email", search: {}, href: "/settings/email" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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
