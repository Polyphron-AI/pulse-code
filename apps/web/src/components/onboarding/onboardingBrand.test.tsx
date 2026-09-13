import { PRODUCT_BASE_NAME } from "@t3tools/shared/productIdentity";
import { act, type ReactElement, type ReactNode } from "react";
import TestRenderer, {
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: object) => ({
      ...options,
      useRouteContext: () => ({ authGateState: { status: "hosted-static" } }),
    }),
    Link: ({ children }: { children: ReactNode }) => <a href="/settings/connections">{children}</a>,
    useLocation: () => "/welcome",
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../../cloud/publicConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../cloud/publicConfig")>()),
  hasCloudPublicConfig: () => true,
}));
vi.mock("../clerk/useT3ConnectAuthPrompt", () => ({
  useT3ConnectAuthPrompt: () => ({ openAuthPrompt: vi.fn() }),
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: [], isReady: true }),
  usePrimaryEnvironment: () => null,
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn(), isCopied: false }),
}));
vi.mock("../cloud/CloudEnvironmentConnectList", () => ({
  CloudEnvironmentConnectRows: () => null,
}));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/collapsible", () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CollapsiblePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("../ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
vi.mock("../ui/empty", () => ({
  Empty: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  EmptyDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  EmptyHeader: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  EmptyTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../WorkspacePageHeader", () => ({
  WorkspacePageHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

import { HostedStaticOnboardingState } from "../../routes/_chat.index";
import { FirstRunRecovery } from "./FirstRunGate";
import { ConnectAccountOption, PairingForm, WelcomeWizardBrandHeader } from "./WelcomeWizard";
import { PulseWordmark } from "../pulse/PulseWordmark";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function textContent(
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null,
): string {
  if (node === null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  return node.children?.map((child) => textContent(child)).join(" ") ?? "";
}

function normalizedText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null) {
  return textContent(node).replace(/\s+/g, " ").trim();
}

async function render(element: ReactElement): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

describe("onboarding product identity", () => {
  it("exposes the branded wizard title and wordmark to assistive technology", async () => {
    const renderer = await render(<WelcomeWizardBrandHeader />);

    expect(normalizedText(renderer.toJSON())).toContain(`Set up ${PRODUCT_BASE_NAME}`);
    const wordmark = renderer.root.findByProps({ role: "img" });
    expect(wordmark.props["aria-label"]).toBe(PRODUCT_BASE_NAME);
    expect(normalizedText(renderer.toJSON())).toContain(PRODUCT_BASE_NAME);

    await act(() => renderer.unmount());
  });

  it("keeps the T3 Connect service and CLI command while naming Pulse in its guidance", async () => {
    const renderer = await render(
      <ConnectAccountOption
        autoSelectedComputers={new Set()}
        disabled={false}
        selectedIds={new Set()}
        onToggleEnvironment={vi.fn()}
      />,
    );
    const renderedText = normalizedText(renderer.toJSON());

    expect(renderedText).toContain("T3 Connect");
    expect(renderedText).toContain("npx t3 connect");
    expect(renderedText).toContain(`Keep ${PRODUCT_BASE_NAME} running.`);

    await act(() => renderer.unmount());
  });

  it("keeps pairing commands verbatim while identifying the app as Pulse", async () => {
    const renderer = await render(
      <PairingForm isPairing={false} setIsPairing={vi.fn()} onPaired={vi.fn()} />,
    );
    const renderedText = normalizedText(renderer.toJSON());

    expect(renderedText).toContain("npx t3 pair");
    expect(renderedText).toContain(`Start ${PRODUCT_BASE_NAME} first`);
    expect(renderedText).toContain("npx t3 serve");
    expect(renderedText).toContain("--tailscale");

    await act(() => renderer.unmount());
  });

  it("names Pulse in connection recovery", async () => {
    const renderer = await render(<FirstRunRecovery reason="connection" />);

    expect(normalizedText(renderer.toJSON())).toContain(
      `${PRODUCT_BASE_NAME} could not confirm this workspace.`,
    );

    await act(() => renderer.unmount());
  });

  it("renders hosted first-use guidance with Pulse and the retained service name", async () => {
    const renderer = await render(<HostedStaticOnboardingState />);
    const renderedText = normalizedText(renderer.toJSON());

    expect(renderedText).toContain(`Connect to a computer running ${PRODUCT_BASE_NAME}`);
    expect(renderedText).toContain(`Start the ${PRODUCT_BASE_NAME} desktop app`);
    expect(renderedText).toContain("Enable T3 Connect");

    await act(() => renderer.unmount());
  });

  it("renders the production wordmark with one accessible product name", async () => {
    const renderer = await render(<PulseWordmark />);
    const wordmark = renderer.root.findByProps({ role: "img" });

    expect(wordmark.props["aria-label"]).toBe(PRODUCT_BASE_NAME);
    expect(normalizedText(renderer.toJSON())).toBe(PRODUCT_BASE_NAME);

    await act(() => renderer.unmount());
  });
});
