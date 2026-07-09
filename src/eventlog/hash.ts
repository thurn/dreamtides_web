import { sha256 } from "js-sha256";

/**
 * Computes a canonical SHA-256 hex digest of `value`.
 *
 * Object keys are sorted recursively at every nesting depth, so key order
 * never affects the result -- two clients that fold the same event log into
 * differently-ordered (but semantically identical) state must produce
 * byte-identical hashes.
 *
 * Array order is preserved and DOES affect the hash: a reordered array is a
 * different state. Do not sort arrays.
 */
export function hashState(value: unknown): string {
  return sha256(canonicalize(value));
}

/**
 * Recursively stringifies `value` into a canonical, unambiguous form that
 * mirrors `JSON.stringify` semantics EXACTLY, differing from it only by sorting
 * object keys:
 * - Object keys are sorted lexicographically and each entry is emitted as its
 *   JSON-quoted key followed by its canonicalized value.
 * - Arrays preserve element order.
 * - Primitives are emitted via `JSON.stringify`, which quotes strings and
 *   distinguishes them from numbers/booleans/null, so type-adjacent values
 *   (e.g. the number 1 vs the string "1") never collide.
 * - `undefined`, functions, and symbols mirror `JSON.stringify`: such an object
 *   entry is OMITTED, and such an array element is emitted as `null`. Aligning
 *   with `JSON.stringify` makes `hash(s) === hash(decode(encode(s)))` hold by
 *   construction for the engine's JSON codec, so a snapshot refolder and a live
 *   folder never disagree. The invariant that a smuggled `undefined` must not
 *   silently hide a structural difference is enforced by {@link assertJsonSafe},
 *   which the client runs on the folded state in dev mode.
 */
function canonicalize(value: unknown): string {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    // Reached only for a top-level unserializable value; emit the JSON slot form.
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined || typeof item === "function" || typeof item === "symbol"
        ? "null"
        : canonicalize(item),
    );
    return `[${items.join(",")}]`;
  }
  if (!isPlainObject(value)) {
    throw new Error("hashState: non-plain object cannot be canonicalized safely");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries: string[] = [];
  for (const key of keys) {
    const child = record[key];
    if (child === undefined || typeof child === "function" || typeof child === "symbol") {
      // JSON.stringify drops such object entries entirely.
      continue;
    }
    entries.push(`${JSON.stringify(key)}:${canonicalize(child)}`);
  }
  return `{${entries.join(",")}}`;
}

/**
 * Dev-mode structural safety walker for folded state. Throws an `Error` naming
 * the dotted path of the FIRST value that would corrupt a JSON round-trip or a
 * fold hash: an `undefined`, a function, a symbol, or a non-finite number
 * (`NaN` / `±Infinity`, which `JSON.stringify` silently coerces to `null`).
 *
 * The canonical hash mirrors `JSON.stringify`, so an `undefined` object entry no
 * longer changes the hash on its own -- this walker is where a smuggled
 * `undefined`/function/`NaN` is caught at its source instead of surfacing later
 * as a divergence or a structurally different snapshot. Game-agnostic; the
 * client runs it on the folded state after each applied event in dev mode, and
 * the rules tests call it directly.
 */
export function assertJsonSafe(value: unknown, label: string): void {
  const offending = firstUnsafePath(value, label, new Set());
  if (offending !== null) {
    throw new Error(`assertJsonSafe: ${offending.path} holds ${offending.reason}`);
  }
}

function firstUnsafePath(
  value: unknown,
  path: string,
  seen: Set<object>,
): { path: string; reason: string } | null {
  if (value === undefined) {
    return { path, reason: "undefined" };
  }
  if (typeof value === "function") {
    return { path, reason: "a function" };
  }
  if (typeof value === "symbol") {
    return { path, reason: "a symbol" };
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { path, reason: Number.isNaN(value) ? "NaN" : "a non-finite number" };
  }
  if (value === null || typeof value !== "object") {
    return null;
  }
  // A cyclic reference cannot survive a JSON round-trip either; guard the walk so
  // it terminates and reports the offending edge rather than overflowing.
  if (seen.has(value)) {
    return { path, reason: "a cyclic reference" };
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstUnsafePath(value[index], `${path}[${index}]`, seen);
      if (found !== null) return found;
    }
    seen.delete(value);
    return null;
  }
  if (!isPlainObject(value)) {
    seen.delete(value);
    return { path, reason: "a non-plain object" };
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const found = firstUnsafePath(record[key], `${path}.${key}`, seen);
    if (found !== null) return found;
  }
  seen.delete(value);
  return null;
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
