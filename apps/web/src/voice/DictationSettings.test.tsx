import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentId,
} from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  environments: [{ environmentId: "office", label: "Office" }] as Array<Record<string, unknown>>,
  configSource: "live" as "cache" | "live",
  supported: true,
  pending: false,
  scopes: ["orchestration:read", "orchestration:operate"] as ReadonlyArray<string>,
  read: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  setup: vi.fn(),
  resetParakeet: vi.fn(),
  parakeetReady: false,
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({
    _tag: "Success",
    value: {
      source: mocks.configSource,
      config: { pulseCapabilities: { groqDictation: mocks.supported } },
    },
    waiting: false,
  }),
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: mocks.environments, isReady: true }),
  usePrimaryEnvironmentId: () => "office",
}));
vi.mock("../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: mocks.scopes },
    isPending: mocks.pending,
  }),
}));
vi.mock("../state/server", () => ({
  serverEnvironment: { configProjection: (target: unknown) => target },
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: string) =>
    command === "read" ? mocks.read : command === "save" ? mocks.save : mocks.remove,
}));
vi.mock("./dictationSettingsState", () => ({
  readGroqApiKeyStatus: "read",
  saveGroqApiKey: "save",
  deleteGroqApiKey: "remove",
}));
vi.mock("./parakeetSetup", () => ({
  setupParakeet: mocks.setup,
  resetParakeet: mocks.resetParakeet,
  isParakeetReady: () => mocks.parakeetReady,
  isParakeetConfigured: () => mocks.parakeetReady,
}));
vi.mock("../components/ui/radio-group", () => ({
  RadioGroup: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {children}
      <button onClick={() => onValueChange("groq")}>Use Groq</button>
    </div>
  ),
  Radio: () => null,
}));
vi.mock("../components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {children}
      <button onClick={() => onValueChange("office")}>Choose Office</button>
    </div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => children,
  SelectPopup: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement> & { nativeInput?: boolean }) => {
    const { nativeInput: _, ...input } = props;
    return <input {...input} />;
  },
}));

import { DictationSettings } from "./DictationSettings";
import {
  readDictationPreferences,
  resetDictationPreferencesForTests,
  writeDictationPreferences,
} from "./dictationPreferences";

let renderer: ReactTestRenderer | undefined;
const json = () => JSON.stringify(renderer!.toJSON());
const render = async () => {
  await act(() => {
    renderer = create(<DictationSettings />);
  });
};
const click = async (text: string) => {
  const button = renderer!.root
    .findAllByType("button")
    .find((item) => item.children.join("") === text)!;
  await act(() => button.props.onClick());
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
  });
  resetDictationPreferencesForTests();
  mocks.environments = [{ environmentId: EnvironmentId.make("office"), label: "Office" }];
  mocks.configSource = "live";
  mocks.supported = true;
  mocks.pending = false;
  mocks.scopes = [AuthOrchestrationReadScope, AuthOrchestrationOperateScope];
  mocks.read.mockReset().mockResolvedValue({ _tag: "Success", value: { configured: false } });
  mocks.save.mockReset().mockResolvedValue({ _tag: "Success", value: { configured: true } });
  mocks.remove.mockReset();
  mocks.setup.mockReset();
  mocks.resetParakeet.mockReset();
  mocks.parakeetReady = false;
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("DictationSettings", () => {
  it("retains the chosen environment while the environment list is temporarily unavailable", async () => {
    await render();
    await click("Use Groq");
    await click("Choose Office");
    mocks.environments = [];
    await act(() => renderer!.update(<DictationSettings />));
    expect(readDictationPreferences().groqEnvironmentId).toBe("office");
    expect(json()).toContain("Choose the environment");
  });
  it("does not set up Parakeet merely by rendering settings", async () => {
    await render();
    expect(mocks.setup).not.toHaveBeenCalled();
    expect(json()).toContain("Set up Parakeet");
  });

  it("shows Parakeet download progress and the real setup error", async () => {
    mocks.setup.mockImplementation((_signal: AbortSignal, progress: (value: object) => void) => {
      progress({ loaded: 50, total: 100, file: "encoder.onnx" });
      return Promise.reject(new Error("CompileError: bad wasm"));
    });
    await render();
    await click("Set up Parakeet");
    expect(json()).toContain("CompileError: bad wasm");
    expect(json()).toContain("Set up Parakeet");
  });

  it("aborts and releases an in-progress setup when Settings unmounts", async () => {
    let signal!: AbortSignal;
    mocks.setup.mockImplementation((value: AbortSignal) => {
      signal = value;
      return new Promise<void>(() => undefined);
    });
    await render();
    await click("Set up Parakeet");
    await act(() => renderer?.unmount());
    renderer = undefined;
    expect(signal.aborted).toBe(true);
    expect(mocks.resetParakeet).toHaveBeenCalledOnce();
  });

  it("retains a successfully loaded model when Settings unmounts", async () => {
    mocks.setup.mockResolvedValue(undefined);
    await render();
    await click("Set up Parakeet");
    expect(json()).toContain("Parakeet is set up");
    await act(() => renderer?.unmount());
    renderer = undefined;
    expect(mocks.resetParakeet).not.toHaveBeenCalled();
  });

  it("shows the existing Parakeet readiness when Settings remounts", async () => {
    mocks.parakeetReady = true;
    await render();
    expect(json()).toContain("Parakeet is set up");
    expect(json()).toContain("Click it again to stop and transcribe.");
    expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(1);
    expect(json()).not.toContain("Set up Parakeet");
    expect(mocks.setup).not.toHaveBeenCalled();
  });

  it("can reverse an onboarding decline", async () => {
    writeDictationPreferences({ enabled: false, backend: "parakeet", groqEnvironmentId: null });
    await render();
    expect(json()).toContain("Dictation stays off");
    const checkbox = renderer!.root.findByProps({ "data-slot": "checkbox" });
    await act(() => checkbox.props.onCheckedChange(true));
    expect(readDictationPreferences().enabled).toBe(true);
    expect(json()).toContain("Set up Parakeet");
  });

  it("releases the local model when dictation is disabled", async () => {
    await render();
    const checkbox = renderer!.root.findByProps({ "data-slot": "checkbox" });
    await act(() => checkbox.props.onCheckedChange(false));
    expect(mocks.resetParakeet).toHaveBeenCalledOnce();
    expect(readDictationPreferences().enabled).toBe(false);
  });

  it("releases the local model when the backend changes to Groq", async () => {
    await render();
    await click("Use Groq");
    expect(mocks.resetParakeet).toHaveBeenCalledOnce();
    expect(readDictationPreferences().backend).toBe("groq");
  });

  it("does not call dictation endpoints without a fresh live capability", async () => {
    mocks.configSource = "cache";
    await render();
    await click("Use Groq");
    await click("Choose Office");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(json()).toContain("Waiting for current dictation support");
  });

  it("clears the ephemeral key when fresh scopes are withdrawn", async () => {
    await render();
    await click("Use Groq");
    await click("Choose Office");
    const input = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.type === "password")!;
    await act(() => input.props.onChange({ currentTarget: { value: "secret-value" } }));
    expect(
      renderer!.root.findAllByType("input").find((item) => item.props.type === "password")!.props
        .value,
    ).toBe("secret-value");
    mocks.pending = true;
    await act(() => renderer!.update(<DictationSettings />));
    mocks.pending = false;
    mocks.scopes = [AuthOrchestrationReadScope];
    await act(() => renderer!.update(<DictationSettings />));
    expect(json()).not.toContain("secret-value");
  });

  it("ignores a late key status after access changes", async () => {
    let resolve!: (value: unknown) => void;
    mocks.read.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render();
    await click("Use Groq");
    await click("Choose Office");
    mocks.scopes = [];
    await act(() => renderer!.update(<DictationSettings />));
    await act(() => resolve({ _tag: "Success", value: { configured: true } }));
    expect(json()).not.toContain("A Groq API key is configured");
  });

  it("clears the key and ignores a late save after operate access changes", async () => {
    let resolve!: (value: unknown) => void;
    mocks.save.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render();
    await click("Use Groq");
    await click("Choose Office");
    await act(() =>
      renderer!.root
        .findAllByType("input")
        .find((item) => item.props.type === "password")!
        .props.onChange({ currentTarget: { value: "secret-value" } }),
    );
    await act(() => {
      renderer!.root
        .findAllByType("button")
        .find((item) => item.children.join("") === "Save key")!
        .props.onClick();
    });
    mocks.scopes = [AuthOrchestrationReadScope];
    await act(() => renderer!.update(<DictationSettings />));
    await act(() => resolve({ _tag: "Success", value: { configured: true } }));
    expect(json()).not.toContain("secret-value");
    expect(json()).not.toContain("A Groq API key is configured");
  });
});
