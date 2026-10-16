// @effect-diagnostics nodeBuiltinImport:off - scans production source files and builds an inert bootstrap.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import react from "@vitejs/plugin-react";
import { build, type Plugin } from "vite-plus";
import { expect, it, vi } from "vite-plus/test";

const webRoot = NodeURL.fileURLToPath(new URL("../../../../", import.meta.url));
const sourceRoot = NodePath.join(webRoot, "src");
const fixtureRoot = NodePath.join(sourceRoot, "components/workspace/dev");

function fixtureImports(file: string, source: string) {
  const imports = [
    ...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)(["'])([^"']+)\1/g),
  ];
  return imports
    .map((match) => match[2]!)
    .filter((fileName) => {
      if (file === "bootstrap.ts" && fileName === "./components/workspace/dev/workspaceMockupEntry")
        return false;
      const resolved = NodePath.resolve(sourceRoot, NodePath.dirname(file), fileName);
      return (
        resolved.startsWith(`${fixtureRoot}${NodePath.sep}`) ||
        /workspace\/dev\/|\/dev\/workspaceMockup|MockupModule/.test(fileName)
      );
    });
}

it.each([
  'import { seed } from "./dev/workspaceMockupFixtures";',
  'export { seed } from "./dev/workspaceMockupFixtures";',
  'void import("./dev/workspaceMockupEntry");',
  'import type { WorkspaceMockupSession } from "./dev/workspaceMockupFixtures";',
  'import { createWorkspaceMockupModule } from "./dev/notesMockupModule";',
  'import { helper } from "./dev/otherHelper";',
])("detects a production fixture import: %s", (source) => {
  expect(fixtureImports("components/workspace/ProductionView.tsx", source)).toHaveLength(1);
});

it("keeps non-dev web sources from importing the fixture directory", async () => {
  const files = (await NodeFSP.readdir(sourceRoot, { recursive: true })).filter((file) => {
    const normalized = file.replaceAll("\\", "/");
    return (
      /\.tsx?$/.test(normalized) &&
      !/\.(?:test|spec)\.tsx?$|(?:^|\/)__tests__\//.test(normalized) &&
      !normalized.startsWith("components/workspace/dev/")
    );
  });
  expect(files.length).toBeGreaterThan(0);
  const leaks = await Promise.all(
    files.map(async (file) => {
      const source = await NodeFSP.readFile(NodePath.join(sourceRoot, file), "utf8");
      return fixtureImports(file.replaceAll("\\", "/"), source).map(
        (fileName) => `${file}: ${fileName}`,
      );
    }),
  );
  expect(leaks.flat()).toEqual([]);
});

it("excludes every fixture module and sample string through the real production bootstrap", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const bootstrap = NodeURL.fileURLToPath(
    new URL("../../../../src/bootstrap.ts", import.meta.url),
  ).replaceAll("\\", "/");
  let mainStubbed = false;
  const stubMain: Plugin = {
    name: "workspace-mockup-production-main-only",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "./main" && importer?.replaceAll("\\", "/") === bootstrap) {
        mainStubbed = true;
        return "\0workspace-mockup-inert-main";
      }
    },
    load(id) {
      if (id === "\0workspace-mockup-inert-main")
        return "export const startup = Promise.resolve();";
    },
  };
  const result = await build({
    root: webRoot,
    configFile: false,
    envDir: false,
    mode: "production",
    plugins: [react(), stubMain],
    build: { write: false },
  }).finally(() => vi.unstubAllEnvs());
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) =>
    "output" in output ? output.output : [],
  );
  const chunks = outputs.filter((output) => output.type === "chunk");
  expect(mainStubbed).toBe(true);
  expect(chunks.length).toBeGreaterThan(0);
  let modules = 0;
  for (const chunk of chunks) {
    for (const id of Object.keys(chunk.modules)) {
      modules += 1;
      expect(id.replaceAll("\\", "/")).not.toMatch(/\/dev\/|\.fixtures\./);
    }
    expect(chunk.code).not.toContain("synkek.invalid");
    expect(chunk.code).not.toContain("Design preview · sample data");
  }
  expect(modules).toBeGreaterThan(0);
}, 120_000);
