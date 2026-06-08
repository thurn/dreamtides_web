// The `seed` variant: a single-card affinity-grown pool. It marries the two
// ideas this prototype already trusts —
//   * fresh20 / replay scoring: cards belong together when they CO-OCCUR in real
//     decks, weighted by IDF so "fits with" means "shares distinctive cards"
//     rather than "shares popular staples" (the same signal the replay/fresh20
//     deck-fit model reads, see `draft/replay/fit-model.ts`);
//   * the decklist pool grower: start from one point and expand outward by
//     affinity until the pool reaches a target size (the `idf` family).
// — but operates at the granularity of a single card instead of a whole deck.
//
// It draws ONE card uniformly at random from the corpus (every card that appears
// in a real deck is equally likely to be the seed), then grows a pool around it
// one copy at a time. Each step adds the not-yet-maxed card whose blended
// affinity is highest, where the blend is
//   score(c) = w · affinityToSeed(c) + (1 - w) · affinityToPool(c) + p · prior(c)
// with `affinityToPool` recomputed against the cards already chosen, so the pool
// stays coherent with itself as it grows, not just with the seed. The blend
// weight `w` (SEED.seedAffinityWeight) is the one dial that trades "hug the seed
// card" against "cohere internally"; both ends of growth read the same
// IDF-weighted co-occurrence. Copies are capped at 2: a card earns its second
// copy only when its affinity still beats fresh first copies after the
// SEED.secondCopyFactor discount, so the most central cards double and the
// fringe stays singleton. The pool grows to SEED.targetSize total copies.
//
// Like the rest of the pool family this reads nothing but the bundled decklists —
// no colors, tides, archetype labels, dreamcallers, or signatures. The only
// randomness is which card seeds the pool.
//
// Cards are identified by their stable cards_v2 UUID, not by display name, so a
// card rename never shifts the draw, the growth tie-breaks, or the provenance.
// The decklist corpus arrives keyed by current name; this variant translates it
// into UUID space on the way in (`PoolData.cardIdByName`) and maps the finished
// pool back onto current names on the way out (`PoolData.cardNameById`), leaving
// the downstream name→card-number resolution untouched. When the source cards
// carry no id (some experiments and tests), both maps are absent and the variant
// falls back to keying by name.

import type { PoolStrategy } from "./strategy.ts";
import type {
  PoolData,
  SeedPoolCardProvenance,
  SeedPoolProvenance,
  VariantResult,
} from "./types.ts";
import { generate } from "./variant-color-pool.ts";
import { idfCorpus } from "./variant-idf.ts";

// Tuning for the `seed` variant. One-stop edit, mirroring the `IDF`/`IDF3`
// constant blocks the sibling variants use.
interface SeedTuning {
  // Desired pool size in TOTAL copies (each card contributes 1 or 2). The grower
  // adds one copy at a time and stops the moment it reaches this. This is the
  // "build a pool of 150 cards" target — change it here to retune pool size.
  targetSize: number;
  // Max copies of any single card. The draft engine caps every pool at 2
  // downstream, so values above 2 have no extra effect.
  cap: number;
  // The blend weight `w`: how much a candidate's affinity to the SEED card counts
  // versus its affinity to the cards already in the pool. 1 = grow purely off the
  // seed (a fixed-centre star); 0 = grow purely off internal coherence (a drifting
  // cluster). Between the two the pool both hugs the seed and coheres with itself.
  seedAffinityWeight: number;
  // Weight on the global play-rate prior, a gentle nudge toward cards that simply
  // see real play so the pool is not pure synergy with no payoff. Small by design;
  // affinity leads.
  priorWeight: number;
  // Discount applied to a card's score when scoring its SECOND copy, so a fresh
  // on-theme first copy out-competes doubling a card already in the pool unless
  // that card is markedly more central. Lower = fewer doubles / wider pool.
  secondCopyFactor: number;
  // How many of the seed's strongest affinity partners to surface on the "why
  // cards" / pool-viewer provenance panels.
  topPartnerCount: number;
}
export const SEED: SeedTuning = {
  targetSize: 150,
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  topPartnerCount: 8,
};

// IDF-weighted card-to-card affinity built from the corpus, the same construction
// the replay deck-fit model uses for its co-occurrence term: for every pair of
// cards sharing a real deck, accumulate idf(a)·idf(b), then normalise each row by
// the source card's document frequency so `affinity.get(a).get(b)` reads as "how
// strongly b partners a, averaged over the decks that run a". Asymmetric after
// normalisation (a's and b's document frequencies differ), which is fine: growth
// always scores a candidate's partnership with cards already chosen.
interface SeedCorpus {
  // Every distinct card key appearing in the (size-filtered) corpus — the uniform
  // universe the seed card is drawn from. A key is the card's stable cards_v2
  // UUID when available, else its name (the fallback when no id map is supplied).
  cards: string[];
  // affinity[a][b] = mean IDF-weighted partnership strength of b for decks with a,
  // keyed by card key on both axes.
  affinity: Map<string, Map<string, number>>;
  // Global play-rate prior: df(c) / numberOfDecks, in [0, 1], keyed by card key.
  prior: Map<string, number>;
}

const seedCorpusCache = new WeakMap<PoolData, SeedCorpus | null>();

function buildSeedCorpus(poolData: PoolData): SeedCorpus | null {
  const cached = seedCorpusCache.get(poolData);
  if (cached !== undefined) return cached;

  // Reuse the shared IDF corpus (size-filtered decks + per-card IDF weights), so
  // corpus hygiene and the IDF definition stay identical to the other variants.
  const corpus = idfCorpus(poolData);
  let result: SeedCorpus | null = null;
  if (corpus && corpus.decks.length > 0) {
    const { decks, idf } = corpus;
    // IDF weights are keyed by the corpus's display names; identity (df, affinity,
    // prior, every map key below) is keyed by the rename-proof card key.
    const idfOf = (name: string): number => idf.get(name) ?? 0;
    const keyOf = (name: string): string =>
      poolData.cardIdByName?.get(name) ?? name;
    const n = decks.length;

    // Document frequency per card key, and the play-rate prior derived from it.
    // Counted once per deck per key, so two names that share a key (a duplicate
    // display name) do not inflate the frequency.
    const df = new Map<string, number>();
    for (const deck of decks) {
      const keys = new Set<string>();
      for (const c of deck.cards) keys.add(keyOf(c));
      for (const k of keys) df.set(k, (df.get(k) ?? 0) + 1);
    }
    const prior = new Map<string, number>();
    for (const [c, d] of df) prior.set(c, d / n);

    // Raw IDF-weighted co-occurrence over every within-deck card pair, accumulated
    // by card key while the IDF weights are read from the source names.
    const cooc = new Map<string, Map<string, number>>();
    const bump = (a: string, b: string, w: number): void => {
      let row = cooc.get(a);
      if (row === undefined) {
        row = new Map<string, number>();
        cooc.set(a, row);
      }
      row.set(b, (row.get(b) ?? 0) + w);
    };
    for (const deck of decks) {
      const names = [...deck.cards];
      for (let i = 0; i < names.length; i += 1) {
        const aKey = keyOf(names[i]);
        const wa = idfOf(names[i]);
        if (wa === 0) continue;
        for (let j = i + 1; j < names.length; j += 1) {
          const bKey = keyOf(names[j]);
          if (bKey === aKey) continue;
          const w = wa * idfOf(names[j]);
          if (w === 0) continue;
          bump(aKey, bKey, w);
          bump(bKey, aKey, w);
        }
      }
    }

    // Normalise each row by the source card's document frequency.
    const affinity = new Map<string, Map<string, number>>();
    for (const [a, row] of cooc) {
      const dfa = df.get(a) ?? 0;
      if (dfa === 0) continue;
      const normRow = new Map<string, number>();
      for (const [b, w] of row) normRow.set(b, w / dfa);
      affinity.set(a, normRow);
    }

    result = { cards: [...df.keys()], affinity, prior };
  }

  seedCorpusCache.set(poolData, result);
  return result;
}

// Grow a pool from one seed card by greedy blended-affinity expansion, operating
// entirely on card keys (UUIDs when available). Returns the capped copy counts
// and a per-card provenance record — each keyed by card key, which the caller
// maps onto current names — describing, for every card, the order it entered, its
// (normalised) affinity to the seed and to the pool at that moment, and its
// blended score — the "how the pool grew" story.
function growSeedPool(
  corpus: SeedCorpus,
  seedCard: string,
  targetSize: number,
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

  const { seedAffinityWeight: w, priorWeight, secondCopyFactor } = SEED;

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
      if ((counts.get(c) ?? 0) >= SEED.cap) continue;
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
      if (have >= SEED.cap) continue;
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
    .slice(0, SEED.topPartnerCount);

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

// Remap a UUID-keyed provenance record onto current display names, the form the
// public {@link SeedPoolProvenance} and the downstream name→card-number
// resolution expect. `nameOf` is the identity when the keys are already names.
function toNamedProvenance(
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

// Build a `seed` pool: draw one card uniformly at random from the corpus, then
// grow the pool around it by blended IDF-affinity to `SEED.targetSize` copies.
// Cards are drawn and grown in UUID-key space (rename-proof); the finished pool
// is mapped back onto current names. Ignores `signatureCards`, `seedArchetypes`,
// `themeArchetypes`, and the passed `targetSize` (the variant owns its size via
// `SEED.targetSize`). Falls back to the `default` algorithm when no usable
// decklists are bundled.
export function generateSeed(rng: () => number, poolData: PoolData): VariantResult {
  const corpus = buildSeedCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) return generate(rng, poolData);

  // Step 1 — draw the seed uniformly at random from every corpus card key.
  const seedKey = corpus.cards[Math.floor(rng() * corpus.cards.length)];

  // Step 2 — grow the pool from it by blended affinity, entirely in key space.
  const { counts, provenance } = growSeedPool(corpus, seedKey, SEED.targetSize);

  // Step 3 — map the UUID-keyed pool back onto current display names so the
  // downstream name→card-number resolution stays unchanged. When no id map is
  // supplied the key is already a name and `nameOf` is the identity.
  const nameOf = (key: string): string => poolData.cardNameById?.get(key) ?? key;
  const namedCounts = new Map<string, number>();
  for (const [key, copies] of counts) namedCounts.set(nameOf(key), copies);

  return {
    C: new Set(),
    selected: ["seed", `card:${nameOf(seedKey)}`],
    counts: namedCounts,
    seedProvenance: toNamedProvenance(provenance, nameOf),
  };
}

/** Strategy adapter for the `seed` algorithm. */
export const seedStrategy: PoolStrategy = {
  id: "seed",
  description:
    "Draw one card at random and grow a 150-card pool around it by IDF-weighted " +
    "co-occurrence affinity — to the seed and to the cards already chosen.",
  // Deliberately ignores `request.targetSize`: the variant pins its own size via
  // `SEED.targetSize`, so the quest's global pool target does not override it.
  generate: ({ rng, poolData }) => generateSeed(rng, poolData),
};
