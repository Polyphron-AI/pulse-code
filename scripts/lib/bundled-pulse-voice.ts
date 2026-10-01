// @effect-diagnostics nodeBuiltinImport:off -- Packaging runs in Node before the Effect runtime is staged.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

const run = NodeUtil.promisify(NodeChildProcess.execFile);

// The pulse-voice sidecar lives in the Meetily fork; desktop builds compile
// exactly this commit. Bump it together with PULSE_VOICE_PROTOCOL changes.
const REPOSITORY = "https://github.com/Polyphron-AI/meetily.git";
export const PULSE_VOICE_REVISION = "a75a9e27ca22f525a49c076c5245edf0b811ad2a";
export const PULSE_VOICE_EXECUTABLE = "pulse-voice.exe";

async function exists(file: string): Promise<boolean> {
  return NodeFSP.stat(file).then(
    () => true,
    () => false,
  );
}

async function checkout(repoRoot: string): Promise<string> {
  const sourceDir = NodePath.join(
    repoRoot,
    ".t3",
    "build-cache",
    "pulse-voice",
    PULSE_VOICE_REVISION,
  );
  if (await exists(NodePath.join(sourceDir, "pulse-voice", "Cargo.toml"))) return sourceDir;
  await NodeFSP.rm(sourceDir, { recursive: true, force: true });
  await NodeFSP.mkdir(sourceDir, { recursive: true });
  await run("git", ["init", "--quiet"], { cwd: sourceDir });
  await run("git", ["fetch", "--quiet", "--depth", "1", REPOSITORY, PULSE_VOICE_REVISION], {
    cwd: sourceDir,
  });
  await run("git", ["checkout", "--quiet", "FETCH_HEAD"], { cwd: sourceDir });
  return sourceDir;
}

/**
 * Builds the pinned pulse-voice sidecar and copies it to
 * `<stageResourcesDir>/pulse-voice`. `sourceOverride` points at a local fork
 * checkout, which must still be at the pinned commit.
 */
export async function stageBundledPulseVoice(input: {
  readonly repoRoot: string;
  readonly stageResourcesDir: string;
  readonly sourceOverride?: string | undefined;
}): Promise<void> {
  const sourceDir = input.sourceOverride ?? (await checkout(input.repoRoot));
  const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: sourceDir });
  if (stdout.trim() !== PULSE_VOICE_REVISION) {
    throw new Error(
      `pulse-voice source at ${sourceDir} is at ${stdout.trim()}, expected ${PULSE_VOICE_REVISION}.`,
    );
  }
  const crateDir = NodePath.join(sourceDir, "pulse-voice");
  await run("cargo", ["build", "--locked", "--release"], {
    cwd: crateDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  const destinationDir = NodePath.join(input.stageResourcesDir, "pulse-voice");
  await NodeFSP.rm(destinationDir, { recursive: true, force: true });
  await NodeFSP.mkdir(destinationDir, { recursive: true });
  await NodeFSP.copyFile(
    NodePath.join(crateDir, "target", "release", PULSE_VOICE_EXECUTABLE),
    NodePath.join(destinationDir, PULSE_VOICE_EXECUTABLE),
  );
  await NodeFSP.copyFile(
    NodePath.join(crateDir, "LICENSE"),
    NodePath.join(destinationDir, "LICENSE"),
  );
}
