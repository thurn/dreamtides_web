// Deterministic corpus and affinity helpers used only to bake the current
// tides4 draft-pool artifact. The public runtime consumes the baked tide decks;
// none of this machinery is shipped as a selectable pool-construction strategy.

const PICKS_PER_PACK = 10;

// These values are part of the tides4 artifact recipe. Changing one requires a
// re-bake and review of the generated decklists.
export const TIDES4_BAKE_GROWER = {
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  shrinkage: 5,
  minSupport: 3,
};

function bumpPair(map, outer, inner, by) {
  let row = map.get(outer);
  if (row === undefined) {
    row = new Map();
    map.set(outer, row);
  }
  row.set(inner, (row.get(inner) ?? 0) + by);
}

/** Build the pick-affinity corpus used to derive the committed tides4 decks. */
export function buildTides4Corpus(records) {
  const offered = new Map();
  const taken = new Map();
  const offeredWith = new Map();
  const takenWith = new Map();

  for (const record of records) {
    const poolSoFar = new Set();
    const length = Math.min(record.packs.length, record.picks.length);
    for (let index = 0; index < length; index += 1) {
      // Retain the canonical ten-picks-per-pack walk. Every observation has unit
      // weight; the position calculation documents the bundle contract.
      void (index % PICKS_PER_PACK);
      const chosen = new Set(record.picks[index]);
      for (const card of new Set(record.packs[index])) {
        offered.set(card, (offered.get(card) ?? 0) + 1);
        const isTaken = chosen.has(card);
        if (isTaken) taken.set(card, (taken.get(card) ?? 0) + 1);
        for (const priorCard of poolSoFar) {
          if (priorCard === card) continue;
          bumpPair(offeredWith, priorCard, card, 1);
          if (isTaken) bumpPair(takenWith, priorCard, card, 1);
        }
      }
      for (const card of chosen) poolSoFar.add(card);
    }
  }

  if (offered.size === 0 || taken.size === 0) return null;

  const prior = new Map();
  for (const [card, offerCount] of offered) {
    prior.set(card, (taken.get(card) ?? 0) / offerCount);
  }

  const affinity = new Map();
  for (const [priorCard, row] of offeredWith) {
    const takenRow = takenWith.get(priorCard);
    const affinityRow = new Map();
    for (const [card, support] of row) {
      if (support < TIDES4_BAKE_GROWER.minSupport) continue;
      const conditionalRate = (takenRow?.get(card) ?? 0) / support;
      const baseline = prior.get(card) ?? 0;
      const evidenceWeight =
        support / (support + TIDES4_BAKE_GROWER.shrinkage);
      const excess = evidenceWeight * (conditionalRate - baseline);
      if (excess > 0) affinityRow.set(card, excess);
    }
    if (affinityRow.size > 0) affinity.set(priorCard, affinityRow);
  }

  return { cards: [...taken.keys()], affinity, prior };
}

/** Grow one deterministic tide deck from one or more UUID seed cards. */
export function growTides4Deck(corpus, seedCards, targetSize) {
  const { affinity, prior } = corpus;
  const affinityOf = (card) => affinity.get(card) ?? new Map();
  const priorOf = (card) => prior.get(card) ?? 0;
  const seeds = [...new Set(seedCards)];
  const seedRows = seeds.map((seed) => {
    const row = affinityOf(seed);
    let max = 0;
    for (const value of row.values()) if (value > max) max = value;
    return { row, max };
  });
  const normalizedSeedAffinity = (card) => {
    let best = 0;
    for (const { row, max } of seedRows) {
      const value = max > 0 ? (row.get(card) ?? 0) / max : 0;
      if (value > best) best = value;
    }
    return best;
  };

  const poolAffinitySum = new Map();
  const addToPoolAffinity = (card) => {
    for (const [partner, weight] of affinityOf(card)) {
      poolAffinitySum.set(
        partner,
        (poolAffinitySum.get(partner) ?? 0) + weight,
      );
    }
  };

  const counts = new Map();
  for (const seed of seeds) {
    counts.set(seed, 1);
    addToPoolAffinity(seed);
  }
  let total = seeds.length;
  let distinct = seeds.length;

  while (total < targetSize) {
    let maxPoolAffinity = 0;
    for (const card of corpus.cards) {
      if ((counts.get(card) ?? 0) >= TIDES4_BAKE_GROWER.cap) continue;
      const raw = (poolAffinitySum.get(card) ?? 0) / distinct;
      if (raw > maxPoolAffinity) maxPoolAffinity = raw;
    }

    let bestCard = null;
    let bestScore = -Infinity;
    let bestIsSecondCopy = false;
    for (const card of corpus.cards) {
      const copies = counts.get(card) ?? 0;
      if (copies >= TIDES4_BAKE_GROWER.cap) continue;
      const seedAffinity = normalizedSeedAffinity(card);
      const poolAffinity =
        maxPoolAffinity > 0
          ? (poolAffinitySum.get(card) ?? 0) /
            distinct /
            maxPoolAffinity
          : 0;
      const base =
        TIDES4_BAKE_GROWER.seedAffinityWeight * seedAffinity +
        (1 - TIDES4_BAKE_GROWER.seedAffinityWeight) * poolAffinity +
        TIDES4_BAKE_GROWER.priorWeight * priorOf(card);
      const marginal =
        copies === 1
          ? base * TIDES4_BAKE_GROWER.secondCopyFactor
          : base;
      if (
        marginal > bestScore ||
        (marginal === bestScore &&
          bestCard !== null &&
          (copies < (counts.get(bestCard) ?? 0) ||
            (copies === (counts.get(bestCard) ?? 0) && card < bestCard)))
      ) {
        bestScore = marginal;
        bestCard = card;
        bestIsSecondCopy = copies === 1;
      }
    }

    if (bestCard === null || bestScore <= 0) break;
    const copies = counts.get(bestCard) ?? 0;
    counts.set(bestCard, copies + 1);
    total += 1;
    if (!bestIsSecondCopy) {
      distinct += 1;
      addToPoolAffinity(bestCard);
    }
  }

  return counts;
}

/** Resolve Dream Avatar signature UUIDs into the corpus key space. */
export function resolveSignatureToCorpus(corpus, signatureCards) {
  const corpusKeys = new Set(corpus.cards);
  const resolved = new Set();
  for (const entry of signatureCards) {
    const id = entry.toLowerCase();
    if (corpusKeys.has(id)) resolved.add(id);
  }
  return resolved;
}

/** Return each corpus card's normalized affinity to a signature. */
export function buildSignatureAffinity(corpus, signatureCards) {
  const affinityByCard = new Map();
  if (!signatureCards || signatureCards.length === 0) return affinityByCard;

  const signatureSet = resolveSignatureToCorpus(corpus, signatureCards);
  if (signatureSet.size === 0) return affinityByCard;

  const rawAffinity = (card) => {
    let maximum = 0;
    const cardRow = corpus.affinity.get(card);
    for (const signatureCard of signatureSet) {
      const fromSignature =
        corpus.affinity.get(signatureCard)?.get(card) ?? 0;
      const fromCard = cardRow?.get(signatureCard) ?? 0;
      const value = Math.max(fromSignature, fromCard);
      if (value > maximum) maximum = value;
    }
    return maximum;
  };

  let maximumRawAffinity = 0;
  for (const card of corpus.cards) {
    if (signatureSet.has(card)) continue;
    const value = rawAffinity(card);
    if (value > maximumRawAffinity) maximumRawAffinity = value;
  }

  for (const card of corpus.cards) {
    affinityByCard.set(
      card,
      signatureSet.has(card)
        ? 1
        : maximumRawAffinity > 0
          ? rawAffinity(card) / maximumRawAffinity
          : 0,
    );
  }
  return affinityByCard;
}
