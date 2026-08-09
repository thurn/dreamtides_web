// The shared deck-fit scoring model. It learns card relationships from the
// historical draft corpus for opponent, reward, Augury, and merchant scoring.
// This module is pure: it builds an immutable model once from a corpus of
// decklists, then scores candidates deterministically (no RNG, no I/O).
//
// Fit blends three signals, each computed in card-UUID space (lowercased stable
// card ids — collision-free, so two cards that share a display name stay
// distinct) and then min-max normalized across the candidates of a single pick
// so every signal speaks on a comparable [0,1] scale before weighting:
//   - neighborCF: collaborative filtering. Find the K corpus decks most similar
//     to the current deck (IDF-cosine), then favour candidates those neighbours
//     tend to run. This is "decks like yours also played X".
//   - cooccur:    mean IDF-weighted partnership strength between a candidate and
//     the cards already in the deck. This is "X pairs well with what you have".
//   - prior:      the candidate's global play-rate. This is the tie-breaker /
//     fallback that dominates on pick 1 when the deck is empty.
// The IDF math uses the shared deck-scoring primitives in `src/draft/idf-fit.ts`.
//
import { idfCosine, type IdfDeck } from "./idf-fit.ts";

/**
 * Tuning knobs for the fit model. `alpha`/`beta`/`gamma` are the blend weights
 * for the neighbour-CF, co-occurrence, and prior terms; `K` is the neighbour
 * count. The remaining knobs control the IDF corpus hygiene.
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
 * Tuned defaults learned from the full adapted draft corpus.
 *
 * This config scores recall@4 = 80.4%, versus a popularity-4 baseline of 52.1%
 * and a random-4 baseline of 46.7% (+28.3 points over popularity). Recall rises
 * monotonically as the deck defines itself: by pack P1 75.4% < P2 82.0% < P3
 * 84.0%, and by stage early 69.5% < mid 82.2% < late 89.5% — evidence that
 * deck-FIT, not mere card popularity, drives the ranking.
 *
 * The sweep showed `K` (neighbour count) is the dominant lever — recall climbs
 * from ~70% at K=10 to a plateau by K=50 — so K=50 buys the full plateau at half
 * the per-pick neighbour cost of K=100. `beta` (co-occurrence) is a useful
 * secondary signal. `gamma` (the global prior) is kept small on purpose: a large
 * gamma pulls toward popular cards and erodes mid/late recall, while a small
 * weight aids the early picks and is the intended pick-1 fallback for an empty
 * deck.
 */
export const DEFAULT_FIT_TUNING: FitTuning = {
  alpha: 1.0,
  beta: 0.9,
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
 * derived in card-UUID space (lowercased stable card ids). Numeric consumers
 * translate through `numberToId` / `idIndex` at the boundary.
 */
export interface FitModel {
  /** Filtered corpus decks as IDF vectors, in their (filtered) corpus order. */
  decks: IdfDeck[];
  /** idf weight per card id (0 for too-rare / too-common cards). */
  idf: Map<string, number>;
  /** Global play-rate prior per card id: df(c) / N over filtered decks. */
  prior: Map<string, number>;
  /**
   * Normalized symmetric co-occurrence lookup. `coocNorm.get(a)?.get(b)` is the
   * mean partnership strength of `b` for decks that ran `a`: the IDF-weighted
   * co-occurrence sum divided by df(a). Asymmetric after normalization because
   * the divisor differs per source card.
   */
  coocNorm: Map<string, Map<string, number>>;
  /** Inverse of `idIndex`: card number -> card id. */
  numberToId: Map<number, string>;
  /** The card-id -> card-number index the model was built against. */
  idIndex: ReadonlyMap<string, number>;
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
 * @param corpusDecks Historical decks; each is a list of card ids (lowercased
 *   stable UUIDs; duplicates and unknown ids are tolerated — only distinct ids
 *   matter).
 * @param idIndex Card-id -> card-number index used at numeric scoring boundaries.
 * @param tuning Optional overrides for {@link DEFAULT_FIT_TUNING}.
 */
export function buildFitModel(
  corpusDecks: readonly (readonly string[])[],
  idIndex: ReadonlyMap<string, number>,
  tuning: FitTuning = DEFAULT_FIT_TUNING,
): FitModel {
  // 1. Hygiene filter in id space: keep decks whose DISTINCT-card count lands
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

  // 6. Invert the id index for the number->id translation at the scoring
  //    boundary. Card ids are unique, so each number maps from one id; the
  //    first-seen guard is kept only for defensiveness.
  const numberToId = new Map<number, string>();
  for (const [id, number] of idIndex) {
    if (!numberToId.has(number)) numberToId.set(number, id);
  }

  return { decks, idf, prior, coocNorm, numberToId, idIndex, tuning };
}

/** Translate card numbers to card ids via the model, dropping unknowns and
 * deduping on first occurrence. Used for both candidates and the deck set. */
function idsFromNumbers(
  numbers: readonly number[],
  numberToId: Map<number, string>,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const num of numbers) {
    const id = numberToId.get(num);
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
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
  candidateIds: readonly string[],
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

  for (const id of candidateIds) {
    let acc = 0;
    for (const nb of neighbors) {
      if (decks[nb.i].cards.has(id)) acc += nb.sim;
    }
    scores.set(id, (acc / denom) * (idf.get(id) ?? 0));
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
  candidateIds: readonly string[],
  deckSet: Set<string>,
  model: Pick<FitModel, "coocNorm">,
): Map<string, number> {
  const { coocNorm } = model;
  const scores = new Map<string, number>();
  if (deckSet.size === 0) return scores;

  const sizeDenom = Math.max(deckSet.size, 1);
  for (const id of candidateIds) {
    let acc = 0;
    for (const d of deckSet) acc += coocNorm.get(d)?.get(id) ?? 0;
    scores.set(id, acc / sizeDenom);
  }
  return scores;
}

/**
 * The per-candidate fit score returned by {@link scoreCandidatesForDeck}.
 * Each raw component is in its pre-normalization scale so callers (e.g. the
 * merchant's centrality signal) can read the individual terms without re-running
 * the scoring.
 */
export interface CandidateFitScore {
  /** Blended alpha/beta/gamma score, per-call min-max normalized. */
  fit: number;
  /** Raw neighbour collaborative-filtering component (0 on an empty deck). */
  neighborCf: number;
  /** Raw IDF-weighted co-occurrence component (0 on an empty deck). */
  cooccur: number;
  /** Raw global play-rate prior component. */
  prior: number;
}

/**
 * Score a set of candidate card numbers against a given deck, returning a
 * {@link CandidateFitScore} for each candidate.  The `fit` field is the
 * blended, per-call min-max normalized score used for ranking; the three raw
 * component fields expose the individual
 * signals for downstream consumers (e.g. the merchant centrality signal uses
 * `0.65 * prior + 0.35 * cooccur`).
 *
 * The function is pure: no RNG, no I/O, input arrays are never mutated.
 *
 * @param candidateNumbers Card numbers of the candidates to score.
 * @param deckCardNumbers Cards already in the deck (card numbers).
 * @param fitModel The model from {@link buildFitModel}.
 * @returns A Map from candidate card number to its {@link CandidateFitScore}.
 *   Only the card numbers supplied in `candidateNumbers` appear as keys
 *   (unknowns are dropped).
 */
export function scoreCandidatesForDeck(
  candidateNumbers: readonly number[],
  deckCardNumbers: readonly number[],
  fitModel: FitModel,
): Map<number, CandidateFitScore> {
  const { numberToId, idIndex, prior, tuning } = fitModel;

  // Translate candidate numbers to ids, dropping unknowns and deduping.
  const candidateIds = idsFromNumbers(candidateNumbers, numberToId);

  const toNumber = (id: string): number => idIndex.get(id) ?? -1;

  // Deck set translated to ids.
  const deckSet = new Set(idsFromNumbers(deckCardNumbers, numberToId));

  // Score each term independently in card-id space.
  const neighborCFMap = scoreNeighborCF(candidateIds, deckSet, fitModel);
  const cooccurMap = scoreCooccur(candidateIds, deckSet, fitModel);

  // Raw arrays in the same order as candidateIds.
  const nfRaw = candidateIds.map((c) => neighborCFMap.get(c) ?? 0);
  const coRaw = candidateIds.map((c) => cooccurMap.get(c) ?? 0);
  // prior is intentionally computed over ALL cards (including idf-zeroed
  // staples) so it works as the pick-1 fallback when the deck is empty.
  const prRaw = candidateIds.map((c) => prior.get(c) ?? 0);

  // Min-max normalize each term across candidates independently.
  const nf = minMaxNormalize(nfRaw);
  const co = minMaxNormalize(coRaw);
  const pr = minMaxNormalize(prRaw);

  const result = new Map<number, CandidateFitScore>();
  for (let idx = 0; idx < candidateIds.length; idx += 1) {
    const id = candidateIds[idx];
    result.set(toNumber(id), {
      fit: tuning.alpha * nf[idx] + tuning.beta * co[idx] + tuning.gamma * pr[idx],
      neighborCf: nfRaw[idx],
      cooccur: coRaw[idx],
      prior: prRaw[idx],
    });
  }
  return result;
}
