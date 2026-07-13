import { selectPlayAreaSize } from "../../battle/state/selectors";
import {
  backRankSlotIds,
  frontRankSlotIds,
  type BattleCardInstance,
  type BattleDreamcallerSummary,
  type BattleInit,
  type BattleMutableState,
  type BattleSide,
} from "../../battle/types";
import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import type {
  MobileBattleCardView,
  MobileBattleSideView,
  MobileBattleSlotView,
  MobileBattleStatusView,
  MobileBattleView,
} from "../../tango/screens/MobileBattleScreen";

const FALLBACK_PLAYER_DREAMCALLER = {
  imageNumber: "001",
  name: "Dreamcaller",
  title: "",
} as const;

export type MobileBattleInit = BattleInit;
export type MobileBattleBoard = BattleMutableState;
export type MobileBattleDreamcaller = BattleDreamcallerSummary;

export function buildMobileBattleView(
  init: BattleInit,
  board: BattleMutableState,
  enemyDreamcaller: BattleDreamcallerSummary,
): MobileBattleView {
  const { frontSize, backSize } = selectPlayAreaSize(board);
  return {
    battleId: init.battleId,
    enemyHandCardIds: [...board.sides.enemy.hand],
    enemy: buildSideView("enemy", enemyDreamcaller, board, frontSize, backSize),
    player: buildSideView(
      "player",
      init.dreamcallerSummary ?? FALLBACK_PLAYER_DREAMCALLER,
      board,
      frontSize,
      backSize,
    ),
    playerHand: buildCardViews(board.sides.player.hand, board),
  };
}

export function buildMobileBattleCardView(
  instance: BattleCardInstance,
): MobileBattleCardView {
  const figment = instance.provenance.kind === "generated-figment";
  return {
    id: instance.battleCardId,
    model: battleGameCardModel(instance),
    exhausted: instance.status.isExhausted,
    figment,
    figmentTitleBar: figment && instance.definition.name.trim() !== "",
  };
}

function buildSideView(
  side: BattleSide,
  dreamcaller: BattleDreamcallerSummary | typeof FALLBACK_PLAYER_DREAMCALLER,
  board: BattleMutableState,
  frontSize: number,
  backSize: number,
): MobileBattleSideView {
  const sideState = board.sides[side];
  return {
    deckCardIds: [...sideState.deck],
    voidCards: buildCardViews([...sideState.void].reverse(), board),
    backRank: backRankSlotIds(backSize).map((slotId) =>
      buildSlotView(slotId, sideState.backRank[slotId] ?? null, board),
    ),
    frontRank: frontRankSlotIds(frontSize).map((slotId) =>
      buildSlotView(slotId, sideState.frontRank[slotId] ?? null, board),
    ),
    status: buildStatusView(dreamcaller, sideState),
  };
}

function buildCardViews(
  battleCardIds: readonly string[],
  board: BattleMutableState,
): MobileBattleCardView[] {
  return battleCardIds.flatMap((battleCardId) => {
    const instance = board.cardInstances[battleCardId];
    return instance === undefined ? [] : [buildMobileBattleCardView(instance)];
  });
}

function buildSlotView(
  id: string,
  battleCardId: string | null,
  board: BattleMutableState,
): MobileBattleSlotView {
  const instance = battleCardId === null ? undefined : board.cardInstances[battleCardId];
  return {
    id,
    card: instance === undefined ? null : buildMobileBattleCardView(instance),
  };
}

function buildStatusView(
  dreamcaller: BattleDreamcallerSummary | typeof FALLBACK_PLAYER_DREAMCALLER,
  sideState: BattleMutableState["sides"][BattleSide],
): MobileBattleStatusView {
  return {
    dreamcaller: {
      imageNumber: dreamcaller.imageNumber,
      name: dreamcaller.name,
      title: dreamcaller.title,
    },
    currentEnergy: sideState.currentEnergy,
    maxEnergy: sideState.maxEnergy,
    points: sideState.score,
  };
}
