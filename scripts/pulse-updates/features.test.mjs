import { test } from "node:test";
import assert from "node:assert/strict";
import { featureTestArgs, runFeatureSuites } from "./features.mjs";

test("host tests exclude prepared upstream candidate worktrees", () => {
  const args = featureTestArgs("/fixture", {
    file: "apps/server/src/skills/ManagedSkillRpc.test.ts",
  });
  assert.deepEqual(args.slice(-2), ["--exclude", "**/.t3/**"]);
});

test("missing features block without attempting a runner", () => {
  const report = runFeatureSuites(
    "/fixture",
    () => {
      throw new Error("must not run");
    },
    () => false,
  );
  assert.equal(report.state, "blocked");
  assert.ok(report.suites.every((suite) => suite.state === "missing"));
});
test("integrated websocket suite runs only its named Pulse cases", () => {
  const args = featureTestArgs("/fixture", {
    file: "apps/server/src/server.test.ts",
    testNamePattern: "managed skill",
  });
  assert.equal(args[args.indexOf("-t") + 1], "managed skill");
});
test("one failed test blocks the combined foundation result", () => {
  const report = runFeatureSuites(
    "/fixture",
    (suite) => ({ status: suite.id === "mcp-preflight" ? 1 : 0 }),
    () => true,
  );
  assert.equal(report.state, "blocked");
  assert.equal(report.suites[1].state, "failed");
});
test("timeouts and process failures cannot pass", () => {
  const report = runFeatureSuites(
    "/fixture",
    () => ({ status: null }),
    () => true,
  );
  assert.equal(report.state, "blocked");
});
test("passing foundations never certifies the release", () => {
  const report = runFeatureSuites(
    "/fixture",
    () => ({ status: 0 }),
    () => true,
  );
  assert.equal(report.state, "foundations-passed");
  assert.equal(report.releaseEligible, false);
  assert.ok(report.remaining.includes("Packaged-app and Windows verification"));
});
