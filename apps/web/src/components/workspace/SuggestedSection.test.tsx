import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId, type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { SuggestedSection } from "./SuggestedSection";
const mocks = vi.hoisted(() => ({
  status: "ready",
  message: undefined as string | undefined,
  refresh: vi.fn(),
  accept: vi.fn(),
  dismiss: vi.fn(),
  operate: true,
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    suggestions: () => "state",
    list: () => "list",
    refreshSuggestions: "refresh",
    acceptSuggestion: "accept",
    dismissSuggestion: "dismiss",
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (kind: string) => ({
    error: null,
    data:
      kind === "state"
        ? {
            status: mocks.status,
            model: "selected-model",
            message: mocks.message,
            cached: true,
            incomplete: false,
          }
        : {
            suggested: Array.from({ length: 4 }, (_, index) => ({
              id: `link-${index}`,
              item: {
                ref: { type: "project", projectId: `project-${index}` },
                title: `Launch ${index}`,
              },
              source: { type: "model", model: "selected-model", reason: `Reason ${index}` },
            })),
          },
  }),
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: "refresh" | "accept" | "dismiss") => mocks[name],
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
const environmentId = EnvironmentId.make("remote");
const item: WorkspaceLinkEndpoint = {
  ref: { type: "thread", threadId: ThreadId.make("captured-thread") },
  title: "Source",
};
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  mocks.status = "ready";
  mocks.message = undefined;
  mocks.operate = true;
  vi.unstubAllGlobals();
});
it("limits visible suggestions to three and accepts with the captured environment and origin", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.accept.mockResolvedValue({ _tag: "Success" });
  const open = vi.fn();
  await act(() => {
    renderer = create(<SuggestedSection environmentId={environmentId} item={item} onOpen={open} />);
  });
  const accepts = renderer!.root
    .findAllByType("button")
    .filter((button) => button.children.includes("Accept"));
  expect(accepts).toHaveLength(3);
  await act(() => accepts[0]!.props.onClick());
  expect(mocks.accept).toHaveBeenCalledWith({
    environmentId,
    input: { id: "link-0", viewing: item },
  });
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Launch 0"))!
      .props.onClick(),
  );
  expect(open).toHaveBeenCalledWith({ type: "project", projectId: ProjectId.make("project-0") });
});
it("shows no-model and failed states with a captured manual refresh", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.status = "no-model";
  mocks.message = "Set up a model";
  await act(() => {
    renderer = create(
      <SuggestedSection environmentId={environmentId} item={item} onOpen={() => {}} />,
    );
  });
  expect(renderer!.root.findAllByType("li")).toHaveLength(0);
  mocks.refresh.mockResolvedValue({
    _tag: "Success",
    value: { status: "failed", message: "Model unavailable", cached: false, incomplete: false },
  });
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Refresh suggestions"))!
      .props.onClick(),
  );
  expect(mocks.refresh).toHaveBeenCalledWith({ environmentId, input: { item, refresh: true } });
  expect(renderer!.root.findAllByType("li")).toHaveLength(0);
});
it("requires operate access for accepting and dismissing while source opening remains available", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.operate = false;
  await act(() => {
    renderer = create(
      <SuggestedSection environmentId={environmentId} item={item} onOpen={() => {}} />,
    );
  });
  const decisions = renderer!.root
    .findAllByType("button")
    .filter((button) => button.children.includes("Accept") || button.children.includes("Dismiss"));
  expect(decisions).toHaveLength(6);
  for (const decision of decisions) expect(decision.props.disabled).toBe(true);
});
