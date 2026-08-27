import { ProjectId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeProjectActionRequest, executeProjectAction } from "./issues.ts";

it("decodes the canonical project-action/v1 request", () => {
  assert.deepEqual(
    decodeProjectActionRequest(
      JSON.stringify({
        protocol_version: 1,
        request_id: "request-1",
        action: "bugs.list",
        params: { project: "project-1", limit: 25 },
      }),
    ),
    {
      protocol_version: 1,
      request_id: "request-1",
      action: "bugs.list",
      params: { project: "project-1", limit: 25 },
    },
  );
});

it.effect("maps bugs.list to the project Report RPC", () =>
  Effect.gen(function* () {
    const calls: Array<{ readonly projectId: ProjectId; readonly limit?: number }> = [];
    const response = yield* executeProjectAction(
      {
        protocol_version: 1,
        request_id: "request-2",
        action: "bugs.list",
        params: { project: "project-2", limit: 10 },
      },
      (input) => {
        calls.push(input);
        return Effect.succeed({
          reports: [
            {
              id: "report-1" as never,
              issueId: null,
              title: "Crash",
              severity: "high",
              status: "received",
              kind: "bug",
              createdAt: "2026-08-27T12:00:00.000Z" as never,
            },
          ],
          nextCursor: "1:2026-07-28T12:00:00.000Z",
        });
      },
    );

    assert.deepEqual(calls, [{ projectId: ProjectId.make("project-2"), limit: 10 }]);
    assert.equal(response.ok, true);
    assert.equal(response.request_id, "request-2");
    // @effect-diagnostics-next-line preferSchemaOverJson:off - Assertion inspects the exact CLI wire rendering.
    assert.include(JSON.stringify(response), '"next_cursor":"1:2026-07-28T12:00:00.000Z"');
  }),
);

it.effect("returns typed errors without invoking unsupported actions", () =>
  Effect.gen(function* () {
    let called = false;
    const response = yield* executeProjectAction(
      { protocol_version: 1, request_id: "request-3", action: "tickets.list" },
      () => {
        called = true;
        return Effect.die("unexpected call");
      },
    );

    assert.isFalse(called);
    assert.equal(response.ok, false);
    if ("error" in response) assert.equal(response.error.code, "unsupported_action");
  }),
);

it.effect("redacts RPC failures behind a typed capability error", () =>
  Effect.gen(function* () {
    const response = yield* executeProjectAction(
      {
        protocol_version: 1,
        request_id: "request-4",
        action: "bugs.list",
        params: { project: "project-4" },
      },
      () => Effect.fail({ _tag: "FixtureFailure", detail: "Bearer secret-token" }),
    );

    assert.equal(response.ok, false);
    // @effect-diagnostics-next-line preferSchemaOverJson:off - Assertion verifies the serialized boundary is redacted.
    assert.notInclude(JSON.stringify(response), "secret-token");
    if ("error" in response) assert.equal(response.error.code, "capability_unavailable");
  }),
);
