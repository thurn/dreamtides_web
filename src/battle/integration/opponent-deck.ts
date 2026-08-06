// Opponent descriptor primitives + the coherent-draft deck algorithm for the
// Battle site (journeys doc "Battle"; design
// `docs/cards2/opponent_deck_coherent_draft_design.md`).
//
// Every battle uses this module's descriptor primitives —
// `selectOpponentDreamAvatar`, `buildOpponentDreamsigns`,
// `resolveBattleAffiliation`, and the run-scaling helpers — to assemble the
// enemy DreamAvatar, its dreamsigns (none in early battles; one from the run
// midpoint onward), and the affiliation the deck leans toward.
//
// `buildOpponentDeck` is the coherent-draft deck algorithm: at each pick the
// opponent takes the card that best FITS the deck drafted so far, where "fit"
// is learned entirely from the corpus of real human draft records
// (`docs/draft_records_adapted/`). Difficulty scales with the run by giving
// stronger opponents a larger pick budget, more post-draft removals, and a lower
// exploration temperature, mirroring how a player's deck tightens. In an
// affiliated dreamscape the draft seed widens to the affiliation probe, pack
// composition is biased toward affiliated cards, and best-of-N selection keeps
// the draft that best matches the affiliation while staying coherent; a neutral
// dreamscape optimizes coherence alone. `create-battle-init` builds the
// production opponent deck with the corpus algorithm
// (`corpus-opponent-deck.ts`) and falls back to this coherent draft when no
// known-good decklist corpus is supplied; the `/opponent` debug tool exposes
// this algorithm directly as "Coherent". Both paths log
// `opponent_deck_constructed` so the build can be reconstructed from
// `logs/journey-log.jsonl`.

import type { CardData } from "../../types/cards";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type { DreamscapeNode } from "../../types/journey";
import type { RunPoolContext } from "../../data/journey-content";
import type { DraftRecord } from "../../data/cards-v2-database";
import {
  buildAffiliationWeightContext,
  resolveNodeAffiliation,
  scoreDeckAffiliationFit,
  type AffiliationWeightContext,
} from "../../affiliations/affiliation-weights";
import type { FitModel } from "../../draft/replay/fit-model";
import { buildPackSequence } from "../../draft/replay/draft-records";
import {
  createSeededRng,
  simulateCoherentDraft,
  type DraftPickTrace,
} from "./coherent-draft";
import { scoreDeckCoherence, type DeckCoherenceScore } from "./coherence";
import { logEvent } from "../../logging";
import type { BattleRng } from "../random";
import type { OpponentsData, OpponentCurve } from "../../types/opponents-data";

/**
 * Default run length used when the atlas snapshot does not carry its per-layer
 * node lists (e.g. battle-engine tests build a minimal atlas). The live run is
 * a 7-layer atlas, so the midpoint derives from 7 unless the
 * caller supplies a populated atlas, which always wins.
 */
/**
 * Whether the opposing DreamAvatar's ability is active at this run layer.
 * The opening battle is the sole dormant layer.
 */
export function opponentAbilityIsActive(
  completionLevel: number,
  abilityActiveFromLayer: number,
): boolean {
  return completionLevel >= abilityActiveFromLayer;
}

/**
 * Minimum and maximum number of distinct cards the opponent drafts for the final
 * deck, after post-draft removals. Every card in the deck is a singleton — the
 * deck is exactly these distinct cards, with no duplicate copies. The count
 * scales linearly with run progress between these bounds so a layer-0 opponent
 * fields the smallest deck and the final boss fields the largest. When the
 * drafted count is below the battle deck minimum the deck is topped up with
 * distinct draftable cards (never repeats) so it still has no duplicates.
 */

/**
 * Post-draft removals: after the draft the opponent prunes its least-coherent
 * cards (lowest co-occurrence with the rest of the deck). The count grows with
 * run progress, mirroring the player purging weak cards — this raises both power
 * and coherence at once because the cut cards are the off-theme orphans. The
 * pick budget is the target distinct count plus removals, so a later opponent
 * drafts a larger pool and prunes harder.
 */

/**
 * Exploration temperature for the simulated draft, by run progress. Early
 * opponents draft with more exploration (looser, weaker decks); later opponents
 * draft closer to greedy (tighter, stronger decks). The early temperature is
 * chosen high enough for per-seed variety yet low enough that coherence stays
 * well above the random baseline. Decreasing in completion level, so deck
 * tightness is monotonic in run progress.
 */

/**
 * Number of independent seeded drafts run per battle. The winner is the draft
 * with the best combined coherence + affiliation-fit objective. Kept small: a
 * handful of drafts is enough to make affiliation fit reliable while staying
 * cheap against the cached fit model.
 */

/**
 * Weight on affiliation fit relative to coherence in best-of-N draft selection,
 * applied only in an affiliated dreamscape. Coherence keeps the winner from
 * being a pile of high-affinity but unsynergistic cards; this term tilts the
 * choice toward the draft that landed on the affiliation.
 */

/**
 * How many real corpus records' pack structures the simulated draft draws its
 * packs from. A seeded subset (rather than the full corpus) bounds per-battle
 * cost while still offering far more distinct candidates than any single draft
 * consumes. Reusing real packs keeps pack composition unbiased beyond the corpus
 * play-rate, exactly as the cards the fit model learned from.
 */

/**
 * The run length for `state.atlas`: the number of authored layers and therefore
 * the number of battles in the run. An empty synthetic test atlas has one
 * effective layer.
 */
export function resolveRunLayerCount(layers: readonly unknown[]): number {
  return Math.max(1, layers.length);
}

/**
 * Whether an opponent at `completionLevel` carries a Dreamsign under the
 * authored zero-indexed unlock layer.
 */
export function opponentCarriesDreamsign(
  completionLevel: number,
  dreamsignsFromLayer: number,
): boolean {
  return completionLevel >= dreamsignsFromLayer;
}

/**
 * Progress fraction (0..1) of a battle at `completionLevel` (0-indexed) in a
 * `layerCount`-layer run. The first battle is 0, the last battle is 1, so deck
 * scaling interpolates cleanly across the run regardless of the layer count.
 */
function progressFraction(completionLevel: number, layerCount: number): number {
  const lastLevel = Math.max(1, layerCount - 1);
  const clamped = Math.min(Math.max(completionLevel, 0), lastLevel);
  return clamped / lastLevel;
}

/**
 * The number of distinct cards the opponent deck draws from the simulated pool
 * at `completionLevel`, scaling linearly with run progress between
 * {@link MIN_OPPONENT_DISTINCT_CARDS} and {@link MAX_OPPONENT_DISTINCT_CARDS}.
 * Monotonically non-decreasing in `completionLevel`, which is the invariant the
 * progress-scaling test asserts.
 */
export function opponentDistinctCardCount(
  completionLevel: number,
  layerCount: number,
  curve: OpponentCurve,
): number {
  const fraction = progressFraction(completionLevel, layerCount);
  return curve.first + Math.round((curve.last - curve.first) * fraction);
}

/**
 * The number of post-draft removals at `completionLevel`, scaling linearly with
 * run progress between {@link MIN_OPPONENT_REMOVALS} and
 * {@link MAX_OPPONENT_REMOVALS}. Monotonically non-decreasing in
 * `completionLevel`.
 */
export function opponentRemovalCount(
  completionLevel: number,
  layerCount: number,
  curve: OpponentCurve,
): number {
  const fraction = progressFraction(completionLevel, layerCount);
  return curve.first + Math.round((curve.last - curve.first) * fraction);
}

/**
 * The number of simulated picks at `completionLevel`: the final distinct target
 * plus the removal count, so the draft over-drafts and prunes back to the target.
 * Monotonically non-decreasing in `completionLevel` because both terms are.
 */
export function opponentPickBudget(
  completionLevel: number,
  layerCount: number,
  distinctCurve: OpponentCurve,
  removalCurve: OpponentCurve,
): number {
  return (
    opponentDistinctCardCount(completionLevel, layerCount, distinctCurve) +
    opponentRemovalCount(completionLevel, layerCount, removalCurve)
  );
}

/**
 * The exploration temperature for the draft at `completionLevel`, interpolating
 * from {@link EARLY_DRAFT_TEMPERATURE} down to {@link LATE_DRAFT_TEMPERATURE} as
 * the run progresses. Monotonically non-increasing in `completionLevel`, so
 * later opponents draft tighter, stronger decks.
 */
export function opponentDraftTemperature(
  completionLevel: number,
  layerCount: number,
  curve: OpponentCurve,
): number {
  const fraction = progressFraction(completionLevel, layerCount);
  return curve.first + (curve.last - curve.first) * fraction;
}

/**
 * Deterministically selects the opponent DreamAvatar for a battle from the run's
 * `dreamAvatars`. The choice is pinned to the battle seed so it is reproducible
 * per battle entry, and the player's own DreamAvatar is excluded when another
 * candidate exists (the player should face a different rival each battle). Returns
 * `null` only when there are no DreamAvatars at all.
 *
 * When `eligibleDreamAvatarIds` is supplied and non-empty the candidate pool is
 * first narrowed to that set — the resident DreamAvatars of a dreamscape, so the
 * opponent faced in a dreamscape is one of its own residents. The ids are matched
 * case-insensitively. An empty or absent list (e.g. the starter dreamscape, which
 * has no residents) imposes no restriction and the full roster is used. If the
 * restriction would empty the pool it is ignored, so a non-empty roster always
 * yields a DreamAvatar.
 */
export function selectOpponentDreamAvatar(
  dreamAvatars: readonly DreamAvatarContent[],
  playerDreamAvatarId: string | null,
  rng: BattleRng,
  eligibleDreamAvatarIds?: readonly string[] | null,
): DreamAvatarContent | null {
  if (dreamAvatars.length === 0) {
    return null;
  }
  let roster = dreamAvatars;
  if (eligibleDreamAvatarIds != null && eligibleDreamAvatarIds.length > 0) {
    const eligible = new Set(
      eligibleDreamAvatarIds.map((id) => id.toLowerCase()),
    );
    const resident = dreamAvatars.filter((dreamAvatar) =>
      eligible.has(dreamAvatar.id.toLowerCase()),
    );
    if (resident.length > 0) roster = resident;
  }
  const candidates = roster.filter(
    (dreamAvatar) => dreamAvatar.id !== playerDreamAvatarId,
  );
  const pool = candidates.length > 0 ? candidates : roster;
  return pool[rng.nextInt(pool.length)];
}

/**
 * The single dreamsign an opponent brings from the run midpoint onward, drawn
 * deterministically from `dreamsignTemplates` via the battle RNG. Returns an
 * empty list before the midpoint, or when no templates are available.
 */
export function buildOpponentDreamsigns(
  completionLevel: number,
  dreamsignsFromLayer: number,
  dreamsignTemplates: readonly DreamsignTemplate[],
  rng: BattleRng,
): DreamsignTemplate[] {
  if (!opponentCarriesDreamsign(completionLevel, dreamsignsFromLayer)) {
    return [];
  }
  if (dreamsignTemplates.length === 0) {
    return [];
  }
  return [dreamsignTemplates[rng.nextInt(dreamsignTemplates.length)]];
}

/**
 * Resolves the affiliation backing the dreamscape the battle takes place in, or
 * `null` when the battle is in a neutral / starter dreamscape or the affiliation
 * is unknown.
 */
export function resolveBattleAffiliation(
  node: DreamscapeNode | null | undefined,
  dreamscapes: readonly DreamscapeContent[],
  affiliations: readonly AffiliationContent[],
): AffiliationContent | null {
  return resolveNodeAffiliation(node, dreamscapes, affiliations);
}

/** A salt mixed into the per-candidate-draft seed so best-of-N drafts draw from
 * independent streams while staying a pure function of `poolSeed`. */
const DRAFT_SEED_SALT = 0x9e3779b1;

/** Translate a DreamAvatar's signature card UUIDs to card numbers via the
 * database, dropping any that do not resolve. Reads the id-aligned
 * `signatureCardIds` (the name-valued `signatureCards` cannot distinguish two
 * cards that share a display name); ids are lowercased to match `idToNumber`. */
function signatureCardNumbers(
  opponentDreamAvatar: DreamAvatarContent | null,
  idToNumber: ReadonlyMap<string, number>,
): number[] {
  const out: number[] = [];
  for (const uuid of opponentDreamAvatar?.signatureCardIds ?? []) {
    const num = idToNumber.get(uuid.toLowerCase());
    if (num !== undefined) out.push(num);
  }
  return out;
}

/** Build the candidate pack pool from a seeded subset of corpus records. Each
 * record contributes its real pack structures (in card-number space), so the
 * draft picks from the exact packs that produced the corpus decks. */
function buildPackSource(
  draftRecords: readonly DraftRecord[],
  idIndex: ReadonlyMap<string, number>,
  seed: number,
  recordCount: number,
): number[][] {
  if (draftRecords.length === 0) return [];
  const rng = createSeededRng(seed ^ 0x51ed270b);
  const indices = draftRecords.map((_, i) => i);
  // Seeded partial shuffle: pick the first OPPONENT_PACK_SOURCE_RECORDS records.
  const take = Math.min(recordCount, indices.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rng() * (indices.length - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  const packs: number[][] = [];
  for (let i = 0; i < take; i += 1) {
    for (const pack of buildPackSequence(draftRecords[indices[i]], idIndex)) {
      if (pack.length > 0) packs.push(pack);
    }
  }
  return packs;
}

/** Per-pack selection weight biasing pack composition toward the affiliation:
 * `1 + biasStrength * meanAffinity` over the pack's cards. Every pack keeps a
 * weight of at least 1, so no pack is excluded. Returns `undefined` when there is
 * no affiliation context (an unbiased draw). */
function affiliationPackWeights(
  packs: readonly (readonly number[])[],
  ctx: AffiliationWeightContext | null,
  biasStrength: number,
  numberToId: ReadonlyMap<number, string>,
): number[] | undefined {
  if (ctx === null) return undefined;
  const strength = Math.max(0, biasStrength);
  return packs.map((pack) => {
    if (pack.length === 0) return 1;
    let sum = 0;
    for (const card of pack) {
      const id = numberToId.get(card);
      sum += id === undefined ? 0 : (ctx.affinityById.get(id) ?? 0);
    }
    return 1 + strength * (sum / pack.length);
  });
}

/** Mean co-occurrence cohesion of `card` with the rest of the deck, read from
 * the model's normalized co-occurrence lookup. Low cohesion marks an off-theme
 * orphan — the card a coherence-raising prune cuts first. */
function cardCohesion(
  card: number,
  rest: readonly number[],
  fitModel: FitModel,
): number {
  if (rest.length === 0) return 0;
  const id = fitModel.numberToId.get(card);
  if (id === undefined) return 0;
  let sum = 0;
  for (const other of rest) {
    const otherId = fitModel.numberToId.get(other);
    if (otherId === undefined) continue;
    sum += fitModel.coocNorm.get(otherId)?.get(id) ?? 0;
  }
  return sum / rest.length;
}

/** Prune `picked` down to `target` distinct cards by iteratively removing the
 * least-cohesive card (lowest mean co-occurrence with the rest). Returns the kept
 * cards and the cards removed, in removal order. */
function pruneToTarget(
  picked: readonly number[],
  target: number,
  fitModel: FitModel,
): { kept: number[]; removed: number[] } {
  const kept = [...picked];
  const removed: number[] = [];
  while (kept.length > target) {
    let worstIdx = 0;
    let worstScore = Infinity;
    for (let i = 0; i < kept.length; i += 1) {
      const rest = kept.filter((_, j) => j !== i);
      const score = cardCohesion(kept[i], rest, fitModel);
      // Lowest cohesion wins removal; tie-break by higher card number for a
      // deterministic, reproducible cut.
      if (
        score < worstScore ||
        (score === worstScore && kept[i] > kept[worstIdx])
      ) {
        worstScore = score;
        worstIdx = i;
      }
    }
    removed.push(kept[worstIdx]);
    kept.splice(worstIdx, 1);
  }
  return { kept, removed };
}

/** A best-of-N candidate draft's measured objective, retained for the trace so
 * the selection can be second-guessed from the log. */
export interface OpponentDraftCandidateSummary {
  draftIndex: number;
  coherence: number;
  affiliationFit: number;
  combined: number;
}

/** Result of an opponent deck build: the chosen cards plus a full reconstruction
 * trace (best-of-N scores, winning pick sequence, removals, coherence,
 * affiliation fit) for `opponent_deck_constructed` logging. */
export interface OpponentDeckBuild {
  /**
   * The chosen deck: the distinct cards (post-removal), one copy of each, with
   * no duplicates. The caller shuffles these into the enemy draw order.
   */
  cards: CardData[];
  /** The final distinct cards (post-removal), in pick order. Identical contents
   * to {@link cards}; retained as a named view of the singleton card set. */
  distinctCards: CardData[];
  /** The affiliation the deck was steered toward, or `null` in a neutral
   * dreamscape (or when the affiliation could not be scored). */
  targetAffiliationId: string | null;
  /** Number of candidate drafts run (best-of-N). */
  candidateCount: number;
  /** Index of the winning candidate draft. */
  winningDraftIndex: number;
  /** The winning deck's coherence score and its components. */
  coherence: DeckCoherenceScore;
  /** The winning deck's affiliation fit (0 in a neutral dreamscape). */
  affiliationFit: number;
  /** The objective scores of every candidate draft (winner included). */
  candidateSummaries: OpponentDraftCandidateSummary[];
  /** The pick budget used (picks before removals). */
  pickBudget: number;
  /** The number of post-draft removals applied. */
  removalCount: number;
  /** The winning draft's per-pick trace. */
  pickTrace: DraftPickTrace[];
  /** The card numbers removed in the post-draft prune, in removal order. */
  removedCardNumbers: number[];
}

/**
 * Builds the opponent battle deck by simulating a coherent draft for the opponent
 * DreamAvatar. Best-of-N seeded drafts are run; each over-drafts to a pick budget,
 * prunes its least-coherent cards back to the target distinct count, and is scored
 * for coherence (resemblance to real corpus decks) and — in an affiliated
 * dreamscape — affiliation fit against the dreamscape's probe. The draft with the
 * best combined objective wins, and its distinct cards are expanded to a
 * progress-scaled copy count.
 *
 * The deck is steered toward the opponent DreamAvatar's signature cards (folded
 * into the draft seed) and, in an affiliated dreamscape, toward the affiliation
 * (probe cards added to the seed and pack composition biased toward affiliated
 * cards). Pure and deterministic in `poolSeed`.
 *
 * Returns `null` when the corpus or fit model is unavailable (no `fitModel`, no
 * draft records, or no usable packs), so the caller can apply its fallback deck.
 */
export function buildOpponentDeck(args: {
  opponentDreamAvatar: DreamAvatarContent | null;
  fitModel: FitModel | undefined;
  draftRecords: readonly DraftRecord[];
  poolContext: RunPoolContext | undefined;
  cardDatabase: ReadonlyMap<number, CardData>;
  affiliation: AffiliationContent | null;
  completionLevel: number;
  layerCount: number;
  poolSeed: number;
  config: OpponentsData["coherentDraft"];
}): OpponentDeckBuild | null {
  const {
    opponentDreamAvatar,
    fitModel,
    draftRecords,
    poolContext,
    cardDatabase,
    affiliation,
    completionLevel,
    layerCount,
    poolSeed,
  } = args;
  const config = args.config;

  if (fitModel === undefined || draftRecords.length === 0) {
    return null;
  }

  const packs = buildPackSource(
    draftRecords,
    fitModel.idIndex,
    poolSeed,
    config.packSourceRecords,
  );
  if (packs.length === 0) {
    return null;
  }

  // Card UUID (lowercased) -> card number, for translating DreamAvatar
  // signature card ids.
  const idToNumber = new Map<string, number>();
  for (const card of cardDatabase.values())
    idToNumber.set(card.id.toLowerCase(), card.cardNumber);

  // Card number -> card UUID (lowercased), for bridging pack cards to the
  // affiliation probe's id-keyed affinity map.
  const numberToId = new Map<number, string>();
  for (const card of cardDatabase.values())
    numberToId.set(card.cardNumber, card.id.toLowerCase());

  // Affiliation context (probe affinities) for an affiliated dreamscape; null in
  // a neutral dreamscape or when the affiliation cannot be scored.
  const affiliationCtx =
    affiliation !== null && poolContext !== undefined
      ? buildAffiliationWeightContext(
          poolContext.poolData,
          cardDatabase,
          affiliation,
        )
      : null;

  // Seed cards: DreamAvatar signatures, plus the affiliation probe in an
  // affiliated dreamscape, so the first picks are pulled toward both.
  const seeds = signatureCardNumbers(opponentDreamAvatar, idToNumber);
  if (affiliationCtx !== null) {
    for (const id of affiliationCtx.signatureWeightedIds) {
      const num = affiliationCtx.numberById.get(id);
      if (num !== undefined) seeds.push(num);
    }
  }

  const packWeights = affiliationPackWeights(
    packs,
    affiliationCtx,
    affiliation?.opponentBiasStrength ?? 0,
    numberToId,
  );

  const targetDistinct = opponentDistinctCardCount(
    completionLevel,
    layerCount,
    config.distinctCardCurve,
  );
  const removalCount = opponentRemovalCount(
    completionLevel,
    layerCount,
    config.removalCurve,
  );
  const pickBudget = opponentPickBudget(
    completionLevel,
    layerCount,
    config.distinctCardCurve,
    config.removalCurve,
  );
  const temperature = opponentDraftTemperature(
    completionLevel,
    layerCount,
    config.temperatureCurve,
  );

  interface Candidate {
    distinct: number[];
    removed: number[];
    trace: DraftPickTrace[];
    coherence: DeckCoherenceScore;
    affiliationFit: number;
    combined: number;
  }

  const candidateSummaries: OpponentDraftCandidateSummary[] = [];
  let winner: Candidate | null = null;
  let winningIndex = 0;

  for (let n = 0; n < config.bestOf; n += 1) {
    const rng = createSeededRng((poolSeed ^ (DRAFT_SEED_SALT * (n + 1))) >>> 0);
    const draft = simulateCoherentDraft({
      fitModel,
      packs,
      signatureCardNumbers: seeds,
      pickBudget,
      temperature,
      packWeights,
      rng,
    });
    const { kept, removed } = pruneToTarget(
      draft.pickedCardNumbers,
      targetDistinct,
      fitModel,
    );
    const coherence = scoreDeckCoherence(kept, fitModel, {
      knn: config.coherence.nearestNeighbors,
      wNeighbor: config.coherence.neighborWeight,
      wCooccur: config.coherence.cooccurrenceWeight,
      wSelf: config.coherence.selfConsistencyWeight,
      selfDistractors: config.coherence.selfDistractors,
      selfRecallK: config.coherence.selfRecallK,
    });
    const affiliationFit =
      affiliationCtx === null
        ? 0
        : scoreDeckAffiliationFit(kept, affiliationCtx);
    const combined =
      coherence.score +
      (affiliationCtx === null
        ? 0
        : config.affiliationObjectiveWeight * affiliationFit);

    candidateSummaries.push({
      draftIndex: n,
      coherence: coherence.score,
      affiliationFit,
      combined,
    });

    if (winner === null || combined > winner.combined) {
      winner = {
        distinct: kept,
        removed,
        trace: draft.trace,
        coherence,
        affiliationFit,
        combined,
      };
      winningIndex = n;
    }
  }

  if (winner === null) {
    return null;
  }

  const distinctCards: CardData[] = [];
  for (const num of winner.distinct) {
    const card = cardDatabase.get(num);
    if (card !== undefined) distinctCards.push(card);
  }
  if (distinctCards.length === 0) {
    return null;
  }

  // The deck is exactly the distinct cards, one copy each — no duplicates.
  const cards: CardData[] = [...distinctCards];

  return {
    cards,
    distinctCards,
    targetAffiliationId:
      affiliationCtx === null ? null : (affiliation?.id ?? null),
    candidateCount: config.bestOf,
    winningDraftIndex: winningIndex,
    coherence: winner.coherence,
    affiliationFit: winner.affiliationFit,
    candidateSummaries,
    pickBudget,
    removalCount,
    pickTrace: winner.trace,
    removedCardNumbers: winner.removed,
  };
}

/**
 * Reconstruction logging for one opponent deck. Captures the opponent
 * DreamAvatar, the draft seed + run depth, the resolved affiliation, the dreamsign
 * carried (if any), and the full coherent-draft trace — best-of-N candidate
 * scores and the winning index, the winning deck's coherence and affiliation fit,
 * the pick budget and removal count, the winning per-pick trace (pack candidates,
 * chosen card, fit, rank), and the cards removed in the post-draft prune — so a
 * battle's opponent and the decision process that built it can be reconstructed
 * from `logs/journey-log.jsonl` filtered by `gameId`.
 */
export interface OpponentDeckLogArgs {
  battleEntryKey: string;
  opponentDreamAvatar: DreamAvatarContent | null;
  poolVariant: string;
  poolSeed: number;
  completionLevel: number;
  layerCount: number;
  affiliation: AffiliationContent | null;
  dreamsigns: readonly DreamsignTemplate[];
  build: OpponentDeckBuild | null;
  fallbackDeckSize: number;
  opponentsContentHash: string;
  progression: OpponentsData["progression"];
  coherentDraft: OpponentsData["coherentDraft"];
}

/** Round a score for compact, stable log output. */
function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function logOpponentDeckConstructed(args: OpponentDeckLogArgs): void {
  const {
    battleEntryKey,
    opponentDreamAvatar,
    poolVariant,
    poolSeed,
    completionLevel,
    layerCount,
    affiliation,
    dreamsigns,
    build,
    fallbackDeckSize,
    opponentsContentHash,
    progression,
    coherentDraft,
  } = args;

  const topCardNumbers = (build?.distinctCards ?? [])
    .slice(0, 12)
    .map((card) => card.cardNumber);

  // Compact per-pick trace: card numbers and scores only, not full card data.
  const pickTrace = (build?.pickTrace ?? []).map((pick) => ({
    pick: pick.pickIndex,
    chosen: pick.chosenCardNumber,
    fit: round4(pick.chosenFit),
    rank: pick.chosenRank,
    candidates: pick.packCandidateNumbers,
  }));

  const candidateSummaries = (build?.candidateSummaries ?? []).map((c) => ({
    draftIndex: c.draftIndex,
    coherence: round4(c.coherence),
    affiliationFit: round4(c.affiliationFit),
    combined: round4(c.combined),
  }));

  logEvent("opponent_deck_constructed", {
    battleEntryKey,
    opponentDreamAvatarId: opponentDreamAvatar?.id ?? null,
    opponentDreamAvatarName: opponentDreamAvatar?.name ?? null,
    poolVariant,
    poolSeed,
    completionLevel,
    layerCount,
    opponentsContentHash,
    progression,
    coherentDraft,
    carriesDreamsign: opponentCarriesDreamsign(
      completionLevel,
      progression.dreamsignsFromLayer,
    ),
    affiliationId: affiliation?.id ?? null,
    targetAffiliationId: build?.targetAffiliationId ?? null,
    dreamsignIds: dreamsigns.map((dreamsign) => dreamsign.id),
    builtFromSimulation: build !== null,
    distinctCardCount: build?.distinctCards.length ?? 0,
    deckSize: build?.cards.length ?? fallbackDeckSize,
    topCardNumbers,
    // Coherent-draft reconstruction.
    pickBudget: build?.pickBudget ?? 0,
    removalCount: build?.removalCount ?? 0,
    candidateCount: build?.candidateCount ?? 0,
    winningDraftIndex: build?.winningDraftIndex ?? 0,
    coherenceScore: build === null ? null : round4(build.coherence.score),
    coherenceComponents:
      build === null
        ? null
        : {
            nearestNeighbor: round4(build.coherence.nearestNeighbor),
            meanPairwiseCooccur: round4(build.coherence.meanPairwiseCooccur),
            selfConsistency: round4(build.coherence.selfConsistency),
          },
    affiliationFit: build === null ? null : round4(build.affiliationFit),
    candidateSummaries,
    removedCardNumbers: build?.removedCardNumbers ?? [],
    pickTrace,
  });
}
