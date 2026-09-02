#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

export interface UpstreamReleaseSource {
  readonly id: "omp" | "orca";
  readonly displayName: string;
  readonly integrationMode: "provider" | "reference";
  readonly upstreamRepository: string;
  readonly forkRepository: string;
  readonly observedTag: string;
  readonly observedAt: string;
  readonly reviewedTag: string | null;
}

export interface LatestRelease {
  readonly tag: string;
  readonly publishedAt: string;
  readonly url: string;
}

export interface ForkMetadata {
  readonly fork: boolean;
  readonly parentRepository: string | null;
}

export interface UpstreamReleaseCheck {
  readonly id: UpstreamReleaseSource["id"];
  readonly displayName: string;
  readonly integrationMode: UpstreamReleaseSource["integrationMode"];
  readonly upstreamRepository: string;
  readonly forkRepository: string;
  readonly observedTag: string;
  readonly latestTag: string;
  readonly publishedAt: string;
  readonly releaseUrl: string;
  readonly releaseState: "current" | "update-available";
  readonly forkState: "linked" | "mismatch";
  readonly compatibilityState: "reviewed" | "unreviewed";
}

export type UpstreamReleaseCheckResult =
  | { readonly ok: true; readonly check: UpstreamReleaseCheck }
  | {
      readonly ok: false;
      readonly id: UpstreamReleaseSource["id"];
      readonly displayName: string;
      readonly message: string;
    };

const GitHubLatestReleaseResponse = Schema.Struct({
  tag_name: Schema.NonEmptyString,
  published_at: Schema.NonEmptyString,
  html_url: Schema.NonEmptyString,
});

const GitHubForkResponse = Schema.Struct({
  fork: Schema.Boolean,
  parent: Schema.optionalKey(
    Schema.Struct({
      full_name: Schema.NonEmptyString,
    }),
  ),
});

const GitHubToken = Config.option(Config.redacted("GITHUB_TOKEN"));
const encodeUnknownJson = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const decodeGitHubLatestReleaseSync = Schema.decodeUnknownSync(GitHubLatestReleaseResponse);
const decodeGitHubLatestReleaseEffect = Schema.decodeUnknownEffect(GitHubLatestReleaseResponse);
const decodeGitHubForkSync = Schema.decodeUnknownSync(GitHubForkResponse);
const decodeGitHubForkEffect = Schema.decodeUnknownEffect(GitHubForkResponse);

export class GitHubReleaseRequestError extends Schema.TaggedErrorClass<GitHubReleaseRequestError>()(
  "GitHubReleaseRequestError",
  {
    repository: Schema.String,
    path: Schema.String,
    status: Schema.optional(Schema.Int),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return this.status === undefined
      ? `GitHub request for ${this.repository}${this.path} failed.`
      : `GitHub request for ${this.repository}${this.path} returned HTTP ${this.status}.`;
  }
}

export class GitHubReleaseDecodeError extends Schema.TaggedErrorClass<GitHubReleaseDecodeError>()(
  "GitHubReleaseDecodeError",
  {
    repository: Schema.String,
    responseKind: Schema.Literals(["latest-release", "fork"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `GitHub ${this.responseKind} response for ${this.repository} is invalid.`;
  }
}

export class UpstreamReleaseChangeDetectedError extends Schema.TaggedErrorClass<UpstreamReleaseChangeDetectedError>()(
  "UpstreamReleaseChangeDetectedError",
  {
    changedSourceCount: Schema.Int,
  },
) {
  override get message(): string {
    const sourceLabel = this.changedSourceCount === 1 ? "source check" : "source checks";
    const verb = this.changedSourceCount === 1 ? "requires" : "require";
    return `${this.changedSourceCount} upstream release ${sourceLabel} ${verb} review.`;
  }
}

export const upstreamReleaseSources: ReadonlyArray<UpstreamReleaseSource> = [
  {
    id: "omp",
    displayName: "Oh My Pi",
    integrationMode: "provider",
    upstreamRepository: "can1357/oh-my-pi",
    forkRepository: "Polyphron-AI/oh-my-pi",
    observedTag: "v18.1.3",
    observedAt: "2026-09-02",
    reviewedTag: null,
  },
  {
    id: "orca",
    displayName: "Orca",
    integrationMode: "reference",
    upstreamRepository: "stablyai/orca",
    forkRepository: "Polyphron-AI/orca",
    observedTag: "v1.4.195",
    observedAt: "2026-09-02",
    reviewedTag: null,
  },
];

export function decodeLatestRelease(value: unknown): LatestRelease {
  let decoded: typeof GitHubLatestReleaseResponse.Type;
  try {
    decoded = decodeGitHubLatestReleaseSync(value);
  } catch {
    throw new Error("GitHub latest-release response is missing required fields.");
  }

  return {
    tag: decoded.tag_name,
    publishedAt: decoded.published_at,
    url: decoded.html_url,
  };
}

export function decodeForkMetadata(value: unknown): ForkMetadata {
  let decoded: typeof GitHubForkResponse.Type;
  try {
    decoded = decodeGitHubForkSync(value);
  } catch {
    throw new Error("GitHub fork response is missing required fields.");
  }

  return {
    fork: decoded.fork,
    parentRepository: decoded.parent?.full_name ?? null,
  };
}

export function resolveReleaseCheck(
  source: UpstreamReleaseSource,
  release: LatestRelease,
  fork: ForkMetadata,
): UpstreamReleaseCheck {
  const forkIsLinked =
    fork.fork && fork.parentRepository?.toLowerCase() === source.upstreamRepository.toLowerCase();

  return {
    id: source.id,
    displayName: source.displayName,
    integrationMode: source.integrationMode,
    upstreamRepository: source.upstreamRepository,
    forkRepository: source.forkRepository,
    observedTag: source.observedTag,
    latestTag: release.tag,
    publishedAt: release.publishedAt,
    releaseUrl: release.url,
    releaseState: release.tag === source.observedTag ? "current" : "update-available",
    forkState: forkIsLinked ? "linked" : "mismatch",
    compatibilityState: source.reviewedTag === release.tag ? "reviewed" : "unreviewed",
  };
}

const fetchGitHubJson = Effect.fn("fetchGitHubJson")(function* (
  repository: string,
  path: string,
  token: string | undefined,
) {
  const client = yield* HttpClient.HttpClient;
  let request = HttpClientRequest.get(`https://api.github.com/repos/${repository}${path}`).pipe(
    HttpClientRequest.acceptJson,
    HttpClientRequest.setHeader("X-GitHub-Api-Version", "2022-11-28"),
    HttpClientRequest.setHeader("User-Agent", "pulse-code-upstream-release-check"),
  );
  if (token) {
    request = request.pipe(HttpClientRequest.bearerToken(token));
  }

  const response = yield* client.execute(request).pipe(
    Effect.mapError(
      (cause) =>
        new GitHubReleaseRequestError({
          repository,
          path,
          cause,
        }),
    ),
  );
  const success = yield* HttpClientResponse.filterStatusOk(response).pipe(
    Effect.mapError(
      (cause) =>
        new GitHubReleaseRequestError({
          repository,
          path,
          status: response.status,
          cause,
        }),
    ),
  );
  return yield* HttpClientResponse.schemaBodyJson(Schema.Unknown)(success).pipe(
    Effect.mapError(
      (cause) =>
        new GitHubReleaseRequestError({
          repository,
          path,
          status: response.status,
          cause,
        }),
    ),
  );
});

const decodeLatestReleaseEffect = (repository: string, value: unknown) =>
  decodeGitHubLatestReleaseEffect(value).pipe(
    Effect.map(
      (decoded): LatestRelease => ({
        tag: decoded.tag_name,
        publishedAt: decoded.published_at,
        url: decoded.html_url,
      }),
    ),
    Effect.mapError(
      (cause) =>
        new GitHubReleaseDecodeError({
          repository,
          responseKind: "latest-release",
          cause,
        }),
    ),
  );

const decodeForkMetadataEffect = (repository: string, value: unknown) =>
  decodeGitHubForkEffect(value).pipe(
    Effect.map(
      (decoded): ForkMetadata => ({
        fork: decoded.fork,
        parentRepository: decoded.parent?.full_name ?? null,
      }),
    ),
    Effect.mapError(
      (cause) =>
        new GitHubReleaseDecodeError({
          repository,
          responseKind: "fork",
          cause,
        }),
    ),
  );

export const checkUpstreamRelease = Effect.fn("checkUpstreamRelease")(function* (
  source: UpstreamReleaseSource,
  token?: string,
) {
  return yield* Effect.gen(function* () {
    const [releasePayload, forkPayload] = yield* Effect.all(
      [
        fetchGitHubJson(source.upstreamRepository, "/releases/latest", token),
        fetchGitHubJson(source.forkRepository, "", token),
      ],
      { concurrency: "unbounded" },
    );
    const [release, fork] = yield* Effect.all(
      [
        decodeLatestReleaseEffect(source.upstreamRepository, releasePayload),
        decodeForkMetadataEffect(source.forkRepository, forkPayload),
      ],
      { concurrency: "unbounded" },
    );
    return {
      ok: true,
      check: resolveReleaseCheck(source, release, fork),
    } as const satisfies UpstreamReleaseCheckResult;
  }).pipe(
    Effect.catch((cause) =>
      Effect.succeed({
        ok: false,
        id: source.id,
        displayName: source.displayName,
        message: cause.message,
      } as const satisfies UpstreamReleaseCheckResult),
    ),
  );
});

export const checkAllUpstreamReleases = Effect.fn("checkAllUpstreamReleases")(function* (
  token?: string,
) {
  return yield* Effect.all(
    upstreamReleaseSources.map((source) => checkUpstreamRelease(source, token)),
    { concurrency: "unbounded" },
  );
});

const printHumanResults = Effect.fn("printHumanResults")(function* (
  results: ReadonlyArray<UpstreamReleaseCheckResult>,
) {
  for (const result of results) {
    if (!result.ok) {
      yield* Console.error(`${result.displayName}: error, ${result.message}`);
      continue;
    }

    const { check } = result;
    yield* Console.log(
      [
        check.displayName,
        `release=${check.latestTag}`,
        `cursor=${check.observedTag}`,
        `release-state=${check.releaseState}`,
        `fork=${check.forkState}`,
        `compatibility=${check.compatibilityState}`,
      ].join("  "),
    );
  }
});

export const runUpstreamReleaseCheck = Effect.fn("runUpstreamReleaseCheck")(function* (options: {
  readonly json: boolean;
  readonly failOnUpdate: boolean;
}) {
  const configuredToken = yield* GitHubToken;
  const token = Option.map(configuredToken, Redacted.value).pipe(Option.getOrUndefined);
  const results = yield* checkAllUpstreamReleases(token);

  if (options.json) {
    yield* Console.log(encodeUnknownJson(results));
  } else {
    yield* printHumanResults(results);
  }

  const changedSourceCount = results.filter(
    (result) =>
      !result.ok ||
      result.check.releaseState === "update-available" ||
      result.check.forkState !== "linked",
  ).length;
  if (options.failOnUpdate && changedSourceCount > 0) {
    return yield* new UpstreamReleaseChangeDetectedError({ changedSourceCount });
  }
});

export const checkUpstreamReleasesCommand = Command.make(
  "check-upstream-releases",
  {
    json: Flag.boolean("json").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print machine-readable JSON."),
    ),
    failOnUpdate: Flag.boolean("fail-on-update").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Exit unsuccessfully when a release changed or a fork link is invalid."),
    ),
  },
  runUpstreamReleaseCheck,
).pipe(Command.withDescription("Check official OMP and Orca releases and fork links."));

if (import.meta.main) {
  Command.run(checkUpstreamReleasesCommand, { version: "0.0.0" }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
    NodeRuntime.runMain,
  );
}
