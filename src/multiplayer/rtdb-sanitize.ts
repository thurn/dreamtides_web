/**
 * Recursively removes `undefined` so a value is safe to hand to Firebase
 * Realtime Database. RTDB's `set`/`update`/`runTransaction` writers reject any
 * tree that contains `undefined` ("Data ... contains undefined in property
 * ..."), which aborts the whole write — a single optional field left
 * `undefined` anywhere in a battle init or quest snapshot takes the entire
 * transaction down (see the Dreamwell `art` and shop `slots` regressions).
 *
 * Semantics:
 * - Object keys whose value is `undefined` are dropped entirely, matching how
 *   RTDB treats an absent field (and how `JSON.stringify` omits the key).
 * - `undefined` array elements become `null` so array indices are preserved
 *   rather than silently reindexed.
 * - `null` is kept untouched: RTDB uses `null` to delete a path in a multi-path
 *   `update()`, and a stored `null` is a legitimate value.
 *
 * The input is returned by reference when it contains no `undefined`, so
 * read-back trees (which never carry `undefined`) and no-op transaction returns
 * skip a pointless deep clone. RTDB already walks the tree on write, so the one
 * extra walk performed only when stripping is needed is the same order of cost.
 */
export function stripUndefinedForRtdb<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = (value as unknown[]).map((element) => {
      if (element === undefined) {
        changed = true;
        return null;
      }
      const cleaned = stripUndefinedForRtdb(element);
      if (cleaned !== element) {
        changed = true;
      }
      return cleaned;
    });
    return (changed ? next : value) as T;
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, element] of Object.entries(value as Record<string, unknown>)) {
    if (element === undefined) {
      changed = true;
      continue;
    }
    const cleaned = stripUndefinedForRtdb(element);
    if (cleaned !== element) {
      changed = true;
    }
    next[key] = cleaned;
  }
  return (changed ? next : value) as T;
}
