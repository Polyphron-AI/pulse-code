// @effect-diagnostics nodeBuiltinImport:off -- Reads bounded native-worker history files without launching audio services.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as Schema from "effect/Schema";
import { TalkDictation } from "../../../../packages/contracts/src/talk.ts";

const decodeDictation = Schema.decodeUnknownSync(TalkDictation);

export async function readDictationHistory(dataDir: string): Promise<readonly TalkDictation[]> {
  const directory = NodePath.join(dataDir, "dictation-history");
  let entries;
  try {
    entries = await NodeFSP.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    // oxlint-disable-next-line preserve-caught-error -- Do not expose local history paths through IPC.
    throw new Error("Dictation history could not be read.");
  }
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^[a-f0-9-]{36}\.json$/i.test(entry.name))
      .map(async (entry) => {
        const file = NodePath.join(directory, entry.name);
        return { file, info: await NodeFSP.stat(file) };
      }),
  );
  const records: TalkDictation[] = [];
  for (const { file, info } of files
    .sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)
    .slice(0, 100)) {
    if (info.size > 256 * 1024) continue;
    try {
      records.push(decodeDictation(JSON.parse(await NodeFSP.readFile(file, "utf8"))));
    } catch {
      /* A damaged entry must not hide other saved dictations. */
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
