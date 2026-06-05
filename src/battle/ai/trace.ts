import type { PlannedAction } from "./planner";
import { CHARACTER_CARD_NUMBERS } from "./cards/card-numbers";
import type { BattleAiChoiceTrace } from "../types";

/**
 * Enriches the planner's {@link BattleAiChoiceTrace} (carried on
 * `action.trace` with its existing fields already populated) with the two
 * presentation fields added in Task 5.1:
 *
 * - `rationale`: a plain-language description of the action, derived from its
 *   kind / stage / card name / target.
 * - `targetBattleCardId`: the targeted card id (Flashpoint's enemy body,
 *   Worlds Await' ally), or `null` when the action has no card target.
 *
 * Returns a NEW trace object (the planner's trace is spread, never mutated) so
 * callers can keep the original alongside the enriched copy.
 */
export function buildTrace(action: PlannedAction): BattleAiChoiceTrace {
  return {
    ...action.trace,
    rationale: describeAction(action),
    targetBattleCardId: action.targets?.targetBattleCardId ?? null,
  };
}

/** Builds the plain-language `rationale` for `action`. */
function describeAction(action: PlannedAction): string {
  if (action.kind === "END_TURN") {
    return "End turn";
  }

  const cardName = action.self?.name ?? action.trace.cardName ?? "a card";

  if (action.kind === "MOVE_CARD") {
    return `Declare ${cardName} as a challenger`;
  }

  // PLAY_CARD.
  const cardNumber = action.self?.cardNumber;
  if (cardNumber !== undefined && CHARACTER_CARD_NUMBERS.has(cardNumber)) {
    return `Play ${cardName} to the back rank`;
  }

  // Event play. Name the dissolve target when one is present (Flashpoint), the
  // supported ally when one is present (Worlds Await), otherwise a plain play.
  const targetId = action.targets?.targetBattleCardId ?? null;
  if (cardNumber === 516 && targetId !== null) {
    return `Dissolve the enemy body with ${cardName}`;
  }
  if (cardNumber === 519 && targetId !== null) {
    return `Empower an ally with ${cardName}`;
  }
  return `Play ${cardName}`;
}
