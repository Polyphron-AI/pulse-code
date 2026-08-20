import { IssueId, IssueReportId, PulseProjectId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  makeWithFetch,
  PulseIssuesClientError,
  type PulseIssuesCredentials,
} from "./PulseIssuesClient.ts";

const credentials: PulseIssuesCredentials = {
  endpoint: "https://pulse.example.test/",
  token: "pat_should_never_leak",
};

const project = (index: number) => ({
  id: `project-${index}`,
  name: `Project ${index}`,
  slug: `project-${index}`,
  apiKeyPublic: `pk_live_${index}`,
  archivedAt: null,
  allowLoopbackOrigins: index % 2 === 0,
  createdAt: "2026-08-19T00:00:00Z",
  updatedAt: "2026-08-19T00:00:00Z",
});

const ticket = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "ticket-1",
  projectId: "project-1",
  ref: "T-42",
  title: "Checkout fails",
  description: "Card form freezes",
  severity: "high",
  status: "triage",
  assignedToId: null,
  labels: ["checkout"],
  resolvedAt: null,
  archivedAt: null,
  version: 3,
  createdAt: "2026-08-19T00:00:00Z",
  updatedAt: "2026-08-19T00:01:00Z",
  ...overrides,
});

const requestUrl = (input: Parameters<typeof fetch>[0]): URL =>
  new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);

describe("PulseIssuesClient", () => {
  it.effect("discovers every project page and keeps ingest secrets server-side", () => {
    const requests: Array<{ readonly url: URL; readonly init?: RequestInit }> = [];
    const fetchFn = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = requestUrl(input);
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      const offset = Number(url.searchParams.get("offset"));
      return Promise.resolve(
        Response.json({
          data:
            offset === 0
              ? Array.from({ length: 100 }, (_, index) => project(index))
              : [project(100)],
          pagination: { total: 101, limit: 100, offset },
        }),
      );
    }) as typeof fetch;

    return Effect.gen(function* () {
      const projects = yield* makeWithFetch(fetchFn).listProjects(credentials);
      assert.equal(projects.length, 101);
      assert.equal(projects[0]?.ingestPublicKey, "pk_live_0");
      assert.equal(projects[0]?.allowLoopbackOrigins, true);
      assert.deepStrictEqual(
        requests.map(({ url }) => url.searchParams.get("offset")),
        ["0", "100"],
      );
      assert.equal(
        requests[0]?.init?.headers &&
          Object.values(requests[0].init.headers).includes(credentials.token),
        false,
      );
      assert.equal(
        (requests[0]?.init?.headers as Record<string, string> | undefined)?.Authorization,
        `Bearer ${credentials.token}`,
      );
      assert.equal(
        requests.every(({ url }) => !url.toString().includes(credentials.token)),
        true,
      );
    });
  });

  it.effect("maps paged Issues and sends optimistic versions through If-Match", () => {
    const requests: Array<{ readonly url: URL; readonly init?: RequestInit }> = [];
    const fetchFn = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = requestUrl(input);
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      return Promise.resolve(
        url.pathname === "/api/tickets"
          ? Response.json({ tickets: [ticket()], total: 1 })
          : Response.json({ ticket: ticket({ status: "in_progress", version: 4 }) }),
      );
    }) as typeof fetch;
    const client = makeWithFetch(fetchFn);

    return Effect.gen(function* () {
      const page = yield* client.listIssues({
        ...credentials,
        pulseProjectId: PulseProjectId.make("project-1"),
        severities: ["high", "critical"],
        limit: 25,
        offset: 50,
      });
      assert.equal(page.issues[0]?.ref, "T-42");
      assert.equal(requests[0]?.url.searchParams.get("severity"), "high,critical");
      assert.equal(requests[0]?.url.searchParams.get("offset"), "50");

      const updated = yield* client.updateIssue({
        ...credentials,
        issueId: IssueId.make("ticket-1"),
        expectedVersion: 3,
        status: "in_progress",
      });
      assert.equal(updated.version, 4);
      assert.equal(
        (requests[1]?.init?.headers as Record<string, string> | undefined)?.["If-Match"],
        "3",
      );
      assert.equal(String(requests[1]?.init?.body), '{"status":"in_progress"}');
    });
  });

  it.effect(
    "uses the actual origin for ingest and completion without leaking the PAT to media",
    () => {
      const requests: Array<{ readonly url: URL; readonly init?: RequestInit }> = [];
      const fetchFn = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = requestUrl(input);
        requests.push({ url, ...(init === undefined ? {} : { init }) });
        if (url.pathname === "/api/ingest") {
          return Promise.resolve(
            Response.json(
              {
                bug_id: "bug-1",
                screenshot_upload_url: "https://r2.example.test/signed-screenshot",
              },
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(Response.json({ ok: true }));
      }) as typeof fetch;

      return Effect.gen(function* () {
        const reportId = yield* makeWithFetch(fetchFn).capture({
          endpoint: credentials.endpoint,
          ingestPublicKey: "pk_live_project",
          origin: "http://localhost:5173",
          title: "Broken button",
          description: "Save does nothing",
          severity: "high",
          media: [
            {
              kind: "screenshot",
              mimeType: "image/png",
              bytes: new Uint8Array([1, 2, 3]),
            },
          ],
        });

        assert.equal(reportId, IssueReportId.make("bug-1"));
        assert.deepStrictEqual(
          requests.map(({ url }) => url.pathname),
          ["/api/ingest", "/signed-screenshot", "/api/ingest/bug-1/uploads-complete"],
        );
        const ingestHeaders = requests[0]?.init?.headers as Record<string, string>;
        assert.equal(ingestHeaders.Origin, "http://localhost:5173");
        assert.equal(ingestHeaders["X-Pulse-Project"], "pk_live_project");
        assert.equal("Authorization" in ingestHeaders, false);
        const uploadHeaders = requests[1]?.init?.headers as Record<string, string>;
        assert.deepStrictEqual(uploadHeaders, { "Content-Type": "image/png" });
        const completionHeaders = requests[2]?.init?.headers as Record<string, string>;
        assert.equal(completionHeaders.Origin, "http://localhost:5173");
        assert.equal(completionHeaders["X-Pulse-Project"], "pk_live_project");
        const ingestBody = String(requests[0]?.init?.body);
        assert.equal(ingestBody.includes('"screenshot_submitted":true'), true);
        assert.equal(ingestBody.includes('"audio_submitted":false'), true);
      });
    },
  );

  it.effect("preserves authentication, origin, stale-version, and upload failures", () => {
    const responseFor = (status: number, body: unknown) =>
      makeWithFetch((() =>
        Promise.resolve(Response.json(body, { status }))) as unknown as typeof fetch);

    return Effect.gen(function* () {
      const authentication = yield* responseFor(401, { error: "invalid_token" })
        .listProjects(credentials)
        .pipe(Effect.flip);
      assert.equal(authentication.reason, "authentication");

      const origin = yield* responseFor(403, {
        error: "origin_not_allowed",
        origin: "http://localhost:3000",
      })
        .capture({
          endpoint: credentials.endpoint,
          ingestPublicKey: "pk_live_project",
          origin: "http://localhost:3000",
          title: "Broken",
          description: "Broken",
          severity: "low",
        })
        .pipe(Effect.flip);
      assert.equal(origin.reason, "origin-not-allowed");
      assert.equal(origin.requiredOrigin, "http://localhost:3000");

      const stale = yield* responseFor(409, { error: "version_conflict", current_version: 4 })
        .updateIssue({
          ...credentials,
          issueId: IssueId.make("ticket-1"),
          expectedVersion: 3,
          status: "todo",
        })
        .pipe(Effect.flip);
      assert.equal(stale.reason, "stale-version");

      const upload = yield* makeWithFetch(((input) =>
        Promise.resolve(
          requestUrl(input).pathname === "/api/ingest"
            ? Response.json({ bug_id: "bug-1" }, { status: 201 })
            : Response.json({}),
        )) as typeof fetch)
        .capture({
          endpoint: credentials.endpoint,
          ingestPublicKey: "pk_live_project",
          origin: "http://localhost:3000",
          title: "Broken",
          description: "Broken",
          severity: "low",
          media: [{ kind: "video", mimeType: "video/webm", bytes: new Uint8Array([1]) }],
        })
        .pipe(Effect.flip);
      assert.equal(upload.reason, "upload-failed");
      assert.equal(upload instanceof PulseIssuesClientError, true);
    });
  });

  it.effect("decodes report evidence, activity, and project assignees lazily", () => {
    const fetchFn = ((input: Parameters<typeof fetch>[0]) => {
      const path = requestUrl(input).pathname;
      if (path === "/api/bugs/bug-1") {
        return Promise.resolve(
          Response.json({
            bug: {
              id: "bug-1",
              projectId: "project-1",
              ticketId: "ticket-1",
              title: "Broken button",
              description: "Save does nothing",
              severity: "medium",
              kind: "bug",
              status: "acknowledged",
              version: 2,
              createdAt: "2026-08-19T00:00:00Z",
              updatedAt: "2026-08-19T00:01:00Z",
              consoleEntries: [{ level: "error" }],
              networkEntries: [],
              errors: [{ message: "boom" }],
              breadcrumbs: [],
            },
            screenshot_url: "https://r2.example.test/screenshot",
            annotated_screenshot_url: null,
            audio_url: null,
            video_url: null,
          }),
        );
      }
      if (path.endsWith("/activity")) {
        return Promise.resolve(
          Response.json({
            activity: [
              {
                id: "activity-1",
                ticketId: "ticket-1",
                actorId: null,
                action: "created",
                field: null,
                payload: null,
                source: "web",
                createdAt: "2026-08-19T00:00:00Z",
              },
            ],
            total: 1,
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          implicit: [
            {
              userId: "user-1",
              email: "owner@example.test",
              role: "owner",
              pending: false,
              implicit: true,
            },
          ],
          explicit: [],
        }),
      );
    }) as typeof fetch;
    const client = makeWithFetch(fetchFn);

    return Effect.gen(function* () {
      const report = yield* client.getReport({
        ...credentials,
        reportId: IssueReportId.make("bug-1"),
      });
      assert.equal(report.screenshotUrl, "https://r2.example.test/screenshot");
      assert.equal(report.consoleEntries.length, 1);

      const activity = yield* client.listActivity({
        ...credentials,
        issueId: IssueId.make("ticket-1"),
        limit: 20,
        offset: 0,
      });
      assert.equal(activity.activity[0]?.action, "created");

      const assignees = yield* client.listAssignees({
        ...credentials,
        pulseProjectId: PulseProjectId.make("project-1"),
      });
      assert.deepStrictEqual(assignees[0], {
        id: "user-1",
        email: "owner@example.test",
        role: "owner",
        pending: false,
        implicit: true,
      });
    });
  });

  it.effect("rejects reports and activity outside their requested container", () => {
    const fetchFn = ((input: Parameters<typeof fetch>[0]) => {
      const path = requestUrl(input).pathname;
      if (path.endsWith("/members")) {
        return Promise.resolve(
          Response.json({
            bugs: [
              {
                id: "bug-1",
                projectId: "project-2",
                title: "Foreign report",
                createdAt: "2026-08-19T00:00:00Z",
                updatedAt: "2026-08-19T00:01:00Z",
              },
            ],
            total: 1,
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          activity: [
            {
              id: "activity-1",
              ticketId: "ticket-2",
              action: "created",
              createdAt: "2026-08-19T00:00:00Z",
            },
          ],
          total: 1,
        }),
      );
    }) as typeof fetch;
    const client = makeWithFetch(fetchFn);

    return Effect.gen(function* () {
      const reportsError = yield* client
        .listReports({
          ...credentials,
          issueId: IssueId.make("ticket-1"),
          pulseProjectId: PulseProjectId.make("project-1"),
          limit: 20,
          offset: 0,
        })
        .pipe(Effect.flip);
      assert.equal(reportsError.reason, "invalid-response");

      const activityError = yield* client
        .listActivity({
          ...credentials,
          issueId: IssueId.make("ticket-1"),
          limit: 20,
          offset: 0,
        })
        .pipe(Effect.flip);
      assert.equal(activityError.reason, "invalid-response");
    });
  });
});
