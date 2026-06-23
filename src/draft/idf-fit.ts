// Shared IDF fit and affinity module for corpus-based deck scoring.
//
// Operates on raw `Set<string>` decks keyed by OPAQUE string tokens. This
// module treats keys as opaque and never inspects, parses, or resolves them;
// callers are responsible for any normalization (e.g. lowercasing UUIDs)
// before passing decks in.
//
// Two scoring entry points: `signatureFit` sums idf (the /sigdecks ranking
// metric), while `computeAffinity` uses the standard idf² cosine via
// `idfCosine`. Choose based on which metric the caller needs.
//
// Reuses `idfCosine`, `IdfDeck`, and `IdfCorpus` from variant-idf.ts so the
// scoring arithmetic is consistent with the rest of the draft pipeline.
//
// Mirrors the df/idf/norm logic in `src/debug/SignatureDecksApp.tsx` and the
// affinity logic in `src/affiliations/affiliation-weights.ts`, generalized to
// opaque string keys (no name ↔ UUID translation here).

import { idfCosine, type IdfCorpus, type IdfDeck } from "./pool/variant-idf.ts";

// Re-export so callers can import the types from one place.
export type { IdfCorpus, IdfDeck };

/**
 * Build an IDF corpus from raw decks of opaque string keys (UUIDs or names).
 * N = decks.length; idf(c) = ln(N / df(c)); each deck's norm = sqrt(Σ idf²).
 * No rare/staple cutoff (matches the /sigdecks corpus, not the pool variant).
 *
 * The returned corpus includes `df` (document frequency: how many corpus decks
 * contain each card key) so callers can display or inspect raw counts without
 * recomputing them.
 */
export function buildIdfStats(
  decks: ReadonlyArray<ReadonlySet<string>>,
): IdfCorpus {
  const N = decks.length;

  // Document frequency: how many decks contain each card.
  const df = new Map<string, number>();
  for (const deck of decks) {
    for (const card of deck) {
      df.set(card, (df.get(card) ?? 0) + 1);
    }
  }

  // idf(c) = ln(N / df(c)). A card counted into df was seen in ≥1 deck, so df ≥ 1.
  const idf = new Map<string, number>();
  for (const [card, d] of df) {
    idf.set(card, Math.log(N / d));
  }

  // Per-deck norm: sqrt(Σ idf(c)² over distinct cards in the deck) || 1.
  const idfOf = (c: string): number => idf.get(c) ?? 0;
  const idfDecks: IdfDeck[] = decks.map((deck) => {
    let sumSq = 0;
    for (const card of deck) {
      const w = idfOf(card);
      sumSq += w * w;
    }
    return { cards: new Set(deck), norm: Math.sqrt(sumSq) || 1 };
  });

  return { decks: idfDecks, idf, df };
}

/**
 * Cosine-style signature fit: (Σ idf(c) over probe∩deck) / (deck.norm · probeNorm).
 * Numerator sums idf (NOT idf²) — preserves the /sigdecks metric.
 */
export function signatureFit(
  probe: ReadonlySet<string>,
  deck: IdfDeck,
  corpus: IdfCorpus,
): number {
  const idfOf = (c: string): number => corpus.idf.get(c) ?? 0;

  // probeNorm = sqrt(Σ idf(c)² over probe cards) || 1
  let probeSumSq = 0;
  for (const card of probe) {
    const w = idfOf(card);
    probeSumSq += w * w;
  }
  const probeNorm = Math.sqrt(probeSumSq) || 1;

  // Numerator: sum idf (not idf²) over cards in the intersection of probe and deck.
  let numerator = 0;
  for (const card of probe) {
    if (deck.cards.has(card)) {
      numerator += idfOf(card);
    }
  }

  return numerator / (deck.norm * probeNorm);
}

/**
 * Per-card affinity (0..1) to a probe: for each card, the max idfCosine to the
 * probe over corpus decks containing it, normalized so the strongest card is 1.
 * Cards never seen in a probe-overlapping deck are omitted (caller treats as 0).
 */
export function computeAffinity(
  corpus: IdfCorpus,
  probe: ReadonlySet<string>,
): Map<string, number> {
  const idfOf = (c: string): number => corpus.idf.get(c) ?? 0;

  // Filter the probe to only cards with idf > 0 (same as computeAffinityByName).
  const probeCards = new Set<string>();
  for (const card of probe) {
    if (idfOf(card) > 0) probeCards.add(card);
  }

  // If the probe has no idf>0 cards, every card is equally (un)affiliated.
  if (probeCards.size === 0) {
    return new Map<string, number>();
  }

  // Build the probe as an IdfDeck.
  let psq = 0;
  for (const card of probeCards) {
    const w = idfOf(card);
    psq += w * w;
  }
  const probeDeck: IdfDeck = { cards: probeCards, norm: Math.sqrt(psq) || 1 };

  // Per-deck cosine to the probe, computed once.
  const deckSim = corpus.decks.map((d) => idfCosine(probeDeck, d, idfOf));

  // raw(card) = max over decks holding it of that deck's cosine to the probe.
  // Skip decks with cosine ≤ 0.
  const raw = new Map<string, number>();
  for (let i = 0; i < corpus.decks.length; i++) {
    const sim = deckSim[i];
    if (sim <= 0) continue;
    for (const card of corpus.decks[i].cards) {
      const prev = raw.get(card) ?? 0;
      if (sim > prev) raw.set(card, sim);
    }
  }

  // Normalize by the global maximum so the strongest card scores exactly 1.
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;

  const affinity = new Map<string, number>();
  if (max > 0) {
    for (const [card, v] of raw) {
      affinity.set(card, v / max);
    }
  }
  return affinity;
}

/**
 * Mean affinity of a deck's cards; missing cards count as 0 in the average.
 */
export function meanAffinity(
  deck: ReadonlySet<string>,
  affinity: ReadonlyMap<string, number>,
): number {
  if (deck.size === 0) return 0;
  let sum = 0;
  for (const card of deck) {
    sum += affinity.get(card) ?? 0;
  }
  return sum / deck.size;
}
