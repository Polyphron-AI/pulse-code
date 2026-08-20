/**
 * Multi-environment native Issues state for mobile.
 *
 * The server owns Pulse credentials and API access. Mobile only reads the
 * capability-gated RPC surface, preserving the environment/project scope on
 * every request so local and remote Issue IDs can never collide.
 */
import { useAtomValue } from "@effect/atom-react";
import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";
import type {
  EnvironmentId,
  Issue,
  IssueConnectionSnapshot,
  IssueListInput,
  ProjectId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "./atom-registry";

/** Shared native Issues RPC state, scoped to the environment that owns it. */
export const issueEnvironment = createIssueEnvironmentAtoms(connectionAtomRuntime);

export interface IssueQueryTarget<Input> {
  readonly environmentId: EnvironmentId;
  readonly input: Input;
}

interface MergedIssueQueryView<Target, A> {
  readonly values: ReadonlyArray<readonly [Target, A]>;
  readonly errors: ReadonlyArray<readonly [Target, string]>;
  readonly isPending: boolean;
}

export function formatIssueQueryError(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The Issues request failed.";
}

function createMergedIssueQuery<Target, A>(
  label: string,
  atomFor: (target: Target) => Atom.Atom<AsyncResult.AsyncResult<A, unknown>>,
) {
  const family = Atom.family((key: string) =>
    Atom.make((get): MergedIssueQueryView<Target, A> => {
      const targets = JSON.parse(key) as ReadonlyArray<Target>;
      const values: Array<readonly [Target, A]> = [];
      const errors: Array<readonly [Target, string]> = [];
      let isPending = false;

      for (const target of targets) {
        const result = get(atomFor(target));
        isPending ||= result.waiting;
        if (result._tag === "Failure") {
          errors.push([target, formatIssueQueryError(result.cause)]);
        }
        const value = Option.getOrNull(AsyncResult.value(result));
        if (value !== null) values.push([target, value]);
      }

      return { values, errors, isPending };
    }).pipe(Atom.withLabel(`${label}:${key}`)),
  );
  const empty = Atom.make<MergedIssueQueryView<Target, A>>({
    values: [],
    errors: [],
    isPending: false,
  }).pipe(Atom.withLabel(`${label}:empty`));

  return function useMergedIssueQuery(targets: ReadonlyArray<Target>) {
    const key = JSON.stringify(targets);
    const view = useAtomValue(targets.length === 0 ? empty : family(key));
    const refresh = useCallback(() => {
      for (const target of JSON.parse(key) as ReadonlyArray<Target>) {
        appAtomRegistry.refresh(atomFor(target));
      }
    }, [key]);
    return { ...view, refresh };
  };
}

const useMergedConnections = createMergedIssueQuery<
  IssueQueryTarget<Record<string, never>>,
  IssueConnectionSnapshot
>("mobile-issues:connections", issueEnvironment.connection);

const useMergedLists = createMergedIssueQuery<
  IssueQueryTarget<IssueListInput>,
  {
    readonly issues: readonly Issue[];
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  }
>("mobile-issues:lists", issueEnvironment.list);

export function useIssueConnections(environmentIds: readonly EnvironmentId[]) {
  const targets = useMemo(
    () => environmentIds.map((environmentId) => ({ environmentId, input: {} })),
    [environmentIds],
  );
  return useMergedConnections(targets);
}

export interface EnvironmentIssueEntry {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly issue: Issue;
}

export function useIssueList(targets: ReadonlyArray<IssueQueryTarget<IssueListInput>>) {
  const query = useMergedLists(targets);
  const entries = useMemo(
    () =>
      query.values.flatMap(([target, result]) => {
        const projectId = target.input.projectId;
        return projectId
          ? result.issues.map((issue) => ({
              environmentId: target.environmentId,
              projectId,
              issue,
            }))
          : [];
      }),
    [query.values],
  );
  const total = useMemo(
    () => query.values.reduce((sum, [, result]) => sum + result.total, 0),
    [query.values],
  );

  return {
    entries,
    total,
    errors: query.errors,
    isPending: query.isPending,
    refresh: query.refresh,
  };
}
