import type { BattleMutableState, BattleSide } from "./types";
import { selectBattleCardLocation } from "./state/selectors";
import semanticPlayCardIds from "./semantic-play-card-ids.json";

const SEMANTIC_PLAY_CARD_IDS: ReadonlySet<string> = new Set(
  semanticPlayCardIds,
);

/** Whether the semantic play event has a complete, explicitly audited rule. */
export function isBattleCardSemanticPlayAutomated(cardId: string): boolean {
  return SEMANTIC_PLAY_CARD_IDS.has(cardId);
}

/** Target legality shared by semantic AI/tutorial play planning and folding. */
export function semanticPlayTargetsAreLegal(
  board: BattleMutableState,
  controller: BattleSide,
  cardId: string,
  targets: readonly string[],
): boolean {
  const target = targets[0];
  if (cardId === "4408b942-09a0-4f4e-a403-10c708c6e3c5") {
    const instance =
      target === undefined ? undefined : board.cardInstances[target];
    const location =
      target === undefined ? null : selectBattleCardLocation(board, target);
    return (
      targets.length === 1 &&
      instance !== undefined &&
      instance.controller !== controller &&
      instance.definition.battleCardKind === "character" &&
      instance.definition.energyCost <= 2 &&
      location !== null &&
      (location.zone === "frontRank" || location.zone === "backRank")
    );
  }
  if (cardId === "944e15d2-d680-4ebe-8d18-36826f4b1535") {
    const instance =
      target === undefined ? undefined : board.cardInstances[target];
    const location =
      target === undefined ? null : selectBattleCardLocation(board, target);
    return (
      targets.length === 1 &&
      instance !== undefined &&
      instance.controller === controller &&
      instance.definition.battleCardKind === "character" &&
      location !== null &&
      (location.zone === "frontRank" || location.zone === "backRank")
    );
  }
  return targets.length === 0;
}
