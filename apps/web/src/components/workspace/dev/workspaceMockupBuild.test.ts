import * as NodeURL from "node:url";
import { build, type Plugin } from "vite-plus";
import { expect, it, vi } from "vite-plus/test";

it("excludes every fixture module and sample string through the real production bootstrap", async () => {
  const webRoot = NodeURL.fileURLToPath(new URL("../../../../", import.meta.url));
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
    configFile: NodeURL.fileURLToPath(new URL("../../../../vite.config.ts", import.meta.url)),
    mode: "production",
    plugins: [stubMain],
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
