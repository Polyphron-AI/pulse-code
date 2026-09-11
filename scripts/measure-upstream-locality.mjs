import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const baseline = process.argv[2] ?? "0662eb65014be8a08840f46dc5005754cf9a7767";
const git = (...args) =>
  NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();
const resolvedBaseline = git("rev-parse", "--verify", `${baseline}^{commit}`);
const paths = [
  "apps/mobile/app.config.ts",
  "apps/web/src/components/settings/providerDriverMeta.ts",
  "apps/web/src/components/chat/providerIconUtils.ts",
  "apps/web/src/components/settings/SettingsPanels.tsx",
  "apps/web/src/components/chat/ChatComposer.tsx",
];
const lines = (text) => text.trimEnd().split(/\r?\n/).length;
const measurements = paths.map((path) => {
  const before = lines(git("show", `${resolvedBaseline}:${path}`));
  const after = lines(NodeFS.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
  return { path, before, after, removedFromHotspot: before - after };
});
console.log(
  JSON.stringify(
    {
      baseline: resolvedBaseline,
      workingTreeHead: git("rev-parse", "HEAD"),
      measure:
        "Line locality only; extracted code still exists. Not a conflict-reduction percentage.",
      measurements,
      upstreamReplay: "Not measured",
      resolutionHoursSaved: null,
    },
    null,
    2,
  ),
);
