// Structural sharing for the battle board's view: a newly built view keeps the
// previous view's objects wherever their contents are unchanged, so the
// board's memoized regions (a rank, a hand, a side's zones) skip rendering
// when an intent changed only the other side. Sharing never changes what the
// board shows: a part is reused only when it is deeply equal to the new one.

import { useRef } from "react";

/** Whether `value` is an array or an object literal: data the view is built from. */
function isPlainData(value: unknown): value is Readonly<Record<string, unknown>> | readonly unknown[] {
  if (Array.isArray(value)) return true;
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * `next`, with every part deeply equal to the same part of `previous`
 * replaced by that part of `previous`; `previous` itself when the two are
 * deeply equal, and `next` itself when no part of it is shared. Arrays and object literals are compared by contents; any
 * other value (a function, a map, a class instance) only by identity.
 */
export function shareEqualParts<T>(previous: unknown, next: T): T {
  if (Object.is(previous, next)) return previous as T;
  if (!isPlainData(previous) || !isPlainData(next)) return next;
  if (Array.isArray(previous) !== Array.isArray(next)) return next;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const shared = next.map((item: unknown, index) => shareEqualParts(previous[index], item));
    if (previous.length === shared.length && shared.every((item, index) => item === previous[index])) {
      return previous as T;
    }
    return shared.every((item, index) => item === next[index]) ? next : (shared as T);
  }
  const before = previous as Readonly<Record<string, unknown>>;
  const after = next as Readonly<Record<string, unknown>>;
  const keys = Object.keys(after);
  const shared: Record<string, unknown> = {};
  for (const key of keys) shared[key] = shareEqualParts(before[key], after[key]);
  const unchanged =
    Object.keys(before).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(before, key) && shared[key] === before[key]);
  if (unchanged) return previous as T;
  return keys.every((key) => shared[key] === after[key]) ? next : (shared as T);
}

/**
 * `next` as a new object whose fields share every unchanged part of
 * `previous`. The result is always a new object, so anything keyed on the
 * view's identity still sees each view the screen receives.
 */
export function shareEqualFields<T extends object>(previous: T | null, next: T): T {
  if (previous === null) return next;
  const before = previous as Readonly<Record<string, unknown>>;
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) shared[key] = shareEqualParts(before[key], value);
  return shared as T;
}

/**
 * `value`, sharing every unchanged part with the value this hook returned
 * last (`shareEqualFields`). The same `value` returns the same result.
 */
export function useSharedFields<T extends object>(value: T): T {
  const memory = useRef<{ readonly input: T; readonly output: T } | null>(null);
  const remembered = memory.current;
  if (remembered !== null && remembered.input === value) return remembered.output;
  const output = shareEqualFields(remembered?.output ?? null, value);
  memory.current = { input: value, output };
  return output;
}
