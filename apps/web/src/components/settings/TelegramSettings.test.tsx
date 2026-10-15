import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { TelegramSettings } from "./TelegramSettings";

const mocks = vi.hoisted(() => ({
  capable: true,
  operate: true,
  command: vi.fn(),
  query: vi.fn(),
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
  useMailCapabilities: () => ({ ready: true, telegramRead: mocks.capable }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: unknown) => {
    mocks.query(query);
    return { data: [], error: null };
  },
}));
vi.mock("../../state/telegram", () => ({
  telegram: { connections: (input: unknown) => input, connect: {} },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.command }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  squashAtomCommandFailure: () => new Error("Fixture connection failed"),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  mocks.capable = true;
  mocks.operate = true;
  vi.unstubAllGlobals();
});
it("gates old servers without invoking the Telegram RPC family", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.capable = false;
  await act(() => {
    renderer = create(<TelegramSettings />);
  });
  expect(mocks.query).toHaveBeenCalledWith(null);
  expect(renderer?.root.findAllByType("form")).toHaveLength(0);
});
it("captures the remote environment and clears a submitted bot token on failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.command.mockResolvedValue({ _tag: "Failure", cause: "fixture" });
  await act(() => {
    renderer = create(<TelegramSettings />);
  });
  await act(() =>
    renderer!.root
      .findByType("input")
      .props.onChange({ target: { value: "1000:synthetic_secret_for_fixture" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command).toHaveBeenCalledWith({
    environmentId: "remote",
    input: { token: "1000:synthetic_secret_for_fixture" },
  });
  expect(renderer!.root.findByType("input").props.value).toBe("");
});
