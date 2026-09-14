import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  ready: false,
  configured: false,
  setup: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  setDraftIdentity: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("../state/environments", () => ({ useEnvironments: () => ({ environments: [] }) }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("./parakeetSetup", () => ({
  getParakeetTranscriber: () => ({ transcribe: vi.fn() }),
  isParakeetConfigured: () => mocks.configured,
  isParakeetReady: () => mocks.ready,
  setupParakeet: mocks.setup,
  subscribeParakeetSetup: () => () => undefined,
}));
vi.mock("./mediaRecorderCapture", () => ({ MediaRecorderCapture: class {} }));
vi.mock("./pulseDictation", () => ({
  PulseDictationController: class {
    state = { phase: "idle" as const };
    getSnapshot = () => this.state;
    subscribe = () => () => undefined;
    setDraftIdentity = mocks.setDraftIdentity;
    start = mocks.start;
    stop = vi.fn();
    cancel = mocks.cancel;
  },
}));

import { useComposerDictation } from "./useComposerDictation";
import {
  readDictationPreferences,
  resetDictationPreferencesForTests,
  writeDictationPreferences,
} from "./dictationPreferences";

let renderer: ReactTestRenderer | undefined;
let start!: () => void;
let disabledReason!: string | null;
function Harness() {
  const dictation = useComposerDictation({ draftIdentity: "draft:voice", deliver: vi.fn() });
  start = dictation.start;
  disabledReason = dictation.disabledReason;
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
  });
  resetDictationPreferencesForTests();
  mocks.navigate.mockReset();
  mocks.start.mockReset();
  mocks.cancel.mockReset();
  mocks.setDraftIdentity.mockReset();
  mocks.ready = false;
  mocks.configured = false;
  mocks.setup.mockReset();
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("useComposerDictation", () => {
  it("opens Parakeet settings before capture when the local model is not ready", async () => {
    await act(() => {
      renderer = create(<Harness />);
    });
    await act(async () => {
      start();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings/integrations",
      hash: "dictation",
    });
    expect(disabledReason).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("starts local capture normally when Parakeet is ready", async () => {
    await act(() => {
      renderer = create(<Harness />);
    });
    mocks.ready = true;
    await act(() => start());
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "parakeet", draftIdentity: "draft:voice" }),
    );
  });

  it("reloads a configured Parakeet model before starting capture", async () => {
    mocks.configured = true;
    mocks.setup.mockResolvedValue(undefined);
    await act(() => {
      renderer = create(<Harness />);
    });
    await act(async () => {
      start();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.setup).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "parakeet", draftIdentity: "draft:voice" }),
    );
  });

  it("opens settings without changing preferences when dictation is disabled", async () => {
    const preferences = { enabled: false, backend: "parakeet" as const, groqEnvironmentId: null };
    writeDictationPreferences(preferences);
    await act(() => {
      renderer = create(<Harness />);
    });
    await act(() => start());
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings/integrations",
      hash: "dictation",
    });
    expect(disabledReason).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(readDictationPreferences()).toEqual(preferences);
  });

  it("opens settings before capture when the selected Groq environment is unavailable", async () => {
    writeDictationPreferences({
      enabled: true,
      backend: "groq",
      groqEnvironmentId: EnvironmentId.make("missing-environment"),
    });
    await act(() => {
      renderer = create(<Harness />);
    });
    await act(() => start());
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings/integrations",
      hash: "dictation",
    });
    expect(disabledReason).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(readDictationPreferences()).toEqual({
      enabled: true,
      backend: "groq",
      groqEnvironmentId: "missing-environment",
    });
  });
});
