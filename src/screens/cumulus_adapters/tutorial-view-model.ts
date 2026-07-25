import type {
  MobileBattleCardView,
  MobileBattleInspectorSideView,
  MobileBattleSideView,
  MobileBattleSlotView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { TutorialView } from "../../cumulus/screens/TutorialScreen";
import type { CardData } from "../../types/cards";
import type { DreamwellCard } from "../../data/dreamwell-database";
import { asCardId } from "../../types/card-identity";
import { TUTORIAL_OPPONENT_CARD_ID } from "../../data/tutorial-opponent-card";
import type {
  TutorialAction,
  TutorialDreamcallerOwner,
  TutorialPlaybackState,
  TutorialSpeechBubble,
} from "../../types/tutorial";
import { tutorialInstructionPlainText } from "../../data/tutorial-instruction-markup";

const TUTORIAL_BATTLE_ID = "tutorial-battle";
const TUTORIAL_DECK_SIZE = 30;
const TUTORIAL_DREAMCALLER_ID = "BFC40414-5264-41BF-86E1-A0F41EE4F5B5";
const TUTORIAL_OPPONENT_DREAMCALLER_ID = "B99936CA-97F9-4930-AF5A-FA9EF92557EF";
const TUTORIAL_PLAYER_BACK_RANK_INDEX = 0;
const TUTORIAL_PLAYER_FRONT_RANK_INDEX = 0;
const TUTORIAL_STARTING_ENERGY = 4;
const AUTUMN_GLADE_CARD_ID = "02e8ea92-1218-413c-9f0b-4c865a3921d3";
const AUTUMN_GLADE_SCORE_GAIN = 2;
export {
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_INSTANCE_ID,
  TUTORIAL_PLAYER_CARD_ID,
} from "../../data/tutorial-opponent-card";

function tutorialSpeechBubbleLogDetails(speechBubble: TutorialSpeechBubble) {
  const messageText = tutorialInstructionPlainText(speechBubble.text);
  return {
    speaker: speechBubble.speaker,
    durationSeconds: speechBubble.duration,
    verticalOffsetPx: speechBubble.verticalOffset,
    bubbleWidthPx: speechBubble.bubbleWidth,
    messageText,
    ...(messageText === speechBubble.text
      ? {}
      : { messageMarkup: speechBubble.text }),
  };
}

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
      speechBubble: tutorialSpeechBubbleLogDetails(action.speechBubble),
    };
  }
  if (action.action === "display-how-to-play") {
    const messageText = tutorialInstructionPlainText(action.text);
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      trigger: action.trigger ?? "player-turn-announcement-complete",
      ...(action.companion === undefined
        ? {}
        : { companion: action.companion }),
      ...(action.companion === "dreamwell-card"
        ? {
            presentationSequence: [
              "dreamwell-emergence",
              "instruction",
            ] as const,
            dreamwellEmergenceDurationSeconds: 1,
          }
        : {}),
      ...(action.cardWidth === undefined
        ? {}
        : { cardWidthPx: action.cardWidth }),
      title: "How to Play",
      messageText,
      ...(messageText === action.text ? {} : { messageMarkup: action.text }),
    };
  }
  if (action.action === "draw-dreamwell-card") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      cardFace: "up",
      owner: action.owner,
      sourceZone: "dreamwell",
      destinationPhase: "dawn",
      ...(action.cardId === AUTUMN_GLADE_CARD_ID
        ? {
            effect: {
              side: action.owner,
              stat: "points",
              amount: AUTUMN_GLADE_SCORE_GAIN,
              timing: "after-dreamwell-instructions",
            },
          }
        : {}),
    };
  }
  if (action.action === "reveal-and-play-opponent-card") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      cardFace: "up",
      revealDurationSeconds: action.revealDuration,
      ...(action.speechBubble === undefined
        ? {}
        : {
            speechBubble: tutorialSpeechBubbleLogDetails(action.speechBubble),
          }),
      revealPlacement: "right-front-rank-intersection",
      sourceZone: "opponent-hand",
      destinationZone: "opponent-back-rank",
      destinationSlot: "center",
    };
  }
  if (action.action === "reposition-opponent-character") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      sourceZone: "opponent-back-rank",
      destinationZone: "opponent-front-rank",
      destinationSlot: "closest",
    };
  }
  if (action.action === "reposition-player-character") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      opposingCardId: action.opposingCardId,
      sourceZone: "player-back-rank",
      destinationZone: "player-front-rank",
      destinationSlot: "across-from-opponent",
    };
  }
  if (action.action === "resolve-challenge") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      challengerCardId: action.challengerCardId,
      defenderCardId: action.defenderCardId,
      sourceZone: "front-rank",
      loserDestinationZone: "controller-void",
      resolution: "compare-spark",
    };
  }
  if (action.action === "end-turn") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      ...(action.speechBubble === undefined
        ? {}
        : {
            speechBubble: tutorialSpeechBubbleLogDetails(action.speechBubble),
          }),
      sourceSide: "player",
      destinationSide: "enemy",
      destinationPhase: "dawn",
    };
  }
  return {
    actionId: action.id,
    action: action.action,
    waitSeconds: action.wait,
    cardId: action.cardId,
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

function tutorialCardById(
  cards: readonly CardData[] | null,
  cardId: string,
  actionId: string,
): CardData | null {
  if (cards === null) return null;
  const card = cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) {
    throw new Error(
      `Tutorial action ${actionId} references card ${cardId}, which is missing from the tutorial card catalog.`,
    );
  }
  return card;
}

function tutorialDeckIds(owner: "enemy" | "player"): readonly string[] {
  return Array.from(
    { length: TUTORIAL_DECK_SIZE },
    (_unused, index) => `tutorial-${owner}-deck-${String(index + 1)}`,
  );
}

function tutorialDreamwellModel(card: DreamwellCard) {
  const cardId = asCardId(card.id);
  return {
    cardId,
    displaySnapshot: {
      id: cardId,
      name: card.name,
      renderedText: card.renderedText,
      energyAdded: card.energyAdded,
      imageNumber: card.imageNumber ?? 0,
      ...(card.art === undefined ? {} : { art: card.art }),
    },
  };
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

function activeDialogue(
  playback: TutorialPlaybackState | null,
): {
  readonly actionId: string;
  readonly parentAction: TutorialAction["action"];
  readonly speechBubble: TutorialSpeechBubble;
} | null {
  if (playback?.currentActionIndex === null || playback === null) return null;
  const currentAction = playback.actions[playback.currentActionIndex];
  if (currentAction?.action === "display-speech-bubble") {
    return {
      actionId: currentAction.id,
      parentAction: currentAction.action,
      speechBubble: currentAction.speechBubble,
    };
  }
  if (
    currentAction?.action === "end-turn" &&
    currentAction.speechBubble !== undefined &&
    playback.playerCardPlay != null
  ) {
    return {
      actionId: currentAction.id,
      parentAction: currentAction.action,
      speechBubble: currentAction.speechBubble,
    };
  }
  if (
    currentAction?.action === "reveal-and-play-opponent-card" &&
    currentAction.speechBubble !== undefined
  ) {
    return {
      actionId: currentAction.id,
      parentAction: currentAction.action,
      speechBubble: currentAction.speechBubble,
    };
  }
  return null;
}

/** Build the quest-independent opening state for the tutorial battle. */
export function buildTutorialView(
  playback: TutorialPlaybackState | null = null,
  opponentCardsInput: readonly CardData[] | CardData | null = null,
  playerCard: CardData | null = null,
  dreamwellCards: readonly DreamwellCard[] | null = null,
): TutorialView {
  const opponentCards =
    opponentCardsInput === null
      ? null
      : Array.isArray(opponentCardsInput)
        ? opponentCardsInput
        : [opponentCardsInput as CardData];
  const currentAction =
    playback?.currentActionIndex === null ||
    playback?.currentActionIndex === undefined
      ? null
      : (playback.actions[playback.currentActionIndex] ?? null);
  const dialogue = activeDialogue(playback);
  const completedActionCount =
    playback === null
      ? 0
      : (playback.currentActionIndex ?? playback.actions.length);
  const dreamwellExplanationCompleted =
    playback?.actions
      .slice(0, completedActionCount)
      .some(
        (action) =>
          action.action === "display-how-to-play" &&
          action.companion === "dreamwell-card",
      ) ?? false;
  const visibleActionCount =
    playback === null
      ? 0
      : playback.currentActionIndex === null
        ? playback.actions.length
        : playback.currentActionIndex + 1;
  const revealedDreamwellAction = playback?.actions
    .slice(0, visibleActionCount)
    .reverse()
    .find((action) => action.action === "draw-dreamwell-card");
  const revealedDreamwellCard =
    revealedDreamwellAction?.action === "draw-dreamwell-card"
      ? dreamwellCards?.find(
          (card) => card.id === revealedDreamwellAction.cardId,
        ) ?? null
      : null;
  if (
    revealedDreamwellAction?.action === "draw-dreamwell-card" &&
    dreamwellCards !== null &&
    revealedDreamwellCard === null
  ) {
    throw new Error(
      `Tutorial Dreamwell card ${revealedDreamwellAction.cardId} is missing from the Dreamwell catalog.`,
    );
  }
  const enemyDeckCardIds = tutorialDeckIds("enemy");
  type OpponentCardRecord = {
    readonly card: CardData;
    readonly view: MobileBattleCardView;
    readonly playOrder: number | null;
    readonly playedAtActionIndex: number | null;
  };
  const opponentHandRecords: OpponentCardRecord[] = [];
  const opponentPlayedRecords: OpponentCardRecord[] = [];
  let completedOpponentDrawCount = 0;
  const completedActions =
    playback?.actions.slice(0, completedActionCount) ?? [];
  for (const [actionIndex, action] of completedActions.entries()) {
    if (action.action === "draw-opponent-card") {
      const instanceId = enemyDeckCardIds[completedOpponentDrawCount];
      const card = tutorialCardById(opponentCards, action.cardId, action.id);
      completedOpponentDrawCount += 1;
      if (instanceId !== undefined && card !== null) {
        opponentHandRecords.push({
          card,
          view: tutorialCardView(card, instanceId, "snap", true, false),
          playOrder: null,
          playedAtActionIndex: null,
        });
      }
      continue;
    }
    if (action.action === "reveal-and-play-opponent-card") {
      const handIndex = opponentHandRecords.findIndex(
        (record) => record.card.id === action.cardId,
      );
      if (opponentCards !== null && handIndex < 0) {
        throw new Error(
          `Tutorial action ${action.id} cannot reveal card ${action.cardId} because it is not in the opponent hand.`,
        );
      }
      if (handIndex >= 0) {
        const [record] = opponentHandRecords.splice(handIndex, 1);
        if (record !== undefined) {
          opponentPlayedRecords.push({
            ...record,
            view: { ...record.view, layoutMotion: "travel" },
            playOrder: opponentPlayedRecords.length,
            playedAtActionIndex: actionIndex,
          });
        }
      }
    }
  }
  const enemyHandCardIds = opponentHandRecords.map((record) => record.view.id);
  const opponentCardToReveal =
    currentAction?.action === "reveal-and-play-opponent-card"
      ? opponentHandRecords.find(
          (record) => record.card.id === currentAction.cardId,
        )?.view ?? null
      : null;
  const enemyDeck = enemyDeckCardIds.slice(completedOpponentDrawCount);
  const visibleOpponentRepositionActions = playback?.actions
    .slice(0, visibleActionCount)
    .filter((action) => action.action === "reposition-opponent-character") ?? [];
  const repositionedOpponentCardIds = new Set(
    visibleOpponentRepositionActions.map((action) => action.cardId),
  );
  for (const action of visibleOpponentRepositionActions) {
    if (
      opponentCards !== null &&
      !opponentPlayedRecords.some((record) => record.card.id === action.cardId)
    ) {
      throw new Error(
        `Tutorial opponent character ${action.cardId} is not in play for action ${action.id}.`,
      );
    }
  }
  const primaryOpponentRecord =
    opponentPlayedRecords.find(
      (record) => record.card.id === TUTORIAL_OPPONENT_CARD_ID,
    ) ?? null;
  const primaryOpponentCard = primaryOpponentRecord?.card ?? null;
  const tutorialCard = primaryOpponentRecord?.view ?? null;
  const opponentCardRepositioned =
    primaryOpponentCard !== null &&
    repositionedOpponentCardIds.has(primaryOpponentCard.id);
  const howToPlayActionIndex =
    playback?.actions.findIndex(
      (action) => action.action === "display-how-to-play",
    ) ?? -1;
  const endTurnActionIndex =
    playback?.actions.findIndex((action) => action.action === "end-turn") ?? -1;
  const endTurnCompleted =
    endTurnActionIndex >= 0 && completedActionCount > endTurnActionIndex;
  const opponentRepositionActionIndex =
    playback?.actions.findIndex(
      (action) => action.action === "reposition-opponent-character",
    ) ?? -1;
  const duskStarted =
    opponentRepositionActionIndex >= 0 &&
    completedActionCount > opponentRepositionActionIndex;
  const playerTurnStarted =
    playback !== null &&
    (playback.currentActionIndex === null ||
      (howToPlayActionIndex >= 0 &&
        playback.currentActionIndex >= howToPlayActionIndex));
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
  const playerCardPlayed =
    playerTurnCard !== null &&
    playback?.playerCardPlay?.cardInstanceId === playerTurnCard.id &&
    playback.playerCardPlay.cardId === playerTurnCard.model.cardId;
  const playerRepositionActionIndex =
    playback?.actions.findIndex(
      (action) => action.action === "reposition-player-character",
    ) ?? -1;
  const playerCardRepositioned =
    playerRepositionActionIndex >= 0 &&
    completedActionCount > playerRepositionActionIndex;
  const playerRepositionAction =
    currentAction?.action === "reposition-player-character"
      ? currentAction
      : null;
  if (
    playerRepositionAction !== null &&
    playerCard !== null &&
    playerRepositionAction.cardId !== playerCard.id
  ) {
    throw new Error(
      `Tutorial player character ${playerRepositionAction.cardId} does not match the loaded tutorial card ${playerCard.id}.`,
    );
  }
  if (
    playerRepositionAction !== null &&
    opponentCards !== null &&
    !opponentPlayedRecords.some(
      (record) => record.card.id === playerRepositionAction.opposingCardId,
    )
  ) {
    throw new Error(
      `Tutorial opposing character ${playerRepositionAction.opposingCardId} is not in play.`,
    );
  }
  const challengeActionIndex =
    playback?.actions.findIndex(
      (action) => action.action === "resolve-challenge",
    ) ?? -1;
  const challengeAction =
    challengeActionIndex < 0
      ? null
      : (playback?.actions[challengeActionIndex] ?? null);
  const challengeOpponentCard =
    challengeAction?.action === "resolve-challenge"
      ? tutorialCardById(
          opponentCards,
          challengeAction.challengerCardId,
          challengeAction.id,
        )
      : null;
  const challengeChallengerCardId =
    challengeAction?.action === "resolve-challenge"
      ? challengeAction.challengerCardId
      : null;
  if (
    challengeAction?.action === "resolve-challenge" &&
    playerCard !== null &&
    challengeAction.defenderCardId !== playerCard.id
  ) {
    throw new Error(
      `Tutorial defender ${challengeAction.defenderCardId} does not match the loaded tutorial player card ${playerCard.id}.`,
    );
  }
  const challengerSpark = challengeOpponentCard?.spark ?? null;
  const defenderSpark = playerCard?.spark ?? null;
  if (
    challengeAction?.action === "resolve-challenge" &&
    challengerSpark !== null &&
    defenderSpark !== null &&
    challengerSpark === defenderSpark
  ) {
    throw new Error(
      `Tutorial challenge ${challengeAction.id} requires unequal printed spark.`,
    );
  }
  const challengeLoserOwner =
    challengerSpark === null || defenderSpark === null
      ? null
      : challengerSpark < defenderSpark
        ? "enemy"
        : "player";
  const challengeResolved =
    challengeActionIndex >= 0 &&
    completedActionCount > challengeActionIndex &&
    challengeLoserOwner !== null;
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
  const enemyDreamwellDrawn =
    revealedDreamwellAction?.action === "draw-dreamwell-card" &&
    revealedDreamwellAction.owner === "enemy";
  const enemyDreamwellApplied =
    enemyDreamwellDrawn && dreamwellExplanationCompleted;
  const dreamwellScoreGain =
    dreamwellExplanationCompleted &&
    revealedDreamwellCard?.id === AUTUMN_GLADE_CARD_ID
      ? AUTUMN_GLADE_SCORE_GAIN
      : 0;
  const enemyDreamwellScore =
    revealedDreamwellAction?.action === "draw-dreamwell-card" &&
    revealedDreamwellAction.owner === "enemy"
      ? dreamwellScoreGain
      : 0;
  const playerDreamwellScore =
    revealedDreamwellAction?.action === "draw-dreamwell-card" &&
    revealedDreamwellAction.owner === "player"
      ? dreamwellScoreGain
      : 0;
  const enemyDreamwellEnergy = enemyDreamwellApplied
    ? (revealedDreamwellCard?.energyAdded ?? 0)
    : 0;
  const playerDreamwellEnergy =
    revealedDreamwellAction?.action === "draw-dreamwell-card" &&
    revealedDreamwellAction.owner === "player"
      ? (revealedDreamwellCard?.energyAdded ?? 0)
      : 0;
  const enemyMaxEnergy = TUTORIAL_STARTING_ENERGY + enemyDreamwellEnergy;
  const dreamwellExplanationActionIndex =
    playback?.actions.findIndex(
      (action) =>
        action.action === "display-how-to-play" &&
        action.companion === "dreamwell-card",
    ) ?? -1;
  const spentEnemyEnergy = opponentPlayedRecords
    .filter(
      (record) =>
        !enemyDreamwellApplied ||
        (record.playedAtActionIndex ?? -1) > dreamwellExplanationActionIndex,
    )
    .reduce(
      (total, record) => total + (record.card.energyCost ?? 0),
      0,
    );
  const enemyCurrentEnergy = Math.max(
    0,
    (enemyDreamwellApplied ? enemyMaxEnergy : TUTORIAL_STARTING_ENERGY) -
      spentEnemyEnergy,
  );
  const enemy = {
    ...emptySide("enemy"),
    voidCards:
      challengeResolved &&
      challengeLoserOwner === "enemy" &&
      tutorialCard !== null
        ? [{ ...tutorialCard, layoutMotion: "snap" as const }]
        : [],
    status: {
      ...emptySide("enemy").status,
      currentEnergy: enemyCurrentEnergy,
      maxEnergy: enemyMaxEnergy,
      points: enemyDreamwellScore,
    },
  };
  const enemyBackRank = enemy.backRank.map((slot, index) => {
    const record = opponentPlayedRecords.find(
      (candidate) =>
        candidate.playOrder === index &&
        !repositionedOpponentCardIds.has(candidate.card.id),
    );
    return record === undefined
      ? slot
      : {
          ...slot,
          card: { ...record.view, exhausted: !playerTurnStarted },
        };
  });
  const enemyFrontRank = enemy.frontRank.map((slot, index) => {
    const record = opponentPlayedRecords.filter((candidate) =>
      repositionedOpponentCardIds.has(candidate.card.id),
    )[index];
    const dissolved =
      record?.card.id === challengeChallengerCardId &&
      challengeResolved &&
      challengeLoserOwner === "enemy";
    return record === undefined || dissolved
      ? slot
      : {
          ...slot,
          card: { ...record.view, exhausted: false },
        };
  });
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
          imageNumber: "0025",
          name: "Threxan",
          title: "the Resounding Wrath",
          portraitFocus: { x: 0.5, y: 0.2 },
        },
        profile: {
          id: TUTORIAL_OPPONENT_DREAMCALLER_ID,
          ability: "Dreamcaller ability is not active",
          unavailable: true,
        },
        settled: dreamcallerSettled("enemy"),
      },
    },
    opponentCardToReveal,
    dialogue:
      dialogue === null
        ? null
        : dialogue.speechBubble.speaker === "player" ||
            dialogue.speechBubble.speaker === "enemy"
          ? {
              actionId: dialogue.actionId,
              parentAction: dialogue.parentAction,
              kind: "dreamcaller",
              owner: dialogue.speechBubble.speaker,
              duration: dialogue.speechBubble.duration,
              verticalOffset: dialogue.speechBubble.verticalOffset,
              bubbleWidth: dialogue.speechBubble.bubbleWidth,
              speakerName:
                dialogue.speechBubble.speaker === "player"
                  ? "Tensho"
                  : "Threxan",
              text: dialogue.speechBubble.text,
            }
          : {
              actionId: dialogue.actionId,
              parentAction: dialogue.parentAction,
              kind: "guide",
              duration: dialogue.speechBubble.duration,
              verticalOffset: dialogue.speechBubble.verticalOffset,
              bubbleWidth: dialogue.speechBubble.bubbleWidth,
              model: {
                portrait: { kind: "character-portrait", characterId: "mira" },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: dialogue.speechBubble.text,
              },
            },
    playbackRunId: playback?.runId ?? null,
    currentAction,
    howToPlay:
      currentAction?.action !== "display-how-to-play"
        ? null
        : {
            actionId: currentAction.id,
            text: currentAction.text,
            wait: currentAction.wait,
            trigger:
              currentAction.trigger ?? "player-turn-announcement-complete",
            ...(currentAction.cardWidth === undefined
              ? {}
              : { cardWidth: currentAction.cardWidth }),
            ...(currentAction.companion === "dreamwell-card"
              ? {
                  companion:
                    revealedDreamwellCard === null
                      ? null
                      : tutorialDreamwellModel(revealedDreamwellCard),
                }
              : {}),
          },
    endTurn:
      currentAction?.action !== "end-turn" || playerTurnCard === null
        ? null
        : {
            actionId: currentAction.id,
            triggerCardId: playerTurnCard.model.cardId,
            ready: playerCardPlayed,
          },
    playerReposition:
      playerRepositionAction === null ||
      playerTurnCard === null ||
      tutorialCard === null ||
      !playerCardPlayed ||
      !opponentCardRepositioned
        ? null
        : {
            actionId: playerRepositionAction.id,
            cardInstanceId: playerTurnCard.id,
            cardId: playerRepositionAction.cardId,
            opposingCardId: playerRepositionAction.opposingCardId,
          },
    challenge:
      currentAction?.action !== "resolve-challenge" ||
      tutorialCard === null ||
      playerTurnCard === null ||
      challengerSpark === null ||
      defenderSpark === null ||
      challengeLoserOwner === null
        ? null
        : {
            actionId: currentAction.id,
            challenger: {
              owner: "enemy",
              card: { ...tutorialCard, exhausted: false },
              spark: challengerSpark,
            },
            defender: {
              owner: "player",
              card: { ...playerTurnCard, exhausted: false },
              spark: defenderSpark,
            },
            winnerOwner: challengeLoserOwner === "enemy" ? "player" : "enemy",
            loserOwner: challengeLoserOwner,
          },
    battle: (() => {
      const emptyPlayer = emptySide("player");
      const playerTurnEnergy =
        TUTORIAL_STARTING_ENERGY + playerDreamwellEnergy;
      const player = {
        ...emptyPlayer,
        deckCardIds: playerDeck,
        voidCards:
          challengeResolved &&
          challengeLoserOwner === "player" &&
          playerTurnCard !== null
            ? [{ ...playerTurnCard, layoutMotion: "snap" as const }]
            : [],
        backRank: emptyPlayer.backRank.map((slot, index) =>
          playerCardPlayed &&
          !playerCardRepositioned &&
          playerTurnCard !== null &&
          index === TUTORIAL_PLAYER_BACK_RANK_INDEX
            ? {
                ...slot,
                card: {
                  ...playerTurnCard,
                  exhausted: !endTurnCompleted,
                  showPlayableOutline: false,
                },
              }
            : slot,
        ),
        frontRank: emptyPlayer.frontRank.map((slot, index) =>
          playerCardPlayed &&
          playerCardRepositioned &&
          !(challengeResolved && challengeLoserOwner === "player") &&
          playerTurnCard !== null &&
          index === TUTORIAL_PLAYER_FRONT_RANK_INDEX
            ? {
                ...slot,
                card: {
                  ...playerTurnCard,
                  exhausted: false,
                  showPlayableOutline: false,
                },
              }
            : slot,
        ),
        status: {
          ...emptyPlayer.status,
          currentEnergy: Math.max(
            0,
            playerTurnEnergy -
              (playerCardPlayed ? (playerCard?.energyCost ?? 0) : 0),
          ),
          maxEnergy: playerTurnEnergy,
          points: playerDreamwellScore,
        },
      };
      const playerHandCards =
        playerTurnCard === null || playerCardPlayed ? [] : [playerTurnCard];
      const playerHandCardIds = playerHandCards.map((card) => card.id);
      const phase =
        challengeActionIndex >= 0 &&
        completedActionCount >= challengeActionIndex
          ? "challenge"
          : endTurnCompleted && !dreamwellExplanationCompleted
          ? "dawn"
          : duskStarted
            ? "dusk"
            : "day";
      return {
      battleId: TUTORIAL_BATTLE_ID,
      perspective: "player",
      aiApproval: null,
      cardPicker: null,
      choicePrompt: null,
      dreamwell:
        !dreamwellExplanationCompleted &&
        revealedDreamwellAction?.action === "draw-dreamwell-card" &&
        revealedDreamwellCard !== null
          ? {
              side: revealedDreamwellAction.owner,
              model: tutorialDreamwellModel(revealedDreamwellCard),
            }
          : null,
      activeSide: endTurnCompleted
        ? "enemy"
        : playerTurnStarted
          ? "player"
          : "enemy",
      isOpeningTurn: !playerTurnStarted,
      phase,
      enemyHandCardIds,
      enemyHand: [],
      enemy: {
        ...enemy,
        deckCardIds: enemyDeck,
        backRank: enemyBackRank,
        frontRank: enemyFrontRank,
      },
      player,
      playerHand: playerHandCards,
      near: player,
      far: {
        ...enemy,
        position: "far",
        deckCardIds: enemyDeck,
        backRank: enemyBackRank,
        frontRank: enemyFrontRank,
      },
      nearHand: {
        owner: "player",
        position: "near",
        cardIds: playerHandCardIds,
        cards: playerHandCards,
      },
      farHand: {
        owner: "enemy",
        position: "far",
        cardIds: enemyHandCardIds,
        cards: [],
      },
      promptNotice: null,
      inspector: {
        opponentName: "Awaiting Dreamcaller",
        perspective: "player",
        turn: playerTurnStarted ? "2" : "1",
        phase:
          phase === "challenge"
            ? "Challenge"
            : phase === "dawn"
              ? "Dawn"
              : phase === "dusk"
                ? "Dusk"
                : "Day",
        activeSide: endTurnCompleted
          ? "Enemy"
          : playerTurnStarted
            ? "Player"
            : "Enemy",
        result: "In progress",
        nextDreamwellOrder: "Complete",
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        isFarHandRevealed: false,
        isNearHandHidden: false,
        sides: {
          player: {
            ...emptyInspectorSide("player"),
            points: playerDreamwellScore,
            currentEnergy: player.status.currentEnergy,
            maxEnergy: player.status.maxEnergy,
            zones: {
              ...emptyInspectorSide("player").zones,
              hand: playerHandCardIds.length,
              deck: playerDeck.length,
              backRank: playerCardPlayed && !playerCardRepositioned ? 1 : 0,
              frontRank:
                playerCardRepositioned &&
                !(challengeResolved && challengeLoserOwner === "player")
                  ? 1
                  : 0,
              void:
                challengeResolved && challengeLoserOwner === "player" ? 1 : 0,
            },
          },
          enemy: {
            ...enemyInspector,
            points: enemyDreamwellScore,
            currentEnergy: enemy.status.currentEnergy,
            maxEnergy: enemy.status.maxEnergy,
            zones: {
              ...enemyInspector.zones,
              hand: enemyHandCardIds.length,
              deck: enemyDeck.length,
              backRank: enemyBackRank.filter((slot) => slot.card !== null)
                .length,
              frontRank: enemyFrontRank.filter((slot) => slot.card !== null)
                .length,
              void:
                challengeResolved && challengeLoserOwner === "enemy" ? 1 : 0,
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
