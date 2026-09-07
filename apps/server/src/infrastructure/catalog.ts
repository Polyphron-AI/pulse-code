import {
  InfrastructureError,
  InfrastructureQuerySummary,
  InfrastructureTargetSummary,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const SafeUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }),
);

export const SavedQuery = Schema.Struct({
  ...InfrastructureQuerySummary.fields,
  datasourceUid: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  expression: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
});

export const Target = Schema.Struct({
  ...InfrastructureTargetSummary.fields,
  enabled: Schema.Boolean,
  allowedThreadIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(
    Schema.isMaxLength(100),
  ),
  mcpEndpoint: SafeUrl,
  tokenEnv: Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9_]{0,127}$/)),
  queries: Schema.Array(SavedQuery).check(Schema.isMaxLength(20)),
});
export type Target = typeof Target.Type;
export type SavedQuery = typeof SavedQuery.Type;
const Catalog = Schema.Struct({
  version: Schema.Literal(1),
  targets: Schema.Array(Target).check(Schema.isMaxLength(50)),
});

export const configurationError = () =>
  new InfrastructureError({
    code: "configuration",
    message:
      "Infrastructure configuration is invalid or unavailable. Ask the environment operator to check infrastructure.json and credential references.",
  });

const decodeCatalog = Schema.decodeUnknownSync(Schema.fromJsonString(Catalog));

export function parseCatalog(text: string) {
  try {
    if (Buffer.byteLength(text) > 262144) throw configurationError();
    const catalog = decodeCatalog(text, {
      onExcessProperty: "error",
    });
    if (new Set(catalog.targets.map((target) => target.id)).size !== catalog.targets.length)
      throw configurationError();
    for (const target of catalog.targets) {
      if (new Set(target.queries.map((query) => query.id)).size !== target.queries.length)
        throw configurationError();
    }
    return catalog.targets;
  } catch {
    throw configurationError();
  }
}

export const summarizeTarget = (target: Target) => ({
  id: target.id,
  label: target.label,
  stage: target.stage,
  service: target.service,
  repository: target.repository,
  queries: target.queries.map(({ id, label, kind }) => ({ id, label, kind })),
});

export function makeQueryCall(
  query: SavedQuery,
  startTime: string,
  endTime: string,
  minutes: number,
) {
  const stepSeconds = Math.max(15, Math.ceil((minutes * 60) / 120));
  return query.kind === "prometheus"
    ? {
        name: "query_prometheus",
        arguments: {
          datasourceUid: query.datasourceUid,
          expr: query.expression,
          startTime,
          endTime,
          stepSeconds,
          queryType: "range",
        },
      }
    : {
        name: "query_loki_logs",
        arguments: {
          datasourceUid: query.datasourceUid,
          logql: query.expression,
          startRfc3339: startTime,
          endRfc3339: endTime,
          limit: 100,
          stepSeconds,
          direction: "backward",
          queryType: "range",
        },
      };
}
