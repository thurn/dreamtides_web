// The deck-fit scoring model for the record-replay draft. At each pick the
// replay shows the player the cards from a fixed real pack that best FIT the
// deck they have drafted so far, where "fit" is learned from ~993 historical
// final decks. This module is pure: it builds an immutable model once from a
// corpus of decklists, then scores each pick deterministically (no RNG, no I/O).
//
// Fit blends three signals, each computed in card-NAME space and then min-max
// normalized across the candidates of a single pick so every signal speaks on a
// comparable [0,1] scale before weighting:
//   - neighborCF: collaborative filtering. Find the K corpus decks most similar
//     to the current deck (IDF-cosine), then favour candidates those neighbours
//     tend to run. This is "decks like yours also played X".
//   - cooccur:    mean IDF-weighted partnership strength between a candidate and
//     the cards already in the deck. This is "X pairs well with what you have".
//   - prior:      the candidate's global play-rate. This is the tie-breaker /
//     fallback that dominates on pick 1 when the deck is empty.
// The IDF math (corpus build recipe, weighted cosine) mirrors the pool
// `variant-idf` module; `idfCosine` is imported and reused directly.

import { idfCosine, type IdfDeck } from "../pool/variant-idf.ts";

/**
 * Tuning knobs for the fit model. `alpha`/`beta`/`gamma` are the blend weights
 * for the neighbour-CF, co-occurrence, and prior terms; `K` is the neighbour
 * count. The remaining knobs control the IDF corpus exactly as the pool
 * `variant-idf` module's do.
 */
export interface FitTuning {
  /** Weight on the neighbour collaborative-filtering term. */
  alpha: number;
  /** Weight on the pairwise co-occurrence term. */
  beta: number;
  /** Weight on the global play-rate prior term. */
  gamma: number;
  /** Number of nearest corpus decks used by the neighbour term. */
  K: number;
  /** Exponent on the idf weights (1 = standard log-idf). */
  idfPower: number;
  /** Cards in fewer than this many decks carry no similarity signal (idf=0). */
  minDf: number;
  /** Cards in more than this fraction of decks carry no signal (idf=0). */
  maxDfFrac: number;
  /** Corpus hygiene: drop decks with fewer than this many distinct cards. */
  minDeckSize: number;
  /** Corpus hygiene: drop decks with more than this many distinct cards. */
  maxDeckSize: number;
}

/**
 * PLACEHOLDER defaults. Task 3 retunes these against the recall@4 metric over
 * the real corpus; the values here are reasonable starting points mirrored from
 * the pool `variant-idf` corpus hygiene plus an even-handed term blend.
 */
export const DEFAULT_FIT_TUNING: FitTuning = {
  alpha: 1.0,
  beta: 0.6,
  gamma: 0.25,
  K: 50,
  idfPower: 1,
  minDf: 2,
  maxDfFrac: 0.6,
  minDeckSize: 16,
  maxDeckSize: 34,
};

/**
 * An immutable fit model built once from a decklist corpus. Everything here is
 * derived in card-NAME space; {@link computeReplayOffer} translates the card
 * numbers it is given through `numberToName` / `nameIndex` at the boundary.
 */
export interface FitModel {
  /** Filtered corpus decks as IDF vectors, in their (filtered) corpus order. */
  decks: IdfDeck[];
  /** idf weight per card name (0 for too-rare / too-common cards). */
  idf: Map<string, number>;
  /** Global play-rate prior per card name: df(c) / N over filtered decks. */
  prior: Map<string, number>;
  /**
   * Normalized symmetric co-occurrence lookup. `coocNorm.get(a)?.get(b)` is the
   * mean partnership strength of `b` for decks that ran `a`: the IDF-weighted
   * co-occurrence sum divided by df(a). Asymmetric after normalization because
   * the divisor differs per source card.
   */
  coocNorm: Map<string, Map<string, number>>;
  /** Inverse of `nameIndex`: card number -> card name. */
  numberToName: Map<number, string>;
  /** The card-name -> card-number index the model was built against. */
  nameIndex: ReadonlyMap<string, number>;
  /** The tuning the model was built with. */
  tuning: FitTuning;
}

/**
 * Build the fit model from a corpus of decklists. Pure and called once per
 * corpus. Decks are filtered to a healthy distinct-card range, then turned into
 * IDF vectors; df, idf, the play-rate prior, and the IDF-weighted co-occurrence
 * lookup are all derived from the SAME filtered set so every downstream signal
 * agrees on what the corpus is.
 *
 * @param corpusDecks Historical decks; each is a list of card names (duplicates
 *   and unknown names are tolerated — only distinct names matter).
 * @param nameIndex Card-name -> card-number index, used to translate the numeric
 *   inputs of {@link computeReplayOffer} into the name space the model lives in.
 * @param tuning Optional overrides for {@link DEFAULT_FIT_TUNING}.
 */
export function buildFitModel(
  corpusDecks: readonly (readonly string[])[],
  nameIndex: ReadonlyMap<string, number>,
  tuning: FitTuning = DEFAULT_FIT_TUNING,
): FitModel {
  // 1. Hygiene filter in name space: keep decks whose DISTINCT-card count lands
  //    in [minDeckSize, maxDeckSize]. Drops empty stubs and oversized aggregates
  //    that would distort df and co-occurrence.
  const filtered: Set<string>[] = [];
  for (const deck of corpusDecks) {
    const distinct = new Set(deck);
    if (distinct.size >= tuning.minDeckSize && distinct.size <= tuning.maxDeckSize) {
      filtered.push(distinct);
    }
  }
  const n = filtered.length;

  // 2. Document frequency, then idf with the rare/common cutoffs. A card outside
  //    [minDf, maxDfFrac * n] gets idf 0 and so contributes nothing to cosine,
  //    co-occurrence, or the neighbour term.
  const df = new Map<string, number>();
  for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
  const maxDf = tuning.maxDfFrac * n;
  const idf = new Map<string, number>();
  for (const [c, d] of df) {
    if (d < tuning.minDf || d > maxDf) {
      idf.set(c, 0);
      continue;
    }
    idf.set(c, Math.log((n + 1) / d) ** tuning.idfPower);
  }
  const idfOf = (c: string): number => idf.get(c) ?? 0;

  // 3. Per-deck IDF vectors for `idfCosine`. norm = sqrt(Σ idf²), floored to 1.
  const decks: IdfDeck[] = filtered.map((cards): IdfDeck => {
    let sq = 0;
    for (const c of cards) {
      const w = idfOf(c);
      sq += w * w;
    }
    return { cards, norm: Math.sqrt(sq) || 1 };
  });

  // 4. Global play-rate prior: fraction of filtered decks that ran each card.
  const prior = new Map<string, number>();
  if (n > 0) for (const [c, d] of df) prior.set(c, d / n);

  // 5. Sparse symmetric IDF-weighted co-occurrence. For each deck, every
  //    unordered pair {a,b} of its distinct cards adds idf(a)*idf(b) to both
  //    cooc[a][b] and cooc[b][a]. Then normalize by df of the SOURCE card so the
  //    lookup reads as "mean partnership strength of b among decks running a"
  //    rather than a raw popularity-inflated sum.
  const cooc = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string, w: number): void => {
    let row = cooc.get(a);
    if (row === undefined) {
      row = new Map<string, number>();
      cooc.set(a, row);
    }
    row.set(b, (row.get(b) ?? 0) + w);
  };
  for (const s of filtered) {
    const cards = [...s];
    for (let i = 0; i < cards.length; i += 1) {
      const a = cards[i];
      const wa = idfOf(a);
      for (let j = i + 1; j < cards.length; j += 1) {
        const b = cards[j];
        const w = wa * idfOf(b);
        if (w === 0) continue;
        bump(a, b, w);
        bump(b, a, w);
      }
    }
  }
  const coocNorm = new Map<string, Map<string, number>>();
  for (const [a, row] of cooc) {
    const dfa = df.get(a) ?? 0;
    if (dfa === 0) continue;
    const normRow = new Map<string, number>();
    for (const [b, w] of row) normRow.set(b, w / dfa);
    coocNorm.set(a, normRow);
  }

  // 6. Invert the name index for the number->name translation at the scoring
  //    boundary. When a number maps from several names the first seen wins,
  //    matching how the forward index resolves duplicate names.
  const numberToName = new Map<number, string>();
  for (const [name, number] of nameIndex) {
    if (!numberToName.has(number)) numberToName.set(number, name);
  }

  return { decks, idf, prior, coocNorm, numberToName, nameIndex, tuning };
}

/** Translate card numbers to names via the model, dropping unknowns and
 * deduping on first occurrence. Used for both candidates and the deck set. */
function namesFromNumbers(
  numbers: readonly number[],
  numberToName: Map<number, string>,
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const num of numbers) {
    const name = numberToName.get(num);
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Min-max normalize values to [0,1]. A constant array (max==min) yields all
 * zeros: a signal that does not vary across candidates carries no information
 * for ranking THIS pick, so it should not tilt the blend. */
function minMaxNormalize(values: readonly number[]): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  if (!(range > 0)) return values.map(() => 0);
  return values.map((v) => (v - lo) / range);
}

/**
 * neighborCF stage: a similarity-weighted vote from the K nearest corpus decks.
 * Build the deck's IDF vector, score every corpus deck by IDF-cosine, take the
 * top K (tie-break by corpus index ascending for determinism), then for each
 * candidate sum the similarities of the neighbours that ran it, normalize by the
 * total similarity mass, and scale by the candidate's idf so a distinctive
 * shared card counts more than a staple. An empty deck has no neighbours to vote,
 * so this returns an empty map (every candidate then scores 0).
 */
function scoreNeighborCF(
  candidateNames: readonly string[],
  deckSet: Set<string>,
  model: Pick<FitModel, "idf" | "decks" | "tuning">,
): Map<string, number> {
  const { idf, decks, tuning } = model;
  const scores = new Map<string, number>();
  if (deckSet.size === 0) return scores;

  let sq = 0;
  for (const c of deckSet) {
    const w = idf.get(c) ?? 0;
    sq += w * w;
  }
  const deckVec: IdfDeck = { cards: deckSet, norm: Math.sqrt(sq) || 1 };
  const idfOf = (c: string): number => idf.get(c) ?? 0;

  const scored = decks.map((d, i) => ({
    i,
    sim: idfCosine(deckVec, d, idfOf),
  }));
  // Top K by similarity desc, tie-break by corpus index asc.
  scored.sort((a, b) => b.sim - a.sim || a.i - b.i);
  const neighbors = scored.slice(0, tuning.K);
  let sumSim = 0;
  for (const nb of neighbors) sumSim += nb.sim;
  const denom = Math.max(sumSim, 1e-9);

  for (const name of candidateNames) {
    let acc = 0;
    for (const nb of neighbors) {
      if (decks[nb.i].cards.has(name)) acc += nb.sim;
    }
    scores.set(name, (acc / denom) * (idf.get(name) ?? 0));
  }
  return scores;
}

/**
 * cooccur stage: the mean IDF-weighted partnership strength between each
 * candidate and the cards already in the deck, read from the model's normalized
 * co-occurrence lookup and averaged over the deck size. An empty deck has no
 * partners, so this returns an empty map (every candidate then scores 0).
 */
function scoreCooccur(
  candidateNames: readonly string[],
  deckSet: Set<string>,
  model: Pick<FitModel, "coocNorm">,
): Map<string, number> {
  const { coocNorm } = model;
  const scores = new Map<string, number>();
  if (deckSet.size === 0) return scores;

  const sizeDenom = Math.max(deckSet.size, 1);
  for (const name of candidateNames) {
    let acc = 0;
    for (const d of deckSet) acc += coocNorm.get(d)?.get(name) ?? 0;
    scores.set(name, acc / sizeDenom);
  }
  return scores;
}

/**
 * Rank the cards of a single pack by how well they fit the player's current
 * deck and return the best `offerSize` of them. Pure and deterministic: no RNG,
 * and the input arrays are never mutated.
 *
 * @param packCardNumbers The pack the player is picking from (card numbers; may
 *   contain duplicates or numbers unknown to the model).
 * @param deckCardNumbers Cards the player has already drafted (card numbers).
 * @param signatureCardNumbers The deck's signature/seed cards. Folded into the
 *   deck set exactly like picked cards, so they steer early picks before the
 *   player has committed to anything.
 * @param fitModel The model from {@link buildFitModel}.
 * @param offerSize How many cards to offer (e.g. 4).
 * @returns Card numbers of the offered cards. Ranked best-fit first when scored;
 *   sorted ascending when the pack is small enough to return whole.
 */
export function computeReplayOffer(
  packCardNumbers: readonly number[],
  deckCardNumbers: readonly number[],
  signatureCardNumbers: readonly number[],
  fitModel: FitModel,
  offerSize: number,
): number[] {
  const { numberToName, nameIndex, prior } = fitModel;

  // 1. Candidates: pack numbers -> names, drop unknowns, dedupe first-seen.
  const candidateNames = namesFromNumbers(packCardNumbers, numberToName);

  const toNumber = (name: string): number => {
    const num = nameIndex.get(name);
    // Names came out of numberToName (inverse of nameIndex), so this is defined;
    // the ?? keeps the type honest without a non-null assertion.
    return num ?? -1;
  };

  // 2. Small pack: nothing to discriminate on — return everything, sorted by
  //    card number ascending for a stable, deck-independent order.
  if (candidateNames.length <= offerSize) {
    return candidateNames.map(toNumber).sort((a, b) => a - b);
  }

  // 3. Deck set = picked cards ∪ signatures, translated to names and deduped.
  //    Signatures are folded in exactly like picks so they steer early offers.
  const deckSet = new Set(
    namesFromNumbers([...deckCardNumbers, ...signatureCardNumbers], numberToName),
  );

  // 4. Score each stage independently in card-name space. neighborCF and cooccur
  //    both vanish on an empty deck; prior is a trivial lookup handled inline.
  const neighborCF = scoreNeighborCF(candidateNames, deckSet, fitModel);
  const cooccur = scoreCooccur(candidateNames, deckSet, fitModel);

  // 5. Min-max normalize each term across the candidates independently, then
  //    blend. A term constant across candidates normalizes to all-zero and so
  //    drops out of the ranking for this pick (it has no discriminating power).
  const nfRaw = candidateNames.map((c) => neighborCF.get(c) ?? 0);
  const coRaw = candidateNames.map((c) => cooccur.get(c) ?? 0);
  // prior is intentionally computed over ALL cards (including idf-zeroed
  // staples), so it still has a value for the popular early-pack cards and works
  // as the pick-1 fallback when the deck is empty and the other two terms are 0.
  const prRaw = candidateNames.map((c) => prior.get(c) ?? 0);
  const nf = minMaxNormalize(nfRaw);
  const co = minMaxNormalize(coRaw);
  const pr = minMaxNormalize(prRaw);

  const { tuning } = fitModel;
  const scoredCandidates = candidateNames.map((name, idx) => ({
    number: toNumber(name),
    fit: tuning.alpha * nf[idx] + tuning.beta * co[idx] + tuning.gamma * pr[idx],
  }));

  // 6. Rank by fit desc, tie-break by card number asc, return the first
  //    `offerSize` card numbers in that order.
  scoredCandidates.sort((a, b) => (b.fit - a.fit) || (a.number - b.number));
  return scoredCandidates.slice(0, offerSize).map((c) => c.number);
}
