import { useAtomValue } from "@effect/atom-react";
import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";
import type {
  EnvironmentId,
  Issue,
  IssueConnectionSnapshot,
  IssueListInput,
  ProjectId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { formatEnvironmentQueryError } from "./query";

/** Shared native Issues RPC state, scoped to the environment that owns each project. */
export const issueEnvironment = createIssueEnvironmentAtoms(connectionAtomRuntime);

export interface IssueQueryTarget<Input> {
  readonly environmentId: EnvironmentId;
  readonly input: Input;
}

interface MergedIssueQueryView<Target, A> {
  readonly values: ReadonlyArray<readonly [Target, A]>;
  readonly error: string | null;
  readonly isPending: boolean;
}

function createMergedIssueQuery<Target, A>(
  label: string,
  atomFor: (target: Target) => Atom.Atom<AsyncResult.AsyncResult<A, unknown>>,
) {
  const family = Atom.family((key: string) =>
    Atom.make((get): MergedIssueQueryView<Target, A> => {
      const targets = JSON.parse(key) as ReadonlyArray<Target>;
      const values: Array<readonly [Target, A]> = [];
      let error: string | null = null;
      let isPending = false;
      for (const target of targets) {
        const result = get(atomFor(target));
        isPending ||= result.waiting;
        if (result._tag === "Failure" && error === null) {
          error = formatEnvironmentQueryError(result.cause);
        }
        const value = Option.getOrNull(AsyncResult.value(result));
        if (value !== null) values.push([target, value]);
      }
      return { values, error, isPending };
    }).pipe(Atom.withLabel(`${label}:${key}`)),
  );
  const empty = Atom.make<MergedIssueQueryView<Target, A>>({
    values: [],
    error: null,
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
>("web-issues:connections", issueEnvironment.connection);

const useMergedLists = createMergedIssueQuery<
  IssueQueryTarget<IssueListInput>,
  {
    readonly issues: readonly Issue[];
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  }
>("web-issues:lists", issueEnvironment.list);

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
  return { entries, total, error: query.error, isPending: query.isPending, refresh: query.refresh };
}
