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
  "dreamtides-coop-v25" satisfies ReducerVersion;

/**
 * Build-scoped reducer ids from earlier builds whose fold behavior was
 * reviewed against {@link CURRENT_REDUCER_VERSION}.
 *
 * These exact ids bridge games created before semantic reducer versioning.
 * Keep the full id: its digest includes generated runtime catalogs, so a
 * different catalog build is not accepted accidentally.
 */
export const COMPATIBLE_LEGACY_REDUCER_VERSIONS: ReadonlySet<ReducerVersion> =
  new Set();

export type ReducerCompatibility = "current" | "legacy" | "incompatible";

/** Classify whether this build may safely fold a stored game. */
export function classifyReducerVersion(
  gameReducerVersion: ReducerVersion,
): ReducerCompatibility {
  if (gameReducerVersion === CURRENT_REDUCER_VERSION) {
    return "current";
  }
  if (COMPATIBLE_LEGACY_REDUCER_VERSIONS.has(gameReducerVersion)) {
    return "legacy";
  }
  return "incompatible";
}

/** Whether this build may safely fold and append to a stored game. */
export function isReducerVersionCompatible(
  gameReducerVersion: ReducerVersion,
): boolean {
  return classifyReducerVersion(gameReducerVersion) !== "incompatible";
}
