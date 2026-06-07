import { BACK_RANK_SLOT_IDS } from "../../types";
import type { ForwardModel, AiCard } from "../forward-model";

/**
 * Removes `self` (matched by `battleCardId`) from `model.aiHand`. Returns the
 * removed card, or `null` when no card in hand matched. Shared by every card's
 * `play` so the hand mutation lives in one place.
 */
export function removeFromHand(model: ForwardModel, self: AiCard): AiCard | null {
  const index = model.aiHand.findIndex((card) => card.battleCardId === self.battleCardId);
  if (index === -1) {
    return null;
  }
  return model.aiHand.splice(index, 1)[0];
}

/**
 * Returns whether a character can be played now: the AI can afford its energy
 * cost and at least one reserve slot is free to receive it.
 */
export function characterCanPlay(model: ForwardModel, self: AiCard): boolean {
  if (model.aiEnergy < self.energyCost) {
    return false;
  }
  return BACK_RANK_SLOT_IDS.some((slot) => model.aiReserve[slot] === null);
}

/**
 * Resolves a character `play`: pays `self.energyCost`, removes `self` from
 * hand, and places it into the first empty reserve slot with
 * `canChallengeThisTurn = false` (a character cannot challenge the turn it is
 * played — see `battle_ai.md` §"The Planner"). The placed card is the instance
 * pulled from hand when present, falling back to `self`. If every reserve slot
 * is occupied the card is dropped after paying its cost (the planner only
 * proposes a character play when a reserve slot is free).
 */
export function playCharacterToReserve(model: ForwardModel, self: AiCard): void {
  model.aiEnergy -= self.energyCost;
  const card = removeFromHand(model, self) ?? self;
  card.canChallengeThisTurn = false;
  for (const slot of BACK_RANK_SLOT_IDS) {
    if (model.aiReserve[slot] === null) {
      model.aiReserve[slot] = card;
      return;
    }
  }
}

/**
 * Resolves an event `play`: pays `self.energyCost`, removes `self` from hand,
 * runs `effect` (the card's resolution, which mutates the model), then pushes
 * `self` onto `model.aiVoid`. The removed-from-hand instance (falling back to
 * `self`) is the one sent to the void.
 */
export function playEvent(
  model: ForwardModel,
  self: AiCard,
  effect: () => void,
): void {
  model.aiEnergy -= self.energyCost;
  const card = removeFromHand(model, self) ?? self;
  effect();
  model.aiVoid.push(card);
}

/**
 * Draws the top card of `model.aiDeck` into `model.aiHand`. No-op on an empty
 * deck (the prototype does not model deck-out loss here).
 */
export function drawTopCard(model: ForwardModel): void {
  const card = model.aiDeck.shift();
  if (card !== undefined) {
    model.aiHand.push(card);
  }
}

/**
 * Models Foresee `n`: inspect the top `n` cards of `model.aiDeck` and bin the
 * poor fits to the bottom, keeping the keepers on top in their original order.
 *
 * Heuristic (deterministic, intentionally simple — `battle_ai.md`
 * §"Per-Card Knowledge" treats Foresee as deck selection toward curve/plan): a
 * top card is binned to the bottom when the AI cannot afford it within one
 * energy of its current max (`energyCost > aiMaxEnergy + 1`) OR it duplicates a
 * card already in hand (clutter). Otherwise it is kept on top. The deck is
 * always a permutation of its prior contents.
 */
export function foresee(model: ForwardModel, n: number): void {
  const handNumbers = new Set(model.aiHand.map((card) => card.cardNumber));
  const inspectCount = Math.min(n, model.aiDeck.length);
  const inspected = model.aiDeck.splice(0, inspectCount);
  const keep: AiCard[] = [];
  const bin: AiCard[] = [];
  for (const card of inspected) {
    const tooExpensive = card.energyCost > model.aiMaxEnergy + 1;
    const duplicate = handNumbers.has(card.cardNumber);
    if (tooExpensive || duplicate) {
      bin.push(card);
    } else {
      keep.push(card);
    }
  }
  model.aiDeck.unshift(...keep);
  model.aiDeck.push(...bin);
}
