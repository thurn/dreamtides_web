// The `merged` variant. It draws from the merged archetype lists
// (`PoolData.mergedLists`, built offline in `scripts/setup-assets.mjs`): one list
// per drafted archetype, holding the cards that recur across that archetype's
// real decks. Run time is a trivial weighted pick — roll a primary archetype
// (theme-weighted), keep the on-color lists, and shuffle a few into the pool —
// with no IDF, cosine, spine, or softmax. The defaults reproduce the `decklists`
// variant's output (see `docs/cards2/draft_pool_algorithms.md`). Falls back to
// `default` when no merged lists are bundled.

import { randInt, shuffle, weightedPick } from "./rng.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { colorPrefix, poolSize } from "./util.ts";
import { generate } from "./variant-default.ts";

// Knobs for the `merged` variant. Grouped here so tuning is a one-stop edit.
interface MergedTuning {
  targetSize: number;
  targetJitter: number;
  themeExp: number;
  weighting: "overlap" | "theme" | "uniform";
  includeProb: number;
  themeCoreFrac: number;
  themeKeep: boolean;
}
const MERGED: MergedTuning = {
  // Desired pool size in copies (each card capped at 2), with a random wobble of
  // +/- targetJitter. ~150 plays as a focused single-archetype pool, matching
  // `decklists`.
  targetSize: 150,
  targetJitter: 8,
  // Exponent on a candidate's theme overlap when rolling the primary archetype.
  // Higher leans the roll harder toward the Dreamcaller's mechanic; 0 rolls
  // uniformly among eligible archetypes.
  themeExp: 1.5,
  // How the next list is chosen during the snowball: `overlap` favors lists that
  // share cards with what is already chosen (coherence), `theme` favors
  // theme-dense lists, `uniform` picks evenly.
  weighting: "overlap",
  // When a list is folded in, each of its cards joins with this probability.
  // Below 1 each list contributes a partial view, raising run-to-run variance
  // and lowering how completely any one archetype is handed over.
  includeProb: 0.7,
  // The per-Dreamcaller "core": the fraction of on-color theme cards always
  // seeded into the pool, so a themed pool reliably leads with its mechanic.
  // 1 hands over the whole theme kit; lower gives a less theme-saturated, more
  // varied pool. This dial is unique to `merged` — `decklists` does not expose
  // it.
  themeCoreFrac: 1,
  // When true, theme cards bypass the `includeProb` dropout and are always taken
  // when a list is folded. With themeCoreFrac it keeps a themed pool on its
  // mechanic.
  themeKeep: true,
};

// Roll a primary archetype from the Dreamcaller's list (theme-weighted), fix the
// color identity to its prefix, seed the per-Dreamcaller theme core, then fold
// on-color merged lists in until the target size. Every per-pool decision is a
// plain weighted random pick; all of the corpus search that `decklists` does at
// run time was moved offline into the merged-list build. `themeArchetypes` are
// the Dreamcaller's mechanic-archetype tide slugs (e.g. `abandon`); when empty
// the pool carries no theme bias. Falls back to the `default` algorithm when no
// merged lists are bundled.
export function generateMerged(
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  themeArchetypes?: readonly string[],
  targetSize?: number,
): VariantResult {
  const { core, archLists, mergedLists } = poolData;
  if (!mergedLists || mergedLists.size === 0) {
    return generate(rng, poolData, seedArchetypes, targetSize);
  }

  // The Dreamcaller's theme: the union of cards in its mechanic-archetype tide
  // lists. `themeOverlap` counts how many of a list's cards are theme cards; it
  // is 0 throughout when the Dreamcaller has no theme, so every theme term below
  // collapses and the pool is unbiased.
  const themeCards = new Set<string>();
  for (const slug of themeArchetypes ?? []) {
    for (const c of archLists.get(slug) ?? []) themeCards.add(c);
  }
  const themeOverlap = (set: Set<string>): number => {
    let n = 0;
    for (const c of set) if (themeCards.has(c)) n++;
    return n;
  };

  // 1. Roll the primary archetype: one of the Dreamcaller's seed archetypes that
  //    has a merged list and a color prefix, weighted toward theme-dense lists so
  //    an abandon Dreamcaller leads with aristocrats rather than off-theme ramp.
  //    Its color prefix becomes the identity. An open-pool Dreamcaller (no
  //    eligible archetype) leads with a random merged list.
  const eligible = (seedArchetypes ?? []).filter(
    (a) => mergedLists.has(a) && colorPrefix(a) !== "",
  );
  const C = new Set<string>();
  let primary: string;
  if (eligible.length > 0) {
    primary = weightedPick(
      rng,
      eligible,
      eligible.map(
        (a) => (1 + themeOverlap(mergedLists.get(a) ?? new Set())) ** MERGED.themeExp,
      ),
    );
  } else {
    const all = [...mergedLists.keys()];
    primary = all[Math.floor(rng() * all.length)];
  }
  for (const ch of colorPrefix(primary)) C.add(ch);

  // 2. On-color candidates: every merged list whose prefix fits inside the
  //    identity (a `bg-midrange` list is excluded from a `br` pool — its green is
  //    off-color — even when it is one of the Dreamcaller's own archetypes).
  const onColor = [...mergedLists.keys()].filter((label) =>
    [...colorPrefix(label)].every((ch) => C.has(ch)),
  );

  const center = targetSize ?? MERGED.targetSize;
  const target = randInt(
    rng,
    center - MERGED.targetJitter,
    center + MERGED.targetJitter,
  );
  const counts = new Map<string, number>([...core].map((c) => [c, 1]));
  const bump = (c: string): void => {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  const fold = (set: Set<string>): void => {
    for (const c of shuffle(rng, [...set])) {
      if (poolSize(counts) >= target) break;
      const keep =
        (MERGED.themeKeep && themeCards.has(c)) ||
        MERGED.includeProb >= 1 ||
        rng() < MERGED.includeProb;
      if (keep) bump(c);
    }
  };

  // 3. The per-Dreamcaller theme core: always-seed a fraction of the on-color
  //    theme cards (theme cards that belong to some on-color list), so a themed
  //    pool reliably leads with its mechanic instead of drifting off-theme.
  if (MERGED.themeCoreFrac > 0 && themeCards.size > 0) {
    const onColorUnion = new Set<string>();
    for (const label of onColor) {
      for (const c of mergedLists.get(label) ?? []) onColorUnion.add(c);
    }
    for (const c of themeCards) {
      if (
        onColorUnion.has(c) &&
        (MERGED.themeCoreFrac >= 1 || rng() < MERGED.themeCoreFrac)
      ) {
        bump(c);
      }
    }
  }

  // 4. Fold the primary list, then 5. snowball the rest: repeatedly pick one
  //    unused on-color list (by `weighting`, default by overlap with what is
  //    already chosen) and fold it in until the target, or until 30 picks in a
  //    row add nothing new.
  fold(mergedLists.get(primary) ?? new Set());
  const used = new Set<string>([primary]);
  let stall = 0;
  while (poolSize(counts) < target && stall < 30) {
    const cands = onColor.filter((l) => !used.has(l));
    if (cands.length === 0) break;
    const poolKeys = new Set(counts.keys());
    const weightOf = (label: string): number => {
      const set = mergedLists.get(label) ?? new Set<string>();
      if (MERGED.weighting === "uniform") return 1;
      if (MERGED.weighting === "theme") {
        return (1 + themeOverlap(set)) ** MERGED.themeExp;
      }
      let ov = 0; // overlap with what is already chosen
      for (const c of set) if (poolKeys.has(c)) ov++;
      return 1 + ov;
    };
    const pick = weightedPick(rng, cands, cands.map(weightOf));
    used.add(pick);
    const before = poolSize(counts);
    fold(mergedLists.get(pick) ?? new Set());
    stall = poolSize(counts) === before ? stall + 1 : 0;
  }

  // 6. Identity + labels. The identity is the rolled archetype's colors; the
  //    labels record the primary archetype and the single mechanic archetype
  //    most represented in the finished pool.
  let domArch: string | null = null;
  let domScore = 0;
  for (const [a, set] of archLists) {
    let s = 0;
    for (const c of counts.keys()) if (set.has(c)) s++;
    if (s > domScore) {
      domScore = s;
      domArch = a;
    }
  }
  const selected = [`D:${primary}`];
  if (domArch) selected.push(`A:${domArch}`);
  return { C, selected, counts };
}
