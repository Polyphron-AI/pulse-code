import { test } from "node:test";
import assert from "node:assert/strict";
import { featureSuites, featureTestArgs, runFeatureSuites } from "./features.mjs";

const passed = { status: 0, stdout: JSON.stringify({ numPassedTests: 1 }) };

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
test("websocket protocol suite runs its named acceptance case", () => {
  const suite = featureSuites.find((suite) => suite.file === "apps/server/src/ws.test.ts");
  assert.ok(suite);
  const args = featureTestArgs("/fixture", suite);
  assert.equal(
    args[args.indexOf("-t") + 1],
    "accepts only the current orchestration protocol before websocket RPC setup",
  );
});
test("one failed test blocks the combined foundation result", () => {
  const report = runFeatureSuites(
    "/fixture",
    (suite) => (suite.id === "mcp-preflight" ? { status: 1 } : passed),
    () => true,
  );
  assert.equal(report.state, "blocked");
  assert.equal(report.suites[1].state, "failed");
});
test("MCP gates include the composer, admission and native readiness boundaries", () => {
  for (const id of [
    "mcp-composer-lifecycle",
    "mcp-draft-boundary",
    "mcp-provider-admission",
    "mcp-provider-configuration",
    "mcp-claude-provider-configuration",
    "mcp-opencode-provider-configuration",
    "mcp-native-readiness",
  ]) {
    assert.ok(
      featureSuites.some((suite) => suite.id === id),
      id,
    );
  }
  assert.equal(
    featureSuites.find((suite) => suite.id === "mcp-native-readiness")?.testNamePattern,
    "managed MCP preflight",
  );
});
test("timeouts and process failures cannot pass", () => {
  const report = runFeatureSuites(
    "/fixture",
    () => ({ status: null }),
    () => true,
  );
  assert.equal(report.state, "blocked");
});

test("a filter matching no tests cannot pass a feature boundary", () => {
  const report = runFeatureSuites(
    "/fixture",
    (suite) =>
      suite.id === "mcp-native-readiness"
        ? { status: 0, stdout: JSON.stringify({ numPassedTests: 0, numPendingTests: 20 }) }
        : passed,
    () => true,
  );
  assert.equal(report.state, "blocked");
  assert.equal(
    report.suites.find((suite) => suite.id === "mcp-native-readiness").state,
    "uncovered",
  );
});
test("passing foundations never certifies the release", () => {
  const report = runFeatureSuites(
    "/fixture",
    () => passed,
    () => true,
  );
  assert.equal(report.state, "foundations-passed");
  assert.equal(report.releaseEligible, false);
  assert.ok(report.remaining.includes("Packaged-app and Windows verification"));
  assert.ok(
    report.remaining.includes(
      "V2 websocket-integrated managed skills, Pulse MCP and dictation acceptance",
    ),
  );
});
