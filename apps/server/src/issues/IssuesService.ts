import type {
  Issue,
  IssueActivityInput,
  IssueActivityResult,
  IssueAssigneeListInput,
  IssueAssigneeListResult,
  IssueCaptureInput,
  IssueCaptureResult,
  IssueConnectionSnapshot,
  IssueConnectionUpdateInput,
  IssueCreateFromReportInput,
  IssueDetailResult,
  IssueForThreadGetInput,
  IssueListInput,
  IssueListResult,
  IssueProjectMapping,
  IssueProjectMappingRemoveInput,
  IssueProjectMappingSetInput,
  IssueReport,
  IssueReportRef,
  IssueReportsInput,
  IssueReportsResult,
  IssueReportUpdateInput,
  IssueThreadLinkGetInput,
  IssueThreadLinkRemoveInput,
  IssueThreadLinkResult,
  IssueThreadLinkSetInput,
  IssueUpdateInput,
} from "@t3tools/contracts";
import { IssueOperationError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import { IssuesStore, type StoredIssueProjectMapping } from "./IssuesStore.ts";
import {
  PulseIssuesClient,
  PulseIssuesClientError,
  type DiscoveredPulseIssueProject,
  type PulseCaptureMediaUpload,
} from "./PulseIssuesClient.ts";

export const PULSE_ISSUES_PAT_SECRET = "pulse-issues-pat";
const MAX_CAPTURE_MEDIA_BYTES = 25_000_000;

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const issueError = (
  operation: string,
  reason: IssueOperationError["reason"],
  detail: string,
  retryable: boolean,
  cause?: unknown,
): IssueOperationError =>
  new IssueOperationError({
    operation,
    reason,
    detail,
    retryable,
    ...(cause === undefined ? {} : { cause }),
  });

const fromClientError = (error: PulseIssuesClientError): IssueOperationError =>
  new IssueOperationError({
    operation: error.operation,
    reason: error.reason,
    detail: error.detail,
    retryable: error.retryable,
    ...(error.requiredOrigin === undefined ? {} : { requiredOrigin: error.requiredOrigin }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

const internalError = (operation: string) => (cause: unknown) =>
  issueError(
    operation,
    "unavailable",
    "Pulse Code could not access the local Issues configuration.",
    true,
    cause,
  );

const publicMapping = (mapping: StoredIssueProjectMapping): IssueProjectMapping => ({
  projectId: mapping.projectId,
  pulseProjectId: mapping.pulseProjectId,
  pulseProjectName: mapping.pulseProjectName,
  pulseProjectSlug: mapping.pulseProjectSlug,
  updatedAt: mapping.updatedAt,
});

const publicProject = (project: DiscoveredPulseIssueProject) => ({
  id: project.id,
  name: project.name,
  slug: project.slug,
  archivedAt: project.archivedAt,
  allowLoopbackOrigins: project.allowLoopbackOrigins,
  ...(project.repoUrl === undefined ? {} : { repoUrl: project.repoUrl }),
  ...(project.repoDefaultBranch === undefined
    ? {}
    : { repoDefaultBranch: project.repoDefaultBranch }),
});

const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

const normalizedEndpoint = (raw: string): string => {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Pulse endpoint must use HTTP or HTTPS");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

interface ActiveConnection {
  readonly endpoint: string;
  readonly token: string;
}

export class IssuesService extends Context.Service<
  IssuesService,
  {
    readonly getConnection: () => Effect.Effect<IssueConnectionSnapshot, IssueOperationError>;
    readonly updateConnection: (
      input: IssueConnectionUpdateInput,
    ) => Effect.Effect<IssueConnectionSnapshot, IssueOperationError>;
    readonly disconnect: () => Effect.Effect<IssueConnectionSnapshot, IssueOperationError>;
    readonly setProjectMapping: (
      input: IssueProjectMappingSetInput,
    ) => Effect.Effect<IssueConnectionSnapshot, IssueOperationError>;
    readonly removeProjectMapping: (
      input: IssueProjectMappingRemoveInput,
    ) => Effect.Effect<IssueConnectionSnapshot, IssueOperationError>;
    readonly list: (input: IssueListInput) => Effect.Effect<IssueListResult, IssueOperationError>;
    readonly detail: (input: {
      readonly projectId: IssueDetailResult["mapping"]["projectId"];
      readonly issueId: Issue["id"];
    }) => Effect.Effect<IssueDetailResult, IssueOperationError>;
    readonly reports: (
      input: IssueReportsInput,
    ) => Effect.Effect<IssueReportsResult, IssueOperationError>;
    readonly reportDetail: (
      input: IssueReportRef,
    ) => Effect.Effect<IssueReport, IssueOperationError>;
    readonly activity: (
      input: IssueActivityInput,
    ) => Effect.Effect<IssueActivityResult, IssueOperationError>;
    readonly assignees: (
      input: IssueAssigneeListInput,
    ) => Effect.Effect<IssueAssigneeListResult, IssueOperationError>;
    readonly update: (input: IssueUpdateInput) => Effect.Effect<Issue, IssueOperationError>;
    readonly updateReport: (
      input: IssueReportUpdateInput,
    ) => Effect.Effect<IssueReport, IssueOperationError>;
    readonly createFromReport: (
      input: IssueCreateFromReportInput,
    ) => Effect.Effect<Issue, IssueOperationError>;
    readonly capture: (
      input: IssueCaptureInput,
    ) => Effect.Effect<IssueCaptureResult, IssueOperationError>;
    readonly getThreadLink: (
      input: IssueThreadLinkGetInput,
    ) => Effect.Effect<IssueThreadLinkResult, IssueOperationError>;
    readonly getForThread: (
      input: IssueForThreadGetInput,
    ) => Effect.Effect<IssueThreadLinkResult, IssueOperationError>;
    readonly setThreadLink: (
      input: IssueThreadLinkSetInput,
    ) => Effect.Effect<IssueThreadLinkResult, IssueOperationError>;
    readonly removeThreadLink: (
      input: IssueThreadLinkRemoveInput,
    ) => Effect.Effect<IssueThreadLinkResult, IssueOperationError>;
  }
>()("t3/issues/IssuesService") {}

export const make = Effect.gen(function* () {
  const store = yield* IssuesStore;
  const pulse = yield* PulseIssuesClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;

  const connection = (operation: string): Effect.Effect<ActiveConnection, IssueOperationError> =>
    Effect.all([store.getConnection(), secrets.get(PULSE_ISSUES_PAT_SECRET)]).pipe(
      Effect.mapError(internalError(operation)),
      Effect.flatMap(([stored, token]) => {
        if (Option.isNone(stored) || Option.isNone(token) || token.value.byteLength === 0) {
          return Effect.fail(
            issueError(
              operation,
              "not-connected",
              "Connect Pulse in Settings → Integrations before using Issues.",
              false,
            ),
          );
        }
        return Effect.succeed({ endpoint: stored.value.endpoint, token: decode(token.value) });
      }),
    );

  const mapping = (
    operation: string,
    projectId: IssueProjectMapping["projectId"],
  ): Effect.Effect<StoredIssueProjectMapping, IssueOperationError> =>
    store.getMapping(projectId).pipe(
      Effect.mapError(internalError(operation)),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              issueError(
                operation,
                "unmapped-project",
                "Map this Pulse Code project to a Pulse project in Settings → Integrations.",
                false,
              ),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const issueForMapping = (
    operation: string,
    active: ActiveConnection,
    mapped: StoredIssueProjectMapping,
    issueId: Issue["id"],
  ): Effect.Effect<Issue, IssueOperationError> =>
    pulse.getIssue({ ...active, issueId }).pipe(
      Effect.mapError(fromClientError),
      Effect.flatMap((issue) =>
        issue.pulseProjectId === mapped.pulseProjectId
          ? Effect.succeed(issue)
          : Effect.fail(
              issueError(
                operation,
                "not-found",
                "The Issue is not part of the mapped project.",
                false,
              ),
            ),
      ),
    );

  const reportForMapping = (
    operation: string,
    active: ActiveConnection,
    mapped: StoredIssueProjectMapping,
    reportId: IssueReportRef["reportId"],
  ): Effect.Effect<IssueReport, IssueOperationError> =>
    pulse.getReport({ ...active, reportId }).pipe(
      Effect.mapError(fromClientError),
      Effect.flatMap((report) =>
        report.pulseProjectId === mapped.pulseProjectId
          ? Effect.succeed(report)
          : Effect.fail(
              issueError(
                operation,
                "not-found",
                "The Report is not part of the mapped project.",
                false,
              ),
            ),
      ),
    );

  const snapshot = (
    status: IssueConnectionSnapshot["status"],
    endpoint: string | null,
    tokenConfigured: boolean,
    projects: ReadonlyArray<DiscoveredPulseIssueProject>,
    lastCheckedAt: string | null,
    error: string | null,
  ): Effect.Effect<IssueConnectionSnapshot, IssueOperationError> =>
    store.listMappings().pipe(
      Effect.mapError(internalError("issues.getConnection")),
      Effect.map((mappings) => ({
        status,
        endpoint,
        tokenConfigured,
        projects: projects.map(publicProject),
        mappings: mappings.map(publicMapping),
        lastCheckedAt,
        error,
      })),
    );

  const connectedSnapshot = (
    active: ActiveConnection,
    projects: ReadonlyArray<DiscoveredPulseIssueProject>,
    checkedAt: string,
  ) => snapshot("connected", active.endpoint, true, projects, checkedAt, null);

  const getConnection: IssuesService["Service"]["getConnection"] = () =>
    Effect.gen(function* () {
      const [stored, token] = yield* Effect.all([
        store.getConnection(),
        secrets.get(PULSE_ISSUES_PAT_SECRET),
      ]).pipe(Effect.mapError(internalError("issues.getConnection")));
      if (Option.isNone(stored) || Option.isNone(token) || token.value.byteLength === 0) {
        return yield* snapshot(
          "disconnected",
          Option.getOrNull(stored)?.endpoint ?? null,
          false,
          [],
          null,
          null,
        );
      }
      const checkedAt = yield* nowIso;
      return yield* pulse
        .listProjects({ endpoint: stored.value.endpoint, token: decode(token.value) })
        .pipe(
          Effect.flatMap((projects) =>
            connectedSnapshot(
              { endpoint: stored.value.endpoint, token: decode(token.value) },
              projects,
              checkedAt,
            ),
          ),
          Effect.catchTag("PulseIssuesClientError", (error) =>
            snapshot("error", stored.value.endpoint, true, [], checkedAt, error.detail),
          ),
        );
    });

  const updateConnection: IssuesService["Service"]["updateConnection"] = (input) =>
    Effect.gen(function* () {
      const endpoint = yield* Effect.try({
        try: () => normalizedEndpoint(input.endpoint),
        catch: (cause) =>
          issueError(
            "issues.updateConnection",
            "invalid-input",
            "The Pulse endpoint is not a valid HTTP(S) URL.",
            false,
            cause,
          ),
      });
      const active = { endpoint, token: input.token.trim() } satisfies ActiveConnection;
      const projects = yield* pulse.listProjects(active).pipe(Effect.mapError(fromClientError));
      const checkedAt = yield* nowIso;
      yield* secrets
        .set(PULSE_ISSUES_PAT_SECRET, encode(active.token))
        .pipe(Effect.mapError(internalError("issues.updateConnection")));
      yield* store
        .setConnection({ endpoint, updatedAt: checkedAt })
        .pipe(Effect.mapError(internalError("issues.updateConnection")));
      return yield* connectedSnapshot(active, projects, checkedAt);
    });

  const disconnect: IssuesService["Service"]["disconnect"] = () =>
    Effect.gen(function* () {
      yield* secrets
        .remove(PULSE_ISSUES_PAT_SECRET)
        .pipe(Effect.mapError(internalError("issues.disconnect")));
      yield* store.clearConnection().pipe(Effect.mapError(internalError("issues.disconnect")));
      return yield* snapshot("disconnected", null, false, [], null, null);
    });

  const setProjectMapping: IssuesService["Service"]["setProjectMapping"] = (input) =>
    Effect.gen(function* () {
      const active = yield* connection("issues.setProjectMapping");
      const projects = yield* pulse.listProjects(active).pipe(Effect.mapError(fromClientError));
      const selected = projects.find((project) => project.id === input.pulseProjectId);
      if (!selected) {
        return yield* Effect.fail(
          issueError(
            "issues.setProjectMapping",
            "not-found",
            "The selected Pulse project is no longer available to this token.",
            false,
          ),
        );
      }
      const updatedAt = yield* nowIso;
      yield* store
        .setMapping({
          projectId: input.projectId,
          pulseProjectId: selected.id,
          pulseProjectName: selected.name,
          pulseProjectSlug: selected.slug,
          ingestPublicKey: selected.ingestPublicKey,
          updatedAt,
        })
        .pipe(Effect.mapError(internalError("issues.setProjectMapping")));
      return yield* connectedSnapshot(active, projects, updatedAt);
    });

  const removeProjectMapping: IssuesService["Service"]["removeProjectMapping"] = (input) =>
    Effect.gen(function* () {
      yield* store
        .removeMapping(input.projectId)
        .pipe(Effect.mapError(internalError("issues.removeProjectMapping")));
      return yield* getConnection();
    });

  const fetchAllForMapping = (
    active: ActiveConnection,
    mapped: StoredIssueProjectMapping,
    input: Omit<IssueListInput, "projectId" | "limit" | "offset">,
  ): Effect.Effect<ReadonlyArray<Issue>, IssueOperationError> =>
    Effect.gen(function* () {
      const first = yield* pulse
        .listIssues({
          ...active,
          ...input,
          pulseProjectId: mapped.pulseProjectId,
          limit: 100,
          offset: 0,
        })
        .pipe(Effect.mapError(fromClientError));
      const offsets = Array.from(
        { length: Math.min(99, Math.max(0, Math.ceil(first.total / 100) - 1)) },
        (_, index) => (index + 1) * 100,
      );
      const rest = yield* Effect.forEach(
        offsets,
        (offset) =>
          pulse
            .listIssues({
              ...active,
              ...input,
              pulseProjectId: mapped.pulseProjectId,
              limit: 100,
              offset,
            })
            .pipe(Effect.mapError(fromClientError)),
        { concurrency: 3 },
      );
      const issues = [first, ...rest].flatMap((page) => page.issues);
      if (issues.some((issue) => issue.pulseProjectId !== mapped.pulseProjectId)) {
        return yield* Effect.fail(
          issueError(
            "issues.list",
            "invalid-response",
            "Pulse returned an Issue outside the requested mapped project.",
            false,
          ),
        );
      }
      return issues;
    });

  const sortIssues = (issues: ReadonlyArray<Issue>, sort: IssueListInput["sort"]): Array<Issue> => {
    const severity = { critical: 4, high: 3, medium: 2, low: 1, "": 0 } as const;
    return [...issues].sort((left, right) => {
      if (sort === "oldest") return left.createdAt.localeCompare(right.createdAt);
      if (sort === "updated") return right.updatedAt.localeCompare(left.updatedAt);
      if (sort === "severity") return severity[right.severity] - severity[left.severity];
      return right.createdAt.localeCompare(left.createdAt);
    });
  };

  const list: IssuesService["Service"]["list"] = (input) =>
    Effect.gen(function* () {
      const active = yield* connection("issues.list");
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const { projectId, limit: _limit, offset: _offset, ...filters } = input;
      const mappings = projectId
        ? [yield* mapping("issues.list", projectId)]
        : yield* store.listMappings().pipe(Effect.mapError(internalError("issues.list")));
      if (mappings.length === 0) {
        return yield* Effect.fail(
          issueError(
            "issues.list",
            "unmapped-project",
            "Map at least one Pulse Code project in Settings → Integrations.",
            false,
          ),
        );
      }
      const pages = yield* Effect.forEach(
        mappings,
        (mapped) => fetchAllForMapping(active, mapped, filters),
        { concurrency: 3 },
      );
      const issues = sortIssues(pages.flat(), input.sort);
      return { issues: issues.slice(offset, offset + limit), total: issues.length, limit, offset };
    });

  const detail: IssuesService["Service"]["detail"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.detail"),
        mapping("issues.detail", input.projectId),
      ]);
      const issue = yield* issueForMapping("issues.detail", active, mapped, input.issueId);
      return { issue, mapping: publicMapping(mapped) };
    });

  const reports: IssuesService["Service"]["reports"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.reports"),
        mapping("issues.reports", input.projectId),
      ]);
      yield* issueForMapping("issues.reports", active, mapped, input.issueId);
      return yield* pulse
        .listReports({
          ...active,
          issueId: input.issueId,
          pulseProjectId: mapped.pulseProjectId,
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
        })
        .pipe(Effect.mapError(fromClientError));
    });

  const reportDetail: IssuesService["Service"]["reportDetail"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.reportDetail"),
        mapping("issues.reportDetail", input.projectId),
      ]);
      return yield* reportForMapping("issues.reportDetail", active, mapped, input.reportId);
    });

  const activity: IssuesService["Service"]["activity"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.activity"),
        mapping("issues.activity", input.projectId),
      ]);
      yield* issueForMapping("issues.activity", active, mapped, input.issueId);
      return yield* pulse
        .listActivity({
          ...active,
          issueId: input.issueId,
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
        })
        .pipe(Effect.mapError(fromClientError));
    });

  const assignees: IssuesService["Service"]["assignees"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.assignees"),
        mapping("issues.assignees", input.projectId),
      ]);
      const candidates = yield* pulse
        .listAssignees({ ...active, pulseProjectId: mapped.pulseProjectId })
        .pipe(Effect.mapError(fromClientError));
      return { assignees: candidates };
    });

  const update: IssuesService["Service"]["update"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.update"),
        mapping("issues.update", input.projectId),
      ]);
      yield* issueForMapping("issues.update", active, mapped, input.issueId);
      const { projectId: _projectId, ...request } = input;
      const updated = yield* pulse
        .updateIssue({ ...active, ...request })
        .pipe(Effect.mapError(fromClientError));
      if (updated.pulseProjectId !== mapped.pulseProjectId) {
        return yield* Effect.fail(
          issueError(
            "issues.update",
            "invalid-response",
            "Pulse returned an Issue outside the mapped project.",
            false,
          ),
        );
      }
      return updated;
    });

  const updateReport: IssuesService["Service"]["updateReport"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.updateReport"),
        mapping("issues.updateReport", input.projectId),
      ]);
      yield* reportForMapping("issues.updateReport", active, mapped, input.reportId);
      const { projectId: _projectId, ...request } = input;
      const report = yield* pulse
        .updateReport({ ...active, ...request })
        .pipe(Effect.mapError(fromClientError));
      if (report.pulseProjectId !== mapped.pulseProjectId) {
        return yield* Effect.fail(
          issueError(
            "issues.updateReport",
            "not-found",
            "The Report is not part of the mapped project.",
            false,
          ),
        );
      }
      return report;
    });

  const createFromReport: IssuesService["Service"]["createFromReport"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.createFromReport"),
        mapping("issues.createFromReport", input.projectId),
      ]);
      yield* reportForMapping("issues.createFromReport", active, mapped, input.reportId);
      const issue = yield* pulse
        .createIssue({
          ...active,
          reportId: input.reportId,
          title: input.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          ...(input.labels === undefined ? {} : { labels: input.labels }),
        })
        .pipe(Effect.mapError(fromClientError));
      if (issue.pulseProjectId !== mapped.pulseProjectId) {
        return yield* Effect.fail(
          issueError(
            "issues.createFromReport",
            "invalid-response",
            "Pulse created an Issue outside the mapped project.",
            false,
          ),
        );
      }
      return issue;
    });

  const mediaUpload = (
    input: NonNullable<IssueCaptureInput["media"]>[number],
  ): Effect.Effect<PulseCaptureMediaUpload, IssueOperationError> => {
    if (input.source === "data-url") {
      return Effect.try({
        try: () => {
          const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl);
          if (!match?.[1] || match[1].toLowerCase() !== input.mimeType.toLowerCase() || !match[2]) {
            throw new Error("Capture media must be a matching base64 data URL.");
          }
          const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
          if (bytes.byteLength > MAX_CAPTURE_MEDIA_BYTES) {
            throw new Error("Capture media exceeds the 25 MB limit.");
          }
          return { kind: input.kind, mimeType: input.mimeType, bytes };
        },
        catch: (cause) =>
          issueError(
            "issues.capture",
            "invalid-input",
            cause instanceof Error ? cause.message : "Capture media is invalid.",
            false,
            cause,
          ),
      });
    }
    return Effect.gen(function* () {
      const artifactDirectory = yield* fileSystem
        .realPath(path.join(config.stateDir, "browser-artifacts"))
        .pipe(Effect.mapError(internalError("issues.capture")));
      const artifactPath = yield* fileSystem
        .realPath(path.resolve(input.artifactPath))
        .pipe(Effect.mapError(internalError("issues.capture")));
      const relative = path.relative(artifactDirectory, artifactPath);
      if (
        relative === "" ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        return yield* Effect.fail(
          issueError(
            "issues.capture",
            "invalid-input",
            "The selected file is not a Pulse Code Preview artifact.",
            false,
          ),
        );
      }
      const bytes = yield* fileSystem
        .readFile(artifactPath)
        .pipe(Effect.mapError(internalError("issues.capture")));
      if (bytes.byteLength > MAX_CAPTURE_MEDIA_BYTES) {
        return yield* Effect.fail(
          issueError(
            "issues.capture",
            "invalid-input",
            "Capture media exceeds the 25 MB limit.",
            false,
          ),
        );
      }
      return { kind: input.kind, mimeType: input.mimeType, bytes };
    });
  };

  const capture: IssuesService["Service"]["capture"] = (input) =>
    Effect.gen(function* () {
      const [active, mapped] = yield* Effect.all([
        connection("issues.capture"),
        mapping("issues.capture", input.projectId),
      ]);
      const media = yield* Effect.forEach(input.media ?? [], mediaUpload, { concurrency: 3 });
      const pageMetadata =
        input.pageUrl === undefined && input.pageTitle === undefined
          ? input.pageMetadata
          : {
              ...(typeof input.pageMetadata === "object" && input.pageMetadata !== null
                ? input.pageMetadata
                : {}),
              ...(input.pageUrl === undefined ? {} : { url: input.pageUrl }),
              ...(input.pageTitle === undefined ? {} : { title: input.pageTitle }),
            };
      const reportId = yield* pulse
        .capture({
          endpoint: active.endpoint,
          ingestPublicKey: mapped.ingestPublicKey,
          origin: input.origin,
          title: input.title,
          description: input.description,
          severity: input.severity,
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          ...(input.featureArea === undefined ? {} : { featureArea: input.featureArea }),
          ...(input.environment === undefined ? {} : { environment: input.environment }),
          ...(input.consoleEntries === undefined ? {} : { consoleEntries: input.consoleEntries }),
          ...(input.networkEntries === undefined ? {} : { networkEntries: input.networkEntries }),
          ...(input.errors === undefined ? {} : { errors: input.errors }),
          ...(input.breadcrumbs === undefined ? {} : { breadcrumbs: input.breadcrumbs }),
          ...(pageMetadata === undefined ? {} : { pageMetadata }),
          ...(input.backendContext === undefined ? {} : { backendContext: input.backendContext }),
          media,
        })
        .pipe(Effect.mapError(fromClientError));
      const issue = yield* pulse
        .createIssue({
          ...active,
          reportId,
          title: input.title,
          description: input.description,
          severity: input.severity,
          ...(input.labels === undefined ? {} : { labels: input.labels }),
        })
        .pipe(Effect.mapError(fromClientError));
      if (issue.pulseProjectId !== mapped.pulseProjectId) {
        return yield* Effect.fail(
          issueError(
            "issues.capture",
            "invalid-response",
            "Pulse created an Issue outside the mapped project.",
            false,
          ),
        );
      }
      return { reportId, issue };
    });

  const getThreadLink: IssuesService["Service"]["getThreadLink"] = (input) =>
    store.getLinkForIssue(input).pipe(
      Effect.mapError(internalError("issues.getThreadLink")),
      Effect.map((link) => ({ link: Option.getOrNull(link) })),
    );

  const getForThread: IssuesService["Service"]["getForThread"] = (input) =>
    store.getLinkForThread(input.threadId).pipe(
      Effect.mapError(internalError("issues.getForThread")),
      Effect.map((link) => ({ link: Option.getOrNull(link) })),
    );

  const setThreadLink: IssuesService["Service"]["setThreadLink"] = (input) =>
    Effect.gen(function* () {
      const [, mapped] = yield* Effect.all([
        detail({ projectId: input.projectId, issueId: input.issueId }),
        mapping("issues.setThreadLink", input.projectId),
      ]);
      const now = yield* nowIso;
      const link = yield* store
        .setLink({
          projectId: input.projectId,
          pulseProjectId: mapped.pulseProjectId,
          issueId: input.issueId,
          threadId: input.threadId,
          now,
        })
        .pipe(Effect.mapError(internalError("issues.setThreadLink")));
      return { link };
    });

  const removeThreadLink: IssuesService["Service"]["removeThreadLink"] = (input) =>
    store
      .removeLinkForIssue(input)
      .pipe(Effect.mapError(internalError("issues.removeThreadLink")), Effect.as({ link: null }));

  return {
    getConnection,
    updateConnection,
    disconnect,
    setProjectMapping,
    removeProjectMapping,
    list,
    detail,
    reports,
    reportDetail,
    activity,
    assignees,
    update,
    updateReport,
    createFromReport,
    capture,
    getThreadLink,
    getForThread,
    setThreadLink,
    removeThreadLink,
  } satisfies IssuesService["Service"];
});

export const layer = Layer.effect(IssuesService, make);
