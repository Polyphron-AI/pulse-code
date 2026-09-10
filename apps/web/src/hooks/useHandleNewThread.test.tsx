import { EnvironmentId, ProjectId, ThreadId, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  defaults: vi.fn(),
  navigate: vi.fn(),
  write: vi.fn(),
  context: vi.fn(),
  stored: null as null | Record<string, unknown>,
  router: { latestLocation: { pathname: "/" }, state: { matches: [] } },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) => (atom === "configs" ? new Map() : DEFAULT_SERVER_SETTINGS),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    ...mocks.router,
    get latestLocation() {
      return mocks.router.latestLocation;
    },
    navigate: mocks.navigate,
  }),
  useParams: vi.fn(),
}));
vi.mock("../state/server", () => ({
  environmentServerConfigsAtom: "configs",
  primaryServerSettingsAtom: "settings",
}));
vi.mock("./useSettings", () => ({ useClientSettings: () => ({}) }));
vi.mock("../state/entities", () => ({
  readProjects: () => [
    { id: "project", environmentId: "environment", workspaceRoot: "/workspace" },
  ],
  readThreadShell: () => null,
  useProjects: vi.fn(),
  useThread: vi.fn(),
}));
vi.mock("../logicalProject", () => ({
  deriveLogicalProjectKeyFromSettings: () => "project-key",
  getProjectOrderKey: vi.fn(),
  selectProjectGroupingSettings: vi.fn(),
}));
vi.mock("../components/Sidebar.logic", () => ({ orderItemsByPreferredIds: vi.fn() }));
vi.mock("../lib/utils", () => ({ newDraftId: () => "draft-new", newThreadId: () => "thread-new" }));
vi.mock("../lib/t3ProjectFileDefaults", () => ({
  readT3ProjectFileDefaultThreadEnvMode: mocks.defaults,
}));
vi.mock("../uiStateStore", () => ({
  useUiStateStore: vi.fn(),
  legacyProjectCwdPreferenceKey: vi.fn(),
}));
vi.mock("../components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("../composerDraftStore", () => ({
  composerDraftHasUserContent: () => false,
  markPromotedDraftThreadByRef: vi.fn(),
  useComposerDraftStore: {
    getState: () => ({
      getComposerDraft: () => null,
      getDraftSessionByLogicalProjectKey: () => mocks.stored,
      getDraftSession: () => null,
      getDraftThread: () => null,
      applyStickyState: vi.fn(),
      moveComposerPromptAndImages: vi.fn(),
      setDraftThreadContext: mocks.context,
      setLogicalProjectDraftThreadId: mocks.write,
      setModelSelection: vi.fn(),
      setPrompt: vi.fn(),
    }),
  },
}));
import { useNewThreadHandler } from "./useHandleNewThread";
let renderer: ReactTestRenderer | undefined;
let start: ReturnType<typeof useNewThreadHandler>;
function Probe() {
  start = useNewThreadHandler();
  return null;
}
const project = {
  environmentId: EnvironmentId.make("environment"),
  projectId: ProjectId.make("project"),
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.stored = null;
  mocks.router.latestLocation = { pathname: "/" };
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.write.mockReset();
  mocks.context.mockReset();
  mocks.defaults.mockReset();
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

describe("automatic index draft navigation", () => {
  it.each([false, true])(
    "preserves a selected thread after defaults load (stored draft: %s)",
    async (stored) => {
      if (stored)
        mocks.stored = {
          draftId: "draft-old",
          threadId: ThreadId.make("thread-old"),
          environmentId: "environment",
          logicalProjectKey: "project-key",
        };
      let finish!: (value: null) => void;
      mocks.defaults.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const pending = start(project, { replace: true, cancelOnNavigation: true });
      expect(mocks.defaults).toHaveBeenCalledOnce();
      mocks.router.latestLocation = { pathname: "/environment/selected-thread" };
      finish(null);
      expect(await pending).toBeNull();
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
    },
  );
  it.each([true, false])(
    "opens the draft when navigation is allowed (automatic: %s)",
    async (automatic) => {
      let finish!: (value: null) => void;
      mocks.defaults.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const pending = start(project, automatic ? { cancelOnNavigation: true } : undefined);
      if (!automatic) mocks.router.latestLocation = { pathname: "/environment/selected-thread" };
      finish(null);
      expect(await pending).toMatchObject({ draftId: "draft-new" });
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/draft/$draftId" }),
      );
      expect(mocks.write).toHaveBeenCalledOnce();
    },
  );
});
