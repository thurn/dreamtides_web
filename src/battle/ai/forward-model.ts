import {
  isFigmentInstance,
  selectEffectiveSparkForInstance,
  selectFigmentCount,
  selectFigmentSparkContext,
} from "../state/figments";
import { supportedDeploySlots } from "../engine/support";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS, createEmptySlotRecord } from "../types";
import type {
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
  BackRankSlotId,
} from "../types";

/**
 * Lightweight, mutable projection of a single battle card that the AI planner
 * reasons over. Only the fields the planner needs are carried; identities are
 * preserved for the AI's own cards so it can act on them.
 */
export interface AiCard {
  battleCardId: string;
  cardNumber: number;
  name: string;
  energyCost: number;
  basePrintedSpark: number;
  sparkDelta: number;
  /** 1 for non-figments; the engine's figment stack size otherwise. */
  figmentCount: number;
  /**
   * Whether this character is allowed to challenge (or, on the opponent's turn,
   * defend) during the current turn. Projection reads the authoritative
   * {@link BattleCardStatus.isExhausted} flag: an exhausted body cannot
   * challenge, defend, or pay ☪ costs, so a character with `isExhausted` set is
   * `false` and an awakened body is `true`. Characters enter play exhausted and
   * the active side's exhaustion is cleared during the Dawn phase (see
   * `battle_rules.md` §Exhaust and Awaken). The planner additionally sets this
   * to `false` on cards it plays during the simulated turn.
   */
  canChallengeThisTurn: boolean;
}

/**
 * Abstract view of an opponent body on the battlefield. By the
 * asymmetric-knowledge principle the planner sees only spark, rank, slot, and
 * whether the body is a figment — never the opponent's card identity.
 *
 * `battleCardId` is a pure targeting HANDLE: it lets a model (e.g. Flashpoint
 * Detonation) name which body it wants to act on without revealing the card's
 * cardNumber, name, or text. The asymmetric-knowledge principle is preserved
 * because the handle carries no identity information the planner can read.
 */
export interface AiOpponentBody {
  /** Opaque instance id used only to name this body as a target. */
  battleCardId: string;
  effectiveSpark: number;
  /**
   * The body's printed energy cost. A card in play is public, so its cost is
   * known to both players (unlike its hidden hand/deck contents); cost-gated
   * removal such as Flashpoint Detonation ("cost 3● or less") reads it. Coerced
   * to `0` for a card with no printed cost.
   */
  energyCost: number;
  /** `front` = front rank, `back` = back rank. */
  rank: "front" | "back";
  /** The slot id, e.g. "F0" / "B2". */
  slot: string;
  isFigment: boolean;
}

export interface ForwardModel {
  aiEnergy: number;
  aiMaxEnergy: number;
  aiScore: number;
  playerScore: number;
  aiHand: AiCard[];
  aiDeck: AiCard[];
  aiVoid: AiCard[];
  aiFrontRank: Record<FrontRankSlotId, AiCard | null>;
  aiBackRank: Record<BackRankSlotId, AiCard | null>;
  opponentBodies: AiOpponentBody[];
  opponentHandCount: number;
  opponentVoidCount: number;
}

function opposingSide(side: BattleSide): BattleSide {
  return side === "player" ? "enemy" : "player";
}

/**
 * Builds an {@link AiCard} from a card instance. `energyCost` reads the
 * definition's cost; events and some cards may carry a `null` cost at runtime,
 * which is coerced to `0` (these cards do have a real cost in play, but a null
 * is treated as free for planning so the projection never produces `NaN`).
 */
function projectAiCard(instance: BattleCardInstance): AiCard {
  const rawCost: number | null = instance.definition.energyCost;
  // An exhausted body cannot challenge or be moved up to defend. The status is
  // authoritative: it is set on entering play (unless awakened) and cleared for
  // the active side during the Dawn phase.
  return {
    battleCardId: instance.battleCardId,
    cardNumber: instance.definition.cardNumber,
    name: instance.definition.name,
    energyCost: rawCost ?? 0,
    basePrintedSpark: instance.definition.printedSpark,
    sparkDelta: instance.sparkDelta,
    figmentCount: selectFigmentCount(instance),
    canChallengeThisTurn: !instance.status.isExhausted,
  };
}

function projectZone(
  state: BattleMutableState,
  ids: readonly string[],
): AiCard[] {
  const cards: AiCard[] = [];
  for (const id of ids) {
    const instance = state.cardInstances[id];
    if (instance !== undefined) {
      cards.push(projectAiCard(instance));
    }
  }
  return cards;
}

/**
 * Projects `state` into a {@link ForwardModel} from the perspective of
 * `aiSide`. The AI's own zones are projected with full identity; the opposing
 * side is reduced to abstract bodies plus hand/void counts.
 */
export function forwardModelFromState(state: BattleMutableState, aiSide: BattleSide): ForwardModel {
  const ai = state.sides[aiSide];
  const opponentSide = opposingSide(aiSide);
  const opponent = state.sides[opponentSide];

  const aiFrontRank: Record<FrontRankSlotId, AiCard | null> =
    createEmptySlotRecord(FRONT_RANK_SLOT_IDS);
  for (const slotId of FRONT_RANK_SLOT_IDS) {
    const id = ai.frontRank[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    aiFrontRank[slotId] = instance === undefined ? null : projectAiCard(instance);
  }

  const aiBackRank: Record<BackRankSlotId, AiCard | null> =
    createEmptySlotRecord(BACK_RANK_SLOT_IDS);
  for (const slotId of BACK_RANK_SLOT_IDS) {
    const id = ai.backRank[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    aiBackRank[slotId] = instance === undefined ? null : projectAiCard(instance);
  }

  const opponentBodies: AiOpponentBody[] = [];
  for (const slotId of FRONT_RANK_SLOT_IDS) {
    const id = opponent.frontRank[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    if (instance !== undefined) {
      opponentBodies.push({
        battleCardId: instance.battleCardId,
        effectiveSpark: selectEffectiveSparkForInstance(
          instance,
          selectFigmentSparkContext(state, instance),
        ),
        energyCost: instance.definition.energyCost ?? 0,
        rank: "front",
        slot: slotId,
        isFigment: isFigmentInstance(instance),
      });
    }
  }
  for (const slotId of BACK_RANK_SLOT_IDS) {
    const id = opponent.backRank[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    if (instance !== undefined) {
      opponentBodies.push({
        battleCardId: instance.battleCardId,
        effectiveSpark: selectEffectiveSparkForInstance(
          instance,
          selectFigmentSparkContext(state, instance),
        ),
        energyCost: instance.definition.energyCost ?? 0,
        rank: "back",
        slot: slotId,
        isFigment: isFigmentInstance(instance),
      });
    }
  }

  return {
    aiEnergy: ai.currentEnergy,
    aiMaxEnergy: ai.maxEnergy,
    aiScore: ai.score,
    playerScore: opponent.score,
    aiHand: projectZone(state, ai.hand),
    aiDeck: projectZone(state, ai.deck),
    aiVoid: projectZone(state, ai.void),
    aiFrontRank,
    aiBackRank,
    opponentBodies,
    opponentHandCount: opponent.hand.length,
    opponentVoidCount: opponent.void.length,
  };
}

/**
 * Computes the effective spark of the AI card occupying `slot`, adding support
 * bonuses from back-rank cards whose `battleCardId` appears in
 * `supportSources`.
 *
 * Base spark = `basePrintedSpark * figmentCount + sparkDelta`.
 *
 * For each occupied back-rank slot whose card's `battleCardId` is a key in
 * `supportSources`, if that back-rank slot's adjacency covers `slot` (per
 * `supportedDeploySlots`), the mapped value is added to the total. Each
 * support source contributes its full value to every slot it covers
 * independently — the value is not divided across supported slots.
 *
 * Returns 0 if `slot` is empty.
 *
 * @param supportSources - Per back-rank `AiCard` `battleCardId`, the flat
 *   spark bonus it grants to each front slot it supports.
 */
export function effectiveSpark(
  model: ForwardModel,
  slot: FrontRankSlotId,
  supportSources: ReadonlyMap<string, number>,
): number {
  const card = model.aiFrontRank[slot];
  if (card === null) {
    return 0;
  }

  const base = card.basePrintedSpark * card.figmentCount + card.sparkDelta;

  let supportBonus = 0;
  for (const backRankSlot of BACK_RANK_SLOT_IDS) {
    const backRankCard = model.aiBackRank[backRankSlot];
    if (backRankCard === null) {
      continue;
    }
    const bonus = supportSources.get(backRankCard.battleCardId);
    if (bonus === undefined) {
      continue;
    }
    if (supportedDeploySlots(backRankSlot).includes(slot)) {
      supportBonus += bonus;
    }
  }

  return base + supportBonus;
}

function cloneAiCard(card: AiCard): AiCard {
  return { ...card };
}

function cloneAiCardOrNull(card: AiCard | null): AiCard | null {
  return card === null ? null : cloneAiCard(card);
}

function cloneSlotRecord<K extends string>(
  source: Record<K, AiCard | null>,
  slotIds: readonly K[],
): Record<K, AiCard | null> {
  const record = createEmptySlotRecord(slotIds) as Record<K, AiCard | null>;
  for (const slotId of slotIds) {
    record[slotId] = cloneAiCardOrNull(source[slotId]);
  }
  return record;
}

/**
 * Structural copy deep enough that mutating a clone's zones, individual
 * {@link AiCard} objects, slot assignments, or opponent bodies never affects
 * the original. Explicit copies (no generic deep-clone library) keep this fast
 * and obvious for beam-search cloning.
 */
export function cloneForwardModel(model: ForwardModel): ForwardModel {
  return {
    aiEnergy: model.aiEnergy,
    aiMaxEnergy: model.aiMaxEnergy,
    aiScore: model.aiScore,
    playerScore: model.playerScore,
    aiHand: model.aiHand.map(cloneAiCard),
    aiDeck: model.aiDeck.map(cloneAiCard),
    aiVoid: model.aiVoid.map(cloneAiCard),
    aiFrontRank: cloneSlotRecord(model.aiFrontRank, FRONT_RANK_SLOT_IDS),
    aiBackRank: cloneSlotRecord(model.aiBackRank, BACK_RANK_SLOT_IDS),
    opponentBodies: model.opponentBodies.map((body) => ({ ...body })),
    opponentHandCount: model.opponentHandCount,
    opponentVoidCount: model.opponentVoidCount,
  };
}
