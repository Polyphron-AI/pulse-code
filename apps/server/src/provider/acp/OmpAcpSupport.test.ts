import { ProviderInstanceId, type RuntimeMode } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildOmpAcpRuntimeOptions,
  buildOmpAcpSpawnInput,
  OMP_APPROVAL_MODE_BY_RUNTIME_MODE,
  resolveOmpAgentDir,
} from "./OmpAcpSupport.ts";

describe("OMP approval modes", () => {
  it.each<{ readonly runtimeMode: RuntimeMode; readonly approvalMode: string }>([
    { runtimeMode: "approval-required", approvalMode: "always-ask" },
    { runtimeMode: "auto-accept-edits", approvalMode: "write" },
    { runtimeMode: "auto", approvalMode: "always-ask" },
    { runtimeMode: "full-access", approvalMode: "yolo" },
  ])("maps $runtimeMode to $approvalMode", ({ runtimeMode, approvalMode }) => {
    expect(OMP_APPROVAL_MODE_BY_RUNTIME_MODE[runtimeMode]).toBe(approvalMode);
  });
});

describe("buildOmpAcpSpawnInput", () => {
  it("builds an isolated OMP ACP process from the selected provider environment", () => {
    const spawn = buildOmpAcpSpawnInput({
      ompSettings: { binaryPath: "C:\\tools\\omp.exe" },
      runtimeMode: "auto-accept-edits",
      cwd: "C:\\workspace",
      agentDir: "C:\\pulse\\userdata\\providers\\omp\\omp_work",
      environment: {
        PATH: "C:\\Windows\\System32",
        OPENAI_API_KEY: "selected-provider-key",
        PI_CODING_AGENT_DIR: "C:\\Users\\user\\.omp",
      },
    });

    expect(spawn).toEqual({
      command: "C:\\tools\\omp.exe",
      args: ["acp", "--approval-mode", "write"],
      cwd: "C:\\workspace",
      env: {
        PATH: "C:\\Windows\\System32",
        OPENAI_API_KEY: "selected-provider-key",
        PI_CODING_AGENT_DIR: "C:\\pulse\\userdata\\providers\\omp\\omp_work",
      },
    });
  });
});

describe("buildOmpAcpRuntimeOptions", () => {
  it("uses agent auth and advertises form elicitation without terminal auth", () => {
    const options = buildOmpAcpRuntimeOptions({
      ompSettings: { binaryPath: "omp" },
      runtimeMode: "approval-required",
      cwd: "C:\\workspace",
      agentDir: "C:\\pulse\\userdata\\providers\\omp\\omp_personal",
      environment: { ANTHROPIC_API_KEY: "selected-provider-key" },
      clientInfo: { name: "pulse-code", version: "0.0.0" },
    });

    expect(options.authMethodId).toBe("agent");
    expect(options.clientCapabilities).toEqual({ elicitation: { form: {} } });
    expect(options.clientCapabilities).not.toHaveProperty("auth");
    expect(options.spawn.args).toEqual(["acp", "--approval-mode", "always-ask"]);
  });
});

describe("resolveOmpAgentDir", () => {
  it("places each provider instance below the Pulse state directory", () => {
    const path = { join: (...parts: ReadonlyArray<string>) => parts.join("/") };
    expect(resolveOmpAgentDir(path, "state-root", ProviderInstanceId.make("omp_work"))).toBe(
      "state-root/providers/omp/omp_work",
    );
  });
});
