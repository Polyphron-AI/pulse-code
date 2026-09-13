import { act, type ComponentProps, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { navigate, scrollToSettingsTarget } = vi.hoisted(() => ({
  navigate: vi.fn(),
  scrollToSettingsTarget: vi.fn(() => true),
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { hash: string }) => unknown }) =>
    select({ hash: "" }),
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: object) => unknown }) =>
    select({ resolvedLocation: { pathname: "/settings/integrations" } }),
}));
vi.mock("../clerk/T3ConnectSidebarSignIn", () => ({
  T3ConnectSidebarAvatar: () => null,
  T3ConnectSidebarSignIn: () => null,
}));
vi.mock("../sidebar/SidebarChrome", () => ({ SidebarUtilityMenu: () => null }));
vi.mock("../ui/collapsible", () => ({
  Collapsible: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? children : null,
  CollapsiblePanel: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../ui/sidebar", () => ({
  SidebarContent: ({ children }: { children: ReactNode }) => children,
  SidebarFooter: ({ children }: { children: ReactNode }) => children,
  SidebarGroup: ({ children }: { children: ReactNode }) => children,
  SidebarMenu: ({ children }: { children: ReactNode }) => children,
  SidebarMenuButton: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  SidebarMenuItem: ({ children }: { children: ReactNode }) => children,
  SidebarMenuSub: ({ children }: { children: ReactNode }) => children,
  SidebarMenuSubButton: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  SidebarMenuSubItem: ({ children }: { children: ReactNode }) => children,
  useSidebar: () => ({ isMobile: false, open: true, setOpen: vi.fn(), setOpenMobile: vi.fn() }),
}));
vi.mock("./settingsLayout", () => ({ scrollToSettingsTarget }));
vi.mock("./settingsSectionVisibility", () => ({
  getVisibleSettingsSectionIds: () => new Set(),
  observeSettingsSectionVisibility: () => undefined,
}));
vi.mock("./useAvailableSettingsSearchItems", () => ({
  useAvailableSettingsSearchItems: () => [],
}));

import { SettingsSidebarNav } from "./SettingsSidebarNav";

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", {
    getElementById: () => null,
    querySelector: () => null,
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  navigate.mockClear();
  scrollToSettingsTarget.mockClear();
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

describe("Integrations settings sub-navigation", () => {
  it("shows every integration section and scrolls to a selected section", async () => {
    await act(() => {
      renderer = create(<SettingsSidebarNav pathname="/settings/integrations" />);
    });

    const buttons = renderer!.root.findAllByType("button");
    const labels = buttons.map((button) =>
      button.findAllByType("span").map((span) => span.children.join("")),
    );
    expect(labels).toContainEqual(["Skills"]);
    expect(labels).toContainEqual(["MCP"]);
    expect(labels).toContainEqual(["Voice dictation"]);
    expect(labels).toContainEqual(["Browser"]);

    const mcpButton = buttons.find((button) =>
      button.findAllByType("span").some((span) => span.children.join("") === "MCP"),
    );
    await act(() => mcpButton!.props.onClick());

    expect(scrollToSettingsTarget).toHaveBeenCalledWith("mcp", { highlight: false });
    expect(navigate).not.toHaveBeenCalled();
  });
});
