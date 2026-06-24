// The `picksig` variant: `pickcohere` steered toward a Dreamcaller. It shares
// `pickcohere`'s corpus (the `pickfit` pick-record affinity) and its best-of-K
// coherence selection verbatim, changing only ONE thing — where the candidate
// seeds come from. Where `pickcohere` draws its K seeds UNIFORMLY from the whole
// corpus, `picksig` draws them from a distribution biased toward the cards that
// partner the chosen Dreamcaller's SIGNATURE (its short list of distinctive card
// UUIDs, `dreamcaller.signatureCards`). The grown pool therefore lands on the
// Dreamcaller's region of the card space while best-of-K coherence still steers
// away from scattered, poorly-supported pools.
//
// The bias mirrors `idf3`'s signature scheme (`docs/cards2/idf3_signature_design.md`)
// but in pick-affinity space instead of decklist-cosine space, and the match is
// direct rather than name-mediated: signature UUIDs and the pick corpus share the
// same lowercase cards_v2 UUID key space, so a signature card is located in the
// corpus by identity. A card's seed weight is
//   weight(c) = ( sigEps + min( sigAffinity(c), sigCap ) ) ^ sigAlpha
// where sigAffinity(c) is c's normalised partnership to the nearest signature
// card (the signature cards themselves are the anchors, affinity 1). Two dials
// shape it, exactly as in `idf3`:
//   * sigCap SATURATES the affinity — every strongly on-theme card competes at
//     the same weight, so the draw SPREADS across the whole identity instead of
//     collapsing onto one cluster. This is the variety lever: a combo seed and an
//     aggro seed both sit at the cap, and either can win a given run, so one
//     Dreamcaller yields many distinct pools leaning in different directions.
//   * sigAlpha is the STRENGTH — how sharply on-theme cards out-weigh the rest.
// With no signature (or none of its cards present in the corpus) every affinity
// is 0, every weight is the constant `sigEps ^ sigAlpha`, and the weighted draw
// reduces to a uniform draw — so `picksig` with an empty signature is identical
// to `pickcohere`, with no separate code path. Cards are identified by UUID
// throughout, exactly as `pickfit`/`pickcohere`.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
  weightedSeedDraw,
} from "./affinity-grower.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { PICKCOHERE } from "./variant-pickcohere.ts";
import { buildPickfitCorpus } from "./variant-pickfit.ts";

interface PickSigTuning extends AffinityGrowerTuning {
  targetSize: number;
  // Exponent on the capped signature affinity — the strength dial. 0 cancels the
  // signature factor (every weight becomes 1), making the seed draw uniform and
  // `picksig` identical to `pickcohere`.
  sigAlpha: number;
  // Saturation cap on the signature affinity — the variety lever. Affinity at or
  // above this counts the same, so all on-theme cards share the top weight and the
  // seed draw spreads across the whole identity rather than its single most
  // central card.
  sigCap: number;
  // Affinity floor, so off-theme cards keep a small share of the seed draw rather
  // than dropping out entirely — a Dreamcaller's pool stays mostly on-theme but
  // not pathologically narrow.
  sigEps: number;
}
// Shares every grower/best-of-K field with `PICKCOHERE` so the ONLY deliberate
// difference is the steered seed draw; the three `sig*` dials govern that draw.
// With these defaults a signature concentrates the draw onto its partners while
// `sigCap` keeps the on-theme region wide enough that one Dreamcaller still yields
// many distinct, differently-leaning pools (validated by
// `scripts/picksig-signature-experiment.mjs`).
export const PICKSIG: PickSigTuning = {
  targetSize: PICKCOHERE.targetSize,
  cap: PICKCOHERE.cap,
  seedAffinityWeight: PICKCOHERE.seedAffinityWeight,
  priorWeight: PICKCOHERE.priorWeight,
  secondCopyFactor: PICKCOHERE.secondCopyFactor,
  topPartnerCount: PICKCOHERE.topPartnerCount,
  seedDraws: PICKCOHERE.seedDraws,
  sigAlpha: 2,
  sigCap: 0.4,
  sigEps: 0.05,
};

// Reuses `pickfit`'s corpus verbatim: `picksig` differs from `pickcohere` only in
// seed selection, so it must read the exact same affinity data.
export function buildPickSigCorpus(poolData: PoolData): AffinityCorpus | null {
  return buildPickfitCorpus(poolData);
}

// Resolve a Dreamcaller's signature entries onto the corpus's UUID key space.
// At runtime `signatureCards` contains the stable cards_v2 UUIDs from
// `dreamcaller.signatureCardIds`, so each entry is first matched as a literal
// lowercase UUID in the corpus — the fast, collision-free path. For synthetic
// test corpora that pass opaque string keys directly, the same path still
// applies. As a legacy fallback, entries that are not found as UUIDs are
// looked up as display names via `cardIdByName`; this path should not trigger
// in production since `signatureCardIds` are already UUIDs.
// Returns the set of corpus keys the signature locates.
export function resolveSignatureToCorpus(
  corpus: AffinityCorpus,
  signatureCards: readonly string[],
  cardIdByName: ReadonlyMap<string, string> | undefined,
): Set<string> {
  const corpusKeys = new Set(corpus.cards);
  const resolved = new Set<string>();
  for (const entry of signatureCards) {
    const asId = entry.toLowerCase();
    if (corpusKeys.has(asId)) {
      resolved.add(asId);
      continue;
    }
    // Legacy fallback: try interpreting the entry as a display name.
    const byName = cardIdByName?.get(entry)?.toLowerCase();
    if (byName !== undefined && corpusKeys.has(byName)) resolved.add(byName);
  }
  return resolved;
}

// The normalised signature affinity per corpus card: how strongly each card
// partners the chosen Dreamcaller's signature, in [0, 1]. A card's raw score is
// its strongest partnership (in EITHER direction) to any signature card —
// affinity rows are normalised per source card, so the max captures "c is tightly
// connected to the signature set" — and the non-anchor scores are then normalised
// so the strongest on-theme partner is 1. The signature cards themselves are the
// anchors at affinity 1. Signature entries are resolved onto the corpus by
// `cardIdByName` (name → UUID); pass it from `poolData`. Returns an empty map when
// no signature card resolves into the corpus (an empty or wholly-off-corpus
// signature). Operates in the corpus's UUID key space.
export function buildSignatureAffinity(
  corpus: AffinityCorpus,
  signatureCards: readonly string[] | undefined,
  cardIdByName?: ReadonlyMap<string, string>,
): Map<string, number> {
  const affinityByCard = new Map<string, number>();
  if (!signatureCards || signatureCards.length === 0) return affinityByCard;

  const signatureSet = resolveSignatureToCorpus(corpus, signatureCards, cardIdByName);
  if (signatureSet.size === 0) return affinityByCard;

  const { affinity } = corpus;
  // A card's strongest partnership to any signature card, in either direction.
  const rawAff = (c: string): number => {
    let mx = 0;
    const rowC = affinity.get(c);
    for (const s of signatureSet) {
      const fromS = affinity.get(s)?.get(c) ?? 0;
      const fromC = rowC?.get(s) ?? 0;
      const v = fromS > fromC ? fromS : fromC;
      if (v > mx) mx = v;
    }
    return mx;
  };

  // Normalise the non-anchor raws so the strongest on-theme partner maps to 1.
  let maxRaw = 0;
  for (const c of corpus.cards) {
    if (signatureSet.has(c)) continue;
    const v = rawAff(c);
    if (v > maxRaw) maxRaw = v;
  }

  for (const c of corpus.cards) {
    affinityByCard.set(
      c,
      signatureSet.has(c) ? 1 : maxRaw > 0 ? rawAff(c) / maxRaw : 0,
    );
  }
  return affinityByCard;
}

// The per-card seed weights for one signature: the capped-affinity formula
// applied to {@link buildSignatureAffinity}. Returns an empty map when no
// signature card resolves into the corpus, which makes the weighted draw fall
// back to uniform — exactly `pickcohere`.
export function buildSignatureSeedWeights(
  corpus: AffinityCorpus,
  signatureCards: readonly string[] | undefined,
  tuning: PickSigTuning,
  cardIdByName?: ReadonlyMap<string, string>,
): Map<string, number> {
  const affinityByCard = buildSignatureAffinity(corpus, signatureCards, cardIdByName);
  if (affinityByCard.size === 0) return new Map<string, number>();

  const { sigAlpha, sigCap, sigEps } = tuning;
  const weights = new Map<string, number>();
  for (const [c, sigAffinity] of affinityByCard) {
    weights.set(c, (sigEps + Math.min(sigAffinity, sigCap)) ** sigAlpha);
  }
  return weights;
}

// Build a `picksig` pool: draw `PICKSIG.seedDraws` candidate seeds from the
// signature-biased distribution, grow a pool from each, keep the most internally
// coherent, emitted keyed by UUID. Falls back to the `default`
// algorithm when no draft records are bundled, and to plain `pickcohere` when the
// signature is empty or none of its cards are in the corpus.
export function generatePickSig(
  rng: () => number,
  poolData: PoolData,
  signatureCards?: readonly string[],
): VariantResult {
  const corpus = buildPickSigCorpus(poolData);
  const seedDraw =
    corpus === null
      ? undefined
      : weightedSeedDraw(
          buildSignatureSeedWeights(
            corpus,
            signatureCards,
            PICKSIG,
            poolData.cardIdByName,
          ),
        );
  return growPoolFromCorpus(
    rng,
    poolData,
    corpus,
    PICKSIG.targetSize,
    PICKSIG,
    "picksig",
    seedDraw,
  );
}

/** Strategy adapter for the `picksig` algorithm. */
export const pickSigStrategy: PoolStrategy = {
  id: "picksig",
  description:
    "Like pickcohere, but draws its candidate seeds from a distribution biased " +
    "toward the chosen Dreamcaller's signature cards, so the grown pool is " +
    "thematically tied to the Dreamcaller while best-of-K coherence keeps it " +
    "focused. Reduces to pickcohere when no signature is given.",
  generate: ({ rng, poolData, signatureCards }) =>
    generatePickSig(rng, poolData, signatureCards),
};
