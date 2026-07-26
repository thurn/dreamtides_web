// A simulated coherent draft for opponent deck construction (design doc
// `docs/cards2/opponent_deck_coherent_draft_design.md`). The opponent's deck is
// built by simulating a series of draft picks: at each pick a pack of candidate
// cards is shown and one is taken, driven by deck FIT (the corpus-trained
// {@link FitModel}) rather than chance. A small, seeded exploration temperature
// keeps different seeds yielding different but still coherent decks.
//
// The deck is seeded before the first pick with the opponent DreamAvatar's
// signature cards (and, in an affiliated dreamscape, the affiliation's probe
// cards). The fit model folds these into the deck representation exactly like
// drafted cards, steering the first picks toward that archetype.
//
// This module is pure: it draws all randomness from a seeded PRNG passed in, so
// construction is a deterministic function of the seed. Packs are supplied by
// the caller (assembled from the real corpus pack structures), so this module
// holds no I/O and no corpus knowledge beyond the fit model.

import {
  scoreCandidatesForDeck,
  type FitModel,
} from "../../draft/replay/fit-model";

/** A deterministic [0,1) PRNG (mulberry32). Seeding from the battle seed keeps a
 * whole simulated draft reproducible without touching the shared battle RNG
 * streams, so best-of-N can derive an independent stream per candidate draft. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-pick reconstruction trace, recorded for the winning draft only. */
export interface DraftPickTrace {
  /** 0-indexed pick number. */
  pickIndex: number;
  /** Distinct, not-yet-picked candidate card numbers the pick chose among. */
  packCandidateNumbers: number[];
  /** The card number taken. */
  chosenCardNumber: number;
  /** The chosen card's blended fit score against the deck-so-far. */
  chosenFit: number;
  /** The chosen card's rank within the pack by fit (1 = best-fitting). */
  chosenRank: number;
}

/** The result of one simulated draft. */
export interface CoherentDraftResult {
  /** The distinct card numbers drafted, in pick order. */
  pickedCardNumbers: number[];
  /** The per-pick trace, for reconstruction logging. */
  trace: DraftPickTrace[];
}

export interface CoherentDraftArgs {
  fitModel: FitModel;
  /** Candidate packs (card numbers) the simulation draws picks from, assembled
   * by the caller from the real corpus pack structures. */
  packs: readonly (readonly number[])[];
  /** Seed cards folded into the deck before the first pick (DreamAvatar
   * signatures, plus affiliation probe cards in an affiliated dreamscape). */
  signatureCardNumbers: readonly number[];
  /** How many picks to make. The final deck is this minus post-draft removals. */
  pickBudget: number;
  /** Exploration temperature. 0 is greedy (always the highest-fit candidate);
   * higher values trade coherence for per-seed variety. */
  temperature: number;
  /** Optional per-pack selection weight (same length as `packs`) used to bias
   * pack composition toward an affiliation. Higher-weighted packs are chosen
   * more often; no pack is ever excluded. Omit for an unbiased draw. */
  packWeights?: readonly number[];
  /** Seeded [0,1) PRNG; see {@link createSeededRng}. */
  rng: () => number;
}

/** Weighted index draw over `weights` using `rng`; falls back to a uniform draw
 * when the weights are degenerate. Returns -1 only for an empty list. */
function weightedIndex(weights: readonly number[], rng: () => number): number {
  if (weights.length === 0) return -1;
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (!(total > 0)) return Math.floor(rng() * weights.length) % weights.length;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i] > 0 ? weights[i] : 0;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Sample one card from `scoredCandidates` by temperature-weighted fit. At
 * temperature 0 this is greedy: the single highest-fit card (ties broken by
 * ascending card number). Above 0, candidates are weighted by
 * `exp((fit - maxFit) / temperature)` so higher-fit cards dominate while leaving
 * room for variety. Returns the chosen card number and its fit-rank in the pack.
 */
function sampleCandidate(
  candidates: readonly number[],
  fitOf: (cardNumber: number) => number,
  temperature: number,
  rng: () => number,
): { card: number; rank: number } {
  // Stable fit-desc / number-asc order, used both for greedy choice and ranking.
  const ranked = [...candidates].sort(
    (a, b) => fitOf(b) - fitOf(a) || a - b,
  );
  const rankOf = (card: number): number => ranked.indexOf(card) + 1;

  if (!(temperature > 0)) {
    const card = ranked[0];
    return { card, rank: rankOf(card) };
  }

  let maxFit = -Infinity;
  for (const c of candidates) maxFit = Math.max(maxFit, fitOf(c));
  const weights = candidates.map((c) =>
    Math.exp((fitOf(c) - maxFit) / temperature),
  );
  const idx = weightedIndex(weights, rng);
  const card = candidates[idx === -1 ? 0 : idx];
  return { card, rank: rankOf(card) };
}

/**
 * Run one simulated coherent draft. Pure given `args.rng`. Picks distinct cards:
 * a candidate already drafted is skipped so each pick adds a new card and the
 * pick budget buys distinct coherent cards (copies are applied later by the
 * caller). When a chosen pack holds no fresh candidates another pack is drawn.
 */
export function simulateCoherentDraft(
  args: CoherentDraftArgs,
): CoherentDraftResult {
  const {
    fitModel,
    packs,
    signatureCardNumbers,
    pickBudget,
    temperature,
    packWeights,
    rng,
  } = args;

  const picked: number[] = [];
  const pickedSet = new Set<number>();
  const signatures = [...signatureCardNumbers];
  const trace: DraftPickTrace[] = [];

  if (packs.length === 0) return { pickedCardNumbers: picked, trace };

  // Mutable pack-selection weights so a drawn pack is not re-drawn forever once
  // exhausted; an exhausted pack's weight is zeroed.
  const weights: number[] = packs.map((_, i) =>
    packWeights && packWeights[i] > 0 ? packWeights[i] : 1,
  );
  const exhausted = new Set<number>();

  while (picked.length < pickBudget && exhausted.size < packs.length) {
    const packIndex = weightedIndex(weights, rng);
    if (packIndex === -1) break;

    // Fresh, distinct candidates from this pack.
    const seenInPack = new Set<number>();
    const candidates: number[] = [];
    for (const card of packs[packIndex]) {
      if (pickedSet.has(card) || seenInPack.has(card)) continue;
      seenInPack.add(card);
      candidates.push(card);
    }
    if (candidates.length === 0) {
      weights[packIndex] = 0;
      exhausted.add(packIndex);
      continue;
    }

    // Score candidates against the deck so far (picks ∪ signatures).
    const deckSoFar = [...picked, ...signatures];
    const scored = scoreCandidatesForDeck(candidates, deckSoFar, fitModel);
    const fitOf = (cardNumber: number): number =>
      scored.get(cardNumber)?.fit ?? 0;

    const { card, rank } = sampleCandidate(
      candidates,
      fitOf,
      temperature,
      rng,
    );

    picked.push(card);
    pickedSet.add(card);
    trace.push({
      pickIndex: picked.length - 1,
      packCandidateNumbers: candidates,
      chosenCardNumber: card,
      chosenFit: fitOf(card),
      chosenRank: rank,
    });
  }

  return { pickedCardNumbers: picked, trace };
}
