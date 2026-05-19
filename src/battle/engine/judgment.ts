import { DEPLOY_SLOT_IDS, type BattleJudgmentResolution, type BattleLaneJudgment, type BattleMutableState, type BattleSide, type DeploySlotId } from "../types";
import { selectDeployedSpark } from "../state/selectors";

export function resolveJudgment(state: BattleMutableState): BattleJudgmentResolution {
  const lanes: BattleLaneJudgment[] = DEPLOY_SLOT_IDS.map((slotId) => {
    const playerSpark = selectDeployedSpark(state, "player", slotId);
    const enemySpark = selectDeployedSpark(state, "enemy", slotId);
    const activeCardId = state.sides[state.activeSide].deployed[slotId];
    const opposingSide = state.activeSide === "player" ? "enemy" : "player";
    const opposingCardId = state.sides[opposingSide].deployed[slotId];

    if (activeCardId === null) {
      return {
        slotId,
        playerSpark,
        enemySpark,
        winner: null,
        scoreDelta: 0,
      };
    }

    if (opposingCardId === null) {
      return {
        slotId,
        playerSpark,
        enemySpark,
        winner: state.activeSide,
        scoreDelta: state.activeSide === "player" ? playerSpark : enemySpark,
      };
    }

    if (playerSpark === enemySpark) {
      return {
        slotId,
        playerSpark,
        enemySpark,
        winner: null,
        scoreDelta: 0,
      };
    }

    return {
      slotId,
      playerSpark,
      enemySpark,
      winner: playerSpark > enemySpark ? "player" : "enemy",
      scoreDelta: 0,
    };
  });

  return {
    lanes,
    playerScoreDelta: lanes
      .filter((lane) => lane.winner === "player")
      .reduce((total, lane) => total + lane.scoreDelta, 0),
    enemyScoreDelta: lanes
      .filter((lane) => lane.winner === "enemy")
      .reduce((total, lane) => total + lane.scoreDelta, 0),
  };
}

export function applyJudgmentDissolutionsInPlace(state: BattleMutableState): void {
  for (const slotId of DEPLOY_SLOT_IDS) {
    dissolveLaneInPlace(state, slotId);
  }
}

function dissolveLaneInPlace(state: BattleMutableState, slotId: DeploySlotId): void {
  const playerCardId = state.sides.player.deployed[slotId];
  const enemyCardId = state.sides.enemy.deployed[slotId];

  if (playerCardId === null || enemyCardId === null) {
    return;
  }

  const playerSpark = selectDeployedSpark(state, "player", slotId);
  const enemySpark = selectDeployedSpark(state, "enemy", slotId);

  if (playerSpark === enemySpark) {
    dissolveCardInPlace(state, "player", slotId, playerCardId);
    dissolveCardInPlace(state, "enemy", slotId, enemyCardId);
    return;
  }

  if (playerSpark > enemySpark) {
    dissolveCardInPlace(state, "enemy", slotId, enemyCardId);
    return;
  }

  dissolveCardInPlace(state, "player", slotId, playerCardId);
}

function dissolveCardInPlace(
  state: BattleMutableState,
  side: BattleSide,
  slotId: DeploySlotId,
  battleCardId: string,
): void {
  state.sides[side].deployed[slotId] = null;
  state.sides[side].void.push(battleCardId);
}
