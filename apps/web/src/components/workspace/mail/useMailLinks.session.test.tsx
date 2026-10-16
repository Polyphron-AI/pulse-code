// @vitest-environment happy-dom
import { RegistryContext } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  EnvironmentId,
  ProjectId,
  WorkspaceLinkId,
  type AuthSessionState,
} from "@t3tools/contracts";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { environmentSession, useEnvironmentSessionState } from "../../../state/session";
import { useMailLinks } from "./useMailLinks";

const command = vi.hoisted(() => vi.fn());
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => command }));

const environmentId = EnvironmentId.make("link-permissions");
const source = {
  ref: { type: "url" as const, url: "https://example.invalid/source" },
  title: "Source",
};
const project = { id: ProjectId.make("created-project"), title: "Created project" };
const linkId = WorkspaceLinkId.make("wl_00000000-0000-0000-0000-000000000001");
const session: AuthSessionState = {
  authenticated: true,
  scopes: [AuthOrchestrationOperateScope],
  auth: {
    policy: "remote-reachable",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "session",
  },
};
let renderer: ReactTestRenderer | undefined;
let registry: AtomRegistry.AtomRegistry | undefined;

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  registry?.dispose();
  registry = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mount(data: AuthSessionState | null, isPending = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  command.mockResolvedValue({ _tag: "Success", value: undefined });
  registry = AtomRegistry.make({
    initialValues: [
      [
        environmentSession.sessionStateAtom(environmentId),
        data === null
          ? AsyncResult.initial(true)
          : AsyncResult.success(data, { waiting: isPending }),
      ],
    ],
  });
  let links!: ReturnType<typeof useMailLinks>;
  let state!: ReturnType<typeof useEnvironmentSessionState>;
  function Harness() {
    const currentLinks = useMailLinks(environmentId);
    const currentState = useEnvironmentSessionState(environmentId);
    useLayoutEffect(() => {
      links = currentLinks;
      state = currentState;
    });
    return null;
  }
  await act(() => {
    renderer = create(
      <RegistryContext.Provider value={registry!}>
        <Harness />
      </RegistryContext.Provider>,
    );
  });
  return { links, state };
}

it("links a project through the real guard while the resolved operate session is revalidating", async () => {
  const { links, state } = await mount(session, true);
  expect(state).toMatchObject({ isPending: true, data: session });
  await expect(links.linkToProject(source, project)).resolves.toBeUndefined();
  expect(command).toHaveBeenCalledWith({
    environmentId,
    input: {
      a: source,
      b: { ref: { type: "project", projectId: project.id }, title: project.title },
      viewing: source,
    },
  });
});

it.each([
  ["unresolved", null],
  ["unauthenticated", { ...session, authenticated: false }],
  ["without operate scope", { ...session, scopes: [] }],
] as const)("rejects every link mutation when the session is %s", async (_name, data) => {
  const { links } = await mount(data);
  for (const mutate of [
    () => links.linkToProject(source, project),
    () => links.linkItem(source, { ref: { type: "project", projectId: project.id } }),
    () => links.unlink(linkId),
  ]) {
    await expect(mutate()).rejects.toThrow("You need operate permission");
  }
  expect(command).not.toHaveBeenCalled();
});
