// @effect-diagnostics nodeBuiltinImport:off - Catalog decoding validates native absolute certificate paths without an Effect runtime.
import {
  InfrastructureError,
  InfrastructureQuerySummary,
  InfrastructureTargetSummary,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as NodePath from "node:path";

const SafeUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.pathname === "/" &&
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
  brokerQueryId: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/)),
});

const CertificateFile = Schema.String.check(
  Schema.isMaxLength(4096),
  Schema.makeFilter(
    (value) => NodePath.isAbsolute(value) && !/[\r\n]/.test(value) && !value.includes("\0"),
  ),
);

export const Target = Schema.Struct({
  ...InfrastructureTargetSummary.fields,
  enabled: Schema.Boolean,
  allowedThreadIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(
    Schema.isMaxLength(100),
  ),
  environmentId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  brokerEndpoint: SafeUrl,
  clientCertificateFile: CertificateFile,
  clientKeyFile: CertificateFile,
  caFile: CertificateFile,
  queries: Schema.Array(SavedQuery).check(Schema.isMaxLength(20)),
});
export type Target = typeof Target.Type;
export type SavedQuery = typeof SavedQuery.Type;
const Catalog = Schema.Struct({
  version: Schema.Literal(2),
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
