import type {
  EnvironmentId,
  ProjectId,
  PullRequestInvolvement,
  PullRequestListInput,
} from "@t3tools/contracts";
/** Normalize shared URL controls to the same bounds accepted by the list contract. */
export function pullRequestNamedFilters(raw: { author?: unknown; labels?: unknown }) {
  const author = typeof raw.author === "string" ? raw.author.trim().slice(0, 200) : "";
  const candidates = Array.isArray(raw.labels)
    ? raw.labels
    : typeof raw.labels === "string"
      ? [raw.labels]
      : [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.slice(0, 100)) {
    if (typeof candidate !== "string") continue;
    const label = candidate.trim().slice(0, 200);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length === 10) break;
  }
  return { ...(author ? { author } : {}), ...(labels.length ? { labels } : {}) };
}

/** Facets load only while their controls are open, without the filters they help choose. */
export function pullRequestFacetTargets(input: {
  open: boolean;
  environments: ReadonlyArray<{
    environmentId: EnvironmentId;
    projectIds?: ReadonlyArray<ProjectId>;
  }>;
  involvement: PullRequestInvolvement;
  projectId?: ProjectId | undefined;
  host?: string | undefined;
}) {
  if (!input.open) return [];
  return input.environments.map(({ environmentId, projectIds }) => ({
    environmentId,
    input: {
      state: "all",
      involvement: input.involvement,
      limit: 99,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(projectIds ? { projectIds } : {}),
      ...(input.host ? { host: input.host } : {}),
    } satisfies PullRequestListInput,
  }));
}
