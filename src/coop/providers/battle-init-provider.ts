// Real BattleInitProvider: turns quest state into a fresh battle fold slice on
// `BEGIN_BATTLE`. Battle construction is ALREADY fully seeded — `createBattleInit`
// derives all of its randomness from a `BattleRng` stream keyed by
// `deriveBattleSeed(quest.seed:battleEntryKey)`, and `createInitialBattleState`
// is pure — so it needs no `ctx.rng`: given the same quest seed and site, every
// client builds a byte-identical battle. The `battleEntryKey` is derived
// deterministically from `(siteId, completionLevel, dreamscapeId)` so it is
// identical across clients too.

import type { QuestContent } from "../../data/quest-content";
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
import { findSite } from "../../rules/quest/sites";
import type { BattleFoldState } from "../../rules/fold-state";
import { emptyDawnFired } from "../../rules/battle/fold";
import type {
  BattleInitProvider,
  TutorialBattleInitProvider,
} from "../../rules/battle/battle-events";
import type { QuestState } from "../../types/quest";

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
const TUTORIAL_AUTUMN_GLADE_ID = "02e8ea92-1218-413c-9f0b-4c865a3921d3";
const TUTORIAL_VOLTSURGE_ID = "7171ff89-ebe4-42d0-8863-9b4b0531cad2";
const TUTORIAL_PLAYER_DRAW_CARD_IDS = [
  "a28ad36d-fa74-4190-a463-7efd3a6233d0",
  "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
  "647f5150-b2e0-424b-9480-27557642524e",
  "5ab11bef-5dcd-49f5-be49-ae2ccde76e70",
  "944e15d2-d680-4ebe-8d18-36826f4b1535",
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
] as const;
const TUTORIAL_ENEMY_DRAW_CARD_IDS = [
  "944e15d2-d680-4ebe-8d18-36826f4b1535",
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
  "647f5150-b2e0-424b-9480-27557642524e",
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
  "5ab11bef-5dcd-49f5-be49-ae2ccde76e70",
] as const;
const TUTORIAL_ENEMY_ERODE_CARD_ID =
  "4408b942-09a0-4f4e-a403-10c708c6e3c5";
const TUTORIAL_DREAMWELL_CARD_IDS = [
  TUTORIAL_AUTUMN_GLADE_ID,
  TUTORIAL_VOLTSURGE_ID,
  "03e4e701-4720-4278-8198-9b7e0514d4cf",
  "5ec17498-9028-4a01-80a0-67c91b03d505",
  "de98477c-e216-4618-bff1-0e24bd982fdb",
  "662b7393-751c-4aa9-8150-5f20b4d176a4",
  "51caf26d-83bf-45a9-bc80-010d353277db",
  "120ec4c2-aa7b-48f4-be9f-f39820e565ca",
  "eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a",
  "a57f1276-3fb6-4527-b538-953fbace35cf",
  "a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf",
] as const;
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
 * Build the immutable battle preview from folded quest state and loaded
 * content. Battle construction is keyed by the quest seed and battle entry,
 * so this is byte-identical to the init `BEGIN_BATTLE` will fold without
 * creating any game state outside the reducer.
 */
export function createBattlePreview(
  content: QuestContent,
  quest: QuestState,
  siteId: string,
  seedOverride: number | null = null,
): BattleInit | null {
  return buildBattleInit(content, quest, siteId, seedOverride, () => {});
}

function buildBattleInit(
  content: QuestContent,
  quest: QuestState,
  siteId: string,
  seedOverride: number | null,
  deferOpponentLog: (emit: () => void) => void,
): BattleInit | null {
  const site = findSite(quest, siteId);
  if (site === null || site.type !== "Battle") return null;

  const battleEntryKey = battleEntryKeyFor(
    quest.currentDreamscape,
    siteId,
    quest.completionLevel,
  );
  return createBattleInit({
    battleEntryKey,
    battleInstanceId: `battle:${quest.runId ?? "unscoped"}:${battleEntryKey}`,
    seedOverride,
    site,
    state: quest,
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
  content: QuestContent,
): BattleInitProvider {
  return {
    beginBattle: ({ quest, siteId, seedOverride, seq }): BattleFoldState | null => {
      const init = buildBattleInit(
        content,
        quest,
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
 * Builds the authored post-tutorial snapshot without needing a quest Battle
 * site. All identity comes from UUIDs and both remaining decks use streams
 * keyed by the room seed, tutorial run, side, and restart number.
 */
export function createTutorialBattleInitProvider(
  content: QuestContent,
): TutorialBattleInitProvider {
  return {
    beginTutorialBattle: ({
      quest,
      tutorialRunId,
      driverClientId,
      restartNumber,
    }) => {
      const key = `tutorial:${quest.seed}:${tutorialRunId}:${String(restartNumber)}`;
      const battleId = `tutorial-battle:${tutorialRunId}:${String(restartNumber)}:${driverClientId}`;
      const init = createTutorialBattleInit(content, quest, key, battleId);
      const board = createInitialBattleState(init);
      arrangeTutorialHandoff(content, board);
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

function createTutorialBattleInit(
  content: QuestContent,
  quest: QuestState,
  key: string,
  battleId: string,
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
    completionLevelAtStart: quest.completionLevel,
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
    questDeckEntries: [],
    playerDeckOrder: makeDeck("player"),
    dreamwellDeck: tutorialDreamwellDeck(content, key),
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
    atlasSnapshot: quest.atlas,
  };
}

function arrangeTutorialHandoff(content: QuestContent, board: BattleMutableState): void {
  const playerStarter = takeCard(board, "player", "e83014d3-9d35-4e80-a1b3-9b25360ad2af");
  const player510 = takeCard(board, "player", "5a980eff-6ec7-44d8-9977-b98e66bbc2c8");
  const player516 = takeCard(board, "player", "4408b942-09a0-4f4e-a403-10c708c6e3c5");
  const player517 = takeCard(board, "player", "2162742c-09d0-4e62-ae49-0f8f79b45adc");
  const enemyStarter = takeCard(board, "enemy", "a28ad36d-fa74-4190-a463-7efd3a6233d0");
  const enemy514 = takeCard(board, "enemy", "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481");
  const twilight = createBaseBattleDeckCardDefinition(cardById(content, TUTORIAL_TWILIGHT_ID));
  const enemyTwilightHand = allocateBattleCardInstance(board, {
    definition: { ...twilight, sourceDeckEntryId: "tutorial:enemy:twilight:hand" },
    owner: "enemy",
    controller: "enemy",
    provenance: tutorialProvenance(),
  });
  const enemyTwilightVoid = allocateBattleCardInstance(board, {
    definition: { ...twilight, sourceDeckEntryId: "tutorial:enemy:twilight:void" },
    owner: "enemy",
    controller: "enemy",
    provenance: tutorialProvenance(),
  });
  stackTutorialDeck(board, "player", TUTORIAL_PLAYER_DRAW_CARD_IDS);
  // The first scheduled enemy Dreamwell effect erodes three cards before the
  // turn draw, so reserve three copies ahead of the visible draw sequence.
  stackTutorialDeck(board, "enemy", [
    TUTORIAL_ENEMY_ERODE_CARD_ID,
    TUTORIAL_ENEMY_ERODE_CARD_ID,
    TUTORIAL_ENEMY_ERODE_CARD_ID,
    ...TUTORIAL_ENEMY_DRAW_CARD_IDS,
  ]);

  board.activeSide = "player";
  board.turnNumber = 4;
  board.phase = "dawn";
  board.dreamwellDeckIndex = 2;
  board.sides.player.currentEnergy = 5;
  board.sides.player.maxEnergy = 5;
  board.sides.player.score = 0;
  board.sides.player.hand = [player510, player516, player517];
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
  board.sides.enemy.hand = [enemy514, enemyTwilightHand];
  board.sides.enemy.void = [enemyTwilightVoid];
  board.sides.enemy.frontRank = { F0: null, F1: null, F2: null, F3: null, F4: null, F5: null, F6: null, F7: null, F8: null };
  board.sides.enemy.backRank = { B0: null, B1: null, B2: null, B3: null, B4: null, B5: enemyStarter, B6: null, B7: null, B8: null, B9: null };
  board.sides.enemy.dreamwellCardIndex = 0;
  board.sides.enemy.dreamwellDrawnTurn = 2;
}

function takeCard(
  board: BattleMutableState,
  side: BattleSide,
  cardId: string,
): string {
  const deck = board.sides[side].deck;
  const index = deck.findIndex(
    (battleCardId) => board.cardInstances[battleCardId]?.definition.cardId === cardId,
  );
  if (index < 0) throw new Error(`Tutorial handoff card ${cardId} is absent.`);
  return deck.splice(index, 1)[0];
}

function stackTutorialDeck(
  board: BattleMutableState,
  side: BattleSide,
  cardIds: readonly string[],
): void {
  const orderedCards = cardIds.map((cardId) => takeCard(board, side, cardId));
  board.sides[side].deck = [...orderedCards, ...board.sides[side].deck];
}

function tutorialDreamwellDeck(
  content: QuestContent,
  key: string,
): readonly DreamwellCardDefinition[] {
  const byId = new Map(content.dreamwellCards.map((card) => [card.id, card]));
  const fixed = TUTORIAL_DREAMWELL_CARD_IDS.map((cardId) => {
    const card = byId.get(cardId);
    if (card === undefined) {
      throw new Error(`Tutorial Dreamwell card ${cardId} is missing from the runtime catalog.`);
    }
    return card;
  });
  const fixedIds = new Set<string>(TUTORIAL_DREAMWELL_CARD_IDS);
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

function cardById(content: QuestContent, cardId: string) {
  const card = [...content.cardDatabase.values()].find((candidate) => candidate.id === cardId);
  if (card === undefined) throw new Error(`Tutorial card ${cardId} is missing from the runtime catalog.`);
  return card;
}

function dreamAvatarById(content: QuestContent, id: string) {
  const dreamAvatar = content.dreamAvatars.find((candidate) => candidate.id === id);
  if (dreamAvatar === undefined) throw new Error(`Tutorial DreamAvatar ${id} is missing from the runtime catalog.`);
  return dreamAvatar;
}

function tutorialEnemyDescriptor(threxan: QuestContent["dreamAvatars"][number]): BattleEnemyDescriptor {
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
    kind: "quest-deck" as const,
    sourceBattleCardId: null,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: null,
    createdAtSide: null,
    createdAtMs: null,
  };
}
