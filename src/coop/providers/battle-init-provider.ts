// Real BattleInitProvider: turns journey state into a fresh battle fold slice on
// `BEGIN_BATTLE`. Battle construction is ALREADY fully seeded — `createBattleInit`
// derives all of its randomness from a `BattleRng` stream keyed by
// `deriveBattleSeed(journey.seed:battleEntryKey)`, and `createInitialBattleState`
// is pure — so it needs no `ctx.rng`: given the same journey seed and site, every
// client builds a byte-identical battle. The `battleEntryKey` is derived
// deterministically from `(siteId, completionLevel, dreamscapeId)` so it is
// identical across clients too.

import type { JourneyContent } from "../../data/journey-content";
import { createBattleInit } from "../../battle/integration/create-battle-init";
import {
  allocateBattleCardInstance,
  createInitialBattleState,
} from "../../battle/state/create-initial-state";
import { createBaseBattleDeckCardDefinition } from "../../battle/card-definition";
import { createBattleRng, deriveBattleSeed } from "../../battle/random";
import type {
  BattleDeckCardDefinition,
  BattleEnemyDescriptor,
  BattleInit,
  BattleMutableState,
  BattleSide,
  DreamwellCardDefinition,
} from "../../battle/types";
import { findSite } from "../../rules/journey/sites";
import type { BattleFoldState } from "../../rules/fold-state";
import { emptyDawnFired } from "../../rules/battle/fold";
import type {
  BattleCompletionProvider,
  BattleInitProvider,
  TutorialBattleInitProvider,
} from "../../rules/battle/battle-events";
import type { JourneyState } from "../../types/journey";
import type {
  TutorialAction,
  TutorialBattleConfiguration,
} from "../../types/tutorial";
import { advanceAtlas } from "../../atlas/atlas-generator";

const deferredOpponentLogs = new Map<number, () => void>();

const TUTORIAL_STARTER_CARD_IDS = [
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8", // #510
  "647f5150-b2e0-424b-9480-27557642524e", // #511
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af", // #512
  "a28ad36d-fa74-4190-a463-7efd3a6233d0", // #513
  "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481", // #514
  "5ab11bef-5dcd-49f5-be49-ae2ccde76e70", // #515
  "4408b942-09a0-4f4e-a403-10c708c6e3c5", // #516
  "2162742c-09d0-4e62-ae49-0f8f79b45adc", // #517
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba", // #518
  "944e15d2-d680-4ebe-8d18-36826f4b1535", // #519
] as const;

const TUTORIAL_TWILIGHT_ID = "229ab3a1-3720-41a2-924c-8fe112188f8e";
const TENSHO_ID = "BFC40414-5264-41BF-86E1-A0F41EE4F5B5";
const THREXAN_ID = "B99936CA-97F9-4930-AF5A-FA9EF92557EF";

/**
 * A battle at `(siteId, completionLevel, dreamscapeId)` always has the same
 * stable identity, so the derived battle seed is identical on every client.
 */
function battleEntryKeyFor(
  dreamscapeId: string | null,
  siteId: string,
  completionLevel: number,
): string {
  return `${siteId}::${String(completionLevel)}::${dreamscapeId ?? "none"}`;
}

/**
 * Build the immutable battle preview from folded journey state and loaded
 * content. Battle construction is keyed by the journey seed and battle entry,
 * so this is byte-identical to the init `BEGIN_BATTLE` will fold without
 * creating any game state outside the reducer.
 */
export function createBattlePreview(
  content: JourneyContent,
  journey: JourneyState,
  siteId: string,
  seedOverride: number | null = null,
): BattleInit | null {
  return buildBattleInit(content, journey, siteId, seedOverride, () => {});
}

function buildBattleInit(
  content: JourneyContent,
  journey: JourneyState,
  siteId: string,
  seedOverride: number | null,
  deferOpponentLog: (emit: () => void) => void,
): BattleInit | null {
  const site = findSite(journey, siteId);
  if (site === null || site.type !== "Battle") return null;

  const battleEntryKey = battleEntryKeyFor(
    journey.currentDreamscape,
    siteId,
    journey.completionLevel,
  );
  return createBattleInit({
    battleEntryKey,
    battleInstanceId: `battle:${journey.runId ?? "unscoped"}:${battleEntryKey}`,
    seedOverride,
    site,
    state: journey,
    cardDatabase: content.cardDatabase,
    dreamAvatars: content.dreamAvatars,
    dreamscapes: content.dreamscapes,
    affiliations: content.affiliations,
    dreamwellCards: content.dreamwellCards,
    dreamsignTemplates: content.dreamsignTemplates,
    poolContext: content.poolContext,
    knownGoodDecklists: content.knownGoodDecklists,
    dreamsignSignatures: content.dreamsignSignatures,
    fitModel: content.fitModel,
    draftRecords: content.draftRecords,
    deferOpponentLog,
    tutorialTriggers: content.tutorialTriggers,
  });
}

/**
 * Settle the reconstruction log captured while folding one BEGIN_BATTLE. Every
 * client consumes its local callback, while only the appending client emits it
 * after the event is confirmed as applied.
 */
export function settleDeferredOpponentLog(
  seq: number,
  shouldEmit: boolean,
): boolean {
  const emit = deferredOpponentLogs.get(seq);
  if (emit === undefined) return false;
  deferredOpponentLogs.delete(seq);
  if (shouldEmit) emit();
  return true;
}

export function createBattleInitProvider(
  content: JourneyContent,
): BattleInitProvider {
  return {
    beginBattle: ({ journey, siteId, seedOverride, seq }): BattleFoldState | null => {
      const init = buildBattleInit(
        content,
        journey,
        siteId,
        seedOverride,
        (emit) => deferredOpponentLogs.set(seq, emit),
      );
      if (init === null) return null;
      const board = createInitialBattleState(init);
      return {
        init,
        board,
        effectQueue: [],
        pendingPrompt: null,
        dawnFired: emptyDawnFired(),
      };
    },
  };
}

/**
 * Advance the live Atlas from authoritative folded journey/battle state.
 * Content is pinned by the room build and every random draw comes from the
 * `END_BATTLE` event stream.
 */
export function createBattleCompletionProvider(
  content: JourneyContent,
): BattleCompletionProvider {
  return {
    advanceAtlas: ({ journey, battle, completionLevel, rng }) => {
      const dreamscapeId = battle.init.dreamscapeId;
      if (dreamscapeId === null) return null;
      let drawIndex = 0;
      return advanceAtlas(
        journey.atlas,
        dreamscapeId,
        completionLevel,
        journey.dreamscapeModifiers.length === 0
          ? {}
          : { dreamscapeModifiers: journey.dreamscapeModifiers },
        {
          dreamscapes: content.dreamscapes,
          atlasConfig: content.atlasConfig,
          dreamsignPoolIds: journey.remainingDreamsignPool,
          apollyonIncarnations: content.apollyonIncarnations,
        },
        {
          logEvents: false,
          rng: () => rng(drawIndex++),
        },
      );
    },
  };
}

/**
 * Builds the authored post-tutorial snapshot without needing a journey Battle
 * site. All identity comes from UUIDs and both remaining decks use streams
 * keyed by the room seed, tutorial run, side, and restart number.
 */
export function createTutorialBattleInitProvider(
  content: JourneyContent,
): TutorialBattleInitProvider {
  return {
    beginTutorialBattle: ({
      journey,
      actions,
      tutorialRunId,
      restartNumber,
    }) => {
      const key = `tutorial:${journey.seed}:${tutorialRunId}:${String(restartNumber)}`;
      const battleId = `tutorial-battle:${tutorialRunId}:${String(restartNumber)}`;
      const battleConfiguration = requireTutorialBattleConfiguration(content);
      const init = createTutorialBattleInit(
        content,
        journey,
        key,
        battleId,
        battleConfiguration,
      );
      const board = createInitialBattleState(init);
      arrangeTutorialHandoff(
        content,
        board,
        actions,
        battleConfiguration,
      );
      return {
        init,
        board,
        effectQueue: [],
        pendingPrompt: null,
        dawnFired: emptyDawnFired(),
        tutorialAiActionOverrides: battleConfiguration.aiActionOverrides,
        consumedTutorialAiActionOverrideIds: [],
      };
    },
  };
}

function createTutorialBattleInit(
  content: JourneyContent,
  journey: JourneyState,
  key: string,
  battleId: string,
  battleConfiguration: TutorialBattleConfiguration,
): BattleInit {
  const makeDeck = (side: BattleSide): BattleDeckCardDefinition[] => {
    const definitions = TUTORIAL_STARTER_CARD_IDS.flatMap((cardId) =>
      Array.from({ length: 3 }, (_unused, copy) => {
        const card = cardById(content, cardId);
        return {
          ...createBaseBattleDeckCardDefinition(card),
          sourceDeckEntryId: `tutorial:${side}:${cardId}:${String(copy)}`,
        };
      }),
    );
    return createBattleRng(deriveBattleSeed(`${key}:${side}`), "playerDeckOrder")
      .shuffle(definitions);
  };
  const tensho = dreamAvatarById(content, TENSHO_ID);
  const threxan = dreamAvatarById(content, THREXAN_ID);
  return {
    battleId,
    battleEntryKey: key,
    seed: deriveBattleSeed(key),
    siteId: "tutorial-handoff",
    dreamscapeId: null,
    completionLevelAtStart: journey.completionLevel,
    isFinalBoss: false,
    essenceReward: 0,
    openingHandSize: 0,
    scoreToWin: 10,
    // The tutorial mode metadata is authoritative for disabled turn-limit
    // behavior. This numeric value keeps the shared engine's current contract.
    turnLimit: Number.MAX_SAFE_INTEGER,
    maxEnergyCap: 10,
    startingSide: "player",
    playerDrawSkipsTurnOne: false,
    tutorialTriggers: content.tutorialTriggers ?? [],
    journeyDeckEntries: [],
    playerDeckOrder: makeDeck("player"),
    dreamwellDeck: tutorialDreamwellDeck(
      content,
      key,
      battleConfiguration.dreamwellDraws,
    ),
    enemyDescriptor: tutorialEnemyDescriptor(threxan),
    enemyDeckDefinition: makeDeck("enemy"),
    dreamAvatarSummary: {
      id: tensho.id,
      name: tensho.name,
      title: tensho.title,
      renderedText: tensho.renderedText,
      imageNumber: tensho.imageNumber,
      ...(tensho.portraitFocus ? { portraitFocus: tensho.portraitFocus } : {}),
    },
    dreamsignSummaries: [],
    atlasSnapshot: journey.atlas,
  };
}

function arrangeTutorialHandoff(
  content: JourneyContent,
  board: BattleMutableState,
  actions: readonly TutorialAction[],
  battleConfiguration: TutorialBattleConfiguration,
): void {
  const playerStarter = takeCard(board, "player", "e83014d3-9d35-4e80-a1b3-9b25360ad2af");
  const enemyStarter = takeCard(board, "enemy", "a28ad36d-fa74-4190-a463-7efd3a6233d0");
  const authoredHands = deriveTutorialHandCardIds(actions);
  const playerHand = materializeAuthoredHand(
    content,
    board,
    "player",
    authoredHands.player,
  );
  const enemyHand = materializeAuthoredHand(
    content,
    board,
    "enemy",
    authoredHands.enemy,
  );
  const twilight = createBaseBattleDeckCardDefinition(cardById(content, TUTORIAL_TWILIGHT_ID));
  const enemyTwilightVoid = allocateBattleCardInstance(board, {
    definition: { ...twilight, sourceDeckEntryId: "tutorial:enemy:twilight:void" },
    owner: "enemy",
    controller: "enemy",
    provenance: tutorialProvenance(),
  });
  stackTutorialDeck(board, "player", battleConfiguration.playerDraws);
  stackTutorialEnemyDeck(board, battleConfiguration.enemyDraws);

  board.activeSide = "player";
  board.turnNumber = 4;
  board.phase = "dawn";
  board.dreamwellDeckIndex = 2;
  board.sides.player.currentEnergy = 5;
  board.sides.player.maxEnergy = 5;
  board.sides.player.score = 0;
  board.sides.player.hand = playerHand;
  // The authored tutorial's compact 2/3 formation is centered in the visual
  // 9/10 formation. Preserve those rendered lanes when its cards enter the
  // rules-engine board: F0 is the authored center front cell and B1 is the
  // authored right-center back cell.
  board.sides.player.frontRank = { F0: null, F1: null, F2: null, F3: null, F4: playerStarter, F5: null, F6: null, F7: null, F8: null };
  board.sides.player.backRank = { B0: null, B1: null, B2: null, B3: null, B4: null };
  board.sides.player.dreamwellCardIndex = 1;
  board.sides.player.dreamwellDrawnTurn = 3;

  board.sides.enemy.currentEnergy = 0;
  board.sides.enemy.maxEnergy = 5;
  board.sides.enemy.score = 2;
  board.sides.enemy.hand = enemyHand;
  board.sides.enemy.void = [enemyTwilightVoid];
  board.sides.enemy.frontRank = { F0: null, F1: null, F2: null, F3: null, F4: null, F5: null, F6: null, F7: null, F8: null };
  board.sides.enemy.backRank = { B0: null, B1: null, B2: null, B3: null, B4: null, B5: enemyStarter, B6: null, B7: null, B8: null, B9: null };
  board.sides.enemy.dreamwellCardIndex = 0;
  board.sides.enemy.dreamwellDrawnTurn = 2;
}

function deriveTutorialHandCardIds(
  actions: readonly TutorialAction[],
): Readonly<Record<BattleSide, readonly string[]>> {
  const hands: Record<BattleSide, string[]> = { player: [], enemy: [] };
  for (const action of actions) {
    if (action.action === "draw-opponent-card") {
      hands.enemy.push(action.cardId);
      continue;
    }
    if (action.action === "draw-card") {
      hands[action.owner].push(action.cardId);
      continue;
    }
    if (action.action === "reveal-and-play-opponent-card") {
      const handIndex = hands.enemy.indexOf(action.cardId);
      if (handIndex < 0) {
        throw new Error(
          `Tutorial action ${action.id} plays ${action.cardId} before it is drawn.`,
        );
      }
      hands.enemy.splice(handIndex, 1);
    }
  }
  return hands;
}

function materializeAuthoredHand(
  content: JourneyContent,
  board: BattleMutableState,
  side: BattleSide,
  cardIds: readonly string[],
): string[] {
  return cardIds.map((cardId, index) => {
    const fromDeck = takeCardIfPresent(board, side, cardId);
    if (fromDeck !== null) return fromDeck;
    const definition = createBaseBattleDeckCardDefinition(
      cardById(content, cardId),
    );
    return allocateBattleCardInstance(board, {
      definition: {
        ...definition,
        sourceDeckEntryId:
          `tutorial:${side}:authored-hand:${String(index)}:${cardId}`,
      },
      owner: side,
      controller: side,
      provenance: tutorialProvenance(),
    });
  });
}

function takeCard(
  board: BattleMutableState,
  side: BattleSide,
  cardId: string,
): string {
  const card = takeCardIfPresent(board, side, cardId);
  if (card === null) {
    throw new Error(`Tutorial handoff card ${cardId} is absent.`);
  }
  return card;
}

function takeCardIfPresent(
  board: BattleMutableState,
  side: BattleSide,
  cardId: string,
): string | null {
  const deck = board.sides[side].deck;
  const index = deck.findIndex(
    (battleCardId) => board.cardInstances[battleCardId]?.definition.cardId === cardId,
  );
  if (index < 0) return null;
  return deck.splice(index, 1)[0] ?? null;
}

function stackTutorialDeck(
  board: BattleMutableState,
  side: BattleSide,
  cardIds: readonly string[],
): void {
  const orderedCards = cardIds.map((cardId) => takeCard(board, side, cardId));
  board.sides[side].deck = [...orderedCards, ...board.sides[side].deck];
}

function stackTutorialEnemyDeck(
  board: BattleMutableState,
  cardIds: readonly string[],
): void {
  const visibleDraws = cardIds.map((cardId) =>
    takeCard(board, "enemy", cardId),
  );
  const erodedCards = board.sides.enemy.deck.splice(0, 3);
  if (erodedCards.length !== 3) {
    throw new Error("Tutorial enemy deck cannot reserve three eroded cards.");
  }
  board.sides.enemy.deck = [
    ...erodedCards,
    ...visibleDraws,
    ...board.sides.enemy.deck,
  ];
}

function tutorialDreamwellDeck(
  content: JourneyContent,
  key: string,
  cardIds: readonly string[],
): readonly DreamwellCardDefinition[] {
  const byId = new Map(content.dreamwellCards.map((card) => [card.id, card]));
  const fixed = cardIds.map((cardId) => {
    const card = byId.get(cardId);
    if (card === undefined) {
      throw new Error(`Tutorial Dreamwell card ${cardId} is missing from the runtime catalog.`);
    }
    return card;
  });
  const fixedIds = new Set<string>(cardIds);
  const rest = [...content.dreamwellCards].filter(
    (card) => !fixedIds.has(card.id),
  );
  const shuffled = createBattleRng(deriveBattleSeed(`${key}:dreamwell`), "dreamwellDeck")
    .shuffle(rest);
  return [...fixed, ...shuffled].map((card) => ({
    id: card.id,
    name: card.name,
    renderedText: card.renderedText,
    energyAdded: card.energyAdded,
    order: card.order,
    cardNumber: card.cardNumber,
    imageNumber: card.imageNumber ?? card.cardNumber,
    ...(card.art ? { art: card.art } : {}),
  }));
}

function requireTutorialBattleConfiguration(
  content: JourneyContent,
): TutorialBattleConfiguration {
  if (content.tutorialBattle === undefined) {
    throw new Error(
      "Tutorial battle draw configuration is missing from tutorial data.",
    );
  }
  return content.tutorialBattle;
}

function cardById(content: JourneyContent, cardId: string) {
  const card = [...content.cardDatabase.values()].find((candidate) => candidate.id === cardId);
  if (card === undefined) throw new Error(`Tutorial card ${cardId} is missing from the runtime catalog.`);
  return card;
}

function dreamAvatarById(content: JourneyContent, id: string) {
  const dreamAvatar = content.dreamAvatars.find((candidate) => candidate.id === id);
  if (dreamAvatar === undefined) throw new Error(`Tutorial DreamAvatar ${id} is missing from the runtime catalog.`);
  return dreamAvatar;
}

function tutorialEnemyDescriptor(threxan: JourneyContent["dreamAvatars"][number]): BattleEnemyDescriptor {
  return {
    id: threxan.id,
    name: threxan.name,
    subtitle: threxan.title,
    imageNumber: threxan.imageNumber,
    portraitSeed: 0,
    // The tutorial presents both DreamAvatars; no DreamAvatar ability is
    // scheduled into the tutorial battle's automation.
    abilityText: threxan.renderedText,
    dreamsigns: [],
    signatureCards: [],
  };
}

function tutorialProvenance() {
  return {
    kind: "journey-deck" as const,
    sourceBattleCardId: null,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: null,
    createdAtSide: null,
    createdAtMs: null,
  };
}
