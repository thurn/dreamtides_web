import {
  isFigmentInstance,
  selectEffectiveSparkForInstance,
  selectFigmentCount,
} from "../state/figments";
import { supportedDeploySlots } from "../engine/support";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";
import type {
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  DeploySlotId,
  ReserveSlotId,
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
   * defend) during the current turn. Projection derives it from the engine's
   * {@link BattleCardInstance.enteredPlayTurnNumber} stamp: a body is exhausted
   * — and so cannot act — until its controller's next turn, so a character that
   * entered play on the AI's most recent turn is `false` and any older body (or
   * one with no stamp) is `true`. The planner additionally sets it to `false`
   * on cards it plays during the simulated turn.
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
  /** `front` = deployed, `back` = reserve. */
  rank: "front" | "back";
  /** The slot id, e.g. "D0" / "R2". */
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
  aiDeployed: Record<DeploySlotId, AiCard | null>;
  aiReserve: Record<ReserveSlotId, AiCard | null>;
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
function projectAiCard(instance: BattleCardInstance, aiLatestTurn: number): AiCard {
  const rawCost: number | null = instance.definition.energyCost;
  // A body is exhausted — and so cannot challenge or be moved up to defend —
  // until its controller's next turn. It entered play on its controller's
  // most recent turn iff its stamp equals `aiLatestTurn`; an older stamp (or
  // none) means a Dawn has since cleared the exhausted status.
  const enteredThisTurn = instance.enteredPlayTurnNumber != null
    && instance.enteredPlayTurnNumber === aiLatestTurn;
  return {
    battleCardId: instance.battleCardId,
    cardNumber: instance.definition.cardNumber,
    name: instance.definition.name,
    energyCost: rawCost ?? 0,
    basePrintedSpark: instance.definition.printedSpark,
    sparkDelta: instance.sparkDelta,
    figmentCount: selectFigmentCount(instance),
    canChallengeThisTurn: !enteredThisTurn,
  };
}

function projectZone(
  state: BattleMutableState,
  ids: readonly string[],
  aiLatestTurn: number,
): AiCard[] {
  const cards: AiCard[] = [];
  for (const id of ids) {
    const instance = state.cardInstances[id];
    if (instance !== undefined) {
      cards.push(projectAiCard(instance, aiLatestTurn));
    }
  }
  return cards;
}

/**
 * The AI's most recent turn number. Within a turn pair the player acts before
 * the enemy at the same `turnNumber` (see `advanceTurnPair` in
 * `engine/handoff.ts`), so when it is the AI's own turn its latest turn is the
 * current one, and when it is the opponent's turn the AI's latest turn is the
 * previous number. A body whose `enteredPlayTurnNumber` equals this value is
 * still exhausted.
 */
function aiLatestTurnNumber(state: BattleMutableState, aiSide: BattleSide): number {
  return state.activeSide === aiSide ? state.turnNumber : state.turnNumber - 1;
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
  const aiLatestTurn = aiLatestTurnNumber(state, aiSide);

  const aiDeployed: Record<DeploySlotId, AiCard | null> = {
    D0: null,
    D1: null,
    D2: null,
    D3: null,
  };
  for (const slotId of DEPLOY_SLOT_IDS) {
    const id = ai.deployed[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    aiDeployed[slotId] = instance === undefined ? null : projectAiCard(instance, aiLatestTurn);
  }

  const aiReserve: Record<ReserveSlotId, AiCard | null> = {
    R0: null,
    R1: null,
    R2: null,
    R3: null,
    R4: null,
  };
  for (const slotId of RESERVE_SLOT_IDS) {
    const id = ai.reserve[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    aiReserve[slotId] = instance === undefined ? null : projectAiCard(instance, aiLatestTurn);
  }

  const opponentBodies: AiOpponentBody[] = [];
  for (const slotId of DEPLOY_SLOT_IDS) {
    const id = opponent.deployed[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    if (instance !== undefined) {
      opponentBodies.push({
        battleCardId: instance.battleCardId,
        effectiveSpark: selectEffectiveSparkForInstance(instance),
        energyCost: instance.definition.energyCost ?? 0,
        rank: "front",
        slot: slotId,
        isFigment: isFigmentInstance(instance),
      });
    }
  }
  for (const slotId of RESERVE_SLOT_IDS) {
    const id = opponent.reserve[slotId];
    const instance = id === null ? undefined : state.cardInstances[id];
    if (instance !== undefined) {
      opponentBodies.push({
        battleCardId: instance.battleCardId,
        effectiveSpark: selectEffectiveSparkForInstance(instance),
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
    aiHand: projectZone(state, ai.hand, aiLatestTurn),
    aiDeck: projectZone(state, ai.deck, aiLatestTurn),
    aiVoid: projectZone(state, ai.void, aiLatestTurn),
    aiDeployed,
    aiReserve,
    opponentBodies,
    opponentHandCount: opponent.hand.length,
    opponentVoidCount: opponent.void.length,
  };
}

/**
 * Computes the effective spark of the AI card occupying `slot`, adding support
 * bonuses from back-rank (reserve) cards whose `battleCardId` appears in
 * `supportSources`.
 *
 * Base spark = `basePrintedSpark * figmentCount + sparkDelta`.
 *
 * For each occupied reserve slot whose card's `battleCardId` is a key in
 * `supportSources`, if that reserve slot's adjacency covers `slot` (per
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
  slot: DeploySlotId,
  supportSources: ReadonlyMap<string, number>,
): number {
  const card = model.aiDeployed[slot];
  if (card === null) {
    return 0;
  }

  const base = card.basePrintedSpark * card.figmentCount + card.sparkDelta;

  let supportBonus = 0;
  for (const reserveSlot of RESERVE_SLOT_IDS) {
    const reserveCard = model.aiReserve[reserveSlot];
    if (reserveCard === null) {
      continue;
    }
    const bonus = supportSources.get(reserveCard.battleCardId);
    if (bonus === undefined) {
      continue;
    }
    if (supportedDeploySlots(reserveSlot).includes(slot)) {
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
    aiDeployed: {
      D0: cloneAiCardOrNull(model.aiDeployed.D0),
      D1: cloneAiCardOrNull(model.aiDeployed.D1),
      D2: cloneAiCardOrNull(model.aiDeployed.D2),
      D3: cloneAiCardOrNull(model.aiDeployed.D3),
    },
    aiReserve: {
      R0: cloneAiCardOrNull(model.aiReserve.R0),
      R1: cloneAiCardOrNull(model.aiReserve.R1),
      R2: cloneAiCardOrNull(model.aiReserve.R2),
      R3: cloneAiCardOrNull(model.aiReserve.R3),
      R4: cloneAiCardOrNull(model.aiReserve.R4),
    },
    opponentBodies: model.opponentBodies.map((body) => ({ ...body })),
    opponentHandCount: model.opponentHandCount,
    opponentVoidCount: model.opponentVoidCount,
  };
}
