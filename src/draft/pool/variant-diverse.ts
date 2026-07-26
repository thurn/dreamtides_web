// The `diverse` variant. It keeps the color-identity skeleton but flattens the
// distribution: it seeds the identity from an archetype weighted toward
// hard-to-reach (multi-color) identities, walks themes weighted toward those
// eligible in fewer identities (inverse reach), includes each theme's cards with
// a probability inverse to how broadly the card is tagged, and fills any
// shortfall by sampling legal cards weighted toward narrow color breadth. Core
// cards still seed every pool. See `docs/cards2/draft_pool_algorithms.md`.

import { ALPHA, HI, LO, TOPK } from "./constants.ts";
import { randInt, shuffle, weightedPick, weightedSample } from "./rng.ts";
import { onColorCandidates } from "./themes.ts";
import type { PoolStrategy } from "./strategy.ts";
import { brandPoolCounts, type PoolData, type VariantResult } from "./types.ts";
import { canonicalColors, colorPrefix, inter, poolSize } from "./util.ts";

// Knobs for the `diverse` variant. Grouped here so tuning is a one-stop edit.
interface DiverseTuning {
  seedExponent: number;
  walkExploration: number;
  reachExponent: number;
  themeBudget: number | null;
  inclusionK: number;
  fillExponent: number;
}
const DIVERSE: DiverseTuning = {
  // Seed: weight the opening archetype (which sets the color identity) by
  // 1 / reach^seedExponent, so identities that few archetypes can reach —
  // notably multi-color ones — are seeded more often. This lifts otherwise
  // starved multi-color archetypes. 0 = seed uniformly at random.
  seedExponent: 1,
  // Walk: 1 = always pick the next theme uniformly at random among on-color
  // candidates (kills the rich-get-richer overlap bias); 0 = behave like the
  // default overlap-weighted walk. Values in between mix the two per step.
  walkExploration: 1,
  // Walk: down-weight a candidate theme by 1 / reach^reachExponent, where reach
  // is how many identities the theme is eligible in. A larger exponent pushes
  // selection harder toward themes eligible in fewer identities (e.g. multi-color
  // and niche themes), countering the dominance of broadly-eligible mechanic and
  // one-color themes.
  reachExponent: 1.5,
  // Walk: cap the number of themes a pool draws before it switches to uniform
  // fill. A smaller budget gives each pool a few focused archetypes and lets the
  // uniform fill carry the rest, which flattens archetype usage; `null` keeps
  // adding themes until the size floor is reached.
  themeBudget: 6,
  // Alternate tagging: when a theme is added, each card is included with
  // probability min(1, inclusionK / themeBreadth), where themeBreadth is how
  // many archetype themes the card is tagged into. Broadly-tagged cards thus
  // contribute less per theme while narrowly-tagged cards stay reliable, which
  // flattens both inclusion rate and 2-of accumulation.
  inclusionK: 3,
  // Fill: when the pool is short, sample legal non-pool cards weighted by
  // 1 / colorBreadth^fillExponent, where colorBreadth is how many bare-color
  // lists the card is legal in. This favors cards legal in fewer color combos
  // (which are otherwise rarely fill candidates), countering the legality-breadth
  // bias. 0 = uniform fill.
  fillExponent: 1,
};

// How many archetype themes each card is tagged into ("theme breadth"), cached
// per PoolData. This is the data signal the diverse variant uses to down-weight
// broadly-tagged cards. Bare color lists are not themes, so they do not count.
const breadthCache = new WeakMap<PoolData, Map<string, number>>();
function themeBreadth(poolData: PoolData): Map<string, number> {
  const cached = breadthCache.get(poolData);
  if (cached) return cached;
  const breadth = new Map<string, number>();
  const bump = (c: string): void => {
    breadth.set(c, (breadth.get(c) ?? 0) + 1);
  };
  for (const set of poolData.archLists.values()) for (const c of set) bump(c);
  for (const [key, set] of poolData.draftLists) {
    if (key.includes("-")) for (const c of set) bump(c);
  }
  breadthCache.set(poolData, breadth);
  return breadth;
}

// How many bare-color lists each card is legal in ("color breadth"), cached per
// PoolData. The diverse fill uses it to down-weight cards legal in many color
// combinations, which are otherwise over-sampled because they are fill
// candidates in nearly every pool.
const colorBreadthCache = new WeakMap<PoolData, Map<string, number>>();
function colorBreadth(poolData: PoolData): Map<string, number> {
  const cached = colorBreadthCache.get(poolData);
  if (cached) return cached;
  const breadth = new Map<string, number>();
  for (const [key, set] of poolData.draftLists) {
    if (key.includes("-")) continue;
    for (const c of set) breadth.set(c, (breadth.get(c) ?? 0) + 1);
  }
  colorBreadthCache.set(poolData, breadth);
  return breadth;
}

// "Theme reach": the expected number of pools in which a theme is an on-color
// candidate, weighted by how often the diverse variant rolls each identity
// (identity == one seed archetype's colors, so each identity's weight is the
// count of color-archetypes with those colors). Themes eligible in many
// identities — mechanic themes and one-color themes — have high reach; the walk
// down-weights them by 1/reach so selection spreads more evenly. Cached.
const reachCache = new WeakMap<PoolData, Map<string, number>>();
function themeReach(poolData: PoolData): Map<string, number> {
  const cached = reachCache.get(poolData);
  if (cached) return cached;
  const identityWeight = new Map<string, number>();
  for (const key of poolData.draftLists.keys()) {
    if (!key.includes("-")) continue;
    const p = colorPrefix(key);
    if (p === "") continue;
    const canon = canonicalColors(p);
    identityWeight.set(canon, (identityWeight.get(canon) ?? 0) + 1);
  }
  const reach = new Map<string, number>();
  for (const [idStr, weight] of identityWeight) {
    const { themes } = onColorCandidates(poolData, new Set([...idStr]), null);
    for (const name of themes.keys()) {
      reach.set(name, (reach.get(name) ?? 0) + weight);
    }
  }
  reachCache.set(poolData, reach);
  return reach;
}

export function generateDiverse(
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  targetSize?: number,
): VariantResult {
  const { core, draftLists } = poolData;
  const breadth = themeBreadth(poolData);
  const reach = themeReach(poolData);

  // A caller can pin the pool to an exact size; otherwise it lands somewhere in
  // the [LO, HI] band. Collapsing the band to `targetSize` fixes the fill/trim
  // target at it.
  const lo = targetSize ?? LO;
  const hi = targetSize ?? HI;

  // 1. choose a color identity by seeding from one archetype. A DreamAvatar
  // restricts the seed pool to its own archetypes; otherwise any color+archetype
  // list is an eligible seed, weighted toward hard-to-reach identities.
  const eligibleSeeds = (seedArchetypes ?? []).filter(
    (a) => draftLists.has(a) && colorPrefix(a) !== "",
  );
  const seeded = eligibleSeeds.length > 0;
  const allowedDraft = seeded ? new Set(seedArchetypes) : null;
  const seedPool = seeded
    ? eligibleSeeds
    : [...draftLists.keys()].filter(
        (n) => n.includes("-") && colorPrefix(n) !== "",
      );
  const seed = weightedPick(
    rng,
    seedPool,
    seedPool.map(
      (a) => 1 / Math.max(1, reach.get(`D:${a}`) ?? 1) ** DIVERSE.seedExponent,
    ),
  );
  const C = new Set([...colorPrefix(seed)]);
  const seedThemeName = `D:${seed}`;

  // 2-3. legal cards and candidate themes for this identity.
  const { legal, themes } = onColorCandidates(poolData, C, allowedDraft);

  // 4. walk: add themes (seed first), including each card with probability
  // inverse to its theme breadth. Subsequent themes are chosen by inverse reach
  // (the diverse walk), optionally falling back to the overlap walk.
  const counts = new Map<string, number>([...core].map((c) => [c, 1]));
  const selected: string[] = [];
  const includeProb = (card: string): number =>
    Math.min(1, DIVERSE.inclusionK / Math.max(1, breadth.get(card) ?? 1));
  const addTheme = (name: string): void => {
    selected.push(name);
    for (const c of themes.get(name) ?? []) {
      if (rng() < includeProb(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  };
  const themeNames = [...themes.keys()];
  addTheme(themes.has(seedThemeName) ? seedThemeName : themeNames[0]);

  while (poolSize(counts) < lo) {
    if (DIVERSE.themeBudget !== null && selected.length >= DIVERSE.themeBudget) {
      break;
    }
    const remaining = themeNames.filter((s) => !selected.includes(s));
    if (remaining.length === 0) break;
    let pick: string;
    if (rng() < DIVERSE.walkExploration) {
      pick = weightedPick(
        rng,
        remaining,
        remaining.map(
          (s) => 1 / Math.max(1, reach.get(s) ?? 1) ** DIVERSE.reachExponent,
        ),
      );
    } else {
      const union = new Set<string>();
      for (const s of selected) for (const c of themes.get(s) ?? []) union.add(c);
      const cands = remaining
        .map((s): [string, number] => [
          s,
          inter(themes.get(s) ?? new Set(), union),
        ])
        .filter(([, score]) => score > 0)
        .sort((x, y) => y[1] - x[1])
        .slice(0, TOPK);
      if (cands.length === 0) break;
      pick = weightedPick(
        rng,
        cands.map(([s]) => s),
        cands.map(([, score]) => score ** ALPHA),
      );
    }
    addTheme(pick);
  }

  // 5. fill to a random target size by sampling legal non-pool cards weighted
  // toward narrow color breadth, so diverse pools vary across the whole 180-220
  // band rather than pinning to the floor.
  const target = randInt(rng, lo, hi);
  if (poolSize(counts) < target) {
    const cBreadth = colorBreadth(poolData);
    const candidates = [...legal].filter((c) => !counts.has(c));
    const fillers = weightedSample(
      rng,
      candidates,
      (c) => 1 / Math.max(1, cBreadth.get(c) ?? 1) ** DIVERSE.fillExponent,
      target - poolSize(counts),
    );
    for (const c of fillers) counts.set(c, 1);
  }

  // 5a. if the legal set was too small to reach the target with 1-ofs, promote
  // random 1-ofs to 2-ofs.
  if (poolSize(counts) < target) {
    const ones = shuffle(
      rng,
      [...counts.entries()].filter(([, v]) => v === 1).map(([c]) => c),
    );
    for (const c of ones) {
      if (poolSize(counts) >= target) break;
      counts.set(c, 2);
    }
  }

  // 6. if theme inclusion overshot the target, demote random 2-ofs back down.
  if (poolSize(counts) > target) {
    const twos = shuffle(
      rng,
      [...counts.entries()].filter(([, v]) => v >= 2).map(([c]) => c),
    );
    for (const c of twos) {
      if (poolSize(counts) <= target) break;
      counts.set(c, 1);
    }
  }

  return { C, selected, counts: brandPoolCounts(counts) };
}

/** Strategy adapter for the `diverse` algorithm. */
export const diverseStrategy: PoolStrategy = {
  id: "diverse",
  description:
    "Color-identity walk tuned to flatten the distribution, spreading cards and " +
    "archetypes more evenly across pools via inverse-reach weighting.",
  generate: ({ rng, poolData, seedArchetypes, targetSize }) =>
    generateDiverse(rng, poolData, seedArchetypes, targetSize),
};
