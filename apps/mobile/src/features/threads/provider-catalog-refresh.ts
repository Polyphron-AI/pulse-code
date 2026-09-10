import type { EnvironmentId } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

type RefreshProvidersTarget = {
  readonly environmentId: EnvironmentId;
  readonly input: { readonly refreshModels: true };
};

/** Explicit model-picker refresh. Repeated taps share the pending discovery. */
export function createProviderCatalogRefreshRunner<Result>(
  refreshProviders: (target: RefreshProvidersTarget) => Promise<Result>,
) {
  const pending = new Map<EnvironmentId, Promise<Result>>();

  return (environmentId: EnvironmentId): Promise<Result> => {
    const existing = pending.get(environmentId);
    if (existing) return existing;
    const result = refreshProviders({ environmentId, input: { refreshModels: true } }).finally(
      () => {
        pending.delete(environmentId);
      },
    );
    pending.set(environmentId, result);
    return result;
  };
}

export function providerCatalogRefreshError(
  result: AtomCommandResult<unknown, unknown>,
): string | null {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "Provider discovery failed.";
}
