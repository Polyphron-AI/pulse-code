import type {
  Issue,
  IssueActivityEntry,
  IssueActivityResult,
  IssueAssigneeCandidate,
  IssueId,
  IssueListInput,
  IssueListResult,
  IssueReport,
  IssueReportId,
  IssueReportsResult,
  IssueReportUpdateInput,
  IssueUpdateInput,
  PulseIssueProject,
  PulseProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type PulseIssuesClientFailureReason =
  | "authentication"
  | "permission"
  | "origin-not-allowed"
  | "not-found"
  | "stale-version"
  | "invalid-response"
  | "upload-failed"
  | "unavailable"
  | "invalid-input";

export class PulseIssuesClientError extends Data.TaggedError("PulseIssuesClientError")<{
  readonly operation: string;
  readonly reason: PulseIssuesClientFailureReason;
  readonly detail: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly requiredOrigin?: string;
  readonly cause?: unknown;
}> {}

export interface PulseIssuesCredentials {
  readonly endpoint: string;
  readonly token: string;
}

/** Project discovery includes the public ingest key, which never leaves the server process. */
export interface DiscoveredPulseIssueProject extends PulseIssueProject {
  readonly ingestPublicKey: string;
}

export interface PulseCaptureMediaUpload {
  readonly kind: "screenshot" | "audio" | "video";
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface PulseCaptureInput {
  readonly endpoint: string;
  readonly ingestPublicKey: string;
  readonly origin: string;
  readonly title: string;
  readonly description: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly kind?: string;
  readonly featureArea?: string;
  readonly environment?: unknown;
  readonly consoleEntries?: ReadonlyArray<unknown>;
  readonly networkEntries?: ReadonlyArray<unknown>;
  readonly errors?: ReadonlyArray<unknown>;
  readonly breadcrumbs?: ReadonlyArray<unknown>;
  readonly pageMetadata?: unknown;
  readonly backendContext?: unknown;
  readonly media?: ReadonlyArray<PulseCaptureMediaUpload>;
}

export interface PulseCreateIssueInput extends PulseIssuesCredentials {
  readonly reportId: IssueReportId;
  readonly title: string;
  readonly description?: string;
  readonly severity?: "critical" | "high" | "medium" | "low";
  readonly labels?: ReadonlyArray<string>;
}

export interface PulseIssueListQuery extends Omit<IssueListInput, "projectId"> {
  readonly pulseProjectId?: PulseProjectId;
}

type PulseFetch = typeof globalThis.fetch;

interface PulseProjectWire {
  readonly id: string;
  readonly name?: string;
  readonly slug?: string;
  readonly apiKeyPublic?: string;
  readonly archivedAt?: string | null;
  readonly allowLoopbackOrigins?: boolean;
  readonly repoUrl?: string;
  readonly repoDefaultBranch?: string;
}

interface PulseTicketWire {
  readonly id: string;
  readonly projectId: string;
  readonly ref: string;
  readonly title: string;
  readonly description?: string;
  readonly severity?: string;
  readonly status: string;
  readonly assignedToId?: string | null;
  readonly labels?: ReadonlyArray<string> | null;
  readonly resolvedAt?: string | null;
  readonly archivedAt?: string | null;
  readonly version?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assignedTo?: { readonly id: string; readonly email: string } | null;
  readonly memberBugs?: ReadonlyArray<unknown>;
}

interface PulseBugWire {
  readonly id: string;
  readonly projectId: string;
  readonly ticketId?: string | null;
  readonly title: string;
  readonly description?: string;
  readonly severity?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly duplicateOfId?: string | null;
  readonly environmentLabel?: string;
  readonly reporterEmail?: string | null;
  readonly version?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly screenshotStatus?: string;
  readonly transcriptionStatus?: string;
  readonly transcriptionSource?: string;
  readonly transcriptionConfidence?: number | null;
  readonly labels?: ReadonlyArray<string> | null;
  readonly reporterIdentity?: unknown;
  readonly environment?: unknown;
  readonly consoleEntries?: ReadonlyArray<unknown> | null;
  readonly networkEntries?: ReadonlyArray<unknown> | null;
  readonly errors?: ReadonlyArray<unknown> | null;
  readonly breadcrumbs?: ReadonlyArray<unknown> | null;
  readonly backendContext?: unknown;
  readonly pageMetadata?: unknown;
}

interface PulseActivityWire {
  readonly id: string;
  readonly ticketId: string;
  readonly actorId?: string | null;
  readonly action: string;
  readonly field?: string | null;
  readonly payload?: unknown;
  readonly source?: string | null;
  readonly createdAt: string;
  readonly actor?: { readonly id: string; readonly email: string } | null;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

const asObject = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

const asArray = (value: unknown): ReadonlyArray<unknown> | null =>
  Array.isArray(value) ? value : null;

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.trim() === "") return {};
  return JSON.parse(text) as unknown;
};

const normalizeEndpoint = (raw: string): string => {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Pulse endpoint must use HTTP or HTTPS");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

const safeDetail = (value: unknown, fallback: string): string => {
  const object = asObject(value);
  return asString(object?.error) ?? asString(object?.message) ?? asString(object?.name) ?? fallback;
};

const statusError = (
  operation: string,
  status: number,
  body: unknown,
  origin?: string,
): PulseIssuesClientError => {
  const bodyObject = asObject(body);
  const code = asString(bodyObject?.error);
  if (status === 401) {
    return new PulseIssuesClientError({
      operation,
      reason: "authentication",
      detail: "Pulse rejected the configured personal access token.",
      retryable: false,
      status,
    });
  }
  if (status === 403 && code === "origin_not_allowed") {
    const requiredOrigin = asString(bodyObject?.origin) ?? origin;
    return new PulseIssuesClientError({
      operation,
      reason: "origin-not-allowed",
      detail: "Pulse does not allow captures from this Preview origin.",
      retryable: false,
      status,
      ...(requiredOrigin === undefined ? {} : { requiredOrigin }),
    });
  }
  if (status === 403) {
    return new PulseIssuesClientError({
      operation,
      reason: "permission",
      detail: "The Pulse token does not have permission for this operation.",
      retryable: false,
      status,
    });
  }
  if (status === 404) {
    return new PulseIssuesClientError({
      operation,
      reason: "not-found",
      detail: safeDetail(body, "The Pulse resource was not found."),
      retryable: false,
      status,
    });
  }
  if (status === 409 || status === 428) {
    return new PulseIssuesClientError({
      operation,
      reason: "stale-version",
      detail: safeDetail(body, "The Issue changed in Pulse; refresh it and retry."),
      retryable: true,
      status,
    });
  }
  if (status === 400 || status === 422) {
    return new PulseIssuesClientError({
      operation,
      reason: "invalid-input",
      detail: safeDetail(body, "Pulse rejected the request."),
      retryable: false,
      status,
    });
  }
  return new PulseIssuesClientError({
    operation,
    reason: "unavailable",
    detail:
      status >= 500
        ? "Pulse is temporarily unavailable."
        : safeDetail(body, "Pulse request failed."),
    retryable: status >= 429,
    status,
  });
};

const invalidResponse = (operation: string, detail: string, cause?: unknown) =>
  new PulseIssuesClientError({
    operation,
    reason: "invalid-response",
    detail,
    retryable: false,
    ...(cause === undefined ? {} : { cause }),
  });

const asPulseIssue = (wire: PulseTicketWire): Issue => ({
  id: wire.id as IssueId,
  pulseProjectId: wire.projectId as PulseProjectId,
  ref: wire.ref,
  title: wire.title,
  description: wire.description ?? "",
  severity: wire.severity === undefined ? "" : (wire.severity as Issue["severity"]),
  status: wire.status as Issue["status"],
  assignedToId: wire.assignedToId ?? null,
  labels: Array.isArray(wire.labels) ? [...wire.labels] : [],
  resolvedAt: wire.resolvedAt ?? null,
  archivedAt: wire.archivedAt ?? null,
  version: wire.version ?? 0,
  createdAt: wire.createdAt,
  updatedAt: wire.updatedAt,
  ...(wire.assignedTo === undefined
    ? {}
    : {
        assignedTo:
          wire.assignedTo === null
            ? null
            : { id: wire.assignedTo.id, email: wire.assignedTo.email },
      }),
  ...(wire.memberBugs === undefined ? {} : { reportCount: wire.memberBugs.length }),
});

const requireTicket = (operation: string, value: unknown): PulseTicketWire => {
  const object = asObject(value);
  const id = asString(object?.id);
  const projectId = asString(object?.projectId);
  const ref = asString(object?.ref);
  const title = asString(object?.title);
  const status = asString(object?.status);
  const createdAt = asString(object?.createdAt);
  const updatedAt = asString(object?.updatedAt);
  if (!object || !id || !projectId || !ref || !title || !status || !createdAt || !updatedAt) {
    throw invalidResponse(operation, "Pulse returned a malformed Issue.");
  }
  return object as unknown as PulseTicketWire;
};

const requireBug = (operation: string, value: unknown): PulseBugWire => {
  const object = asObject(value);
  if (
    !object ||
    !asString(object.id) ||
    !asString(object.projectId) ||
    !asString(object.title) ||
    !asString(object.createdAt) ||
    !asString(object.updatedAt)
  ) {
    throw invalidResponse(operation, "Pulse returned a malformed Report.");
  }
  return object as unknown as PulseBugWire;
};

const makeRequest =
  (fetch: PulseFetch) =>
  async (
    operation: string,
    endpoint: string,
    path: string,
    init: RequestInit,
    origin?: string,
  ): Promise<unknown> => {
    let base: string;
    try {
      base = normalizeEndpoint(endpoint);
    } catch (cause) {
      throw new PulseIssuesClientError({
        operation,
        reason: "invalid-input",
        detail: "The Pulse endpoint is not a valid HTTP(S) URL.",
        retryable: false,
        cause,
      });
    }
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, init);
    } catch (cause) {
      throw new PulseIssuesClientError({
        operation,
        reason: "unavailable",
        detail: "Pulse could not be reached.",
        retryable: true,
        cause,
      });
    }
    let body: unknown;
    try {
      body = await parseJson(response);
    } catch (cause) {
      throw invalidResponse(operation, "Pulse returned invalid JSON.", cause);
    }
    if (!response.ok) throw statusError(operation, response.status, body, origin);
    return body;
  };

const queryPath = (path: string, params: Readonly<Record<string, string | undefined>>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const query = search.toString();
  return query === "" ? path : `${path}?${query}`;
};

const authHeaders = (token: string, json = false): Readonly<Record<string, string>> => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  ...(json ? { "Content-Type": "application/json" } : {}),
});

const jsonEffect = <A>(thunk: () => Promise<A>): Effect.Effect<A, PulseIssuesClientError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      cause instanceof PulseIssuesClientError
        ? cause
        : new PulseIssuesClientError({
            operation: "request",
            reason: "invalid-response",
            detail: "Pulse response handling failed.",
            retryable: false,
            cause,
          }),
  });

export class PulseIssuesClient extends Context.Service<
  PulseIssuesClient,
  {
    readonly listProjects: (
      input: PulseIssuesCredentials,
    ) => Effect.Effect<ReadonlyArray<DiscoveredPulseIssueProject>, PulseIssuesClientError>;
    readonly listIssues: (
      input: PulseIssuesCredentials & PulseIssueListQuery,
    ) => Effect.Effect<IssueListResult, PulseIssuesClientError>;
    readonly getIssue: (
      input: PulseIssuesCredentials & { readonly issueId: IssueId },
    ) => Effect.Effect<Issue, PulseIssuesClientError>;
    readonly listReports: (
      input: PulseIssuesCredentials & {
        readonly issueId: IssueId;
        readonly pulseProjectId: PulseProjectId;
        readonly limit: number;
        readonly offset: number;
      },
    ) => Effect.Effect<IssueReportsResult, PulseIssuesClientError>;
    readonly getReport: (
      input: PulseIssuesCredentials & { readonly reportId: IssueReportId },
    ) => Effect.Effect<IssueReport, PulseIssuesClientError>;
    readonly listActivity: (
      input: PulseIssuesCredentials & {
        readonly issueId: IssueId;
        readonly limit: number;
        readonly offset: number;
      },
    ) => Effect.Effect<IssueActivityResult, PulseIssuesClientError>;
    readonly listAssignees: (
      input: PulseIssuesCredentials & { readonly pulseProjectId: PulseProjectId },
    ) => Effect.Effect<ReadonlyArray<IssueAssigneeCandidate>, PulseIssuesClientError>;
    readonly updateIssue: (
      input: PulseIssuesCredentials & Omit<IssueUpdateInput, "projectId">,
    ) => Effect.Effect<Issue, PulseIssuesClientError>;
    readonly updateReport: (
      input: PulseIssuesCredentials & Omit<IssueReportUpdateInput, "projectId">,
    ) => Effect.Effect<IssueReport, PulseIssuesClientError>;
    readonly createIssue: (
      input: PulseCreateIssueInput,
    ) => Effect.Effect<Issue, PulseIssuesClientError>;
    readonly capture: (
      input: PulseCaptureInput,
    ) => Effect.Effect<IssueReportId, PulseIssuesClientError>;
  }
>()("t3/issues/PulseIssuesClient") {}

export const makeWithFetch = (fetch: PulseFetch): PulseIssuesClient["Service"] => {
  const request = makeRequest(fetch);

  const listProjects: PulseIssuesClient["Service"]["listProjects"] = (input) =>
    jsonEffect(async () => {
      const projects: DiscoveredPulseIssueProject[] = [];
      let offset = 0;
      for (let page = 0; page < 100; page += 1) {
        const body = await request(
          "projects.list",
          input.endpoint,
          queryPath("/api/projects", { limit: "100", offset: String(offset) }),
          { method: "GET", headers: authHeaders(input.token) },
        );
        const object = asObject(body);
        const data = asArray(object?.data);
        const pagination = asObject(object?.pagination);
        const total = asNumber(pagination?.total);
        if (!data)
          throw invalidResponse("projects.list", "Pulse returned a malformed project page.");
        for (const value of data) {
          const project = asObject(value) as PulseProjectWire | null;
          if (!project?.id || !project.name || !project.slug || !project.apiKeyPublic) {
            throw invalidResponse("projects.list", "Pulse returned a malformed project.");
          }
          projects.push({
            id: project.id as PulseProjectId,
            name: project.name,
            slug: project.slug,
            archivedAt: project.archivedAt ?? null,
            allowLoopbackOrigins: project.allowLoopbackOrigins ?? false,
            ...(project.repoUrl === undefined ? {} : { repoUrl: project.repoUrl }),
            ...(project.repoDefaultBranch === undefined
              ? {}
              : { repoDefaultBranch: project.repoDefaultBranch }),
            ingestPublicKey: project.apiKeyPublic,
          });
        }
        offset += data.length;
        if (
          data.length === 0 ||
          (total !== null && offset >= total) ||
          (total === null && data.length < 100)
        ) {
          break;
        }
      }
      return projects;
    });

  const listIssues: PulseIssuesClient["Service"]["listIssues"] = (input) =>
    jsonEffect(async () => {
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const body = await request(
        "issues.list",
        input.endpoint,
        queryPath("/api/tickets", {
          projectId: input.pulseProjectId,
          status: input.status,
          severity: input.severities?.join(","),
          assignee: input.assignee,
          search: input.search,
          sort: input.sort,
          include_archived:
            input.includeArchived === undefined ? undefined : String(input.includeArchived),
          limit: String(limit),
          offset: String(offset),
        }),
        { method: "GET", headers: authHeaders(input.token) },
      );
      const object = asObject(body);
      const tickets = asArray(object?.tickets);
      const total = asNumber(object?.total);
      if (!tickets || total === null) {
        throw invalidResponse("issues.list", "Pulse returned a malformed Issue page.");
      }
      return {
        issues: tickets.map((ticket) => asPulseIssue(requireTicket("issues.list", ticket))),
        total,
        limit,
        offset,
      };
    });

  const getIssue: PulseIssuesClient["Service"]["getIssue"] = (input) =>
    jsonEffect(async () => {
      const body = await request("issues.detail", input.endpoint, `/api/tickets/${input.issueId}`, {
        method: "GET",
        headers: authHeaders(input.token),
      });
      return asPulseIssue(requireTicket("issues.detail", asObject(body)?.ticket));
    });

  const listReports: PulseIssuesClient["Service"]["listReports"] = (input) =>
    jsonEffect(async () => {
      const body = await request(
        "issues.reports",
        input.endpoint,
        queryPath(`/api/tickets/${input.issueId}/members`, {
          limit: String(input.limit),
          offset: String(input.offset),
        }),
        { method: "GET", headers: authHeaders(input.token) },
      );
      const object = asObject(body);
      const bugs = asArray(object?.bugs);
      const total = asNumber(object?.total);
      if (!bugs || total === null) {
        throw invalidResponse("issues.reports", "Pulse returned a malformed Report page.");
      }
      return {
        reports: bugs.map((value) => {
          const bug = requireBug("issues.reports", value);
          if (bug.projectId !== input.pulseProjectId) {
            throw invalidResponse(
              "issues.reports",
              "Pulse returned a Report outside the requested project.",
            );
          }
          return {
            id: bug.id as IssueReportId,
            title: bug.title,
            severity: (bug.severity ?? "") as IssueReportsResult["reports"][number]["severity"],
            status: (bug.status ?? "") as IssueReportsResult["reports"][number]["status"],
            kind: bug.kind ?? "bug",
            ...(bug.reporterEmail === undefined ? {} : { reporterEmail: bug.reporterEmail }),
            createdAt: bug.createdAt,
            errorCount: bug.errors?.length ?? 0,
            consoleCount: bug.consoleEntries?.length ?? 0,
            networkCount: bug.networkEntries?.length ?? 0,
          };
        }),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    });

  const getReport: PulseIssuesClient["Service"]["getReport"] = (input) =>
    jsonEffect(async () => {
      const body = await request(
        "issues.reportDetail",
        input.endpoint,
        `/api/bugs/${input.reportId}`,
        {
          method: "GET",
          headers: authHeaders(input.token),
        },
      );
      const object = asObject(body);
      const bug = requireBug("issues.reportDetail", object?.bug);
      return {
        id: bug.id as IssueReportId,
        pulseProjectId: bug.projectId as PulseProjectId,
        issueId:
          bug.ticketId === undefined || bug.ticketId === null ? null : (bug.ticketId as IssueId),
        title: bug.title,
        description: bug.description ?? "",
        severity: (bug.severity ?? "") as IssueReport["severity"],
        kind: bug.kind ?? "bug",
        status: (bug.status ?? "") as IssueReport["status"],
        duplicateOfId:
          bug.duplicateOfId === undefined || bug.duplicateOfId === null
            ? null
            : (bug.duplicateOfId as IssueReportId),
        environmentLabel: bug.environmentLabel ?? "",
        reporterEmail: bug.reporterEmail ?? null,
        version: bug.version ?? 0,
        createdAt: bug.createdAt,
        updatedAt: bug.updatedAt,
        screenshotStatus: bug.screenshotStatus ?? "",
        transcriptionStatus: bug.transcriptionStatus ?? "none",
        transcriptionSource: bug.transcriptionSource ?? "none",
        transcriptionConfidence: bug.transcriptionConfidence ?? null,
        labels: Array.isArray(bug.labels) ? [...bug.labels] : [],
        reporterIdentity: bug.reporterIdentity ?? null,
        environment: bug.environment ?? null,
        consoleEntries: bug.consoleEntries ?? [],
        networkEntries: bug.networkEntries ?? [],
        errors: bug.errors ?? [],
        breadcrumbs: bug.breadcrumbs ?? [],
        backendContext: bug.backendContext ?? null,
        pageMetadata: bug.pageMetadata ?? null,
        screenshotUrl: asString(object?.screenshot_url),
        annotatedScreenshotUrl: asString(object?.annotated_screenshot_url),
        audioUrl: asString(object?.audio_url),
        videoUrl: asString(object?.video_url),
      };
    });

  const listActivity: PulseIssuesClient["Service"]["listActivity"] = (input) =>
    jsonEffect(async () => {
      const body = await request(
        "issues.activity",
        input.endpoint,
        queryPath(`/api/tickets/${input.issueId}/activity`, {
          limit: String(input.limit),
          offset: String(input.offset),
        }),
        { method: "GET", headers: authHeaders(input.token) },
      );
      const object = asObject(body);
      const activity = asArray(object?.activity);
      const total = asNumber(object?.total);
      if (!activity || total === null) {
        throw invalidResponse("issues.activity", "Pulse returned malformed Issue activity.");
      }
      return {
        activity: activity.map((value) => {
          const row = asObject(value) as PulseActivityWire | null;
          if (!row?.id || !row.ticketId || !row.action || !row.createdAt) {
            throw invalidResponse("issues.activity", "Pulse returned a malformed activity row.");
          }
          if (row.ticketId !== input.issueId) {
            throw invalidResponse(
              "issues.activity",
              "Pulse returned activity outside the requested Issue.",
            );
          }
          return {
            id: row.id,
            issueId: row.ticketId as IssueId,
            actorId: row.actorId ?? null,
            action: row.action,
            field: row.field ?? null,
            payload: row.payload ?? null,
            source: row.source ?? null,
            createdAt: row.createdAt,
            ...(row.actor === undefined
              ? {}
              : {
                  actor: row.actor === null ? null : { id: row.actor.id, email: row.actor.email },
                }),
          } satisfies IssueActivityEntry;
        }),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    });

  const listAssignees: PulseIssuesClient["Service"]["listAssignees"] = (input) =>
    jsonEffect(async () => {
      const body = await request(
        "issues.assignees",
        input.endpoint,
        `/api/projects/${input.pulseProjectId}/members`,
        { method: "GET", headers: authHeaders(input.token) },
      );
      const object = asObject(body);
      const implicit = asArray(object?.implicit);
      const explicit = asArray(object?.explicit);
      if (!implicit || !explicit) {
        throw invalidResponse(
          "issues.assignees",
          "Pulse returned a malformed project member list.",
        );
      }
      return [...implicit, ...explicit].map((value) => {
        const row = asObject(value);
        const id = asString(row?.userId);
        const email = asString(row?.email);
        if (!id || !email) {
          throw invalidResponse("issues.assignees", "Pulse returned a malformed project member.");
        }
        return {
          id,
          email,
          role: asString(row?.role) ?? "member",
          pending: row?.pending === true,
          implicit: row?.implicit === true,
        } satisfies IssueAssigneeCandidate;
      });
    });

  const updateIssue: PulseIssuesClient["Service"]["updateIssue"] = (input) =>
    jsonEffect(async () => {
      const { endpoint, token, issueId, expectedVersion, ...patch } = input;
      const body = await request("issues.update", endpoint, `/api/tickets/${issueId}`, {
        method: "PATCH",
        headers: { ...authHeaders(token, true), "If-Match": String(expectedVersion) },
        body: JSON.stringify(patch),
      });
      return asPulseIssue(requireTicket("issues.update", asObject(body)?.ticket));
    });

  const updateReport: PulseIssuesClient["Service"]["updateReport"] = (input) =>
    jsonEffect(async () => {
      const { endpoint, token, reportId, expectedVersion, ...patch } = input;
      const body = await request("issues.updateReport", endpoint, `/api/bugs/${reportId}`, {
        method: "PATCH",
        headers: { ...authHeaders(token, true), "If-Match": String(expectedVersion) },
        body: JSON.stringify(patch),
      });
      const updated = requireBug("issues.updateReport", asObject(body)?.bug);
      const detail = await getReport({ endpoint, token, reportId }).pipe(Effect.runPromise);
      return { ...detail, version: updated.version ?? detail.version };
    });

  const createIssue: PulseIssuesClient["Service"]["createIssue"] = (input) =>
    jsonEffect(async () => {
      const body = await request("issues.createFromReport", input.endpoint, "/api/tickets", {
        method: "POST",
        headers: authHeaders(input.token, true),
        body: JSON.stringify({
          title: input.title,
          description: input.description ?? "",
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          labels: input.labels ?? [],
          memberBugIds: [input.reportId],
        }),
      });
      return asPulseIssue(requireTicket("issues.createFromReport", asObject(body)?.ticket));
    });

  const capture: PulseIssuesClient["Service"]["capture"] = (input) =>
    jsonEffect(async () => {
      const media = input.media ?? [];
      const byKind = new Map(media.map((item) => [item.kind, item] as const));
      const body = await request(
        "issues.capture",
        input.endpoint,
        "/api/ingest",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: input.origin,
            "X-Pulse-Project": input.ingestPublicKey,
          },
          body: JSON.stringify({
            title: input.title,
            description: input.description,
            severity: input.severity,
            kind: input.kind ?? "bug",
            feature_area: input.featureArea ?? "",
            is_synthetic: false,
            screenshot_submitted: byKind.has("screenshot"),
            audio_submitted: byKind.has("audio"),
            video_submitted: byKind.has("video"),
            environment: input.environment ?? null,
            console_entries: input.consoleEntries ?? [],
            network_entries: input.networkEntries ?? [],
            errors: input.errors ?? [],
            breadcrumbs: input.breadcrumbs ?? [],
            page_metadata: input.pageMetadata ?? null,
            backend_context: input.backendContext ?? null,
          }),
        },
        input.origin,
      );
      const object = asObject(body);
      const reportId = asString(object?.bug_id);
      if (!reportId) throw invalidResponse("issues.capture", "Pulse did not return a Report id.");

      const uploadUrls = {
        screenshot: asString(object?.screenshot_upload_url),
        audio: asString(object?.audio_upload_url),
        video: asString(object?.video_upload_url),
      } as const;
      for (const item of media) {
        const url = uploadUrls[item.kind];
        if (!url) {
          throw new PulseIssuesClientError({
            operation: "issues.capture.upload",
            reason: "upload-failed",
            detail: `Pulse did not provide a ${item.kind} upload URL.`,
            retryable: true,
          });
        }
        let uploadResponse: Response;
        try {
          uploadResponse = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": item.mimeType },
            body: item.bytes,
          });
        } catch (cause) {
          throw new PulseIssuesClientError({
            operation: "issues.capture.upload",
            reason: "upload-failed",
            detail: `The ${item.kind} upload could not be completed.`,
            retryable: true,
            cause,
          });
        }
        if (!uploadResponse.ok) {
          throw new PulseIssuesClientError({
            operation: "issues.capture.upload",
            reason: "upload-failed",
            detail: `Pulse rejected the ${item.kind} upload.`,
            retryable: true,
            status: uploadResponse.status,
          });
        }
      }

      if (media.length > 0) {
        await request(
          "issues.capture.uploadsComplete",
          input.endpoint,
          `/api/ingest/${reportId}/uploads-complete`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              Origin: input.origin,
              "X-Pulse-Project": input.ingestPublicKey,
            },
          },
          input.origin,
        );
      }
      return reportId as IssueReportId;
    });

  return {
    listProjects,
    listIssues,
    getIssue,
    listReports,
    getReport,
    listActivity,
    listAssignees,
    updateIssue,
    updateReport,
    createIssue,
    capture,
  };
};

export const make = Effect.sync(() => makeWithFetch(globalThis.fetch));

export const layer = Layer.effect(PulseIssuesClient, make);
