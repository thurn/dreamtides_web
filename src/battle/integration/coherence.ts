// Corpus-relative deck coherence scoring for opponent deck construction
// (design doc `docs/cards2/opponent_deck_coherent_draft_design.md`). "Coherence"
// is defined purely as resemblance to the real human decks in the
// `docs/draft_records_adapted/` corpus, measured with the same IDF machinery the
// draft-replay fit model already uses — no archetype tags, no hand-labeled deck
// quality, no card-text taxonomy.
//
// A deck's coherence aggregates three corpus-relative signals, each computed
// against the shared {@link FitModel}:
//   - nearestNeighbor: the deck as an IDF vector, mean cosine to its K most
//     similar real corpus decks. A coherent deck looks like real decks; a random
//     pile does not. This is the primary signal.
//   - meanPairwiseCooccur: the average corpus co-occurrence strength across the
//     deck's card pairs. Coherent decks pair cards real decks ran together.
//   - selfConsistency: for each card, remove it and ask the fit model to rank it
//     against deterministic distractors given the rest of the deck. A coherent
//     deck is one whose own cards the model re-picks (the replay recall measure
//     turned inward on a generated deck).
//
// This module is pure: no RNG, no I/O. The distractor set for self-consistency
// is derived deterministically from the card number so the whole score is a pure
// function of (deck, fit model). The same function backs both the construction
// trace logging and the offline validation harness, so both report one number.

import { idfCosine, type IdfDeck } from "../../draft/pool/variant-idf";
import {
  scoreCandidatesForDeck,
  type FitModel,
} from "../../draft/replay/fit-model";

/** Tuning knobs for the coherence metric. Tuned against the validation harness
 * (`scripts/opponent-coherence-experiment.mjs`,
 * `npm run opponent-coherence-metric`); see {@link DEFAULT_COHERENCE_TUNING}. */
export interface CoherenceTuning {
  /** Number of nearest corpus decks averaged for the neighbour term. */
  knn: number;
  /** Blend weight on the nearest-neighbour similarity term. */
  wNeighbor: number;
  /** Blend weight on the mean pairwise co-occurrence term. */
  wCooccur: number;
  /** Blend weight on the self-consistency (held-out fit) term. */
  wSelf: number;
  /** Number of distractor cards each held-out card is ranked against. */
  selfDistractors: number;
  /** A held-out card counts as "re-picked" when it ranks within this many. */
  selfRecallK: number;
}

/**
 * Tuned defaults. Chosen so the aggregate score cleanly separates real corpus
 * decks from random piles (`npm run opponent-coherence-metric`). The three blend
 * weights sum to 1 so the aggregate stays on a comparable scale to its
 * components. `knn` mirrors a small neighbourhood (the replay fit model plateaus
 * by K=50, but a deck-shape resemblance signal wants the *closest* decks, so a
 * tighter neighbourhood reads cleaner here).
 */
export const DEFAULT_COHERENCE_TUNING: CoherenceTuning = {
  knn: 10,
  wNeighbor: 0.5,
  wCooccur: 0.3,
  wSelf: 0.2,
  selfDistractors: 12,
  selfRecallK: 4,
};

/** The three corpus-relative components of a deck's coherence, each in [0,1]. */
export interface CoherenceComponents {
  /** Mean IDF-cosine to the K nearest real corpus decks. */
  nearestNeighbor: number;
  /** Mean corpus co-occurrence strength across the deck's card pairs. */
  meanPairwiseCooccur: number;
  /** Fraction of the deck's own cards the fit model re-picks within recall@K. */
  selfConsistency: number;
}

/** A deck's coherence: the blended aggregate plus its retained components. */
export interface DeckCoherenceScore extends CoherenceComponents {
  /** Weighted blend of the three components (the headline coherence number). */
  score: number;
}

/** Deterministic distractor seed: a cheap integer hash of two card numbers so
 * the distractor set for a held-out card is reproducible without any RNG. */
function mixHash(a: number, b: number): number {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  // Coerce to a non-negative 32-bit integer.
  return h >>> 0;
}

/** Build the deck's IDF vector (cards as a name set, L2 norm over idf weights)
 * the same way `buildFitModel` builds its corpus deck vectors, so `idfCosine`
 * compares like with like. */
function deckIdfVector(
  deckNames: Set<string>,
  idf: ReadonlyMap<string, number>,
): IdfDeck {
  let sq = 0;
  for (const c of deckNames) {
    const w = idf.get(c) ?? 0;
    sq += w * w;
  }
  return { cards: deckNames, norm: Math.sqrt(sq) || 1 };
}

/** Mean IDF-cosine of the deck to its `knn` most similar corpus decks. */
function nearestNeighborSimilarity(
  deckNames: Set<string>,
  fitModel: FitModel,
  knn: number,
): number {
  if (deckNames.size === 0 || fitModel.decks.length === 0) return 0;
  const idfOf = (c: string): number => fitModel.idf.get(c) ?? 0;
  const deckVec = deckIdfVector(deckNames, fitModel.idf);
  const sims: number[] = fitModel.decks.map((d) => idfCosine(deckVec, d, idfOf));
  sims.sort((a, b) => b - a);
  const k = Math.min(knn, sims.length);
  if (k === 0) return 0;
  let sum = 0;
  for (let i = 0; i < k; i += 1) sum += sims[i];
  return sum / k;
}

/** Mean normalized co-occurrence strength across every unordered card pair in
 * the deck, read from the model's co-occurrence lookup. */
function meanPairwiseCooccurrence(
  deckNames: readonly string[],
  fitModel: FitModel,
): number {
  if (deckNames.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < deckNames.length; i += 1) {
    const row = fitModel.coocNorm.get(deckNames[i]);
    for (let j = i + 1; j < deckNames.length; j += 1) {
      sum += row?.get(deckNames[j]) ?? 0;
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}

/**
 * Held-out fit: for each distinct card the model knows, remove it from the deck
 * and ask the fit model to rank it against a deterministic distractor set drawn
 * from the corpus card universe. The card "re-picks" when it lands within
 * `selfRecallK`. Returns the fraction of testable cards that re-pick, or 0 when
 * none are testable (e.g. an empty deck, or a deck of cards the model ignores).
 */
function selfConsistency(
  deckNumbers: readonly number[],
  fitModel: FitModel,
  tuning: CoherenceTuning,
): number {
  const { nameIndex, numberToName } = fitModel;

  // The distractor universe is every card number the model can score (a name
  // with a prior). Built once and reused across held-out cards.
  const universe: number[] = [];
  for (const [name, num] of nameIndex) {
    if (fitModel.prior.has(name)) universe.push(num);
  }
  if (universe.length === 0) return 0;

  // Distinct, model-known deck cards, in a stable order.
  const seen = new Set<number>();
  const distinct: number[] = [];
  for (const num of deckNumbers) {
    if (seen.has(num)) continue;
    seen.add(num);
    if (numberToName.has(num)) distinct.push(num);
  }
  if (distinct.length === 0) return 0;

  let testable = 0;
  let hits = 0;
  for (const held of distinct) {
    const rest = distinct.filter((c) => c !== held);
    if (rest.length === 0) continue; // need context to rank against

    // Deterministic distractors: the lowest-hash universe cards that are neither
    // the held card nor already in the deck. Hashed per held card so different
    // held cards face different distractors (no RNG, fully reproducible).
    const candidates = universe
      .filter((c) => c !== held && !seen.has(c))
      .map((c) => ({ c, h: mixHash(held, c) }))
      .sort((a, b) => a.h - b.h || a.c - b.c)
      .slice(0, tuning.selfDistractors)
      .map((entry) => entry.c);
    candidates.push(held);

    const scored = scoreCandidatesForDeck(candidates, rest, fitModel);
    const heldFit = scored.get(held)?.fit ?? -Infinity;
    let rank = 1;
    for (const [c, s] of scored) {
      if (c === held) continue;
      // Match `computeReplayOffer`'s ordering: higher fit ranks ahead, ties
      // broken by ascending card number.
      if (s.fit > heldFit || (s.fit === heldFit && c < held)) rank += 1;
    }
    testable += 1;
    if (rank <= tuning.selfRecallK) hits += 1;
  }
  return testable === 0 ? 0 : hits / testable;
}

/**
 * Score one deck's coherence against the corpus the fit model was built from.
 * Pure and deterministic: the same deck and model always yield the same score.
 *
 * @param deckCardNumbers The deck's card numbers (duplicates and copies are
 *   collapsed to the distinct set the corpus signals operate on).
 * @param fitModel The shared model from `buildFitModel`.
 * @param tuning Optional overrides for {@link DEFAULT_COHERENCE_TUNING}.
 */
export function scoreDeckCoherence(
  deckCardNumbers: readonly number[],
  fitModel: FitModel,
  tuning: CoherenceTuning = DEFAULT_COHERENCE_TUNING,
): DeckCoherenceScore {
  const { numberToName } = fitModel;

  // Distinct deck card names known to the model, in stable first-seen order.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const num of deckCardNumbers) {
    const name = numberToName.get(num);
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  const nameSet = new Set(names);

  const nearestNeighbor = nearestNeighborSimilarity(
    nameSet,
    fitModel,
    tuning.knn,
  );
  const meanPairwiseCooccur = meanPairwiseCooccurrence(names, fitModel);
  const self = selfConsistency(deckCardNumbers, fitModel, tuning);

  const score =
    tuning.wNeighbor * nearestNeighbor +
    tuning.wCooccur * meanPairwiseCooccur +
    tuning.wSelf * self;

  return {
    score,
    nearestNeighbor,
    meanPairwiseCooccur,
    selfConsistency: self,
  };
}
