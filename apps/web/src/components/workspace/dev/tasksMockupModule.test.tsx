// @vitest-environment happy-dom
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./tasksMockupModule";
import { createWorkspaceMockupSession } from "./workspaceMockupFixtures";
it("renders production rows and confirmed completion with isolated seed data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("03");
  const module = createWorkspaceMockupModule(session);
  let renderer: ReactTestRenderer;
  try {
    await act(() => {
      renderer = create(<>{module.center}</>);
    });
    expect(module.readyRegions).toEqual(["center"]);
    expect(
      renderer!.root
        .findAllByType("button")
        .map((button) => button.props["aria-label"])
        .filter((label) => label?.startsWith("Open ")),
    ).toEqual([
      "Open Approve homepage copy",
      "Open Review October keyword plan",
      "Open Prepare product launch assets",
      "Open Publish campaign landing page",
      "Open Share weekly performance report",
    ]);
    expect(
      renderer!.root.findAllByProps({ role: "img" }).map((owner) => owner.children.join("")),
    ).toEqual(["MC", "LM", "NP", "AM", "MC"]);
    expect(
      renderer!.root
        .findAllByType("input")
        .filter((n) => n.props.type === "checkbox")
        .map((n) => n.props.checked),
    ).toEqual([false, false, false, false, true]);
    expect(renderer!.root.findAllByType("time").map((n) => n.children.join(""))).toEqual([
      "Today",
      "16 Oct",
      "16 Oct",
      "16 Oct",
      "16 Oct",
    ]);
    expect(JSON.stringify(renderer!.toJSON())).toContain("4 open · SynKEK");
    await act(async () =>
      renderer!.root
        .findByProps({ "aria-label": "Complete Approve homepage copy" })
        .props.onChange({ target: { checked: true } }),
    );
    await module.settled();
    expect(
      renderer!.root.findByProps({ "aria-label": "Reopen Approve homepage copy" }).props.checked,
    ).toBe(true);
    expect(JSON.stringify(renderer!.toJSON())).toContain("3 open · SynKEK");
    expect(session.operations).toHaveLength(1);
    await act(async () =>
      renderer!.root
        .findByProps({ "aria-label": "Reopen Approve homepage copy" })
        .props.onChange({ target: { checked: false } }),
    );
    await module.settled();
    expect(JSON.stringify(renderer!.toJSON())).toContain("4 open \u00b7 SynKEK");
    expect(session.operations).toHaveLength(2);
  } finally {
    await act(() => renderer!.unmount());
    module.dispose();
    session.dispose();
    vi.unstubAllGlobals();
  }
});
