// @vitest-environment happy-dom
import * as Cause from "effect/Cause";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useThreadHandoff } from "./useThreadHandoff";

const state = vi.hoisted(() => ({ generate: vi.fn(), open: vi.fn(), toast: vi.fn() }));
const environmentId = EnvironmentId.make("remote");
const instanceId = ProviderInstanceId.make("codex_work");
const projectId = ProjectId.make("project");
const threadId = ThreadId.make("source");
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => state.generate }));
vi.mock("./useHandleNewThread", () => ({ useNewThreadHandler: () => state.open }));
vi.mock("../components/ui/toast", () => ({ toastManager: { add: state.toast, close: vi.fn() } }));
vi.mock("../state/entities", () => ({
  readThreadShell: () => ({
    projectId: "project",
    branch: "feature",
    worktreePath: "/workspace/feature",
  }),
  useServerConfigs: () =>
    new Map([
      [
        "remote",
        {
          settings: {
            providers: {},
            providerInstances: { codex_work: { driver: "codex", enabled: true, config: {} } },
          },
          providers: [
            {
              instanceId: "codex_work",
              driver: "codex",
              enabled: true,
              installed: true,
              status: "ready",
              models: [{ slug: "gpt-6-astra", name: "Astra", isCustom: false, capabilities: null }],
            },
          ],
        },
      ],
    ]),
}));
beforeEach(() => {
  state.generate.mockReset();
  state.open.mockReset();
  state.toast.mockReset();
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  state.open.mockImplementation(async (projectRef, options) => {
    const draftId = DraftId.make("destination");
    useComposerDraftStore.getState().setProjectDraftThreadId(projectRef, draftId, options);
    return { draftId, threadId: "new" };
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function bind() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  let handoff: ReturnType<typeof useThreadHandoff> | undefined;
  function Binding() {
    const bound = useThreadHandoff();
    useEffect(() => {
      handoff = bound;
    }, [bound]);
    return null;
  }
  await act(async () => root.render(<Binding />));
  return {
    run: (selection: object = {}) =>
      handoff!({ threadRef: { environmentId, threadId }, instanceId, ...selection }),
    close: async () => act(async () => root.unmount()),
  };
}
describe("thread handoff", () => {
  it("routes the summary to the destination and opens an editable draft retaining its model and workspace", async () => {
    state.generate.mockResolvedValue({
      _tag: "Success",
      value: { summary: "Fix the race", truncated: false },
    });
    const binding = await bind();
    await binding.run({
      modelSelection: {
        instanceId,
        model: "gpt-6-astra",
        options: [{ id: "reasoningEffort", value: "high" }],
      },
    });
    expect(state.generate).toHaveBeenCalledWith({
      environmentId,
      input: {
        threadId,
        destination: {
          instanceId,
          model: "gpt-6-astra",
          options: [{ id: "reasoningEffort", value: "high" }],
        },
      },
    });
    expect(state.open).toHaveBeenCalledWith(
      { environmentId, projectId },
      { branch: "feature", worktreePath: "/workspace/feature", envMode: "worktree" },
    );
    const draft = useComposerDraftStore.getState().getComposerDraft(DraftId.make("destination"));
    expect(draft?.modelSelectionByProvider[instanceId]).toEqual({
      instanceId,
      model: "gpt-6-astra",
      options: [{ id: "reasoningEffort", value: "high" }],
    });
    expect(draft?.prompt).toBe("Fix the race");
    useComposerDraftStore.getState().setPrompt(DraftId.make("destination"), "Edited brief");
    expect(
      useComposerDraftStore.getState().getComposerDraft(DraftId.make("destination"))?.prompt,
    ).toBe("Edited brief");
    expect(
      useComposerDraftStore.getState().getDraftSession(DraftId.make("destination")),
    ).toMatchObject({ branch: "feature", worktreePath: "/workspace/feature", environmentId });
    await binding.close();
  });
  it("opens no draft after an interrupted summary and allows retry", async () => {
    state.generate
      .mockResolvedValueOnce({ _tag: "Failure", cause: Cause.interrupt(1) })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: { summary: "Retry brief", truncated: false },
      });
    const binding = await bind();
    await binding.run();
    expect(useComposerDraftStore.getState().listDraftThreadKeys()).toEqual([]);
    await binding.run();
    expect(
      useComposerDraftStore.getState().getComposerDraft(DraftId.make("destination"))?.prompt,
    ).toBe("Retry brief");
    await binding.close();
  });
  it("coalesces repeated requests while generation is pending", async () => {
    let finish: ((value: object) => void) | undefined;
    state.generate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const binding = await bind();
    const first = binding.run();
    await binding.run();
    expect(useComposerDraftStore.getState().listDraftThreadKeys()).toEqual([]);
    finish!({ _tag: "Success", value: { summary: "One brief", truncated: false } });
    await first;
    expect(useComposerDraftStore.getState().listDraftThreadKeys()).toHaveLength(1);
    expect(state.generate).toHaveBeenCalledTimes(1);
    await binding.close();
  });
  it("preserves a draft that gains user content while navigation is pending", async () => {
    state.generate.mockResolvedValue({
      _tag: "Success",
      value: { summary: "Brief", truncated: false },
    });
    state.open.mockImplementationOnce(async (projectRef, options) => {
      const draftId = DraftId.make("destination");
      useComposerDraftStore.getState().setProjectDraftThreadId(projectRef, draftId, options);
      useComposerDraftStore.getState().setPrompt(draftId, "My unfinished draft");
      return { draftId, threadId: "new" };
    });
    const binding = await bind();
    await binding.run();
    expect(
      useComposerDraftStore.getState().getComposerDraft(DraftId.make("destination"))?.prompt,
    ).toBe("My unfinished draft");
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", title: "Could not prepare the new thread" }),
    );
    await binding.close();
  });
  it("coalesces the sidebar and composer actions for the same source thread", async () => {
    let finish: ((value: object) => void) | undefined;
    state.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const sidebar = await bind();
    const composer = await bind();
    const first = sidebar.run();
    const second = composer.run();
    expect(state.generate).toHaveBeenCalledTimes(1);
    finish!({ _tag: "Success", value: { summary: "One brief", truncated: false } });
    await Promise.all([first, second]);
    await sidebar.close();
    await composer.close();
  });
});
