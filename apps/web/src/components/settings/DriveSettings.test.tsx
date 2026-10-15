import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { DriveSettings } from "./DriveSettings";
const mocks = vi.hoisted(() => ({
  capable: true,
  operate: true,
  command: vi.fn(),
  query: vi.fn(),
  connections: [] as unknown[],
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: [{ environmentId: "remote", label: "Remote" }] }),
  usePrimaryEnvironmentId: () => "remote",
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../workspace/mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ ready: true, driveRead: mocks.capable }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: unknown) => {
    mocks.query(query);
    return { data: mocks.connections, error: null, refresh: vi.fn() };
  },
}));
vi.mock("../../state/drive", () => ({
  drive: {
    connections: (input: unknown) => input,
    upsert: {},
    startOAuth: {},
    completeOAuth: {},
    cancelOAuth: {},
    disconnect: {},
    remove: {},
  },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.command }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  squashAtomCommandFailure: () => new Error("Synthetic failure"),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.capable = true;
  mocks.operate = true;
  mocks.connections = [];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const mount = async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(<DriveSettings />);
  });
};
it("does not invoke Drive RPC queries on an older server", async () => {
  mocks.capable = false;
  await mount();
  expect(mocks.query).toHaveBeenCalledWith(null);
  expect(renderer!.root.findAllByType("form")).toHaveLength(0);
});
it("captures remote environment and clears client secret after a failed save", async () => {
  mocks.command.mockResolvedValue({ _tag: "Failure", cause: "fixture" });
  await mount();
  for (const [label, value] of [
    ["Drive connection name", "Work"],
    ["Google OAuth client ID", "fixture.apps.googleusercontent.com"],
    ["Google OAuth client secret", "synthetic-secret"],
  ])
    await act(() =>
      renderer!.root.findByProps({ "aria-label": label }).props.onChange({ target: { value } }),
    );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command).toHaveBeenCalledWith({
    environmentId: "remote",
    input: {
      nickname: "Work",
      clientId: "fixture.apps.googleusercontent.com",
      clientSecret: "synthetic-secret",
    },
  });
  expect(
    renderer!.root.findByProps({ "aria-label": "Google OAuth client secret" }).props.value,
  ).toBe("");
});
it("shows reconnect authorization and pasted return controls for an already-connected account", async () => {
  mocks.connections = [
    {
      id: "drv_00000000-0000-0000-0000-000000000001",
      nickname: "Work",
      clientId: "fixture",
      connected: true,
      clientSecretConfigured: false,
    },
  ];
  mocks.command.mockResolvedValue({
    _tag: "Success",
    value: {
      flowId: "flow",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic",
    },
  });
  await mount();
  const button = renderer!.root
    .findAllByType("button")
    .find((button) => button.props.children === "Reconnect Google")!;
  await act(() => button.props.onClick());
  expect(renderer!.root.findByType("a").props.href).toContain("accounts.google.com");
  expect(renderer!.root.findByProps({ "aria-label": "Google sign-in return URL" }).props.type).toBe(
    "password",
  );
  expect(mocks.command).toHaveBeenCalledWith({
    environmentId: "remote",
    input: { connectionId: "drv_00000000-0000-0000-0000-000000000001" },
  });
});
