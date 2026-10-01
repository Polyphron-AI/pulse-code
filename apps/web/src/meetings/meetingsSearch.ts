import type { EnvironmentId } from "@t3tools/contracts";

export interface MeetingsSearch {
  readonly environmentId?: EnvironmentId;
}

/** Meetings routes carry the environment whose meetings they show. */
export function parseMeetingsSearch(raw: Record<string, unknown>): MeetingsSearch {
  return typeof raw.environmentId === "string" && raw.environmentId
    ? { environmentId: raw.environmentId as EnvironmentId }
    : {};
}
