// @vitest-environment happy-dom
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import { EnvironmentId } from "@t3tools/contracts";
import { useMailCapabilities } from "./useMailCapabilities";
const state = vi.hoisted(() => ({
  projection: {} as {
    source: string;
    config: {
      pulseCapabilities: { workspaceTools: boolean; workspaceTasksV2?: boolean };
      settings: object;
    };
  },
}));
vi.mock("../../../state/environments", () => ({ usePrimaryEnvironmentId: () => "primary" }));
vi.mock("../../../state/server", () => ({
  serverEnvironment: { configProjection: () => Atom.make(AsyncResult.success(state.projection)) },
}));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
it.each([
  ["live", undefined, false],
  ["live", false, false],
  ["cached", true, false],
  ["live", true, true],
] as const)(
  "reads workspaceTasksV2 only from live configuration: %s %s",
  async (source, flag, expected) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.projection = {
      source,
      config: {
        pulseCapabilities: {
          workspaceTools: true,
          ...(flag === undefined ? {} : { workspaceTasksV2: flag }),
        },
        settings: {},
      },
    };
    function View() {
      const value = useMailCapabilities(
        EnvironmentId.make(`${source}-${String(flag)}`),
      ).workspaceTasksV2;
      return <span>{String(value)}</span>;
    }
    await act(() => {
      renderer = create(<View />);
    });
    expect(renderer!.root.findByType("span").children.join("")).toBe(String(expected));
  },
);
