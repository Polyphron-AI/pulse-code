// @effect-diagnostics nodeBuiltinImport:off -- Normalizes native worker paths at the Electron shell boundary.
import * as NodePath from "node:path";

export function recordingAudioPath(dataDir: string, audioPath: string, platform: string): string {
  const paths = platform === "win32" ? NodePath.win32 : NodePath.posix;
  const normalized = (value: string) => {
    const resolved = paths.resolve(value);
    if (platform !== "win32") return resolved;
    if (resolved.startsWith("\\\\?\\UNC\\")) return `\\\\${resolved.slice(8)}`;
    if (resolved.startsWith("\\\\?\\")) return resolved.slice(4);
    return resolved;
  };
  const root = normalized(dataDir);
  const target = normalized(audioPath);
  const relative = paths.relative(root, target);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${paths.sep}`) ||
    paths.isAbsolute(relative) ||
    paths.extname(target).toLowerCase() !== ".wav"
  )
    throw new Error("Recording path is outside Talk storage.");
  return target;
}
