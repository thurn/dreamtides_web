import type {
  MobileBattleInspectorSideView,
  MobileBattleSideView,
  MobileBattleSlotView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { TutorialView } from "../../cumulus/screens/TutorialScreen";
import type {
  DisplaySpeechBubbleTutorialAction,
  TutorialDreamcallerOwner,
  TutorialPlaybackState,
} from "../../types/tutorial";

const TUTORIAL_BATTLE_ID = "tutorial-battle";
const TUTORIAL_DECK_SIZE = 30;
const TUTORIAL_DREAMCALLER_ID = "BFC40414-5264-41BF-86E1-A0F41EE4F5B5";
const TUTORIAL_OPPONENT_DREAMCALLER_ID = "86026206-1B11-4F38-A24E-FD3C697F5353";

function tutorialDeckIds(
  owner: "enemy" | "player",
): readonly string[] {
  return Array.from(
    { length: TUTORIAL_DECK_SIZE },
    (_unused, index) => `tutorial-${owner}-deck-${String(index + 1)}`,
  );
}

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
    deckCardIds: tutorialDeckIds(owner),
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
      deck: TUTORIAL_DECK_SIZE,
      void: 0,
      banished: 0,
      backRank: 0,
      frontRank: 0,
    },
    canDiscard: false,
    canShuffle: true,
  };
}

function activeDialogueAction(
  playback: TutorialPlaybackState | null,
): DisplaySpeechBubbleTutorialAction | null {
  if (playback?.currentActionIndex === null || playback === null) return null;
  for (let index = playback.currentActionIndex; index >= 0; index -= 1) {
    const action = playback.actions[index];
    if (action?.action === "display-speech-bubble") return action;
  }
  return null;
}

/** Build the quest-independent opening state for the tutorial battle. */
export function buildTutorialView(
  playback: TutorialPlaybackState | null = null,
): TutorialView {
  const currentAction =
    playback?.currentActionIndex === null ||
    playback?.currentActionIndex === undefined
      ? null
      : (playback.actions[playback.currentActionIndex] ?? null);
  const dialogueAction = activeDialogueAction(playback);
  const dreamcallerSettled = (owner: TutorialDreamcallerOwner): boolean => {
    const actionIndex =
      playback?.actions.findIndex(
        (action) =>
          action.action === "animate-dreamcaller-portrait" &&
          action.owner === owner,
      ) ?? -1;
    return (
      playback !== null &&
      actionIndex >= 0 &&
      (playback.currentActionIndex === null ||
        playback.currentActionIndex > actionIndex)
    );
  };
  return {
    dreamcallers: {
      player: {
        visual: {
          imageNumber: "0029",
          name: "Tensho",
          title: "Daimyo of Lacquered Fury",
          portraitFocus: { x: 0.5, y: 0.22 },
        },
        profile: {
          id: TUTORIAL_DREAMCALLER_ID,
          ability: "Dreamcaller ability is not active",
          unavailable: true,
        },
        settled: dreamcallerSettled("player"),
      },
      enemy: {
        visual: {
          imageNumber: "0087",
          name: "Vrakmoth",
          title: "Ashbroker",
          portraitFocus: { x: 0.49, y: 0.18 },
        },
        profile: {
          id: TUTORIAL_OPPONENT_DREAMCALLER_ID,
          ability: "Dreamcaller ability is not active",
          unavailable: true,
        },
        settled: dreamcallerSettled("enemy"),
      },
    },
    dialogue:
      dialogueAction === null
        ? null
        : {
            portrait: { kind: "character-portrait", characterId: "mira" },
            portraitAlt: "Mira",
            speakerName: "Mira",
            text: dialogueAction.text,
          },
    playbackRunId: playback?.runId ?? null,
    currentAction,
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
