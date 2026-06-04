// The `idf3` variant: `idf2`'s diversity-biased decklist pool, steered toward a
// chosen Dreamcaller by a tiny piece of new data — a SIGNATURE, a short list of
// distinctive card names standing in for "what this Dreamcaller wants to do".
// Like `idf`/`idf2` it reads nothing but the bundled decklists plus those card
// names — no colors, tides, archetype labels, or other metadata.
//
// Building a decklist pool comes down to picking ONE starter deck and growing the
// pool from its nearest neighbours (the growth in `idf`), so the only lever is
// the starter draw. `idf2` draws it by inverse near-twin weight `div(i)` (broad
// but Dreamcaller-agnostic); `idf3` multiplies one more factor onto that weight
// so the starter lands on the Dreamcaller's region of the corpus while still
// spreading across the many decks that fit it. Two refinements make it work
// (`docs/cards2/idf3_signature_design.md`, the "A″" scheme):
//   1. ANCHOR affinity (dense, not sparse). A handful of signature cards appear
//      in only a thin slice of the decks that actually fit, so literal overlap
//      would see a biased corner. Instead the signature locates the ANCHORS — the
//      few real decks most similar to it — and a deck's fit is its similarity to
//      the nearest anchor. Because an anchor is a whole ~25-card deck, the entire
//      archetype scores high, whether or not it runs the literal signature cards.
//   2. A CAP on the affinity (a soft gate). Without it the few decks most like an
//      anchor (its near-duplicates) soak up the draw and the pool collapses onto a
//      tiny set. Saturating affinity at `sigCap` means every on-identity deck gets
//      the same affinity factor and then competes purely on `div(i)`, spreading
//      the draw across the whole identity.
// The starter weight is therefore
//   weight(i) = ( sigEps + min( anchorAffinity(i), sigCap ) ) ^ sigAlpha × div(i)
// With no signature (or none of its cards carrying IDF weight) there are no
// anchors, every affinity is 0, and the weight reduces to a constant × div(i) —
// exactly the `idf2` diversity-only draw — with no separate code path.
// `scripts/idf3-signature-experiment.mjs` validates this scheme and the constants
// below against the real `idf2` oracle.

import type { PoolData, VariantResult } from "./types.ts";
import { generate } from "./variant-default.ts";
import { type IdfDeck, idfCosine, growIdfPool } from "./variant-idf.ts";
import { IDF2, idf2Corpus } from "./variant-idf2.ts";

interface Idf3Tuning {
  // Exponent on the capped affinity — the strength dial. 0 cancels the affinity
  // factor under normalization, making `idf3` identical to the `idf2` draw.
  sigAlpha: number;
  // Saturation cap on affinity — the soft gate. Affinity at or above this counts
  // the same, so on-identity decks spread on `div(i)` instead of concentrating on
  // the single most anchor-like deck.
  sigCap: number;
  // Number of nearest real decks taken as anchors. Raise it for multi-modal
  // identities so each mode gets its own anchor.
  anchorCount: number;
  // Affinity floor, so off-identity decks keep a small, diversity-shaped share
  // rather than dropping out entirely.
  sigEps: number;
}
const IDF3: Idf3Tuning = {
  sigAlpha: 2,
  sigCap: 0.4,
  anchorCount: 3,
  sigEps: 0.05,
};

// Build a pool like `idf2`, but steer the starter draw toward the Dreamcaller's
// signature. Reuses `idf2`'s cached corpus and near-twin diversity weights, the
// IDF-cosine routine, and the whole-deck growth procedure unchanged; the only new
// work is the signature probe, the anchors, and the capped affinity factor on the
// starter weight. Falls back to `default` when no usable decklists exist, and to
// the plain `idf2` diversity draw when the signature is empty or carries no IDF
// weight (which falls straight out of the formula).
export function generateIdf3(
  rng: () => number,
  poolData: PoolData,
  signatureCards?: readonly string[],
  targetSize?: number,
): VariantResult {
  const corpus = idf2Corpus(poolData);
  if (!corpus) return generate(rng, poolData, undefined, targetSize);
  const { base, twinCount } = corpus;
  const { decks, idf } = base;
  const idfOf = (c: string): number => idf.get(c) ?? 0;

  // The diversity weight div(i) = 1 / (1 + nearTwins(i))^beta, reused from `idf2`.
  const beta = IDF2.diversityBeta;
  const div = twinCount.map((t) => 1 / (1 + t) ** beta);

  // Step 1 — the probe: the signature cards that exist in the corpus with a
  // positive IDF weight (absent or zeroed cards carry no signal and are dropped).
  // Treated as a synthetic deck so the standard IDF-cosine applies to it.
  const probeCards = new Set<string>();
  if (signatureCards) {
    for (const c of signatureCards) if (idfOf(c) > 0) probeCards.add(c);
  }

  // anchorAffinity(i): greatest similarity of deck i to any anchor (0 with no
  // anchors). Dense, because an anchor is a whole deck — every deck in the
  // archetype scores high, not only those holding the literal signature cards.
  const affinity = new Array<number>(decks.length).fill(0);
  if (probeCards.size > 0) {
    let psq = 0;
    for (const c of probeCards) psq += idfOf(c) ** 2;
    const probe: IdfDeck = { cards: probeCards, norm: Math.sqrt(psq) || 1 };

    // Step 2 — anchors: the up-to-`anchorCount` decks with the highest POSITIVE
    // probe-cosine (decks scoring zero are never anchors).
    const anchors = decks
      .map((d, i) => ({ i, s: idfCosine(probe, d, idfOf) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, IDF3.anchorCount)
      .map((x) => x.i);

    // Step 3 — affinity: max cosine to any anchor; an anchor's affinity to itself
    // is 1.
    for (let i = 0; i < decks.length; i++) {
      let mx = 0;
      for (const a of anchors) {
        const s = a === i ? 1 : idfCosine(decks[a], decks[i], idfOf);
        if (s > mx) mx = s;
      }
      affinity[i] = mx;
    }
  }

  // Step 4 — the starter weight (the A″ formula).
  const { sigAlpha, sigCap, sigEps } = IDF3;
  const weights = decks.map(
    (_, i) => (sigEps + Math.min(affinity[i], sigCap)) ** sigAlpha * div[i],
  );

  // Step 5 — draw the starter from the categorical distribution proportional to
  // the weights (one rng draw, the same structure `idf`/`idf2` use).
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

  // Step 6 — grow the pool from the starter, unchanged from `idf`/`idf2`. The
  // starter is on-identity and growth pulls in its most similar neighbours, so the
  // grown pool is on-identity too; steering the starter alone is sufficient.
  const counts = growIdfPool(decks, idfOf, startIdx, targetSize);
  return { C: new Set(), selected: ["idf3", `deck#${String(startIdx)}`], counts };
}
