/**
 * UUID-keyed corpus co-occurrence helpers.
 *
 * All card identifiers are opaque lowercase UUID strings. No parsing,
 * splitting, or name resolution is performed here.
 */

/**
 * Build a co-occurrence table over a corpus of decks.
 *
 * Normalization: conditional probability.
 *   cooc(a, b) = (# decks containing both a and b) / (# decks containing a)
 *
 * This is the "mean partnership strength of b for decks containing a" — i.e.
 * how often b appears alongside a given that a is present. The mapping is
 * directional (not symmetric), matching the direction consumed by
 * `synergyAscending` / `cardCohesion` (see opponent-deck.ts).
 *
 * Keys are the cards themselves; values are inner maps from partner card to
 * conditional co-occurrence strength in [0, 1].
 */
export function buildCooccurrence(
  decks: ReadonlyArray<ReadonlySet<string>>,
): Map<string, Map<string, number>> {
  // pairCount.get(a)?.get(b)  = # decks where both a and b appear
  // deckCount.get(a)          = # decks containing a
  const pairCount = new Map<string, Map<string, number>>();
  const deckCount = new Map<string, number>();

  for (const deck of decks) {
    const cards = [...deck]; // distinct cards in this deck
    for (const card of cards) {
      deckCount.set(card, (deckCount.get(card) ?? 0) + 1);
    }
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = 0; j < cards.length; j += 1) {
        if (i === j) continue;
        const a = cards[i];
        const b = cards[j];
        let inner = pairCount.get(a);
        if (inner === undefined) {
          inner = new Map<string, number>();
          pairCount.set(a, inner);
        }
        inner.set(b, (inner.get(b) ?? 0) + 1);
      }
    }
  }

  // Normalize: cooc(a, b) = pairCount(a, b) / deckCount(a)
  const cooc = new Map<string, Map<string, number>>();
  for (const [a, partners] of pairCount) {
    const totalA = deckCount.get(a) ?? 0;
    const normalized = new Map<string, number>();
    for (const [b, count] of partners) {
      normalized.set(b, totalA === 0 ? 0 : count / totalA);
    }
    cooc.set(a, normalized);
  }

  return cooc;
}

/**
 * Order a deck's cards from least-synergistic to most-synergistic.
 *
 * For each card, its synergy score is the mean co-occurrence with the OTHER
 * distinct cards in the deck (using the direction: `cooc.get(other)?.get(card)`,
 * matching `cardCohesion` in opponent-deck.ts which sums
 * `coocNorm.get(otherName)?.get(name)`).
 *
 * Cards absent from the corpus contribute 0 to co-occurrence sums.
 *
 * Tie-break: higher UUID string first (descending string comparison), mirroring
 * `pruneToTarget`'s deterministic tie-break ("higher card number wins removal").
 *
 * The returned list contains the deck's distinct cards in ascending synergy
 * order (the least synergistic card, the one to prune first, comes first).
 */
export function synergyAscending(
  deck: ReadonlyArray<string>,
  cooc: ReadonlyMap<string, ReadonlyMap<string, number>>,
): string[] {
  // Deduplicate while preserving an ordered list to work from.
  const distinct = [...new Set(deck)];

  if (distinct.length === 0) return [];

  // Compute the synergy score for each card.
  const scored: Array<{ card: string; score: number }> = distinct.map((card) => {
    const rest = distinct.filter((c) => c !== card);
    if (rest.length === 0) {
      return { card, score: 0 };
    }
    let sum = 0;
    for (const other of rest) {
      sum += cooc.get(other)?.get(card) ?? 0;
    }
    return { card, score: sum / rest.length };
  });

  // Sort ascending by score; tie-break by higher UUID string first (descending
  // string comparison) so ties are deterministic.
  scored.sort((x, y) => {
    if (x.score !== y.score) return x.score - y.score;
    // Descending by UUID string (higher UUID first).
    return y.card < x.card ? -1 : y.card > x.card ? 1 : 0;
  });

  return scored.map((s) => s.card);
}
