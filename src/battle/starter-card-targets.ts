import { selectBattleCardLocation } from "./state/selectors";
import type { BattleMutableState } from "./types";

const ENEMY_LOW_COST_CHARACTER_TARGET_CARD_UUID =
  "4408b942-09a0-4f4e-a403-10c708c6e3c5";
const FRIENDLY_CHARACTER_TARGET_CARD_UUID =
  "944e15d2-d680-4ebe-8d18-36826f4b1535";

export function starterCardRequiresTarget(cardUuid: string): boolean {
  return (
    cardUuid === ENEMY_LOW_COST_CHARACTER_TARGET_CARD_UUID ||
    cardUuid === FRIENDLY_CHARACTER_TARGET_CARD_UUID
  );
}

export function selectStarterCardLegalTargetIds(
  board: BattleMutableState,
  sourceBattleCardId: string,
): string[] {
  const source = board.cardInstances[sourceBattleCardId];
  if (source === undefined) return [];
  const sourceCardUuid = source.definition.cardId;
  if (!starterCardRequiresTarget(sourceCardUuid)) return [];
  return Object.entries(board.cardInstances).flatMap(
    ([targetBattleCardId, target]) => {
      const location = selectBattleCardLocation(board, targetBattleCardId);
      const onBattlefield =
        location?.zone === "frontRank" || location?.zone === "backRank";
      if (!onBattlefield || target.definition.battleCardKind !== "character") {
        return [];
      }
      if (sourceCardUuid === ENEMY_LOW_COST_CHARACTER_TARGET_CARD_UUID) {
        return target.controller !== source.controller &&
          target.definition.energyCost <= 2
          ? [targetBattleCardId]
          : [];
      }
      return target.controller === source.controller
        ? [targetBattleCardId]
        : [];
    },
  );
}

export function starterCardHasRequiredTargets(
  board: BattleMutableState,
  sourceBattleCardId: string,
): boolean {
  const sourceCardUuid =
    board.cardInstances[sourceBattleCardId]?.definition.cardId;
  return sourceCardUuid !== undefined &&
    (
      !starterCardRequiresTarget(sourceCardUuid) ||
      selectStarterCardLegalTargetIds(board, sourceBattleCardId).length > 0
    );
}
