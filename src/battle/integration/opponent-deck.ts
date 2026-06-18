// Opponent deck + descriptor construction for the Battle site (quests doc
// "Battle"). Each battle has an assigned opponent Dreamcaller whose deck is
// built by emulating the player's own journey: a simulated quest is run with
// that Dreamcaller's tides up to the equivalent point in the run, biased toward
// the dreamscape's affiliation, so the decks the player faces grow stronger as
// the run progresses. Opponents carry no dreamsigns in the early battles; from
// the run midpoint onward each opponent brings a single dreamsign.
//
// This module is the single source of opponent construction. `create-battle-init`
// calls into it to assemble the enemy descriptor (dreamcaller + dreamsigns) and
// the enemy battle deck, then logs `opponent_deck_constructed` so a battle's
// opponent can be reconstructed from `logs/quest-log.jsonl`.

import type { CardData } from "../../types/cards";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type { DreamscapeNode } from "../../types/quest";
import type { RunPoolContext } from "../../data/quest-content";
import { generatePoolFromData } from "../../draft/pool/generate";
import { DEFAULT_POOL_VARIANT } from "../../draft/pool/types";
import {
  opponentAffiliationBias,
  resolveNodeAffiliation,
} from "../../affiliations/affiliation-weights";
import { logEvent } from "../../logging";
import type { BattleRng } from "../random";

/**
 * Default run length used when the atlas snapshot does not carry its per-layer
 * node lists (e.g. battle-engine tests build a minimal atlas). The live run is
 * a 7-layer atlas, so the midpoint derives from 7 unless the
 * caller supplies a populated atlas, which always wins.
 */
export const DEFAULT_RUN_LAYER_COUNT = 7;

/**
 * Minimum and maximum number of distinct (deduplicated) cards the opponent deck
 * draws from the simulated pool, before per-card copies and padding. The count
 * scales linearly with run progress between these bounds so a layer-0 opponent
 * fields the smallest legal deck and the final boss fields the largest.
 */
const MIN_OPPONENT_DISTINCT_CARDS = 14;
const MAX_OPPONENT_DISTINCT_CARDS = 30;

/**
 * Number of whole-deck copies the opponent runs of each chosen card grows from
 * one (early run) toward this cap (late run), so later decks are not only wider
 * but denser with their best cards.
 */
const MAX_OPPONENT_COPIES_PER_CARD = 2;

/**
 * The run length for `state.atlas`: the number of layers, which is the number of
 * battles in the run. Falls back to {@link DEFAULT_RUN_LAYER_COUNT} when the
 * atlas does not carry its per-layer node lists.
 */
export function resolveRunLayerCount(layers: readonly unknown[]): number {
  return layers.length > 0 ? layers.length : DEFAULT_RUN_LAYER_COUNT;
}

/**
 * The 0-indexed `completionLevel` at which opponents begin carrying a dreamsign.
 * Derived from the run length — the middle of the run — so it tracks the layer
 * count rather than a hardcoded battle number. For the live 7-layer run this is
 * `floor(7 / 2) = 3` (the fourth battle, 1-indexed layer 4).
 */
export function runMidpointCompletionLevel(layerCount: number): number {
  return Math.floor(Math.max(1, layerCount) / 2);
}

/**
 * Whether an opponent at `completionLevel` (0-indexed) in a `layerCount`-layer
 * run carries a dreamsign: true from the run midpoint onward, false before it.
 */
export function opponentCarriesDreamsign(
  completionLevel: number,
  layerCount: number,
): boolean {
  return completionLevel >= runMidpointCompletionLevel(layerCount);
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
): number {
  const fraction = progressFraction(completionLevel, layerCount);
  const span = MAX_OPPONENT_DISTINCT_CARDS - MIN_OPPONENT_DISTINCT_CARDS;
  return MIN_OPPONENT_DISTINCT_CARDS + Math.round(span * fraction);
}

/**
 * How many copies of each chosen card the opponent runs at `completionLevel`,
 * scaling from one (early) up to {@link MAX_OPPONENT_COPIES_PER_CARD} (late) so
 * later decks are denser with their best cards. Monotonically non-decreasing in
 * `completionLevel`.
 */
function opponentCopiesPerCard(
  completionLevel: number,
  layerCount: number,
): number {
  const fraction = progressFraction(completionLevel, layerCount);
  return 1 + Math.round((MAX_OPPONENT_COPIES_PER_CARD - 1) * fraction);
}

/**
 * Deterministically selects the opponent Dreamcaller for a battle from the run's
 * `dreamcallers`. The choice is pinned to the battle seed so it is reproducible
 * per battle entry, and the player's own Dreamcaller is excluded when another
 * candidate exists (the player should face a different rival each battle). Returns
 * `null` only when there are no Dreamcallers at all.
 */
export function selectOpponentDreamcaller(
  dreamcallers: readonly DreamcallerContent[],
  playerDreamcallerId: string | null,
  rng: BattleRng,
): DreamcallerContent | null {
  if (dreamcallers.length === 0) {
    return null;
  }
  const candidates = dreamcallers.filter(
    (dreamcaller) => dreamcaller.id !== playerDreamcallerId,
  );
  const pool = candidates.length > 0 ? candidates : dreamcallers;
  return pool[rng.nextInt(pool.length)];
}

/**
 * The single dreamsign an opponent brings from the run midpoint onward, drawn
 * deterministically from `dreamsignTemplates` via the battle RNG. Returns an
 * empty list before the midpoint, or when no templates are available.
 */
export function buildOpponentDreamsigns(
  completionLevel: number,
  layerCount: number,
  dreamsignTemplates: readonly DreamsignTemplate[],
  rng: BattleRng,
): DreamsignTemplate[] {
  if (!opponentCarriesDreamsign(completionLevel, layerCount)) {
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

/** A card paired with its selection weight for deterministic weighted draws. */
interface WeightedCandidate {
  card: CardData;
  weight: number;
}

/**
 * Draws `count` distinct cards from `candidates` without replacement, weighted by
 * each candidate's `weight`, using the seeded battle RNG so the draw is
 * reproducible per battle. A higher weight (an affiliation-leaning card) is more
 * likely to be drawn, but every candidate keeps a positive weight so any card the
 * simulated pool produced can still appear (the affiliation "any card can still
 * appear" rule carried into the opponent build).
 */
function weightedSampleWithoutReplacement(
  candidates: readonly WeightedCandidate[],
  count: number,
  rng: BattleRng,
): CardData[] {
  const remaining = candidates.map((candidate) => ({ ...candidate }));
  const chosen: CardData[] = [];
  const target = Math.min(count, remaining.length);

  while (chosen.length < target && remaining.length > 0) {
    let totalWeight = 0;
    for (const candidate of remaining) {
      totalWeight += candidate.weight;
    }
    if (totalWeight <= 0) {
      // Degenerate weights: fall back to a uniform pick so the draw still fills.
      const index = rng.nextInt(remaining.length);
      chosen.push(remaining[index].card);
      remaining.splice(index, 1);
      continue;
    }
    let roll = rng.nextFloat() * totalWeight;
    let pickedIndex = remaining.length - 1;
    for (let index = 0; index < remaining.length; index += 1) {
      roll -= remaining[index].weight;
      if (roll <= 0) {
        pickedIndex = index;
        break;
      }
    }
    chosen.push(remaining[pickedIndex].card);
    remaining.splice(pickedIndex, 1);
  }

  return chosen;
}

/** Result of an opponent deck build: the chosen cards plus a reconstruction summary. */
export interface OpponentDeckBuild {
  /**
   * The chosen distinct cards expanded to per-card copies (each card repeated
   * `copiesPerCard` times). Ordering is the weighted draw order, copies grouped.
   * The caller shuffles and pads these into the enemy draw order.
   */
  cards: CardData[];
  /** The distinct cards chosen before copy expansion, in draw order. */
  distinctCards: CardData[];
  copiesPerCard: number;
}

/**
 * Builds the opponent battle deck by emulating the opponent Dreamcaller's journey:
 * a pool is simulated with that Dreamcaller's signature/tides up to the run's pool
 * strategy (`poolContext.poolVariant`, default {@link DEFAULT_POOL_VARIANT} =
 * `tides4`), exactly as the player's own draft pool is built. The simulated pool's
 * cards are resolved to {@link CardData}, biased toward the dreamscape affiliation
 * via {@link opponentAffiliationBias}, then a progress-scaled number of distinct
 * cards is drawn (weighted by the bias) and expanded to a progress-scaled copy
 * count — so later-layer decks are both wider and denser, and lean toward the
 * affiliation when one is present.
 *
 * Returns `null` when no usable pool can be produced (no `poolContext`, or the
 * simulated pool resolves to no cards in the database), so the caller can apply
 * its existing fallback deck.
 */
export function buildOpponentDeck(args: {
  opponentDreamcaller: DreamcallerContent | null;
  poolContext: RunPoolContext | undefined;
  cardDatabase: ReadonlyMap<number, CardData>;
  affiliation: AffiliationContent | null;
  completionLevel: number;
  layerCount: number;
  poolSeed: number;
  rng: BattleRng;
}): OpponentDeckBuild | null {
  const {
    opponentDreamcaller,
    poolContext,
    cardDatabase,
    affiliation,
    completionLevel,
    layerCount,
    poolSeed,
    rng,
  } = args;

  if (poolContext === undefined) {
    return null;
  }

  const pool = generatePoolFromData(
    poolContext.poolData,
    poolSeed,
    /* seedArchetypes */ undefined,
    poolContext.poolVariant ?? DEFAULT_POOL_VARIANT,
    /* themeArchetypes */ undefined,
    /* targetSize */ undefined,
    opponentDreamcaller?.signatureCards ?? [],
    opponentDreamcaller?.id,
  );

  // Prefer the curated anchor starter decklist when the variant produces one
  // (idf3): for those variants the Dreamcaller's signature steers the anchor
  // deck, not the full corpus `counts`. Variants whose steered pool *is* the
  // `counts` map (tides4, the production default, which sets no `starterDeck`)
  // fall through to `counts`.
  const starterDeck = pool.starterDeck ?? [];
  const poolNames =
    starterDeck.length > 0 ? [...starterDeck] : [...pool.counts.keys()];

  const poolCards: CardData[] = [];
  for (const name of poolNames) {
    const cardNumber = poolContext.nameIndex.get(name);
    if (cardNumber === undefined) {
      continue;
    }
    const card = cardDatabase.get(cardNumber);
    if (card === undefined) {
      continue;
    }
    poolCards.push(card);
  }

  if (poolCards.length === 0) {
    return null;
  }

  // Apply the affiliation bias to the candidate cards (Task 4 hook). With no
  // affiliation every candidate keeps weight 1, so the draw is unbiased.
  const weighted: WeightedCandidate[] =
    affiliation === null
      ? poolCards.map((card) => ({ card, weight: 1 }))
      : opponentAffiliationBias(
          poolCards,
          affiliation,
          poolContext.poolData,
          cardDatabase,
        );

  const distinctCount = Math.min(
    opponentDistinctCardCount(completionLevel, layerCount),
    weighted.length,
  );
  const distinctCards = weightedSampleWithoutReplacement(
    weighted,
    distinctCount,
    rng,
  );
  const copiesPerCard = opponentCopiesPerCard(completionLevel, layerCount);

  const cards: CardData[] = [];
  for (const card of distinctCards) {
    for (let copy = 0; copy < copiesPerCard; copy += 1) {
      cards.push(card);
    }
  }

  return { cards, distinctCards, copiesPerCard };
}

/**
 * Reconstruction logging for one opponent deck (spec §8). Captures the opponent
 * Dreamcaller, the simulated pool strategy + seed + depth, the resolved
 * affiliation, the dreamsign carried (if any), and a decklist summary (distinct
 * cards, copies, total size, top card numbers), so a battle's opponent can be
 * reconstructed from `logs/quest-log.jsonl` filtered by `gameId`.
 */
export function logOpponentDeckConstructed(args: {
  battleEntryKey: string;
  opponentDreamcaller: DreamcallerContent | null;
  poolVariant: string;
  poolSeed: number;
  completionLevel: number;
  layerCount: number;
  affiliation: AffiliationContent | null;
  dreamsigns: readonly DreamsignTemplate[];
  build: OpponentDeckBuild | null;
  fallbackDeckSize: number;
}): void {
  const {
    battleEntryKey,
    opponentDreamcaller,
    poolVariant,
    poolSeed,
    completionLevel,
    layerCount,
    affiliation,
    dreamsigns,
    build,
    fallbackDeckSize,
  } = args;

  const topCardNumbers = (build?.distinctCards ?? [])
    .slice(0, 12)
    .map((card) => card.cardNumber);

  logEvent("opponent_deck_constructed", {
    battleEntryKey,
    opponentDreamcallerId: opponentDreamcaller?.id ?? null,
    opponentDreamcallerName: opponentDreamcaller?.name ?? null,
    poolVariant,
    poolSeed,
    completionLevel,
    layerCount,
    midpointCompletionLevel: runMidpointCompletionLevel(layerCount),
    carriesDreamsign: opponentCarriesDreamsign(completionLevel, layerCount),
    affiliationId: affiliation?.id ?? null,
    dreamsignIds: dreamsigns.map((dreamsign) => dreamsign.id),
    builtFromSimulation: build !== null,
    distinctCardCount: build?.distinctCards.length ?? 0,
    copiesPerCard: build?.copiesPerCard ?? 0,
    deckSize: build?.cards.length ?? fallbackDeckSize,
    topCardNumbers,
  });
}
