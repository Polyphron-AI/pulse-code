import * as Config from "effect/Config";

/**
 * Reads a Pulse Code configuration key first and falls back to its supported
 * T3 Code alias. The legacy key remains a compatibility contract.
 */
export function withLegacyConfigAlias<A>(
  canonical: Config.Config<A>,
  legacy: Config.Config<A>,
): Config.Config<A> {
  return canonical.pipe(Config.orElse(() => legacy));
}
