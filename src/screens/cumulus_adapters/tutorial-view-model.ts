import type {
  MobileBattleCardView,
  MobileBattleInspectorSideView,
  MobileBattleSideView,
  MobileBattleSlotView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { TutorialView } from "../../cumulus/screens/TutorialScreen";
import type { CardData } from "../../types/cards";
import { TUTORIAL_OPPONENT_CARD_ID } from "../../data/tutorial-opponent-card";
import type {
  DisplaySpeechBubbleTutorialAction,
  TutorialAction,
  TutorialDreamcallerOwner,
  TutorialPlaybackState,
} from "../../types/tutorial";

const TUTORIAL_BATTLE_ID = "tutorial-battle";
const TUTORIAL_DECK_SIZE = 30;
const TUTORIAL_DREAMCALLER_ID = "BFC40414-5264-41BF-86E1-A0F41EE4F5B5";
const TUTORIAL_OPPONENT_DREAMCALLER_ID = "86026206-1B11-4F38-A24E-FD3C697F5353";
const TUTORIAL_OPPONENT_BACK_RANK_INDEX = 0;
const TUTORIAL_PLAYER_TURN_ENERGY = 4;
export {
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_ID,
} from "../../data/tutorial-opponent-card";

/** Reconstruction fields logged whenever an authored tutorial action appears. */
export function tutorialActionLogDetails(action: TutorialAction) {
  if (action.action === "animate-dreamcaller-portrait") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      owner: action.owner,
      portraitPauseSeconds: action.pause,
      portraitTravelSeconds: action.duration,
    };
  }
  if (action.action === "display-speech-bubble") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      speaker: action.speaker ?? "mira",
    };
  }
  if (action.action === "reveal-and-play-opponent-card") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: TUTORIAL_OPPONENT_CARD_ID,
      cardFace: "up",
      revealDurationSeconds: action.revealDuration,
      revealPlacement: "right-front-rank-intersection",
      sourceZone: "opponent-hand",
      destinationZone: "opponent-back-rank",
      destinationSlot: "center",
    };
  }
  return {
    actionId: action.id,
    action: action.action,
    waitSeconds: action.wait,
    cardFace: "down",
    sourceZone: "opponent-deck",
    destinationZone: "opponent-hand",
  };
}

function tutorialCardView(
  card: CardData,
  instanceId: string,
  layoutMotion: MobileBattleCardView["layoutMotion"],
  exhausted: boolean,
  showPlayableOutline: boolean,
): MobileBattleCardView {
  return {
    id: instanceId,
    model: { cardId: card.id, displaySnapshot: card },
    exhausted,
    figment: false,
    figmentTitleBar: false,
    layoutMotion,
    figmentCount: 0,
    storedTime: 0,
    showPlayableOutline,
  };
}

function tutorialDeckIds(owner: "enemy" | "player"): readonly string[] {
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
    owner,
    position: owner === "player" ? "near" : "far",
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
    heading: side === "player" ? "Player" : "Enemy",
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
  opponentCard: CardData | null = null,
  playerCard: CardData | null = null,
): TutorialView {
  const currentAction =
    playback?.currentActionIndex === null ||
    playback?.currentActionIndex === undefined
      ? null
      : (playback.actions[playback.currentActionIndex] ?? null);
  const dialogueAction = activeDialogueAction(playback);
  const completedActionCount =
    playback === null
      ? 0
      : (playback.currentActionIndex ?? playback.actions.length);
  const completedOpponentDraws =
    playback?.actions
      .slice(0, completedActionCount)
      .filter((action) => action.action === "draw-opponent-card").length ?? 0;
  const completedOpponentPlays =
    playback?.actions
      .slice(0, completedActionCount)
      .filter((action) => action.action === "reveal-and-play-opponent-card")
      .length ?? 0;
  const enemyDeckCardIds = tutorialDeckIds("enemy");
  const drawnEnemyCardIds = enemyDeckCardIds.slice(0, completedOpponentDraws);
  const enemyHandCardIds = drawnEnemyCardIds.slice(completedOpponentPlays);
  const enemyDeck = enemyDeckCardIds.slice(completedOpponentDraws);
  const tutorialCardInstanceId = drawnEnemyCardIds[0] ?? null;
  const tutorialCard =
    opponentCard !== null && tutorialCardInstanceId !== null
      ? tutorialCardView(
          opponentCard,
          tutorialCardInstanceId,
          "snap",
          true,
          false,
        )
      : null;
  const opponentCardPlayed = completedOpponentPlays > 0;
  const playerTurnStarted =
    playback !== null && playback.currentActionIndex === null;
  const playerDeckCardIds = tutorialDeckIds("player");
  const playerTurnCardInstanceId = playerDeckCardIds[0] ?? null;
  const playerTurnCard =
    playerTurnStarted &&
    playerCard !== null &&
    playerTurnCardInstanceId !== null
      ? tutorialCardView(
          playerCard,
          playerTurnCardInstanceId,
          "travel",
          false,
          true,
        )
      : null;
  const playerDeck = playerTurnStarted
    ? playerDeckCardIds.slice(1)
    : playerDeckCardIds;
  const enemyInspector = emptyInspectorSide("enemy");
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
  const enemy = emptySide("enemy");
  const enemyBackRank = enemy.backRank.map((slot, index) =>
    opponentCardPlayed && index === TUTORIAL_OPPONENT_BACK_RANK_INDEX
      ? { ...slot, card: tutorialCard }
      : slot,
  );
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
        : dialogueAction.speaker === "player" ||
            dialogueAction.speaker === "enemy"
          ? {
              kind: "dreamcaller",
              owner: dialogueAction.speaker,
              speakerName:
                dialogueAction.speaker === "player" ? "Tensho" : "Vrakmoth",
              text: dialogueAction.text,
            }
          : {
              kind: "guide",
              model: {
                portrait: { kind: "character-portrait", characterId: "mira" },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: dialogueAction.text,
              },
            },
    playbackRunId: playback?.runId ?? null,
    currentAction,
    battle: (() => {
      const emptyPlayer = emptySide("player");
      const player = {
        ...emptyPlayer,
        deckCardIds: playerDeck,
        status: {
          ...emptyPlayer.status,
          currentEnergy: playerTurnStarted ? TUTORIAL_PLAYER_TURN_ENERGY : 0,
          maxEnergy: playerTurnStarted ? TUTORIAL_PLAYER_TURN_ENERGY : 0,
        },
      };
      const playerHandCards = playerTurnCard === null ? [] : [playerTurnCard];
      const playerHandCardIds = playerHandCards.map((card) => card.id);
      const farHandCards = tutorialCard === null || opponentCardPlayed ? [] : [tutorialCard];
      return {
      battleId: TUTORIAL_BATTLE_ID,
      perspective: "player",
      aiApproval: null,
      cardPicker: null,
      choicePrompt: null,
      dreamwell: null,
      activeSide: playerTurnStarted ? "player" : "enemy",
      isOpeningTurn: !playerTurnStarted,
      phase: "day",
      enemyHandCardIds,
      enemyHand: farHandCards,
      enemy: {
        ...enemy,
        deckCardIds: enemyDeck,
        backRank: enemyBackRank,
      },
      player,
      playerHand: playerHandCards,
      near: player,
      far: { ...enemy, position: "far", deckCardIds: enemyDeck, backRank: enemyBackRank },
      nearHand: {
        owner: "player",
        position: "near",
        cardIds: playerHandCardIds,
        cards: playerHandCards,
      },
      farHand: { owner: "enemy", position: "far", cardIds: enemyHandCardIds, cards: farHandCards },
      promptNotice: null,
      inspector: {
        opponentName: "Awaiting Dreamcaller",
        perspective: "player",
        turn: playerTurnStarted ? "2" : "1",
        phase: "Day",
        activeSide: playerTurnStarted ? "Player" : "Enemy",
        result: "In progress",
        nextDreamwellOrder: "Complete",
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        isFarHandRevealed: false,
        isNearHandHidden: false,
        sides: {
          player: {
            ...emptyInspectorSide("player"),
            currentEnergy: player.status.currentEnergy,
            maxEnergy: player.status.maxEnergy,
            zones: {
              ...emptyInspectorSide("player").zones,
              hand: playerHandCardIds.length,
              deck: playerDeck.length,
            },
          },
          enemy: {
            ...enemyInspector,
            zones: {
              ...enemyInspector.zones,
              hand: enemyHandCardIds.length,
              deck: enemyDeck.length,
              backRank: opponentCardPlayed && tutorialCard !== null ? 1 : 0,
            },
          },
        },
        ai: null,
      },
      result: null,
    };
    })(),
  };
}
