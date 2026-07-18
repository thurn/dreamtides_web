import type {
  MobileBattleInspectorSideView,
  MobileBattleSideView,
  MobileBattleSlotView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { TutorialView } from "../../cumulus/screens/TutorialScreen";

const TUTORIAL_BATTLE_ID = "tutorial-battle";

function emptySlots(
  owner: "enemy" | "player",
  rank: "back" | "front",
  count: number,
): readonly MobileBattleSlotView[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `${owner}-${rank}-${String(index)}`,
    card: null,
  }));
}

function emptySide(owner: "enemy" | "player"): MobileBattleSideView {
  return {
    deckCardIds: [],
    banishedCardCount: 0,
    voidCards: [],
    backRank: emptySlots(owner, "back", 3),
    frontRank: emptySlots(owner, "front", 2),
    status: {
      dreamcaller: null,
      currentEnergy: 0,
      maxEnergy: 0,
      points: 0,
    },
  };
}

function emptyInspectorSide(
  side: "enemy" | "player",
): MobileBattleInspectorSideView {
  return {
    side,
    heading: side === "player" ? "Your" : "Enemy",
    points: 0,
    currentEnergy: 0,
    maxEnergy: 0,
    zones: {
      hand: 0,
      deck: 0,
      void: 0,
      banished: 0,
      backRank: 0,
      frontRank: 0,
    },
    canDiscard: false,
    canShuffle: false,
  };
}

/** Build the quest-independent opening state for the tutorial battle. */
export function buildTutorialView(): TutorialView {
  return {
    battle: {
      battleId: TUTORIAL_BATTLE_ID,
      aiApproval: null,
      cardPicker: null,
      choicePrompt: null,
      dreamwell: null,
      activeSide: "enemy",
      phase: "day",
      enemyHandCardIds: [],
      enemyHand: [],
      enemy: emptySide("enemy"),
      player: emptySide("player"),
      playerHand: [],
      inspector: {
        opponentName: "Awaiting Dreamcaller",
        turn: "1",
        phase: "Day",
        activeSide: "Enemy",
        result: "In progress",
        nextDreamwellOrder: "Complete",
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        sides: {
          player: emptyInspectorSide("player"),
          enemy: emptyInspectorSide("enemy"),
        },
        ai: null,
      },
      result: null,
    },
  };
}
