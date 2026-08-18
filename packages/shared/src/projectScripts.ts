import type { ProjectScript } from "@t3tools/contracts";

interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

export function projectScriptRuntimeEnv(
  input: ProjectScriptRuntimeEnvInput,
): Record<string, string> {
  const env: Record<string, string> = {
    PULSE_CODE_PROJECT_ROOT: input.project.cwd,
    T3CODE_PROJECT_ROOT: input.project.cwd,
  };
  if (input.worktreePath) {
    env.PULSE_CODE_WORKTREE_PATH = input.worktreePath;
    env.T3CODE_WORKTREE_PATH = input.worktreePath;
  }
  if (input.extraEnv) {
    const merged = { ...env, ...input.extraEnv };
    const projectRoot =
      input.extraEnv.PULSE_CODE_PROJECT_ROOT ?? input.extraEnv.T3CODE_PROJECT_ROOT;
    const worktreePath =
      input.extraEnv.PULSE_CODE_WORKTREE_PATH ?? input.extraEnv.T3CODE_WORKTREE_PATH;
    if (projectRoot !== undefined) {
      merged.PULSE_CODE_PROJECT_ROOT = projectRoot;
      merged.T3CODE_PROJECT_ROOT = projectRoot;
    }
    if (worktreePath !== undefined) {
      merged.PULSE_CODE_WORKTREE_PATH = worktreePath;
      merged.T3CODE_WORKTREE_PATH = worktreePath;
    }
    return merged;
  }
  return env;
}

export function setupProjectScript(scripts: readonly ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnWorktreeCreate) ?? null;
}
