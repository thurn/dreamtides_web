// Small pure helpers shared across the pool-generation variants.

import { COLORS } from "./constants.ts";

// Leading run of color letters in a list name ('' if it has no color prefix).
export function colorPrefix(name: string): string {
  const head = name.split("-")[0];
  const isColors = head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}

// Canonical color-identity string (ordered w/u/b/r/g) for a color set or prefix.
export function canonicalColors(colors: Iterable<string>): string {
  const set = new Set(colors);
  return [...COLORS].filter((c) => set.has(c)).join("");
}

// Size of the intersection of two sets.
export function inter(set: Set<string>, other: Set<string>): number {
  let n = 0;
  for (const c of set) if (other.has(c)) n++;
  return n;
}

// Pool size counts copies, capped at 2 per card. Generic over the key type so it
// accepts both the variants' internal string-keyed working maps and the public
// `CardId`-keyed pool counts without coupling to either key brand.
export function poolSize<K>(counts: ReadonlyMap<K, number>): number {
  let n = 0;
  for (const v of counts.values()) n += Math.min(2, v);
  return n;
}

/**
 * Expand a pool's copy counts into newline-ready card lines: keys sorted, a
 * 2-of duplicated, so the line count equals the pool size. Shared by the Node
 * generator/simulation tooling so its output matches the in-app pool exactly.
 * Generic over the (string-shaped) key type so it serves both internal working
 * maps and `CardId`-keyed pool counts.
 */
export function poolToLines<K extends string>(
  counts: ReadonlyMap<K, number>,
): string[] {
  const lines: string[] = [];
  for (const [card, count] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    for (let i = 0; i < Math.min(2, count); i++) lines.push(card);
  }
  return lines;
}
