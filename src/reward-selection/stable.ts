import { sha256 } from "js-sha256";
import {
  parseStableDigest,
  type StableDigest,
} from "../types/stable-digest";

export {
  isStableDigest,
  parseStableDigest,
  type StableDigest,
} from "../types/stable-digest";

export function compareStableKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Map) {
    const entries = [...(value as ReadonlyMap<unknown, unknown>).entries()];
    return entries
      .sort(([left], [right]) => compareStableKeys(String(left), String(right)))
      .map(([key, child]): [unknown, unknown] => [key, stableValue(child)]);
  }
  if (value instanceof Set) {
    return [...value].map(stableValue).sort((left, right) =>
      compareStableKeys(JSON.stringify(left), JSON.stringify(right)),
    );
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort(compareStableKeys)
      .flatMap((key) =>
        record[key] === undefined ? [] : [[key, stableValue(record[key])]],
      ),
  );
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function stableDigest(value: unknown): StableDigest {
  return parseStableDigest(sha256(stableStringify(value)));
}
