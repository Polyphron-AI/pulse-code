import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { MailDraftReply } from "./MailDraftReply";

const mocks = vi.hoisted(() => ({
  menu: vi.fn(),
  check: vi.fn(),
  start: vi.fn(),
  seed: vi.fn(),
  setPrompt: vi.fn(),
  setModel: vi.fn(),
  href: "/workspace",
  prompt: "",
  contexts: [] as unknown[],
  reuse: false,
  navigate: vi.fn(),
}));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  createEnvironmentRpcCommand: () => ({}),
  squashAtomCommandFailure: () => new Error("Account access required"),
}));
vi.mock("../../../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("../../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.check }));
vi.mock("../../../state/entities", () => ({
  useProjects: () => [
    { id: ProjectId.make("project"), environmentId: EnvironmentId.make("env"), title: "Project" },
  ],
  useThreadShells: () =>
    mocks.reuse
      ? [
          {
            id: "existing",
            environmentId: "env",
            projectId: "project",
            modelSelection: { instanceId: "provider", model: "model" },
          },
        ]
      : [],
}));
vi.mock("../../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.start }));
vi.mock("../../../localApi", () => ({
  readLocalApi: () => ({ contextMenu: { show: mocks.menu } }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: mocks.navigate,
    state: {
      location: {
        get href() {
          return mocks.href;
        },
      },
    },
  }),
}));
vi.mock("../../../composerDraftStore", () => ({
  useComposerDraftStore: {
    getState: () => ({
      getComposerDraft: () => ({ prompt: mocks.prompt }),
      setModelSelection: mocks.setModel,
      addThreadContexts: mocks.seed,
      setPrompt: mocks.setPrompt,
    }),
  },
}));
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({ mailReply: true, workspaceItemContext: true }),
}));
vi.mock("../../ui/button", () => ({ Button: "button" }));

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.href = "/workspace";
  mocks.reuse = false;
});
const source = {
  ref: { type: "mail" as const, accountId: "acct", messageId: "<source@test>" },
  title: "Original",
};
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.check.mockResolvedValue({
    _tag: "Success",
    value: {
      choices: [
        {
          label: "Supported model",
          modelSelection: { instanceId: ProviderInstanceId.make("provider"), model: "model" },
        },
      ],
      unavailable: [],
    },
  });
  mocks.start.mockResolvedValue({ draftId: "exact-draft", threadId: "thread" });
  await act(() => {
    renderer = create(
      <MailDraftReply
        environmentId={EnvironmentId.make("env")}
        item={source}
        linked={[
          { ref: { type: "project", projectId: ProjectId.make("project") } },
          ...(mocks.reuse
            ? [
                {
                  ref: {
                    type: "thread" as const,
                    threadId: "existing" as import("@t3tools/contracts").ThreadId,
                  },
                },
              ]
            : []),
        ]}
      />,
    );
  });
  return () =>
    act(async () => {
      await renderer!.root.findByType("button").props.onClick({
        currentTarget: { getBoundingClientRect: () => ({ left: 0, bottom: 0 }) },
      });
    });
}
it("cancels model choice without creating a draft or linking the source", async () => {
  const click = await render();
  mocks.menu.mockResolvedValue(null);
  await click();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.seed).not.toHaveBeenCalled();
});
it("seeds the exact returned draft with removable reply provenance and leaves sending to approval", async () => {
  const click = await render();
  mocks.menu.mockResolvedValue("0");
  await click();
  expect(mocks.check).toHaveBeenCalledWith({
    environmentId: "env",
    input: { projectId: "project", accountId: "acct" },
  });
  expect(mocks.setPrompt.mock.calls[0]?.[1]).not.toContain("<source@test>");
  expect(mocks.seed).toHaveBeenCalledWith(
    "exact-draft",
    expect.arrayContaining([
      expect.objectContaining({ action: "draft-reply", item: source, viewing: source }),
    ]),
    { insertAtCaret: false },
  );
  expect(mocks.setPrompt).toHaveBeenCalledWith(
    "exact-draft",
    expect.stringContaining("mail_prepare_send"),
  );
  expect(mocks.setPrompt).toHaveBeenCalledWith(
    "exact-draft",
    expect.stringContaining("approval card"),
  );
});
it("does not apply a stale readiness response after navigation", async () => {
  const click = await render();
  mocks.check.mockImplementation(async () => {
    mocks.href = "/other";
    return { _tag: "Success", value: { choices: [], unavailable: [] } };
  });
  await click();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.seed).not.toHaveBeenCalled();
});

it("reuses a linked thread without seeding that thread as its own source context", async () => {
  mocks.reuse = true;
  const click = await render();
  mocks.menu.mockResolvedValue("0");
  await click();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalled();
  const records = mocks.seed.mock.calls[0]?.[1] as Array<{
    item: { ref: { type: string; threadId?: string } };
  }>;
  expect(
    records.some(
      (record) => record.item.ref.type === "thread" && record.item.ref.threadId === "existing",
    ),
  ).toBe(false);
  expect(records.some((record) => record.item.ref.type === "mail")).toBe(true);
});
