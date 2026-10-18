// @vitest-environment happy-dom
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Atom, AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import { useMailCapabilities } from "./useMailCapabilities";
const state = vi.hoisted(() => ({
  projection: {} as {
    source: string;
    config: {
      pulseCapabilities: {
        workspaceTools: boolean;
        workspaceTasksV2?: boolean;
        workspaceProjectOverview?: boolean;
        driveProjectRoot?: boolean;
        driveExplorer?: boolean;
      };
      settings: object;
    };
  },
}));
const projections = Atom.family((_environmentId: string) =>
  Atom.make(AsyncResult.success(state.projection)),
);
vi.mock("../../../state/environments", () => ({ usePrimaryEnvironmentId: () => "primary" }));
vi.mock("../../../state/server", () => ({
  serverEnvironment: {
    configProjection: ({ environmentId }: { environmentId: string }) => projections(environmentId),
  },
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
it.each(["driveProjectRoot", "driveExplorer"] as const)(
  "revokes live %s on downgrade and refuses a later cached true snapshot",
  async (capability) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const id = EnvironmentId.make(`drive-downgrade-${capability}`);
    state.projection = {
      source: "live",
      config: { pulseCapabilities: { workspaceTools: true, [capability]: true }, settings: {} },
    };
    const registry = AtomRegistry.make();
    function View() {
      return <span>{String(useMailCapabilities(id)[capability])}</span>;
    }
    try {
      await act(() => {
        renderer = create(
          <RegistryContext value={registry}>
            <View />
          </RegistryContext>,
        );
      });
      expect(renderer!.root.findByType("span").children.join("")).toBe("true");
      await act(() =>
        registry.set(
          projections(id),
          AsyncResult.success({
            ...state.projection,
            config: { ...state.projection.config, pulseCapabilities: { workspaceTools: true } },
          }),
        ),
      );
      expect(renderer!.root.findByType("span").children.join("")).toBe("false");
      await act(() =>
        registry.set(
          projections(id),
          AsyncResult.success({ ...state.projection, source: "cached" }),
        ),
      );
      expect(renderer!.root.findByType("span").children.join("")).toBe("false");
    } finally {
      await act(() => renderer?.unmount());
      renderer = undefined;
      registry.dispose();
    }
  },
);
it.each([
  ["live", undefined, false],
  ["live", false, false],
  ["cached", true, false],
  ["live", true, true],
] as const)(
  "reads driveExplorer only from live configuration: %s %s",
  async (source, flag, expected) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.projection = {
      source,
      config: {
        pulseCapabilities: {
          workspaceTools: true,
          ...(flag === undefined ? {} : { driveExplorer: flag }),
        },
        settings: {},
      },
    };
    function View() {
      return (
        <span>
          {String(
            useMailCapabilities(EnvironmentId.make(`explorer-${source}-${String(flag)}`))
              .driveExplorer,
          )}
        </span>
      );
    }
    await act(() => {
      renderer = create(<View />);
    });
    expect(renderer!.root.findByType("span").children.join("")).toBe(String(expected));
  },
);
it.each([
  ["live", undefined, false],
  ["live", false, false],
  ["cached", true, false],
  ["live", true, true],
] as const)(
  "trusts project Drive roots only from live configuration: %s %s",
  async (source, flag, expected) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.projection = {
      source,
      config: {
        pulseCapabilities: {
          workspaceTools: true,
          ...(flag === undefined ? {} : { driveProjectRoot: flag }),
        },
        settings: {},
      },
    };
    function View() {
      return (
        <span>
          {String(
            useMailCapabilities(EnvironmentId.make(`drive-${source}-${String(flag)}`))
              .driveProjectRoot,
          )}
        </span>
      );
    }
    await act(() => {
      renderer = create(<View />);
    });
    expect(renderer!.root.findByType("span").children.join("")).toBe(String(expected));
  },
);

it.each([
  ["live", undefined, false],
  ["live", false, false],
  ["cached", true, false],
  ["live", true, true],
] as const)(
  "trusts project overview only from live config: %s %s",
  async (source, flag, expected) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.projection = {
      source,
      config: {
        pulseCapabilities: {
          workspaceTools: true,
          ...(flag === undefined ? {} : { workspaceProjectOverview: flag }),
        },
        settings: {},
      },
    };
    function View() {
      return (
        <span>
          {String(
            useMailCapabilities(EnvironmentId.make(`overview-${source}-${flag}`))
              .workspaceProjectOverview,
          )}
        </span>
      );
    }
    await act(() => {
      renderer = create(<View />);
    });
    expect(renderer!.root.findByType("span").children.join("")).toBe(String(expected));
  },
);
it("revokes project overview on environment switch and live downgrade", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.projection = {
    source: "live",
    config: {
      pulseCapabilities: { workspaceTools: true, workspaceProjectOverview: true },
      settings: {},
    },
  };
  const registry = AtomRegistry.make();
  const a = EnvironmentId.make("overview-switch-a"),
    b = EnvironmentId.make("overview-switch-b");
  const stops = [registry.mount(projections(a)), registry.mount(projections(b))];
  registry.set(projections(a), AsyncResult.success(state.projection));
  registry.set(projections(b), AsyncResult.success({ ...state.projection, source: "cached" }));
  function View({ id }: { id: EnvironmentId }) {
    return <span>{String(useMailCapabilities(id).workspaceProjectOverview)}</span>;
  }
  const render = (id: EnvironmentId) =>
    act(() => {
      const element = (
        <RegistryContext value={registry}>
          <View id={id} />
        </RegistryContext>
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  try {
    await render(a);
    expect(renderer!.root.findByType("span").children.join("")).toBe("true");
    await render(b);
    expect(renderer!.root.findByType("span").children.join("")).toBe("false");
    await render(a);
    await act(() =>
      registry.set(
        projections(a),
        AsyncResult.success({
          ...state.projection,
          config: { ...state.projection.config, pulseCapabilities: { workspaceTools: true } },
        }),
      ),
    );
    expect(renderer!.root.findByType("span").children.join("")).toBe("false");
  } finally {
    await act(() => renderer?.unmount());
    renderer = undefined;
    stops.forEach((stop) => stop());
    registry.dispose();
  }
});
