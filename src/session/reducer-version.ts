/**
 * Semantic compatibility version for the deterministic game reducer.
 *
 * Keep this value stable across presentation, tooling, documentation, and
 * compatible rules fixes. Bump it only when this build cannot safely fold or
 * append to games written by the preceding reducer protocol. The value is
 * persisted in every stored game's genesis, so its spelling is part of the
 * saved-game format.
 */
import type { ReducerVersion } from "../types/reducer-version";

export const CURRENT_REDUCER_VERSION =
  "dreamtides-coop-v29" satisfies ReducerVersion;

/** Whether this build may safely fold and append to a stored game. */
export function isReducerVersionCompatible(
  gameReducerVersion: ReducerVersion,
): boolean {
  return gameReducerVersion === CURRENT_REDUCER_VERSION;
}
