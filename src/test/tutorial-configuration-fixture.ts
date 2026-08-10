import type {
  TutorialBattleConfiguration,
  TutorialConfiguration,
  TutorialFeaturedCards,
  TutorialSpeechBubble,
} from "../types/tutorial";

export const TEST_TUTORIAL_FEATURED_CARDS: TutorialFeaturedCards = {
  playerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
  opponentCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
  enemyStarterCardId: "a28ad36d-fa74-4190-a463-7efd3a6233d0",
  loadingEventCardId: "944e15d2-d680-4ebe-8d18-36826f4b1535",
  dreamwellCardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
};

export const TEST_TUTORIAL_PLAYER_AVATAR_ID =
  "bfc40414-5264-41bf-86e1-a0f41ee4f5b5";
export const TEST_TUTORIAL_ENEMY_AVATAR_ID =
  "b99936ca-97f9-4930-af5a-fa9ef92557ef";

export function makeTutorialBattleConfiguration(
  overrides: Partial<TutorialBattleConfiguration> = {},
): TutorialBattleConfiguration {
  return {
    featuredCards: TEST_TUTORIAL_FEATURED_CARDS,
    playerDreamAvatarId: TEST_TUTORIAL_PLAYER_AVATAR_ID,
    enemyDreamAvatarId: TEST_TUTORIAL_ENEMY_AVATAR_ID,
    startingEnergy: 4,
    scoreToWin: 10,
    starterDeck: [
      { cardId: TEST_TUTORIAL_FEATURED_CARDS.playerCardId, copies: 10 },
      { cardId: TEST_TUTORIAL_FEATURED_CARDS.enemyStarterCardId, copies: 10 },
      { cardId: TEST_TUTORIAL_FEATURED_CARDS.loadingEventCardId, copies: 10 },
    ],
    handoff: {
      activeSide: "player",
      turnNumber: 4,
      phase: "dawn",
      dreamwellDeckIndex: 2,
      player: {
        currentEnergy: 5,
        maxEnergy: 5,
        score: 0,
        dreamwellCardIndex: 1,
        dreamwellDrawnTurn: 3,
      },
      enemy: {
        currentEnergy: 0,
        maxEnergy: 5,
        score: 2,
        dreamwellCardIndex: 0,
        dreamwellDrawnTurn: 2,
      },
      placements: [
        {
          cardRole: "player",
          side: "player",
          source: "deck",
          zone: "frontRank",
          slotId: "F4",
        },
        {
          cardRole: "enemyStarter",
          side: "enemy",
          source: "deck",
          zone: "backRank",
          slotId: "B5",
        },
        {
          cardRole: "opponent",
          side: "enemy",
          source: "created",
          zone: "void",
        },
      ],
    },
    playerDraws: [],
    enemyDraws: [],
    dreamwellDraws: [
      TEST_TUTORIAL_FEATURED_CARDS.dreamwellCardId,
      "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
    ],
    aiActionOverrides: [],
    ...overrides,
  };
}

const SPEECH_BUBBLE: TutorialSpeechBubble = {
  speaker: "mira",
  horizontalOffset: 0,
  verticalOffset: 0,
  bubbleWidth: 700,
  text: "Fixture guidance.",
};

export function makeTutorialConfiguration(
  battle: TutorialBattleConfiguration = makeTutorialBattleConfiguration(),
): TutorialConfiguration {
  return {
    contentHash: "0".repeat(64),
    foldHash: "1".repeat(64),
    journeyStart: { speechBubble: SPEECH_BUBBLE },
    dreamscape: { speechBubble: SPEECH_BUBBLE },
    atlas: { speechBubble: SPEECH_BUBBLE },
    draft: { speechBubble: SPEECH_BUBBLE },
    purge: { speechBubble: SPEECH_BUBBLE },
    dreamsignRevelation: { speechBubble: SPEECH_BUBBLE },
    battleStart: {
      firstBattle: { speechBubble: SPEECH_BUBBLE },
      secondBattle: { speechBubble: SPEECH_BUBBLE },
    },
    actions: [],
    triggers: [],
    battle,
  };
}
