import { ProviderInstanceId, type RuntimeMode } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  applyOmpAcpTextGenerationModelSelection,
  buildOmpAcpPurposeRuntimeOptions,
  buildOmpAcpRuntimeOptions,
  buildOmpAcpSpawnInput,
  buildOmpProcessEnvironment,
  buildOmpTextGenerationProcessEnvironment,
  OMP_APPROVAL_MODE_BY_RUNTIME_MODE,
  OMP_TEXT_GENERATION_ACP_ARGS,
  resolveOmpAgentDir,
  resolveOmpTextGenerationDir,
  resolveOmpTextGenerationRunPaths,
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
      environment: {
        PATH: "C:\\Windows\\System32",
        OPENAI_API_KEY: "selected-provider-key",
        PI_CODING_AGENT_DIR: "C:\\Users\\user\\.omp",
      },
      purpose: {
        type: "interactive",
        runtimeMode: "auto-accept-edits",
        cwd: "C:\\workspace",
        agentDir: "C:\\pulse\\userdata\\providers\\omp\\omp_work",
      },
    });

    expect(spawn).toEqual({
      command: "C:\\tools\\omp.exe",
      args: ["acp", "--approval-mode", "write"],
      cwd: "C:\\workspace",
      env: {
        PATH: "C:\\Windows\\System32",
        OPENAI_API_KEY: "selected-provider-key",
        OMP_PROFILE: "",
        PI_PROFILE: "",
        PI_CODING_AGENT_PROFILE: "",
        PI_CODING_AGENT_DIR: "C:\\pulse\\userdata\\providers\\omp\\omp_work",
      },
      forceKillAfter: "2 seconds",
    });
  });

  it("removes ambient profiles case-insensitively and forces one instance agent dir", () => {
    const environment = buildOmpProcessEnvironment(
      {
        PATH: "C:\\Windows\\System32",
        OPENAI_API_KEY: "selected-provider-key",
        OMP_PROFILE: "ambient-omp",
        omp_profile: "ambient-omp-lowercase",
        Pi_PrOfIlE: "ambient-pi-mixed-case",
        pi_coding_agent_profile: "ambient-agent-profile",
        pi_coding_agent_dir: "C:\\ambient-lowercase",
        PI_CODING_AGENT_DIR: "C:\\ambient-uppercase",
      },
      "C:\\pulse\\userdata\\providers\\omp\\omp_work",
    );

    expect(environment.PATH).toBe("C:\\Windows\\System32");
    expect(environment.OPENAI_API_KEY).toBe("selected-provider-key");
    expect(environment.OMP_PROFILE).toBe("");
    expect(environment.PI_PROFILE).toBe("");
    expect(environment.PI_CODING_AGENT_PROFILE).toBe("");
    expect(
      Object.keys(environment).filter(
        (key) =>
          ["OMP_PROFILE", "PI_PROFILE", "PI_CODING_AGENT_PROFILE"].includes(key.toUpperCase()) &&
          !["OMP_PROFILE", "PI_PROFILE", "PI_CODING_AGENT_PROFILE"].includes(key),
      ),
    ).toEqual([]);
    expect(
      Object.keys(environment).filter((key) => key.toUpperCase() === "PI_CODING_AGENT_DIR"),
    ).toEqual(["PI_CODING_AGENT_DIR"]);
    expect(environment.PI_CODING_AGENT_DIR).toBe("C:\\pulse\\userdata\\providers\\omp\\omp_work");
  });
});

describe("OMP text generation process isolation", () => {
  const path = { join: (...parts: ReadonlyArray<string>) => parts.join("/") };
  const paths = resolveOmpTextGenerationRunPaths(path, "state/providers/omp-text/run-123");

  it("builds the exact hardened ACP command in a clean run layout", () => {
    const spawn = buildOmpAcpSpawnInput({
      ompSettings: { binaryPath: "omp-test" },
      environment: { PATH: "/bin", OPENAI_API_KEY: "selected" },
      purpose: { type: "text-generation", paths },
    });

    expect(spawn.command).toBe("omp-test");
    expect(spawn.args).toEqual(OMP_TEXT_GENERATION_ACP_ARGS);
    expect(spawn.cwd).toBe(paths.cwd);
    expect(spawn.forceKillAfter).toBe("2 seconds");
  });

  it("replaces ambient state paths case-insensitively and strips Pulse internals", () => {
    const environment = buildOmpTextGenerationProcessEnvironment(
      {
        PATH: "/selected/bin",
        OPENAI_API_KEY: "selected-key",
        HTTPS_PROXY: "https://proxy.example.test",
        NODE_EXTRA_CA_CERTS: "/selected/ca.pem",
        home: "/ambient/home",
        UserProfile: "/ambient/profile",
        xdg_config_home: "/ambient/config",
        appdata: "/ambient/app-data",
        Temp: "/ambient/tmp",
        pwd: "/ambient/repository",
        OldPwd: "/ambient/previous-repository",
        init_cwd: "/ambient/npm-repository",
        omp_profile: "ambient-omp",
        Pi_PrOfIlE: "ambient-pi",
        pi_coding_agent_profile: "ambient-agent",
        pi_coding_agent_dir: "/ambient/agent",
        Pi_Coding_Agent_Session_Dir: "/ambient/sessions",
        pulse_code_internal_auth_token: "do-not-forward",
        T3CODE_HOME: "/shared/pulse-home",
        T3_MCP_BEARER_TOKEN: "do-not-forward",
        T3_SSH_AUTH_SECRET: "do-not-forward",
        claude_config_dir: "/shared/claude",
        Git_Work_Tree: "/ambient/repository",
        omp_launch_cwd: "/ambient/repository",
        OMP_WORKTREE_DIR: "/shared/omp-worktrees",
        oMp_AuTh_BrOkEr_Url: "https://broker.example.test",
        OmP_aUtH_bRoKeR_tOkEn: "do-not-forward",
        oMp_AuTh_BrOkEr_AcCoUnT_pOoL_fIlE: "/shared/account-pool.json",
        OmP_aUtH_bRoKeR_sNaPsHoT_cAcHe: "/shared/broker-snapshot.enc",
        Pi_CoNfIg_FiLeS: "/shared/omp-overlay.yml",
        pI_cOnFiG_dIr: "../../shared-omp-config",
      },
      paths,
    );

    expect(environment.PATH).toBe("/selected/bin");
    expect(environment.OPENAI_API_KEY).toBe("selected-key");
    expect(environment.HTTPS_PROXY).toBe("https://proxy.example.test");
    expect(environment.NODE_EXTRA_CA_CERTS).toBe("/selected/ca.pem");
    expect(environment.PI_CODING_AGENT_DIR).toBe(paths.agentDir);
    expect(environment.PI_CODING_AGENT_SESSION_DIR).toBe(paths.sessionDir);
    expect(environment.HOME).toBe(paths.homeDir);
    expect(environment.USERPROFILE).toBe(paths.homeDir);
    expect(environment.XDG_CONFIG_HOME).toBe(paths.configDir);
    expect(environment.APPDATA).toBe(paths.appDataDir);
    expect(environment.TEMP).toBe(paths.tempDir);
    expect(environment.PWD).toBe(paths.cwd);
    expect(environment.OLDPWD).toBe(paths.cwd);
    expect(environment.INIT_CWD).toBe(paths.cwd);
    expect(environment.OMP_PROFILE).toBe("");
    expect(environment.PI_PROFILE).toBe("");
    expect(environment.PI_CODING_AGENT_PROFILE).toBe("");
    expect(
      Object.keys(environment).filter((key) =>
        [
          "PI_CODING_AGENT_DIR",
          "PI_CODING_AGENT_SESSION_DIR",
          "HOME",
          "USERPROFILE",
          "XDG_CONFIG_HOME",
          "APPDATA",
          "TEMP",
          "OMP_PROFILE",
          "PI_PROFILE",
          "PI_CODING_AGENT_PROFILE",
          "PWD",
          "OLDPWD",
          "INIT_CWD",
        ].includes(key.toUpperCase()),
      ),
    ).toEqual([
      "OMP_PROFILE",
      "PI_PROFILE",
      "PI_CODING_AGENT_PROFILE",
      "PI_CODING_AGENT_DIR",
      "PI_CODING_AGENT_SESSION_DIR",
      "HOME",
      "USERPROFILE",
      "XDG_CONFIG_HOME",
      "APPDATA",
      "TEMP",
      "PWD",
      "OLDPWD",
      "INIT_CWD",
    ]);
    expect(environment).not.toHaveProperty("pulse_code_internal_auth_token");
    expect(environment).not.toHaveProperty("T3CODE_HOME");
    expect(environment).not.toHaveProperty("T3_MCP_BEARER_TOKEN");
    expect(environment).not.toHaveProperty("T3_SSH_AUTH_SECRET");
    expect(environment).not.toHaveProperty("claude_config_dir");
    expect(environment).not.toHaveProperty("Git_Work_Tree");
    expect(environment).not.toHaveProperty("omp_launch_cwd");
    expect(environment).not.toHaveProperty("OMP_WORKTREE_DIR");
    expect(
      Object.keys(environment).filter((key) =>
        [
          "OMP_AUTH_BROKER_URL",
          "OMP_AUTH_BROKER_TOKEN",
          "OMP_AUTH_BROKER_ACCOUNT_POOL_FILE",
          "OMP_AUTH_BROKER_SNAPSHOT_CACHE",
          "PI_CONFIG_FILES",
          "PI_CONFIG_DIR",
        ].includes(key.toUpperCase()),
      ),
    ).toEqual([]);
  });

  it("forces empty MCP servers and advertises no filesystem, terminal, or forms", () => {
    const options = buildOmpAcpPurposeRuntimeOptions({
      ompSettings: { binaryPath: "omp" },
      environment: { OPENAI_API_KEY: "selected" },
      purpose: { type: "text-generation", paths },
      clientInfo: { name: "pulse-code", version: "0.0.0" },
    });

    expect(options.cwd).toBe(paths.cwd);
    expect(options.mcpServers).toEqual([]);
    expect(options.clientCapabilities).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    });
    expect(options.clientCapabilities).not.toHaveProperty("elicitation");
  });

  it.effect("configures default mode, exact model, then reasoning as thinking", () => {
    const calls: Array<ReadonlyArray<unknown>> = [];
    return Effect.gen(function* () {
      yield* applyOmpAcpTextGenerationModelSelection({
        runtime: {
          setMode: (mode) => Effect.sync(() => calls.push(["mode", mode])).pipe(Effect.as({})),
          setModel: (model) => Effect.sync(() => calls.push(["model", model])).pipe(Effect.asVoid),
          setConfigOption: (configId, value) =>
            Effect.sync(() => calls.push(["config", configId, value])).pipe(
              Effect.as({ configOptions: [] }),
            ),
        },
        modelSelection: {
          instanceId: ProviderInstanceId.make("omp_work"),
          model: "openai/gpt-5",
          options: [{ id: "reasoning", value: "high" }],
        },
        mapError: (cause) => cause,
      });

      expect(calls).toEqual([
        ["mode", "default"],
        ["model", "openai/gpt-5"],
        ["config", "thinking", "high"],
      ]);
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

  it("keeps text generation outside the interactive OMP agent directory", () => {
    const path = { join: (...parts: ReadonlyArray<string>) => parts.join("/") };
    const instanceId = ProviderInstanceId.make("omp_work");
    expect(resolveOmpTextGenerationDir(path, "state-root", instanceId)).toBe(
      "state-root/providers/omp-text-generation/omp_work",
    );
    expect(resolveOmpTextGenerationDir(path, "state-root", instanceId)).not.toContain(
      `${resolveOmpAgentDir(path, "state-root", instanceId)}/`,
    );
  });
});
