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
  BattlefieldSlotId,
  DreamwellCardDefinition,
} from "../../battle/types";
import { rankSlotIds } from "../../battle/types";
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
import { resolveBattleAiConfiguration } from "../../types/opponents-data";
import { tutorialCardConstantId } from "../../data/tutorial-actions";
import { parseJourneyId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import type { BattleId } from "../../types/identifiers";
import type {
  BattleCardId,
  DreamAvatarId,
  DreamwellCardId,
} from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import { parseSiteId } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseBattleCardId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseOpponentId } from "../../types/identifiers";

const deferredOpponentLogs = new Map<number, () => void>();

/**
 * A battle at `(siteId, completionLevel, dreamscapeId)` always has the same
 * stable identity, so the derived battle seed is identical on every client.
 */
function battleEntryKeyFor(
  dreamscapeId: AtlasNodeId | null,
  siteId: SiteId,
  completionLevel: number,
): string {
  return `${siteId}::${String(completionLevel)}::${dreamscapeId ?? parseAtlasNodeId("none")}`;
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
  siteId: SiteId,
  seedOverride: number | null = null,
): BattleInit | null {
  return buildBattleInit(content, journey, siteId, seedOverride, () => {});
}

function buildBattleInit(
  content: JourneyContent,
  journey: JourneyState,
  siteId: SiteId,
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
    opponentsData: content.opponentsData,
    transfigurationData: content.transfigurationData,
    battleEntryKey: parseBattleEntryKey(battleEntryKey),
    battleInstanceId: parseBattleId(
      `battle:${journey.runId ?? parseJourneyId("unscoped")}:${battleEntryKey}`,
    ),
    seedOverride,
    site,
    state: journey,
    cardDatabase: content.cardDatabase,
    dreamAvatars: content.dreamAvatars,
    dreamscapes: content.dreamscapes,
    affiliations: content.affiliations,
    dreamwellCards: content.dreamwellCards,
    dreamsignTemplates: content.dreamsignTemplates,
    tides4Decks: content.poolContext?.poolData.tides4Decks,
    tides4Tuning: content.poolContext?.tides4Tuning,
    economyData: content.economyData,
    deferOpponentLog,
    tutorialTriggers: content.tutorial?.triggers,
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
    beginBattle: ({
      journey,
      siteId,
      seedOverride,
      seq,
    }): BattleFoldState | null => {
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
        {
          ...(journey.dreamscapeModifiers.length === 0
            ? {}
            : { dreamscapeModifiers: journey.dreamscapeModifiers }),
          draftPickCount: content.draftData.offers.picksPerSite,
        },
        {
          dreamscapes: content.dreamscapes,
          atlasData: content.atlasData,
          sitesData: content.sitesData,
          gambleData: content.gambleData,
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
        parseBattleId(battleId),
        battleConfiguration,
      );
      const board = createInitialBattleState(init);
      arrangeTutorialHandoff(content, board, actions, battleConfiguration);
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
  battleId: BattleId,
  battleConfiguration: TutorialBattleConfiguration,
): BattleInit {
  const makeDeck = (side: BattleSide): BattleDeckCardDefinition[] => {
    const definitions = battleConfiguration.starterDeck.flatMap(
      ({ cardId, copies }) =>
        Array.from({ length: copies }, (_unused, copy) => {
          const card = cardById(content, cardId);
          return {
            ...createBaseBattleDeckCardDefinition(card),
            sourceDeckEntryId: parseDeckEntryId(
              `tutorial:${side}:${cardId}:${String(copy)}`,
            ),
          };
        }),
    );
    return createBattleRng(
      deriveBattleSeed(parseBattleEntryKey(`${key}:${side}`)),
      "playerDeckOrder",
    ).shuffle(definitions);
  };
  const playerDreamAvatar = dreamAvatarById(
    content,
    battleConfiguration.playerDreamAvatarId,
  );
  const enemyDreamAvatar = dreamAvatarById(
    content,
    battleConfiguration.enemyDreamAvatarId,
  );
  return {
    battleId,
    battleEntryKey: parseBattleEntryKey(key),
    seed: deriveBattleSeed(parseBattleEntryKey(key)),
    siteId: parseSiteId("tutorial-handoff"),
    dreamscapeId: null,
    completionLevelAtStart: journey.completionLevel,
    isFinalBoss: false,
    essenceReward: 0,
    openingHandSize: 0,
    scoreToWin: battleConfiguration.scoreToWin,
    // The tutorial mode metadata is authoritative for disabled turn-limit
    // behavior. This numeric value keeps the shared engine's current contract.
    turnLimit: Number.MAX_SAFE_INTEGER,
    maxEnergyCap: 10,
    handLimit: content.opponentsData.battle.handLimit,
    opponentsContentHash: content.opponentsData.contentHash,
    opponentAbilityActive: false,
    aiConfiguration: resolveBattleAiConfiguration(
      content.opponentsData,
      "tutorial",
    ),
    startingSide: "player",
    playerDrawSkipsTurnOne: false,
    tutorialTriggers: content.tutorial?.triggers ?? [],
    journeyDeckEntries: [],
    playerDeckOrder: makeDeck("player"),
    dreamwellDeck: tutorialDreamwellDeck(
      content,
      key,
      battleConfiguration.dreamwellDraws,
    ),
    enemyDescriptor: tutorialEnemyDescriptor(enemyDreamAvatar),
    enemyDeckDefinition: makeDeck("enemy"),
    dreamAvatarSummary: {
      id: playerDreamAvatar.id,
      name: playerDreamAvatar.name,
      title: playerDreamAvatar.title,
      renderedText: playerDreamAvatar.renderedText,
      imageNumber: playerDreamAvatar.imageNumber,
      ...(playerDreamAvatar.portraitFocus
        ? { portraitFocus: playerDreamAvatar.portraitFocus }
        : {}),
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
  const placementCards = battleConfiguration.handoff.placements.map(
    (placement, index) => {
      const cardId = tutorialCardConstantId(
        battleConfiguration.tutorialCardConstants,
        placement.cardRole,
      );
      if (placement.source === "deck") {
        return {
          placement,
          instanceId: takeCard(board, placement.side, cardId),
        };
      }
      const definition = createBaseBattleDeckCardDefinition(
        cardById(content, cardId),
      );
      return {
        placement,
        instanceId: allocateBattleCardInstance(board, {
          definition: {
            ...definition,
            sourceDeckEntryId: parseDeckEntryId(
              `tutorial:${placement.side}:handoff:${String(index)}:${cardId}`,
            ),
          },
          owner: placement.side,
          controller: placement.side,
          provenance: tutorialProvenance(),
        }),
      };
    },
  );
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
  stackTutorialDeck(board, "player", battleConfiguration.forcedPlayerDraws);
  stackTutorialEnemyDeck(board, battleConfiguration.forcedEnemyDraws);

  board.activeSide = battleConfiguration.handoff.activeSide;
  board.turnNumber = battleConfiguration.handoff.turnNumber;
  board.phase = battleConfiguration.handoff.phase;
  board.dreamwellDeckIndex = battleConfiguration.handoff.dreamwellDeckIndex;
  applyTutorialHandoffSide(board, "player", battleConfiguration.handoff.player);
  board.sides.player.hand = playerHand.map(parseBattleCardId);
  applyTutorialHandoffSide(board, "enemy", battleConfiguration.handoff.enemy);
  board.sides.enemy.hand = enemyHand.map(parseBattleCardId);
  for (const side of ["player", "enemy"] as const) {
    board.sides[side].void = [];
    clearRank(board.sides[side].frontRank);
    clearRank(board.sides[side].backRank);
  }
  for (const { placement, instanceId } of placementCards) {
    if (placement.zone === "void") {
      board.sides[placement.side].void.push(instanceId);
      continue;
    }
    if (placement.zone === "frontRank") {
      board.sides[placement.side].frontRank[placement.slotId] = instanceId;
    } else {
      board.sides[placement.side].backRank[placement.slotId] = instanceId;
    }
  }
}

function applyTutorialHandoffSide(
  board: BattleMutableState,
  side: BattleSide,
  configuration: TutorialBattleConfiguration["handoff"][BattleSide],
): void {
  board.sides[side].currentEnergy = configuration.currentEnergy;
  board.sides[side].maxEnergy = configuration.maxEnergy;
  board.sides[side].score = configuration.score;
  board.sides[side].dreamwellCardIndex = configuration.dreamwellCardIndex;
  board.sides[side].dreamwellDrawnTurn = configuration.dreamwellDrawnTurn;
}

function clearRank<SlotId extends BattlefieldSlotId>(
  rank: Record<SlotId, BattleCardId | null>,
): void {
  for (const slotId of rankSlotIds(rank)) rank[slotId] = null;
}

function deriveTutorialHandCardIds(
  actions: readonly TutorialAction[],
): Readonly<Record<BattleSide, readonly CardId[]>> {
  const hands: Record<BattleSide, CardId[]> = { player: [], enemy: [] };
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
  cardIds: readonly CardId[],
): BattleCardId[] {
  return cardIds.map((cardId, index) => {
    const fromDeck = takeCardIfPresent(board, side, cardId);
    if (fromDeck !== null) return fromDeck;
    const definition = createBaseBattleDeckCardDefinition(
      cardById(content, cardId),
    );
    return allocateBattleCardInstance(board, {
      definition: {
        ...definition,
        sourceDeckEntryId: parseDeckEntryId(
          `tutorial:${side}:authored-hand:${String(index)}:${cardId}`,
        ),
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
  cardId: CardId,
): BattleCardId {
  const card = takeCardIfPresent(board, side, cardId);
  if (card === null) {
    throw new Error(`Tutorial handoff card ${cardId} is absent.`);
  }
  return card;
}

function takeCardIfPresent(
  board: BattleMutableState,
  side: BattleSide,
  cardId: CardId,
): BattleCardId | null {
  const deck = board.sides[side].deck;
  const index = deck.findIndex(
    (battleCardId) =>
      board.cardInstances[battleCardId]?.definition.cardId === cardId,
  );
  if (index < 0) return null;
  return deck.splice(index, 1)[0] ?? null;
}

function stackTutorialDeck(
  board: BattleMutableState,
  side: BattleSide,
  cardIds: readonly CardId[],
): void {
  const orderedCards = cardIds.map((cardId) => takeCard(board, side, cardId));
  board.sides[side].deck = [...orderedCards, ...board.sides[side].deck];
}

function stackTutorialEnemyDeck(
  board: BattleMutableState,
  cardIds: readonly CardId[],
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
  cardIds: readonly DreamwellCardId[],
): readonly DreamwellCardDefinition[] {
  const byId = new Map(content.dreamwellCards.map((card) => [card.id, card]));
  const fixed = cardIds.map((cardId) => {
    const card = byId.get(cardId);
    if (card === undefined) {
      throw new Error(
        `Tutorial Dreamwell card ${cardId} is missing from the runtime catalog.`,
      );
    }
    return card;
  });
  const fixedIds = new Set<DreamwellCardId>(cardIds);
  const rest = [...content.dreamwellCards].filter(
    (card) => !fixedIds.has(card.id),
  );
  const shuffled = createBattleRng(
    deriveBattleSeed(parseBattleEntryKey(`${key}:dreamwell`)),
    "dreamwellDeck",
  ).shuffle(rest);
  return [...fixed, ...shuffled].map((card) => ({
    id: card.id,
    name: card.name,
    renderedText: card.renderedText,
    energyAdded: card.energyAdded,
    order: card.order,
    cardNumber: card.cardNumber,
    imageNumber: card.imageNumber ?? card.cardNumber,
    automation: [...(card.automation ?? [])],
    ...(card.art ? { art: card.art } : {}),
  }));
}

function requireTutorialBattleConfiguration(
  content: JourneyContent,
): TutorialBattleConfiguration {
  if (content.tutorial === undefined) {
    throw new Error(
      "Tutorial battle configuration is missing from tutorial data.",
    );
  }
  return content.tutorial.battle;
}

function cardById(content: JourneyContent, cardId: CardId) {
  const card = [...content.cardDatabase.values()].find(
    (candidate) => candidate.id === cardId,
  );
  if (card === undefined)
    throw new Error(
      `Tutorial card ${cardId} is missing from the runtime catalog.`,
    );
  return card;
}

function dreamAvatarById(content: JourneyContent, id: DreamAvatarId) {
  const dreamAvatar = content.dreamAvatars.find(
    (candidate) => candidate.id === id,
  );
  if (dreamAvatar === undefined)
    throw new Error(
      `Tutorial DreamAvatar ${id} is missing from the runtime catalog.`,
    );
  return dreamAvatar;
}

function tutorialEnemyDescriptor(
  threxan: JourneyContent["dreamAvatars"][number],
): BattleEnemyDescriptor {
  return {
    id: parseOpponentId(`tutorial:${threxan.id}`),
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
