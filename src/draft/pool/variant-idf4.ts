// The `idf4` variant: a tuned descendant of the shipping `idf3` that targets a
// higher build-around "adequacy" headline (the `scripts/buildaround-support-
// experiment.mjs` metric) by combining three levers validated by simulation:
//
//   1. PRUNED corpus. Before building anything, the raw decklists are scored for
//      self-adequacy — how well each deck, treated as a pool, supports its OWN
//      build-around payoffs — and the worst `IDF4_PRUNE_FRACTION` of the
//      payoff-carrying decks are dropped. The grower then never seeds from or
//      folds in a deck that carries a payoff it cannot support, so fewer traps
//      reach the pool. This lever reads `data/buildaround_support.json`: idf4 is
//      the only variant that consumes the support metadata.
//   2. COHERENT full-pool growth. Instead of ranking neighbours once against the
//      fixed starter (`growIdfPool`), idf4 grows greedily against the accumulating
//      pool centroid (`growCoherentPool`): a far deck that merely shares the
//      starter's signature card but little else is not folded in unless it also
//      coheres with what the pool already holds, so the pool drifts less and its
//      payoffs stay supported.
//   3. A SMALLER pool. idf4 pins the pool to `IDF4_POOL_SIZE` (~100) regardless of
//      the request's `targetSize`. A denser pool concentrates support behind the
//      payoffs it does carry, lifting per-payoff adequacy.
//
// Everything else is `idf3`'s signature steering verbatim: the same probe ->
// anchors -> capped affinity -> weighted categorical starter draw, run on the
// PRUNED corpus. idf4 is opt-in via `?algo=idf4`; `idf3` remains the default.

import supportMeta from "../../../data/buildaround_support.json" with { type: "json" };
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { generate } from "./variant-color-pool.ts";
import {
  type IdfDeck,
  growCoherentPool,
  idfCosine,
} from "./variant-idf.ts";
import { IDF2, idf2Corpus } from "./variant-idf2.ts";

// idf4 pins the pool to this many copies. It IGNORES the request's `targetSize`
// (production passes 200); idf4 always builds ~100. A denser pool concentrates a
// theme's support behind its payoffs, which lifts the build-around adequacy
// headline — one of idf4's three tuning levers.
const IDF4_POOL_SIZE = 100;

// Fraction of the payoff-carrying decklists dropped (worst-first by
// self-adequacy) when pruning the corpus. 0.25 was the measured ~95-headline
// point on earlier support metadata; this needs re-validation as the support
// metadata changes — it is a tuning dial, not a fixed constant.
const IDF4_PRUNE_FRACTION = 0.2;

// Demand-tier -> target support share (fraction of the pool, in copies). Ported
// from `TIER_TARGET` in `scripts/buildaround-support-experiment.mjs` so the prune
// scores decks against the same target the headline metric uses.
const TIER_TARGET: Record<number, number> = { 1: 0.1, 2: 0.18, 3: 0.25 };

// idf3's signature-steering constants, duplicated locally so retuning idf4 never
// touches idf3. See `variant-idf3.ts` for the meaning of each.
const IDF4_SIG = {
  // Exponent on the capped affinity — the strength dial.
  sigAlpha: 2,
  // Saturation cap on affinity — the soft gate that spreads on-identity decks.
  sigCap: 0.4,
  // Number of nearest real decks taken as anchors.
  anchorCount: 3,
  // Affinity floor, so off-identity decks keep a small diversity-shaped share.
  sigEps: 0.05,
};

// The support metadata shape this variant reads from buildaround_support.json.
// It is keyed by each card's stable id UUID and carries the current card name in
// `name`; this variant works in card-name space, so it indexes entries by name.
interface SupportEntry {
  name: string;
  needs?: { theme: string; tier: number }[];
  supports?: string[];
}
interface SupportMeta {
  cards: Record<string, SupportEntry>;
}
const META = supportMeta as SupportMeta;
const SUPPORT_BY_NAME = new Map<string, SupportEntry>(
  Object.values(META.cards).map((entry) => [entry.name, entry]),
);

// Self-adequacy of one raw decklist: treat it as a pool (copies capped at 2) and,
// for each payoff instance it carries (a card whose `needs` is non-empty, once per
// needed theme), compute adequacy = min(1, supportShare / TIER_TARGET[tier]),
// where supportShare = (pool copies of cards supporting that theme, capped at 2,
// EXCLUDING the payoff's own copies) / poolSize. The deck's self-adequacy is the
// mean adequacy over its payoff instances. Returns null when the deck carries no
// scored payoff at all — those decks have no payoff risk and are never "worst".
// Mirrors `scorePool` in the experiment script and `selfAdequacy` in
// `scripts/idf3-prune-corpus.mjs`.
function deckSelfAdequacy(deck: readonly string[]): number | null {
  const counts = new Map<string, number>();
  for (const c of deck) counts.set(c, Math.min(2, (counts.get(c) ?? 0) + 1));

  let size = 0;
  for (const v of counts.values()) size += v;
  if (size === 0) return null;

  // Support copies available per theme across the whole deck-pool.
  const supportCopies = new Map<string, number>();
  for (const [name, copies] of counts) {
    const entry = SUPPORT_BY_NAME.get(name);
    if (!entry) continue;
    for (const theme of entry.supports ?? []) {
      supportCopies.set(theme, (supportCopies.get(theme) ?? 0) + copies);
    }
  }

  const adequacies: number[] = [];
  for (const [name, copies] of counts) {
    const entry = SUPPORT_BY_NAME.get(name);
    if (!entry || !(entry.needs ?? []).length) continue;
    for (const need of entry.needs ?? []) {
      const target = TIER_TARGET[need.tier];
      // Exclude the payoff's own copies, so a lone lord isn't self-supported.
      const self = (entry.supports ?? []).includes(need.theme) ? copies : 0;
      const sc = (supportCopies.get(need.theme) ?? 0) - self;
      const share = sc / size;
      adequacies.push(target > 0 ? Math.min(1, share / target) : 1);
    }
  }
  if (adequacies.length === 0) return null;
  return adequacies.reduce((s, x) => s + x, 0) / adequacies.length;
}

// The decklists kept after pruning the worst `IDF4_PRUNE_FRACTION` of the
// payoff-carrying decks, ascending by self-adequacy. Decks that carry no payoff
// are always kept. This is the only lever-1 work; it is memoized per PoolData
// below because it is O(decks).
function prunedDecklists(
  decklists: readonly (readonly string[])[],
): (readonly string[])[] {
  const scored = decklists.map((d, i) => ({ i, a: deckSelfAdequacy(d) }));
  const withPayoff = scored
    .filter((x): x is { i: number; a: number } => x.a !== null)
    .sort((a, b) => a.a - b.a);
  const dropCount = Math.round(IDF4_PRUNE_FRACTION * withPayoff.length);
  const dropSet = new Set(withPayoff.slice(0, dropCount).map((x) => x.i));
  return decklists.filter((_, i) => !dropSet.has(i));
}

// The pruned PoolData (and its idf2 corpus) computed once per incoming PoolData.
// The build-around experiment runs thousands of generations; the corpus carries
// an O(decks^2) near-twin pass, so recomputing the pruned data and corpus per call
// would be far too slow. Keyed on the incoming `poolData`, exactly like
// `idf2Corpus`'s own cache, so a session that reuses one PoolData prunes once.
interface PrunedPool {
  // The pruned inputs handed to `idf2Corpus`. Null when no usable decklists exist
  // (the variant then falls back to the `default` algorithm).
  prunedPoolData: PoolData | null;
}
const prunedCache = new WeakMap<PoolData, PrunedPool>();
function prunedPoolFor(poolData: PoolData): PrunedPool {
  const cached = prunedCache.get(poolData);
  if (cached !== undefined) return cached;
  let result: PrunedPool = { prunedPoolData: null };
  const source = poolData.decklists;
  if (source && source.length > 0) {
    const kept = prunedDecklists(source);
    result = { prunedPoolData: { ...poolData, decklists: kept } };
  }
  prunedCache.set(poolData, result);
  return result;
}

// Build an idf4 pool: prune the corpus against the support metadata, steer the
// starter exactly like idf3 on the pruned corpus, then grow by coherent full-pool
// growth to `IDF4_POOL_SIZE`. Falls back to `default` when no usable decklists
// exist, and to the plain idf2 diversity draw when the signature is empty or
// carries no IDF weight (which falls straight out of the formula).
export function generateIdf4(
  rng: () => number,
  poolData: PoolData,
  signatureCards?: readonly string[],
  targetSize?: number,
): VariantResult {
  const { prunedPoolData } = prunedPoolFor(poolData);
  // No usable decklists: same fallback idf3 uses.
  if (!prunedPoolData) return generate(rng, poolData, undefined, targetSize);

  const corpus = idf2Corpus(prunedPoolData);
  if (!corpus) return generate(rng, poolData, undefined, targetSize);
  const { base, twinCount } = corpus;
  const { decks, idf } = base;
  const idfOf = (c: string): number => idf.get(c) ?? 0;

  // The diversity weight div(i) = 1 / (1 + nearTwins(i))^beta, reused from idf2.
  const beta = IDF2.diversityBeta;
  const div = twinCount.map((t) => 1 / (1 + t) ** beta);

  // Step 1 — the probe: signature cards present in the corpus with positive IDF
  // weight, treated as a synthetic deck so the standard IDF-cosine applies.
  const probeCards = new Set<string>();
  if (signatureCards) {
    for (const c of signatureCards) if (idfOf(c) > 0) probeCards.add(c);
  }

  // Step 2/3 — anchors and affinity: max cosine of each deck to any of the
  // up-to-`anchorCount` decks most similar to the probe (dense, because an anchor
  // is a whole deck). Affinity is 0 everywhere when the probe is empty.
  const affinity = new Array<number>(decks.length).fill(0);
  if (probeCards.size > 0) {
    let psq = 0;
    for (const c of probeCards) psq += idfOf(c) ** 2;
    const probe: IdfDeck = { cards: probeCards, norm: Math.sqrt(psq) || 1 };
    const anchors = decks
      .map((d, i) => ({ i, s: idfCosine(probe, d, idfOf) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, IDF4_SIG.anchorCount)
      .map((x) => x.i);
    for (let i = 0; i < decks.length; i++) {
      let mx = 0;
      for (const a of anchors) {
        const s = a === i ? 1 : idfCosine(decks[a], decks[i], idfOf);
        if (s > mx) mx = s;
      }
      affinity[i] = mx;
    }
  }

  // Step 4 — the starter weight (idf3's A″ formula).
  const { sigAlpha, sigCap, sigEps } = IDF4_SIG;
  const weights = decks.map(
    (_, i) => (sigEps + Math.min(affinity[i], sigCap)) ** sigAlpha * div[i],
  );

  // Step 5 — draw the starter from the categorical distribution (one rng draw).
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  let startIdx = weights.length - 1;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      startIdx = i;
      break;
    }
  }

  // Step 6 — grow the pool by coherent full-pool growth to idf4's pinned size.
  // The request's `targetSize` is deliberately ignored.
  const counts = growCoherentPool(decks, idfOf, startIdx, IDF4_POOL_SIZE);

  return {
    C: new Set(),
    selected: ["idf4", `deck#${String(startIdx)}`],
    counts,
    starterDeck: [...decks[startIdx].cards],
  };
}

/** Strategy adapter for the `idf4` algorithm. */
export const idf4Strategy: PoolStrategy = {
  id: "idf4",
  description:
    "idf3's signature steering on a self-adequacy-pruned corpus, grown by " +
    "coherent full-pool growth to a denser ~100-card pool for higher " +
    "build-around support.",
  generate: ({ rng, poolData, signatureCards, targetSize }) =>
    generateIdf4(rng, poolData, signatureCards, targetSize),
};
