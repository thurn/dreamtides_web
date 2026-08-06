/**
 * Semantic compatibility version for the deterministic room reducer.
 *
 * Keep this value stable across presentation, tooling, documentation, and
 * compatible rules fixes. Bump it only when this client cannot safely fold or
 * append to rooms written by the preceding reducer protocol.
 */
export const CURRENT_REDUCER_VERSION = "dreamtides-coop-v12";

/**
 * Build-scoped reducer ids from deployed clients whose fold behavior was
 * reviewed against {@link CURRENT_REDUCER_VERSION}.
 *
 * These exact ids bridge rooms created before semantic reducer versioning.
 * Keep the full id: its digest includes generated runtime catalogs, so a
 * different catalog build is not accepted accidentally.
 */
export const COMPATIBLE_LEGACY_REDUCER_VERSIONS: ReadonlySet<string> = new Set();

export type ReducerCompatibility = "current" | "legacy" | "incompatible";

/** Classify whether this client may safely participate in a room. */
export function classifyReducerVersion(
  roomReducerVersion: string,
): ReducerCompatibility {
  if (roomReducerVersion === CURRENT_REDUCER_VERSION) {
    return "current";
  }
  if (COMPATIBLE_LEGACY_REDUCER_VERSIONS.has(roomReducerVersion)) {
    return "legacy";
  }
  return "incompatible";
}

/** Whether this client may safely fold and append to the room. */
export function isReducerVersionCompatible(
  roomReducerVersion: string,
): boolean {
  return classifyReducerVersion(roomReducerVersion) !== "incompatible";
}
