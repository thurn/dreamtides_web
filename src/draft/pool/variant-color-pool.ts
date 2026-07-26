// The `color_pool` variant: the original color-identity algorithm. Choose a
// color identity, walk the on-color themes weighted by overlap with what is
// already chosen, then fill, jitter, and trim to a random target size.

import { ALPHA, COLORS, HI, JIT, K_WEIGHTS, LO, TOPK } from "./constants.ts";
import { randInt, shuffle, weightedPick } from "./rng.ts";
import { onColorCandidates } from "./themes.ts";
import type { PoolStrategy } from "./strategy.ts";
import { brandPoolCounts, type PoolData, type VariantResult } from "./types.ts";
import { colorPrefix, inter, poolSize } from "./util.ts";

export function generate(
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  targetSize?: number,
): VariantResult {
  const { core, draftLists } = poolData;

  // A caller can pin the pool to an exact size; otherwise it lands in the
  // [LO, HI] band. Collapsing the band to `targetSize` makes the fill loops
  // build up to it and the jitter/trim below converge on it exactly.
  const lo = targetSize ?? LO;
  const hi = targetSize ?? HI;

  // A DreamAvatar can seed pool construction with a list of draft archetypes.
  // We pick one of those archetypes at random, adopt its colors as the identity,
  // and restrict the walk's color+archetype themes to the listed ones (on-color
  // mechanic-tide archetypes still join the walk). Only archetypes that exist in
  // the pool data and carry a color prefix are eligible seeds.
  const eligibleSeeds = (seedArchetypes ?? []).filter(
    (a) => draftLists.has(a) && colorPrefix(a) !== "",
  );
  const seeded = eligibleSeeds.length > 0;
  const allowedDraft = seeded ? new Set(seedArchetypes) : null;

  // 1. choose a color identity C
  let C: Set<string>;
  let seedThemeName: string | null = null;
  if (seeded) {
    const seed = eligibleSeeds[Math.floor(rng() * eligibleSeeds.length)];
    C = new Set([...colorPrefix(seed)]);
    seedThemeName = `D:${seed}`;
  } else {
    const k = Number(
      weightedPick(rng, Object.keys(K_WEIGHTS), Object.values(K_WEIGHTS)),
    );
    C = new Set(shuffle(rng, [...COLORS]).slice(0, k));
  }

  // 2-3. on-color legal cards and candidate themes for this identity.
  const { onColorDraft, themes } = onColorCandidates(poolData, C, allowedDraft);

  // 4. seed + overlap-weighted synergy walk among themes
  const counts = new Map<string, number>([...core].map((c) => [c, 1]));
  const selected: string[] = [];
  const addTheme = (name: string): void => {
    selected.push(name);
    for (const c of themes.get(name) ?? []) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  };
  const themeNames = [...themes.keys()];
  if (seedThemeName !== null && themes.has(seedThemeName)) {
    addTheme(seedThemeName);
  } else {
    addTheme(themeNames[Math.floor(rng() * themeNames.length)]);
  }

  while (poolSize(counts) < lo) {
    const union = new Set<string>();
    for (const s of selected) {
      for (const c of themes.get(s) ?? []) union.add(c);
    }
    const cands = themeNames
      .filter((s) => !selected.includes(s))
      .map((s): [string, number] => [
        s,
        inter(themes.get(s) ?? new Set(), union),
      ])
      .filter(([, score]) => score > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, TOPK);
    if (cands.length === 0) break;
    const pick = weightedPick(
      rng,
      cands.map(([s]) => s),
      cands.map(([, score]) => score ** ALPHA),
    );
    addTheme(pick);
  }

  // 4a. if still short, fill with the most-shared on-color staples (1-ofs)
  if (poolSize(counts) < lo) {
    const freq = new Map<string, number>();
    for (const n of onColorDraft) {
      for (const c of draftLists.get(n) ?? []) {
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
    }
    const fillers = [...freq.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([c]) => c)
      .filter((c) => !counts.has(c));
    for (const c of fillers) {
      if (poolSize(counts) >= lo) break;
      counts.set(c, 1);
    }
  }

  // 4b. jitter: demote a random subset of 2-ofs down to a random target size
  const cap = Math.min(poolSize(counts), hi);
  const target = randInt(rng, Math.max(lo, cap - JIT), cap);
  const twos = shuffle(
    rng,
    [...counts.entries()].filter(([, v]) => v >= 2).map(([c]) => c),
  );
  for (const c of twos) {
    if (poolSize(counts) <= target) break;
    counts.set(c, 1);
  }

  // 4c. fallback fringe-trim (rare): cut cards unique to the last theme
  if (poolSize(counts) > target && selected.length > 0) {
    const others = new Set(core);
    for (const s of selected.slice(0, -1)) {
      for (const c of themes.get(s) ?? []) others.add(c);
    }
    const fringe = shuffle(
      rng,
      [...(themes.get(selected[selected.length - 1]) ?? [])].filter(
        (c) => counts.has(c) && !others.has(c),
      ),
    );
    for (const c of fringe) {
      if (poolSize(counts) <= Math.max(target, lo)) break;
      counts.delete(c);
    }
  }

  return { C, selected, counts: brandPoolCounts(counts) };
}

/** Strategy adapter for the `color_pool` algorithm. */
export const colorPoolStrategy: PoolStrategy = {
  id: "color_pool",
  description:
    "Color-identity walk: pick an identity, walk the on-color themes weighted " +
    "by overlap with what is already chosen, then fill, jitter, and trim to a " +
    "random target size.",
  generate: ({ rng, poolData, seedArchetypes, targetSize }) =>
    generate(rng, poolData, seedArchetypes, targetSize),
};
