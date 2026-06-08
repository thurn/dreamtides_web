// The shared affinity-grower behind the single-card-seeded pool variants. It
// draws one card and grows a pool around it by greedy blended affinity, where
// each step adds the not-yet-maxed card whose blend is highest:
//   score(c) = w · affinityToSeed(c) + (1 - w) · affinityToPool(c) + p · prior(c)
// `affinityToPool` is recomputed against the cards already chosen, so the pool
// stays coherent with itself as it grows, not just with the seed. The blend
// weight `w` trades "hug the seed card" against "cohere internally". Copies are
// capped: a card earns its second copy only when its affinity still beats fresh
// first copies after the `secondCopyFactor` discount, so the most central cards
// double and the fringe stays singleton.
//
// The grower is agnostic to where the affinity and prior come from: callers
// supply an {@link AffinityCorpus} and the grower does the rest. `seed` builds
// its corpus from IDF-weighted decklist co-occurrence; `pickfit` builds its
// corpus from real draft pick records. Because both call this same grower, the
// only variable between them is the corpus — an apples-to-apples comparison.
//
// Everything operates in an opaque card-key space (the caller's stable identity,
// a cards_v2 UUID when available, else the card name); the caller maps keys back
// onto display names on the way out.

import {
  missingPoolData,
  type PoolData,
  type SeedPoolCardProvenance,
  type SeedPoolProvenance,
  type VariantResult,
} from "./types.ts";

// IDF-weighted card-to-card affinity plus a play-rate prior over a fixed card
// universe. `affinity.get(a).get(b)` reads as "how strongly b partners a";
// asymmetric in general (each row is normalised by its own source card). The
// grower only ever scores a candidate's partnership with cards already chosen.
export interface AffinityCorpus {
  // Every distinct card key in the corpus — the uniform universe the seed card is
  // drawn from. A key is the card's stable identity (cards_v2 UUID when
  // available, else its name).
  cards: string[];
  // affinity[a][b] = partnership strength of b for the source card a, keyed by
  // card key on both axes.
  affinity: Map<string, Map<string, number>>;
  // Play-rate prior in [0, 1], keyed by card key.
  prior: Map<string, number>;
}

// The dials the grower reads. Each variant owns its own block of these and
// passes them in, mirroring the `SEED`/`PICKFIT` constant blocks.
export interface AffinityGrowerTuning {
  // Max copies of any single card.
  cap: number;
  // The blend weight `w`: affinity to the SEED card versus affinity to the cards
  // already in the pool. 1 = grow purely off the seed; 0 = purely off internal
  // coherence.
  seedAffinityWeight: number;
  // Weight on the global play-rate prior, a gentle nudge toward cards that simply
  // see real play so the pool is not pure synergy with no payoff.
  priorWeight: number;
  // Discount applied to a card's score when scoring its SECOND copy, so a fresh
  // on-theme first copy out-competes doubling a card already in the pool unless
  // that card is markedly more central.
  secondCopyFactor: number;
  // How many of the seed's strongest affinity partners to surface on the "why
  // cards" / pool-viewer provenance panels.
  topPartnerCount: number;
  // How many candidate seeds to draw before growing the final pool. With the
  // default of 1 the grower draws a single seed and grows it (uniform seeding).
  // With K > 1 it grows a pool from each of K independently-drawn seeds and keeps
  // the most internally COHERENT one — the pool whose cards partner each other
  // most strongly (see {@link poolCoherence}). A generic seed (premium removal,
  // card draw) grows a loose, low-coherence pool, so best-of-K steers away from
  // those without any external metadata. Reads only the corpus affinity, so it
  // stays purely draft-record-derived.
  seedDraws?: number;
}

// Grow a pool from one seed card by greedy blended-affinity expansion, operating
// entirely on card keys. Returns the capped copy counts and a per-card
// provenance record — each keyed by card key, which the caller maps onto current
// names — describing, for every card, the order it entered, its (normalised)
// affinity to the seed and to the pool at that moment, and its blended score —
// the "how the pool grew" story.
export function growAffinityPool(
  corpus: AffinityCorpus,
  seedCard: string,
  targetSize: number,
  tuning: AffinityGrowerTuning,
): { counts: Map<string, number>; provenance: SeedPoolProvenance } {
  const { affinity, prior } = corpus;
  const affOf = (a: string): Map<string, number> =>
    affinity.get(a) ?? new Map<string, number>();
  const priorOf = (c: string): number => prior.get(c) ?? 0;

  // Seed affinity, normalised once so it lands in [0, 1] alongside the pool term.
  const seedRow = affOf(seedCard);
  let maxSeedAff = 0;
  for (const v of seedRow.values()) if (v > maxSeedAff) maxSeedAff = v;
  const seedAffNorm = (c: string): number =>
    maxSeedAff > 0 ? (seedRow.get(c) ?? 0) / maxSeedAff : 0;

  // Running sum of each card's affinity to the cards already in the pool; the
  // mean (divided by the distinct count) is the pool-coherence term. Updated by
  // folding in a card's affinity row each time a NEW card joins the pool.
  const poolAffSum = new Map<string, number>();
  const addToPoolAff = (card: string): void => {
    for (const [b, w] of affOf(card)) poolAffSum.set(b, (poolAffSum.get(b) ?? 0) + w);
  };

  const counts = new Map<string, number>();
  const cardProvenanceByName: Record<string, SeedPoolCardProvenance> = {};
  const order: string[] = [];

  const { seedAffinityWeight: w, priorWeight, secondCopyFactor, cap } = tuning;

  // Seed the pool: copy 1 of the drawn card, provenance order 0.
  counts.set(seedCard, 1);
  addToPoolAff(seedCard);
  order.push(seedCard);
  cardProvenanceByName[seedCard] = {
    isSeed: true,
    copies: 1,
    addOrder: 0,
    seedAffinity: 1,
    poolAffinity: 1,
    blendedScore: 1,
  };
  let total = 1;
  let distinct = 1;

  while (total < targetSize) {
    // First pass: raw pool-affinity means, to min-max normalise this step.
    let maxPoolRaw = 0;
    for (const c of corpus.cards) {
      if ((counts.get(c) ?? 0) >= cap) continue;
      const raw = (poolAffSum.get(c) ?? 0) / distinct;
      if (raw > maxPoolRaw) maxPoolRaw = raw;
    }

    // Second pass: blended marginal score; pick the best (card, copy) to add.
    let bestCard: string | null = null;
    let bestScore = -Infinity;
    let bestSeedAff = 0;
    let bestPoolAff = 0;
    let bestIsSecondCopy = false;
    for (const c of corpus.cards) {
      const have = counts.get(c) ?? 0;
      if (have >= cap) continue;
      const sSeed = seedAffNorm(c);
      const sPool = maxPoolRaw > 0 ? (poolAffSum.get(c) ?? 0) / distinct / maxPoolRaw : 0;
      const base = w * sSeed + (1 - w) * sPool + priorWeight * priorOf(c);
      const marginal = have === 1 ? base * secondCopyFactor : base;
      // Tie-break: prefer a fresh first copy over a second copy, then lower key.
      if (
        marginal > bestScore ||
        (marginal === bestScore &&
          bestCard !== null &&
          (have < (counts.get(bestCard) ?? 0) ||
            (have === (counts.get(bestCard) ?? 0) && c < bestCard)))
      ) {
        bestScore = marginal;
        bestCard = c;
        bestSeedAff = sSeed;
        bestPoolAff = sPool;
        bestIsSecondCopy = have === 1;
      }
    }

    // Corpus exhausted (everything already at the cap): stop short of target.
    if (bestCard === null || bestScore <= 0) break;

    const have = counts.get(bestCard) ?? 0;
    counts.set(bestCard, have + 1);
    total += 1;
    if (!bestIsSecondCopy) {
      distinct += 1;
      addToPoolAff(bestCard);
      order.push(bestCard);
      cardProvenanceByName[bestCard] = {
        isSeed: false,
        copies: 1,
        addOrder: order.length - 1,
        seedAffinity: bestSeedAff,
        poolAffinity: bestPoolAff,
        blendedScore: bestScore,
      };
    } else {
      cardProvenanceByName[bestCard] = {
        ...cardProvenanceByName[bestCard],
        copies: 2,
      };
    }
  }

  // The seed's strongest partners actually pulled into the pool, for the panels.
  const topPartnerCardNames = order
    .filter((c) => c !== seedCard)
    .sort((a, b) => (seedRow.get(b) ?? 0) - (seedRow.get(a) ?? 0) || (a < b ? -1 : 1))
    .slice(0, tuning.topPartnerCount);

  let doubledCardCount = 0;
  for (const v of counts.values()) if (v >= 2) doubledCardCount += 1;

  const provenance: SeedPoolProvenance = {
    seedCardName: seedCard,
    targetSize,
    seedAffinityWeight: w,
    distinctCardCount: distinct,
    totalCopies: total,
    doubledCardCount,
    topPartnerCardNames,
    cardProvenanceByName,
  };
  return { counts, provenance };
}

// The internal coherence of a grown pool: the mean affinity over every ordered
// pair of DISTINCT cards in the pool, read from the corpus affinity. High means
// the pool's cards strongly partner each other (a tight, focused pool); low
// means a loose, scattered pool — the signature of a generic seed that pulled in
// cards with little to do with one another. Used to choose between best-of-K
// candidate seeds. Operates in the corpus's card-key space.
export function poolCoherence(
  counts: Map<string, number>,
  affinity: Map<string, Map<string, number>>,
): number {
  const ids = [...counts.keys()];
  let sum = 0;
  let pairs = 0;
  for (const a of ids) {
    const row = affinity.get(a);
    for (const b of ids) {
      if (a === b) continue;
      sum += row?.get(b) ?? 0;
      pairs += 1;
    }
  }
  return pairs > 0 ? sum / pairs : 0;
}

// Run a single-card-seeded pool from a prebuilt corpus, the shape every
// affinity-grown variant shares: fall back to the default algorithm when the
// corpus is empty, otherwise draw `tuning.seedDraws` candidate seeds (default 1)
// uniformly, grow a pool from each, keep the most coherent, grow to `targetSize`,
// and map the id-keyed result back onto current display names via `cardNameById`.
// `label` is the variant's id, recorded in `selected` for provenance.
export function growPoolFromCorpus(
  rng: () => number,
  poolData: PoolData,
  corpus: AffinityCorpus | null,
  targetSize: number,
  tuning: AffinityGrowerTuning,
  label: string,
): VariantResult {
  if (!corpus || corpus.cards.length === 0) {
    missingPoolData(
      label,
      "its draft-record corpus is empty (the draft records were not loaded)",
    );
  }

  // Best-of-K: draw K seeds, grow each, keep the most internally coherent. All K
  // rng() draws are consumed regardless of the winner, so the result stays
  // deterministic in the seed. K = 1 is a single uniform draw.
  const draws = Math.max(1, Math.floor(tuning.seedDraws ?? 1));
  let seedKey = "";
  let counts: Map<string, number> | null = null;
  let provenance: SeedPoolProvenance | null = null;
  let bestCoherence = -Infinity;
  for (let i = 0; i < draws; i++) {
    const candidate = corpus.cards[Math.floor(rng() * corpus.cards.length)];
    const grown = growAffinityPool(corpus, candidate, targetSize, tuning);
    const coherence = poolCoherence(grown.counts, corpus.affinity);
    if (coherence > bestCoherence) {
      bestCoherence = coherence;
      seedKey = candidate;
      counts = grown.counts;
      provenance = grown.provenance;
    }
  }
  // The loop runs at least once, so a winner is always chosen; this guard only
  // satisfies the type checker (and narrows the nullable accumulators).
  if (counts === null || provenance === null) {
    missingPoolData(label, "no candidate seed could be drawn from its corpus");
  }

  const nameOf = (key: string): string => poolData.cardNameById?.get(key) ?? key;
  const namedCounts = new Map<string, number>();
  for (const [key, copies] of counts) namedCounts.set(nameOf(key), copies);

  return {
    C: new Set(),
    selected: [label, `card:${nameOf(seedKey)}`],
    counts: namedCounts,
    seedProvenance: toNamedProvenance(provenance, nameOf),
  };
}

// Remap a key-keyed provenance record onto current display names, the form the
// public {@link SeedPoolProvenance} and the downstream name→card-number
// resolution expect. `nameOf` is the identity when the keys are already names.
export function toNamedProvenance(
  provenance: SeedPoolProvenance,
  nameOf: (key: string) => string,
): SeedPoolProvenance {
  const cardProvenanceByName: Record<string, SeedPoolCardProvenance> = {};
  for (const [key, entry] of Object.entries(provenance.cardProvenanceByName)) {
    cardProvenanceByName[nameOf(key)] = entry;
  }
  return {
    ...provenance,
    seedCardName: nameOf(provenance.seedCardName),
    topPartnerCardNames: provenance.topPartnerCardNames.map(nameOf),
    cardProvenanceByName,
  };
}
