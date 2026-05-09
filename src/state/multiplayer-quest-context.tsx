import { useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Database } from "firebase/database";
import {
  createPlayableBattleCache,
  PlayableBattleCacheProvider,
  type PlayableBattleCache,
} from "../components/playable-battle-cache";
import { resetBattleCompletionBridge } from "../battle/integration/battle-completion-bridge";
import type { QuestContent } from "../data/quest-content";
import { resetLog } from "../logging";
import {
  runRoomTransaction,
  writeRoomUpdate,
} from "../multiplayer/room-service";
import {
  buildQuestFieldUpdate,
  metadataUpdatedAtPath,
  questStatePath,
  type FirebaseUpdateMap,
} from "../multiplayer/room-paths";
import type { MultiplayerRoom, RoomSession } from "../multiplayer/room-types";
import type { DreamcallerContent, PackageTideId } from "../types/content";
import type {
  CardSourceDebugState,
  CardChoiceTransfigurationOffer,
  DeckEntry,
  DreamAtlas,
  Dreamsign,
  DreamsignOfferSiteRuntime,
  EssenceSiteRuntime,
  CardChoiceSiteRuntime,
  DreamJourneySiteRuntime,
  QuestFailureSummary,
  QuestState,
  RewardSiteRuntime,
  RuntimeShopSlot,
  Screen,
  ShopSiteRuntime,
  SiteState,
  TemptingOfferSiteRuntime,
  TransfigurationType,
} from "../types/quest";
import type { DraftState } from "../types/draft";
import {
  applyCardSourceDebug,
  applyDraftState,
  applyDreamcallerSelection,
  applyRemainingDreamsignPool,
  createDefaultState,
  QuestContextProvider,
  type QuestMutations,
  type QuestContextValue,
} from "./quest-context";
import {
  changeQuestEssence,
  commitPreparedDraftCardPickInQuestState,
  completeQuestSite,
  prepareDraftCardPickInQuestState,
  setQuestScreen,
  startQuestFromDreamcaller,
  updateQuestAtlas,
} from "./quest-state-actions";
import { generateRewardSiteData } from "../rewards/reward-generator";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";
import {
  generateShopInventory,
  generateSpecialtyShopInventory,
  rerollCost,
  shopSlotsToRuntime,
} from "../shop/shop-generator";
import {
  assignTransfiguration,
  transfigurationEffectDetails,
} from "../transfiguration/transfiguration-logic";
import {
  DREAM_JOURNEYS,
  type JourneyEffect,
} from "../data/dream-journeys";
import {
  TEMPTING_OFFERS,
  type OfferEffect,
} from "../data/tempting-offers";
import { sampleRewardCards } from "../data/tide-weights";
import { createDreamsign } from "../data/dreamsigns";
import type { CardData } from "../types/cards";

const MAX_DREAMSIGNS = 12;

export interface MultiplayerQuestProviderProps {
  children: ReactNode;
  database: Database;
  session: RoomSession;
  questContent: QuestContent;
}

function writeUpdate(
  database: Database,
  updateMap: FirebaseUpdateMap,
): void {
  void writeRoomUpdate(database, updateMap).catch((error: unknown) => {
    console.error("Failed to write multiplayer quest update", error);
  });
}

function writeRoomTransaction({
  database,
  roomId,
  updater,
}: {
  database: Database;
  roomId: string;
  updater: (room: MultiplayerRoom | null) => MultiplayerRoom | null | undefined;
}): void {
  void runRoomTransaction(database, roomId, updater).catch((error: unknown) => {
    console.error("Failed to write multiplayer quest update", error);
  });
}

function writeQuestField<K extends keyof QuestState>({
  database,
  roomId,
  field,
  value,
}: {
  database: Database;
  roomId: string;
  field: K;
  value: QuestState[K];
}): void {
  writeUpdate(
    database,
    buildQuestFieldUpdate(roomId, field, value, new Date().toISOString()),
  );
}

function writeWholeQuestState({
  database,
  roomId,
  state,
}: {
  database: Database;
  roomId: string;
  state: QuestState;
}): void {
  const updatedAt = new Date().toISOString();
  writeUpdate(database, {
    [questStatePath(roomId)]: state,
    [metadataUpdatedAtPath(roomId)]: updatedAt,
  });
}

function writeScreenUpdate({
  database,
  roomId,
  state,
}: {
  database: Database;
  roomId: string;
  state: QuestState;
}): void {
  const updatedAt = new Date().toISOString();
  writeUpdate(database, {
    ...buildQuestFieldUpdate(roomId, "screen", state.screen, updatedAt),
    ...buildQuestFieldUpdate(
      roomId,
      "activeSiteId",
      state.activeSiteId,
      updatedAt,
    ),
  });
}

function unavailableMutation(name: string): never {
  throw new Error(
    `${name} is not available in multiplayer until its composed Firebase action is implemented`,
  );
}

function randomIntInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function runtimeSlotPrice(slot: {
  basePrice: number;
  discountPercent: number;
}): number {
  if (slot.discountPercent === 0) return slot.basePrice;
  return Math.round(slot.basePrice * (1 - slot.discountPercent / 100));
}

function nextDeckEntryId(deck: readonly DeckEntry[]): string {
  const highest = deck.reduce((max, entry) => {
    const match = /^deck-(\d+)$/.exec(entry.entryId);
    return match === null ? max : Math.max(max, Number(match[1]));
  }, 0);
  return `deck-${String(highest + 1)}`;
}

function dreamsignMatches(left: Dreamsign, right: Dreamsign): boolean {
  if (left.id !== undefined && right.id !== undefined) {
    return left.id === right.id;
  }
  return left.name === right.name;
}

function dreamsignDetailsEqual(left: Dreamsign, right: Dreamsign): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.effectDescription === right.effectDescription &&
    left.imageName === right.imageName &&
    left.imageAlt === right.imageAlt &&
    left.isBane === right.isBane
  );
}

function arraysEqual<T>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

function deckCardNumbersEqual(
  left: readonly DeckEntry[],
  rightCardNumbers: readonly number[],
): boolean {
  return arraysEqual(
    left.map((entry) => entry.cardNumber),
    rightCardNumbers,
  );
}

function runtimeShopSlotsEqual(
  left: readonly RuntimeShopSlot[],
  right: readonly RuntimeShopSlot[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runtimeShopSlotEqual(
  left: RuntimeShopSlot | undefined,
  right: RuntimeShopSlot | undefined,
): boolean {
  if (
    left === undefined ||
    right === undefined ||
    left.itemType !== right.itemType ||
    left.basePrice !== right.basePrice ||
    left.discountPercent !== right.discountPercent ||
    left.purchased !== right.purchased
  ) {
    return false;
  }

  if (left.itemType === "card" && right.itemType === "card") {
    return left.cardNumber === right.cardNumber;
  }

  if (left.itemType === "dreamsign" && right.itemType === "dreamsign") {
    return dreamsignMatches(left.dreamsign, right.dreamsign);
  }

  return left.itemType === "reroll" && right.itemType === "reroll";
}

function completeSiteAndReturnToDreamscape(
  state: QuestState,
  siteId: string,
): QuestState {
  return setQuestScreen(completeQuestSite(state, siteId), {
    type: "dreamscape",
  });
}

function findSite(state: QuestState, siteId: string): SiteState | null {
  for (const node of Object.values(state.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site !== undefined) {
      return site;
    }
  }
  return null;
}

function shuffled<T>(items: readonly T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function dreamJourneyOptionId(journey: (typeof DREAM_JOURNEYS)[number]): string {
  return journey.name;
}

function temptingOfferOptionId(index: number): string {
  return `offer-${String(index)}`;
}

function findDreamJourneyOption(optionId: string) {
  return DREAM_JOURNEYS.find((journey) => dreamJourneyOptionId(journey) === optionId);
}

function findTemptingOfferOption(optionId: string) {
  const match = /^offer-(\d+)$/.exec(optionId);
  return match === null ? undefined : TEMPTING_OFFERS[Number(match[1])];
}

function selectCardChoiceEntryIds({
  deck,
  cardDatabase,
  kind,
  isEnhanced,
}: {
  deck: readonly DeckEntry[];
  cardDatabase: Map<number, CardData>;
  kind: "transfiguration" | "duplication";
  isEnhanced: boolean;
}): string[] {
  const entryIds: string[] = [];
  const entries = isEnhanced ? [...deck] : shuffled(deck);
  const limit = isEnhanced ? Number.POSITIVE_INFINITY : 3;

  for (const entry of entries) {
    if (entryIds.length >= limit) {
      break;
    }
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }
    if (
      kind === "transfiguration" &&
      (entry.transfiguration !== null ||
        assignTransfiguration(card, entry.transfiguration) === null)
    ) {
      continue;
    }
    entryIds.push(entry.entryId);
  }
  return entryIds;
}

function duplicationCopyCount(siteId: string, entryId: string): number {
  let hash = 0;
  for (const char of `${siteId}:${entryId}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 4) + 1;
}

function effectDetailsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildCardChoiceRuntime({
  siteId: _siteId,
  deck,
  cardDatabase,
  kind,
  isEnhanced,
}: {
  siteId: string;
  deck: readonly DeckEntry[];
  cardDatabase: Map<number, CardData>;
  kind: "transfiguration" | "duplication";
  isEnhanced: boolean;
}): CardChoiceSiteRuntime {
  const entryIds = selectCardChoiceEntryIds({
    deck,
    cardDatabase,
    kind,
    isEnhanced,
  });

  if (kind === "duplication") {
    return {
      kind: "cardChoice",
      choiceKind: "duplication",
      entryIds,
      acceptedEntryIds: [],
    };
  }

  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const transfigurationOffers: CardChoiceTransfigurationOffer[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) {
      continue;
    }
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }
    const offer = assignTransfiguration(card, entry.transfiguration);
    if (offer === null) {
      continue;
    }
    transfigurationOffers.push({
      entryId,
      type: offer.type,
      effectDescription: offer.description,
      effectDetails: transfigurationEffectDetails(offer, card),
      previewCard: offer.previewCard,
    });
  }

  return {
    kind: "cardChoice",
    choiceKind: "transfiguration",
    entryIds,
    acceptedEntryIds: [],
    transfigurationOffers,
  };
}

function deckEntriesRuntimeCompatible(
  deck: readonly DeckEntry[],
  expected: readonly DeckEntry[],
): boolean {
  return (
    deck.length === expected.length &&
    deck.every((entry, index) => {
      const other = expected[index];
      return (
        other !== undefined &&
        entry.entryId === other.entryId &&
        entry.cardNumber === other.cardNumber &&
        entry.transfiguration === other.transfiguration &&
        entry.isBane === other.isBane
      );
    })
  );
}

function siteRuntimeAssumptionMatches(
  state: QuestState,
  siteId: string,
  expectedType: SiteState["type"] | null,
  expectedIsEnhanced: boolean,
): boolean {
  const site = findSite(state, siteId);
  return (
    site?.type === expectedType &&
    site.isEnhanced === expectedIsEnhanced
  );
}

function applyPreparedDreamJourneyEffect({
  prev,
  effect,
  prepared,
}: {
  prev: QuestState;
  effect: JourneyEffect;
  prepared: {
    removeEntryIds: string[];
    addCardNumbers: number[];
    upgrades: Array<{ entryId: string; type: TransfigurationType }>;
  };
}): QuestState | null {
  const removeCards = (state: QuestState, count: number): QuestState | null => {
    const ids = prepared.removeEntryIds.slice(0, count);
    if (
      ids.some((entryId) => {
        const entry = state.deck.find((candidate) => candidate.entryId === entryId);
        return entry === undefined || entry.isBane;
      })
    ) {
      return null;
    }
    const idSet = new Set(ids);
    return {
      ...state,
      deck: state.deck.filter((entry) => !idSet.has(entry.entryId)),
    };
  };

  const addCards = (state: QuestState, count: number): QuestState => {
    let deck = state.deck;
    for (const cardNumber of prepared.addCardNumbers.slice(0, count)) {
      deck = [
        ...deck,
        {
          entryId: nextDeckEntryId(deck),
          cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ];
    }
    return { ...state, deck };
  };

  switch (effect.type) {
    case "addEssence":
      return { ...prev, essence: prev.essence + effect.amount };
    case "removeEssence":
      return { ...prev, essence: prev.essence - effect.amount };
    case "removeRandomCards":
      return removeCards(prev, effect.count);
    case "addRandomCards":
      return addCards(prev, effect.count);
    case "addEssenceAndRemoveCards":
      return removeCards(
        { ...prev, essence: prev.essence + effect.essenceAmount },
        effect.removeCount,
      );
    case "removeCardsAndAddRandomCards": {
      const removed = removeCards(prev, effect.removeCount);
      return removed === null ? null : addCards(removed, effect.addCount);
    }
    case "upgradeRandomCards": {
      const upgrades = prepared.upgrades.slice(0, effect.count);
      if (
        upgrades.some(({ entryId }) => {
          const entry = prev.deck.find((candidate) => candidate.entryId === entryId);
          return entry === undefined || entry.transfiguration !== null;
        })
      ) {
        return null;
      }
      const upgradeMap = new Map(upgrades.map((upgrade) => [upgrade.entryId, upgrade.type]));
      return {
        ...prev,
        deck: prev.deck.map((entry) => {
          const type = upgradeMap.get(entry.entryId);
          return type === undefined ? entry : { ...entry, transfiguration: type };
        }),
      };
    }
  }
}

function prepareDreamJourneyEffect({
  state,
  effect,
  cardDatabase,
  selectedPackageTides,
}: {
  state: QuestState;
  effect: JourneyEffect;
  cardDatabase: Map<number, CardData>;
  selectedPackageTides: readonly PackageTideId[];
}) {
  const removeCount =
    effect.type === "removeRandomCards"
      ? effect.count
      : effect.type === "addEssenceAndRemoveCards"
        ? effect.removeCount
        : effect.type === "removeCardsAndAddRandomCards"
          ? effect.removeCount
          : 0;
  const addCount =
    effect.type === "addRandomCards"
      ? effect.count
      : effect.type === "removeCardsAndAddRandomCards"
        ? effect.addCount
        : 0;
  const upgradeCount = effect.type === "upgradeRandomCards" ? effect.count : 0;
  const types = ["Viridian", "Golden", "Scarlet", "Azure", "Bronze"] as const;

  return {
    removeEntryIds: shuffled(state.deck.filter((entry) => !entry.isBane))
      .slice(0, removeCount)
      .map((entry) => entry.entryId),
    addCardNumbers: sampleRewardCards(
      cardDatabase,
      addCount,
      selectedPackageTides,
    ).map((card) => card.cardNumber),
    upgrades: shuffled(state.deck.filter((entry) => entry.transfiguration === null))
      .slice(0, upgradeCount)
      .map((entry) => ({
        entryId: entry.entryId,
        type: types[Math.floor(Math.random() * types.length)],
      })),
  };
}

function applyPreparedTemptingOfferEffect({
  prev,
  effect,
  prepared,
}: {
  prev: QuestState;
  effect: OfferEffect;
  prepared: {
    addCardNumbers: number[];
    addBaneCardNumbers: number[];
    removeEntryIds: string[];
    removeDreamsign: { index: number; dreamsign: Dreamsign } | null;
    addedDreamsign: Dreamsign | null;
  };
}): QuestState | null {
  const addCards = (
    state: QuestState,
    cardNumbers: readonly number[],
    isBane: boolean,
  ): QuestState => {
    let deck = state.deck;
    for (const cardNumber of cardNumbers) {
      deck = [
        ...deck,
        {
          entryId: nextDeckEntryId(deck),
          cardNumber,
          transfiguration: null,
          isBane,
        },
      ];
    }
    return { ...state, deck };
  };
  const removeCards = (state: QuestState, count: number): QuestState | null => {
    const ids = prepared.removeEntryIds.slice(0, count);
    if (
      ids.some((entryId) => {
        const entry = state.deck.find((candidate) => candidate.entryId === entryId);
        return entry === undefined || entry.isBane;
      })
    ) {
      return null;
    }
    const idSet = new Set(ids);
    return {
      ...state,
      deck: state.deck.filter((entry) => !idSet.has(entry.entryId)),
    };
  };

  switch (effect.type) {
    case "addEssence":
      return { ...prev, essence: prev.essence + effect.amount };
    case "addRandomCards":
      return addCards(prev, prepared.addCardNumbers.slice(0, effect.count), false);
    case "addBaneCards":
      return addCards(prev, prepared.addBaneCardNumbers.slice(0, effect.count), true);
    case "removeEssence":
      return { ...prev, essence: prev.essence - effect.amount };
    case "removeDreamsign":
      if (prepared.removeDreamsign === null) {
        return prev;
      }
      if (
        prev.dreamsigns[prepared.removeDreamsign.index] === undefined ||
        !dreamsignDetailsEqual(
          prev.dreamsigns[prepared.removeDreamsign.index],
          prepared.removeDreamsign.dreamsign,
        )
      ) {
        return null;
      }
      return {
        ...prev,
        dreamsigns: prev.dreamsigns.filter(
          (_, index) => index !== prepared.removeDreamsign?.index,
        ),
      };
    case "reduceMaxDreamsigns":
      return prev;
    case "removeRandomCards":
      return removeCards(prev, effect.count);
    case "addDreamsign":
      if (prepared.addedDreamsign === null || prev.dreamsigns.length >= MAX_DREAMSIGNS) {
        return prev;
      }
      return { ...prev, dreamsigns: [...prev.dreamsigns, prepared.addedDreamsign] };
  }
}

function prepareTemptingOfferEffects({
  state,
  benefit,
  cost,
  cardDatabase,
  selectedPackageTides,
  dreamsignTemplates,
}: {
  state: QuestState;
  benefit: OfferEffect;
  cost: OfferEffect;
  cardDatabase: Map<number, CardData>;
  selectedPackageTides: readonly PackageTideId[];
  dreamsignTemplates: QuestContent["dreamsignTemplates"];
}) {
  const effects = [benefit, cost];
  const addCount = effects.reduce(
    (sum, effect) =>
      sum + (effect.type === "addRandomCards" ? effect.count : 0),
    0,
  );
  const baneCount = effects.reduce(
    (sum, effect) =>
      sum + (effect.type === "addBaneCards" ? effect.count : 0),
    0,
  );
  const removeCount = effects.reduce(
    (sum, effect) =>
      sum + (effect.type === "removeRandomCards" ? effect.count : 0),
    0,
  );
  const shouldRemoveDreamsign = effects.some(
    (effect) => effect.type === "removeDreamsign",
  );
  const shouldAddDreamsign = effects.some(
    (effect) => effect.type === "addDreamsign",
  );

  return {
    addCardNumbers: sampleRewardCards(
      cardDatabase,
      addCount,
      selectedPackageTides,
    ).map((card) => card.cardNumber),
    addBaneCardNumbers: sampleRewardCards(cardDatabase, baneCount).map(
      (card) => card.cardNumber,
    ),
    removeEntryIds: shuffled(state.deck.filter((entry) => !entry.isBane))
      .slice(0, removeCount)
      .map((entry) => entry.entryId),
    removeDreamsign:
      shouldRemoveDreamsign && state.dreamsigns.length > 0
        ? (() => {
          const index = Math.floor(Math.random() * state.dreamsigns.length);
          return {
            index,
            dreamsign: { ...state.dreamsigns[index] },
          };
        })()
        : null,
    addedDreamsign:
      shouldAddDreamsign && dreamsignTemplates.length > 0
        ? createDreamsign(
          dreamsignTemplates[Math.floor(Math.random() * dreamsignTemplates.length)],
          false,
        )
        : null,
  };
}

export function MultiplayerQuestProvider({
  children,
  database,
  session,
  questContent,
}: MultiplayerQuestProviderProps) {
  const state = session.room.questState ?? createDefaultState();
  const playableBattleCache = useMemo(() => createPlayableBattleCache(), []);
  const currentRef = useRef<{
    database: Database;
    session: RoomSession;
    questContent: QuestContent;
    state: QuestState;
    playableBattleCache: PlayableBattleCache;
  }>({
    database,
    session,
    questContent,
    state,
    playableBattleCache,
  });
  currentRef.current = {
    database,
    session,
    questContent,
    state,
    playableBattleCache,
  };

  const changeEssence = useCallback(
    (delta: number, _source: string) => {
      const current = currentRef.current;
      const next = changeQuestEssence(current.state, delta);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "essence",
        value: next.essence,
      });
    },
    [],
  );

  const startQuest = useCallback(
    (dreamcaller: DreamcallerContent) => {
      const current = currentRef.current;
      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (
            room === null ||
            (room.questState !== null && room.questState.dreamcaller !== null)
          ) {
            return room ?? undefined;
          }

          const questState = room.questState ?? createDefaultState();
          const next = startQuestFromDreamcaller({
            prev: questState,
            dreamcaller,
            questContent: current.questContent,
          });
          const now = new Date().toISOString();
          const actionId = crypto.randomUUID();

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "startQuest",
                source: "quest_start",
                summary: {
                  dreamcallerId: dreamcaller.id,
                  dreamcallerName: dreamcaller.name,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const setScreen = useCallback(
    (screen: Screen) => {
      const current = currentRef.current;
      writeScreenUpdate({
        database: current.database,
        roomId: current.session.roomId,
        state: setQuestScreen(current.state, screen),
      });
    },
    [],
  );

  const setCardSourceDebug = useCallback(
    (cardSourceDebug: CardSourceDebugState | null, _source: string) => {
      const current = currentRef.current;
      const next = applyCardSourceDebug(current.state, cardSourceDebug);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "cardSourceDebug",
        value: next.cardSourceDebug,
      });
    },
    [],
  );

  const addDreamsign = useCallback(
    (dreamsign: Dreamsign, _sourceSiteType: string) => {
      const current = currentRef.current;
      if (current.state.dreamsigns.length >= MAX_DREAMSIGNS) {
        return;
      }
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "dreamsigns",
        value: [...current.state.dreamsigns, dreamsign],
      });
    },
    [],
  );

  const removeDreamsign = useCallback(
    (index: number, _reason: string) => {
      const current = currentRef.current;
      if (current.state.dreamsigns[index] === undefined) {
        return;
      }
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "dreamsigns",
        value: current.state.dreamsigns.filter(
          (_, dreamsignIndex) => dreamsignIndex !== index,
        ),
      });
    },
    [],
  );

  const setRemainingDreamsignPool = useCallback(
    (remainingDreamsignPool: string[], _source: string) => {
      const current = currentRef.current;
      const next = applyRemainingDreamsignPool(
        current.state,
        remainingDreamsignPool,
      );
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "remainingDreamsignPool",
        value: next.remainingDreamsignPool,
      });
    },
    [],
  );

  const setCurrentDreamscape = useCallback(
    (nodeId: string | null) => {
      const current = currentRef.current;
      const next = {
        ...current.state,
        currentDreamscape: nodeId,
        visitedSites: nodeId !== null ? [] : current.state.visitedSites,
      };
      const updatedAt = new Date().toISOString();
      writeUpdate(current.database, {
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "currentDreamscape",
          next.currentDreamscape,
          updatedAt,
        ),
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "visitedSites",
          next.visitedSites,
          updatedAt,
        ),
      });
    },
    [],
  );

  const updateAtlas = useCallback(
    (atlas: DreamAtlas) => {
      const current = currentRef.current;
      const next = updateQuestAtlas(current.state, atlas);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "atlas",
        value: next.atlas,
      });
    },
    [],
  );

  const setDraftState = useCallback(
    (draftState: DraftState, _source: string) => {
      const current = currentRef.current;
      const next = applyDraftState(current.state, draftState);
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "draftState",
        value: next.draftState,
      });
    },
    [],
  );

  const setFailureSummary = useCallback(
    (failureSummary: QuestFailureSummary | null, _source: string) => {
      const current = currentRef.current;
      writeQuestField({
        database: current.database,
        roomId: current.session.roomId,
        field: "failureSummary",
        value: failureSummary === null ? null : { ...failureSummary },
      });
    },
    [],
  );

  const resetQuest = useCallback(() => {
    const current = currentRef.current;
    resetLog();
    resetBattleCompletionBridge();
    current.playableBattleCache.reset();
    writeWholeQuestState({
      database: current.database,
      roomId: current.session.roomId,
      state: createDefaultState(),
    });
  }, []);

  const setDreamcallerSelection = useCallback(
    (resolvedPackage: Parameters<QuestMutations["setDreamcallerSelection"]>[0]) => {
      const current = currentRef.current;
      const next = applyDreamcallerSelection(current.state, resolvedPackage);
      const updatedAt = new Date().toISOString();
      writeUpdate(current.database, {
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "dreamcaller",
          next.dreamcaller,
          updatedAt,
        ),
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "resolvedPackage",
          next.resolvedPackage,
          updatedAt,
        ),
        ...buildQuestFieldUpdate(
          current.session.roomId,
          "remainingDreamsignPool",
          next.remainingDreamsignPool,
          updatedAt,
        ),
      });
    },
    [],
  );

  const completeSite = useCallback(
    (siteId: string, source: string) => {
      const current = currentRef.current;
      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }

          const next = setQuestScreen(
            completeQuestSite(room.questState, siteId),
            { type: "dreamscape" },
          );
          const now = new Date().toISOString();
          const actionId = crypto.randomUUID();

          return {
            ...room,
            questState: {
              ...room.questState,
              visitedSites: next.visitedSites,
              atlas: next.atlas,
              screen: next.screen,
              activeSiteId: next.activeSiteId,
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "completeSite",
                source,
                summary: { siteId },
              },
            },
          };
        },
      });
    },
    [],
  );

  const pickDraftCard = useCallback((siteId: string, cardNumber: number) => {
    const current = currentRef.current;
    let prepared: ReturnType<typeof prepareDraftCardPickInQuestState>;
    try {
      prepared = prepareDraftCardPickInQuestState({
        prev: current.state,
        siteId,
        cardNumber,
        cardDatabase: current.questContent.cardDatabase,
      });
    } catch {
      return;
    }

    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }

        const next = commitPreparedDraftCardPickInQuestState({
          prev: room.questState,
          prepared,
        });
        if (next === null) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            deck: next.deck,
            draftState: next.draftState,
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "pickDraftCard",
              source: "draft_pick",
              summary: { siteId, cardNumber },
            },
          },
        };
      },
    });
  }, []);

  const ensureRewardSiteRuntime = useCallback((siteId: string) => {
    const current = currentRef.current;
    const expectedRemainingDreamsignPool = [
      ...current.state.remainingDreamsignPool,
    ];
    const expectedSelectedTides = [
      ...(current.state.resolvedPackage?.selectedTides ?? []),
    ];
    const generated =
      current.state.siteRuntime[siteId] === undefined
        ? generateRewardSiteData({
          cardDatabase: current.questContent.cardDatabase,
          dreamsignTemplates: current.questContent.dreamsignTemplates,
          remainingDreamsignPoolIds: expectedRemainingDreamsignPool,
          selectedPackageTides: expectedSelectedTides,
        })
        : null;
    const runtime: RewardSiteRuntime | null =
      generated === null
        ? null
        : {
          kind: "reward",
          reward: generated.reward,
          remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          accepted: false,
        };
    const remainingDreamsignPool =
      generated === null
        ? expectedRemainingDreamsignPool
        : generated.spentDreamsignPoolIds.length > 0
          ? generated.remainingDreamsignPoolIds
          : expectedRemainingDreamsignPool;
    const now = new Date().toISOString();
    const actionId =
      runtime === null ? null : crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.siteRuntime[siteId] !== undefined) {
          return room;
        }
        if (
          runtime === null ||
          actionId === null ||
          !arraysEqual(
            room.questState.remainingDreamsignPool,
            expectedRemainingDreamsignPool,
          ) ||
          !arraysEqual(
            room.questState.resolvedPackage?.selectedTides ?? [],
            expectedSelectedTides,
          )
        ) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            remainingDreamsignPool,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: runtime,
            },
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "ensureRewardSiteRuntime",
              source: "site_reveal",
              summary: {
                siteId,
                rewardType: runtime.reward.rewardType,
              },
            },
          },
        };
      },
    });
  }, []);

  const acceptRewardSite = useCallback((siteId: string) => {
    const current = currentRef.current;
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();
    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "reward" ||
          runtime.accepted
        ) {
          return room;
        }

        let next: QuestState = room.questState;
        const reward = runtime.reward;
        if (reward.rewardType === "card") {
          next = {
            ...next,
            deck: [
              ...next.deck,
              {
                entryId: nextDeckEntryId(next.deck),
                cardNumber: reward.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ],
          };
        } else if (reward.rewardType === "dreamsign") {
          if (next.dreamsigns.length < MAX_DREAMSIGNS) {
            next = {
              ...next,
              dreamsigns: [
                ...next.dreamsigns,
                {
                  id: reward.dreamsignId,
                  name: reward.dreamsignName,
                  effectDescription: reward.dreamsignEffect,
                  isBane: false,
                },
              ],
            };
          }
        } else {
          next = {
            ...next,
            essence: next.essence + reward.essenceAmount,
          };
        }

        next = completeSiteAndReturnToDreamscape(
          {
            ...next,
            siteRuntime: {
              ...next.siteRuntime,
              [siteId]: {
                ...runtime,
                accepted: true,
              },
            },
          },
          siteId,
        );

        return {
          ...room,
          questState: next,
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "acceptRewardSite",
              source: "site_reveal",
              summary: {
                siteId,
                rewardType: reward.rewardType,
              },
            },
          },
        };
      },
    });
  }, []);

  const ensureDreamsignOfferRuntime = useCallback(
    (siteId: string, optionCount: number) => {
      const current = currentRef.current;
      const expectedRemainingDreamsignPool = [
        ...current.state.remainingDreamsignPool,
      ];
      const revealed =
        current.state.siteRuntime[siteId] === undefined
          ? drawDreamsignOptions(
            expectedRemainingDreamsignPool,
            current.questContent.dreamsignTemplates,
            optionCount,
          )
          : null;
      const runtime: DreamsignOfferSiteRuntime | null =
        revealed === null
          ? null
          : {
            kind: "dreamsignOffer",
            offeredDreamsigns: revealed.offeredDreamsigns,
            remainingDreamsignPool: revealed.remainingDreamsignPool,
            accepted: false,
          };
      const now = new Date().toISOString();
      const actionId =
        runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[siteId] !== undefined) {
            return room;
          }
          if (
            runtime === null ||
            actionId === null ||
            !arraysEqual(
              room.questState.remainingDreamsignPool,
              expectedRemainingDreamsignPool,
            )
          ) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              remainingDreamsignPool: runtime.remainingDreamsignPool,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: runtime,
              },
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureDreamsignOfferRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  optionCount,
                  offeredCount: runtime.offeredDreamsigns.length,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const acceptDreamsignOffer = useCallback(
    (siteId: string, dreamsign: Dreamsign, purgeIndex?: number) => {
      const current = currentRef.current;
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();
      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "dreamsignOffer" ||
            runtime.accepted ||
            !runtime.offeredDreamsigns.some((offered) =>
              dreamsignMatches(offered, dreamsign),
            )
          ) {
            return room;
          }
          const purgedDreamsign =
            purgeIndex === undefined
              ? null
              : room.questState.dreamsigns[purgeIndex];
          if (
            (purgeIndex !== undefined && purgedDreamsign == null) ||
            (room.questState.dreamsigns.length >= MAX_DREAMSIGNS &&
              purgeIndex === undefined)
          ) {
            return room;
          }
          const dreamsigns =
            purgeIndex === undefined
              ? [...room.questState.dreamsigns, dreamsign]
              : room.questState.dreamsigns.map((existing, index) =>
                index === purgeIndex ? dreamsign : existing,
              );

          const next = completeSiteAndReturnToDreamscape(
            {
              ...room.questState,
              dreamsigns,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: {
                  ...runtime,
                  accepted: true,
                },
              },
            },
            siteId,
          );
          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "acceptDreamsignOffer",
                source: "site_reveal",
                summary: {
                  siteId,
                  dreamsignId: dreamsign.id ?? null,
                  dreamsignName: dreamsign.name,
                  purgedDreamsignName: purgedDreamsign?.name ?? null,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const ensureEssenceSiteRuntime = useCallback(
    (siteId: string, isEnhanced: boolean) => {
      const current = currentRef.current;
      const runtime: EssenceSiteRuntime | null =
        current.state.siteRuntime[siteId] === undefined
          ? {
            kind: "essence",
            amount: isEnhanced
              ? randomIntInRange(400, 600)
              : randomIntInRange(200, 300),
            accepted: false,
          }
          : null;
      const now = new Date().toISOString();
      const actionId =
        runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[siteId] !== undefined) {
            return room;
          }
          if (runtime === null || actionId === null) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: runtime,
              },
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureEssenceSiteRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  amount: runtime.amount,
                  isEnhanced,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const acceptEssenceSite = useCallback((siteId: string) => {
    const current = currentRef.current;
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();
    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "essence" ||
          runtime.accepted
        ) {
          return room;
        }

        const next = completeSiteAndReturnToDreamscape(
          {
            ...room.questState,
            essence: room.questState.essence + runtime.amount,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: {
                ...runtime,
                accepted: true,
              },
            },
          },
          siteId,
        );
        return {
          ...room,
          questState: next,
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "acceptEssenceSite",
              source: "site_reveal",
              summary: {
                siteId,
                amount: runtime.amount,
              },
            },
          },
        };
      },
    });
  }, []);

  const ensureShopRuntime = useCallback(
    (site: SiteState, specialtyOnly: boolean) => {
      const current = currentRef.current;
      const expectedRemainingDreamsignPool = [
        ...current.state.remainingDreamsignPool,
      ];
      const expectedSelectedTides = [
        ...(current.state.resolvedPackage?.selectedTides ?? []),
      ];
      const expectedDeckCardNumbers = current.state.deck.map(
        (entry) => entry.cardNumber,
      );
      let runtime: ShopSiteRuntime | null = null;
      let remainingDreamsignPool = expectedRemainingDreamsignPool;

      if (current.state.siteRuntime[site.id] === undefined) {
        if (specialtyOnly) {
          const generated = generateSpecialtyShopInventory(
            current.questContent.cardDatabase,
            current.state.deck,
            expectedSelectedTides,
          );
          const slots = site.isEnhanced
            ? generated.map((slot) => ({
              ...slot,
              basePrice: 0,
              discountPercent: 0,
            }))
            : generated;
          runtime = {
            kind: "shop",
            slots: shopSlotsToRuntime(slots),
            rerollCount: 0,
            remainingDreamsignPoolIds: expectedRemainingDreamsignPool,
          };
        } else {
          const generated = generateShopInventory(
            current.questContent.cardDatabase,
            current.state.deck,
            {
              selectedPackageTides: expectedSelectedTides,
              remainingDreamsignPoolIds: expectedRemainingDreamsignPool,
              dreamsignTemplates: current.questContent.dreamsignTemplates,
            },
          );
          runtime = {
            kind: "shop",
            slots: shopSlotsToRuntime(generated.slots),
            rerollCount: 0,
            remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          };
          remainingDreamsignPool = generated.remainingDreamsignPoolIds;
        }
      }

      const now = new Date().toISOString();
      const actionId = runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[site.id] !== undefined) {
            return room;
          }
          if (
            runtime === null ||
            actionId === null ||
            !arraysEqual(
              room.questState.remainingDreamsignPool,
              expectedRemainingDreamsignPool,
            ) ||
            !arraysEqual(
              room.questState.resolvedPackage?.selectedTides ?? [],
              expectedSelectedTides,
            ) ||
            !deckCardNumbersEqual(room.questState.deck, expectedDeckCardNumbers)
          ) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              remainingDreamsignPool,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [site.id]: runtime,
              },
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureShopRuntime",
                source: "site_reveal",
                summary: {
                  siteId: site.id,
                  specialtyOnly,
                  slotCount: runtime.slots.length,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const buyShopSlot = useCallback((siteId: string, slotIndex: number) => {
    const current = currentRef.current;
    const expectedRuntime = current.state.siteRuntime[siteId];
    if (
      expectedRuntime === undefined ||
      expectedRuntime.kind !== "shop" ||
      current.state.visitedSites.includes(siteId)
    ) {
      return;
    }
    const expectedSlot = expectedRuntime.slots[slotIndex];
    if (
      expectedSlot === undefined ||
      expectedSlot.purchased ||
      expectedSlot.itemType === "reroll"
    ) {
      return;
    }

    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.visitedSites.includes(siteId)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "shop" ||
          runtime.rerollCount !== expectedRuntime.rerollCount ||
          !arraysEqual(
            runtime.remainingDreamsignPoolIds,
            expectedRuntime.remainingDreamsignPoolIds,
          ) ||
          !runtimeShopSlotEqual(runtime.slots[slotIndex], expectedSlot)
        ) {
          return room;
        }
        const slot = runtime.slots[slotIndex];
        if (
          slot === undefined ||
          slot.purchased ||
          slot.itemType === "reroll"
        ) {
          return room;
        }

        const price = runtimeSlotPrice(slot);
        if (price > room.questState.essence) {
          return room;
        }
        if (
          slot.itemType === "dreamsign" &&
          room.questState.dreamsigns.length >= MAX_DREAMSIGNS
        ) {
          return room;
        }

        let next: QuestState = {
          ...room.questState,
          essence: room.questState.essence - price,
        };
        const summary: Record<string, unknown> = {
          siteId,
          slotIndex,
          itemType: slot.itemType,
          basePrice: slot.basePrice,
          discountedPrice: price,
        };

        if (slot.itemType === "card") {
          next = {
            ...next,
            deck: [
              ...next.deck,
              {
                entryId: nextDeckEntryId(next.deck),
                cardNumber: slot.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ],
          };
          summary.cardNumber = slot.cardNumber;
        } else {
          next = {
            ...next,
            dreamsigns: [...next.dreamsigns, slot.dreamsign],
          };
          summary.dreamsignId = slot.dreamsign.id ?? null;
          summary.dreamsignName = slot.dreamsign.name;
        }

        next = {
          ...next,
          siteRuntime: {
            ...next.siteRuntime,
            [siteId]: {
              ...runtime,
              slots: runtime.slots.map((candidate, index) =>
                index === slotIndex
                  ? { ...candidate, purchased: true }
                  : candidate,
              ),
            },
          },
        };

        return {
          ...room,
          questState: next,
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "buyShopSlot",
              source: "shop_purchase",
              summary,
            },
          },
        };
      },
    });
  }, []);

  const rerollShop = useCallback((site: SiteState, slotIndex: number) => {
    const current = currentRef.current;
    const expectedRuntime = current.state.siteRuntime[site.id];
    if (
      expectedRuntime === undefined ||
      expectedRuntime.kind !== "shop" ||
      current.state.visitedSites.includes(site.id)
    ) {
      return;
    }
    const expectedSlot = expectedRuntime.slots[slotIndex];
    if (
      expectedSlot === undefined ||
      expectedSlot.itemType !== "reroll" ||
      expectedSlot.purchased
    ) {
      return;
    }

    const expectedEssence = current.state.essence;
    const cost = rerollCost(expectedRuntime.rerollCount, site.isEnhanced);
    if (cost > expectedEssence) {
      return;
    }
    const expectedSelectedTides = [
      ...(current.state.resolvedPackage?.selectedTides ?? []),
    ];
    const expectedDeckCardNumbers = current.state.deck.map(
      (entry) => entry.cardNumber,
    );
    const generated = generateShopInventory(
      current.questContent.cardDatabase,
      current.state.deck,
      {
        selectedPackageTides: expectedSelectedTides,
        remainingDreamsignPoolIds: expectedRuntime.remainingDreamsignPoolIds,
        dreamsignTemplates: current.questContent.dreamsignTemplates,
      },
    );
    const replacements = shopSlotsToRuntime(
      generated.slots.filter((candidate) => candidate.itemType !== "reroll"),
    );
    let replacementIndex = 0;
    const rerollCount = expectedRuntime.rerollCount + 1;
    const slots = expectedRuntime.slots.map((candidate, index) => {
      if (candidate.purchased) return candidate;
      if (index === slotIndex) {
        return {
          ...candidate,
          basePrice: rerollCost(rerollCount, site.isEnhanced),
        };
      }
      if (candidate.itemType === "reroll") return candidate;
      const replacement = replacements[replacementIndex];
      replacementIndex += 1;
      return replacement ?? candidate;
    });
    const now = new Date().toISOString();
    const actionId = crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.visitedSites.includes(site.id)) {
          return room;
        }
        const runtime = room.questState.siteRuntime[site.id];
        if (
          runtime === undefined ||
          runtime.kind !== "shop" ||
          runtime.rerollCount !== expectedRuntime.rerollCount ||
          room.questState.essence !== expectedEssence ||
          !arraysEqual(
            runtime.remainingDreamsignPoolIds,
            expectedRuntime.remainingDreamsignPoolIds,
          ) ||
          !runtimeShopSlotsEqual(runtime.slots, expectedRuntime.slots) ||
          !arraysEqual(
            room.questState.remainingDreamsignPool,
            expectedRuntime.remainingDreamsignPoolIds,
          ) ||
          !arraysEqual(
            room.questState.resolvedPackage?.selectedTides ?? [],
            expectedSelectedTides,
          ) ||
          !deckCardNumbersEqual(room.questState.deck, expectedDeckCardNumbers)
        ) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            essence: room.questState.essence - cost,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [site.id]: {
                ...runtime,
                slots,
                rerollCount,
                remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
              },
            },
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "rerollShop",
              source: "shop_reroll",
              summary: {
                siteId: site.id,
                slotIndex,
                rerollCost: cost,
                rerollCount,
              },
            },
          },
        };
      },
    });
  }, []);

  const ensureCardChoiceRuntime = useCallback(
    (siteId: string, kind: "transfiguration" | "duplication") => {
      const current = currentRef.current;
      const expectedDeck = structuredClone(current.state.deck);
      const site = findSite(current.state, siteId);
      const expectedSiteType = site?.type ?? null;
      const expectedIsEnhanced = site?.isEnhanced ?? false;
      const runtime: CardChoiceSiteRuntime | null =
        current.state.siteRuntime[siteId] === undefined
          ? buildCardChoiceRuntime({
            siteId,
              deck: current.state.deck,
              cardDatabase: current.questContent.cardDatabase,
              kind,
              isEnhanced: site?.isEnhanced ?? false,
          })
          : null;
      const now = new Date().toISOString();
      const actionId = runtime === null ? null : crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.siteRuntime[siteId] !== undefined) {
            return room;
          }
          if (
            runtime === null ||
            actionId === null ||
            !siteRuntimeAssumptionMatches(
              room.questState,
              siteId,
              expectedSiteType,
              expectedIsEnhanced,
            ) ||
            !deckEntriesRuntimeCompatible(room.questState.deck, expectedDeck)
          ) {
            return room;
          }

          return {
            ...room,
            questState: {
              ...room.questState,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: runtime,
              },
            },
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "ensureCardChoiceRuntime",
                source: "site_reveal",
                summary: {
                  siteId,
                  kind,
                  entryCount: runtime.entryIds.length,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const acceptTransfigurationChoice = useCallback(
    (
      siteId: string,
      entryId: string,
      type: TransfigurationType,
      effectDescription: string,
      effectDetails: Record<string, unknown>,
    ) => {
      const current = currentRef.current;
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "cardChoice" ||
            runtime.choiceKind !== "transfiguration" ||
            !Array.isArray(runtime.transfigurationOffers) ||
            runtime.acceptedEntryIds.length > 0 ||
            !runtime.entryIds.includes(entryId)
          ) {
            return room;
          }
          const entry = room.questState.deck.find(
            (candidate) => candidate.entryId === entryId,
          );
          if (entry === undefined || entry.transfiguration !== null) {
            return room;
          }
          const offered = runtime.transfigurationOffers.find(
            (offer) => offer.entryId === entryId,
          );
          if (
            offered === undefined ||
            offered.type !== type ||
            offered.effectDescription !== effectDescription ||
            !effectDetailsEqual(offered.effectDetails, effectDetails)
          ) {
            return room;
          }

          const next = completeSiteAndReturnToDreamscape(
            {
              ...room.questState,
              deck: room.questState.deck.map((candidate) =>
                candidate.entryId === entryId
                  ? { ...candidate, transfiguration: offered.type }
                  : candidate,
              ),
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: {
                  ...runtime,
                  acceptedEntryIds: [entryId],
                },
              },
            },
            siteId,
          );

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "acceptTransfigurationChoice",
                source: "transfiguration",
                summary: {
                  siteId,
                  entryId,
                  transfigurationType: offered.type,
                  effectDescription: offered.effectDescription,
                  effectDetails: offered.effectDetails,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const acceptDuplicationChoice = useCallback(
    (siteId: string, entryId: string, copyCount: number) => {
      const current = currentRef.current;
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId) || copyCount < 1) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "cardChoice" ||
            runtime.choiceKind !== "duplication" ||
            runtime.acceptedEntryIds.length > 0 ||
            !runtime.entryIds.includes(entryId)
          ) {
            return room;
          }
          const entry = room.questState.deck.find(
            (candidate) => candidate.entryId === entryId,
          );
          if (entry === undefined) {
            return room;
          }
          const expectedCopyCount = duplicationCopyCount(siteId, entryId);
          if (copyCount !== expectedCopyCount) {
            return room;
          }

          let deck = room.questState.deck;
          for (let index = 0; index < expectedCopyCount; index += 1) {
            deck = [
              ...deck,
              {
                entryId: nextDeckEntryId(deck),
                cardNumber: entry.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ];
          }

          const next = completeSiteAndReturnToDreamscape(
            {
              ...room.questState,
              deck,
              siteRuntime: {
                ...room.questState.siteRuntime,
                [siteId]: {
                  ...runtime,
                  acceptedEntryIds: [entryId],
                },
              },
            },
            siteId,
          );

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "acceptDuplicationChoice",
                source: "duplication",
                summary: {
                  siteId,
                  entryId,
                  cardNumber: entry.cardNumber,
                  copyCount: expectedCopyCount,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const ensureDreamJourneyRuntime = useCallback((siteId: string) => {
    const current = currentRef.current;
    const site = findSite(current.state, siteId);
    const expectedSiteType = site?.type ?? null;
    const expectedIsEnhanced = site?.isEnhanced ?? false;
    const optionCount = site?.isEnhanced ? 3 : 2;
    const runtime: DreamJourneySiteRuntime | null =
      current.state.siteRuntime[siteId] === undefined
        ? {
          kind: "dreamJourney",
          optionIds: shuffled(DREAM_JOURNEYS)
            .slice(0, optionCount)
            .map(dreamJourneyOptionId),
          completed: false,
        }
        : null;
    const now = new Date().toISOString();
    const actionId = runtime === null ? null : crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.siteRuntime[siteId] !== undefined) {
          return room;
        }
        if (
          runtime === null ||
          actionId === null ||
          !siteRuntimeAssumptionMatches(
            room.questState,
            siteId,
            expectedSiteType,
            expectedIsEnhanced,
          )
        ) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: runtime,
            },
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "ensureDreamJourneyRuntime",
              source: "site_reveal",
              summary: {
                siteId,
                optionCount,
              },
            },
          },
        };
      },
    });
  }, []);

  const completeDreamJourneyOption = useCallback(
    (siteId: string, optionId: string) => {
      const current = currentRef.current;
      const journey = findDreamJourneyOption(optionId);
      if (journey === undefined) {
        return;
      }
      const selectedPackageTides = [
        ...(current.state.resolvedPackage?.selectedTides ?? []),
      ];
      const prepared = prepareDreamJourneyEffect({
        state: current.state,
        effect: journey.effect,
        cardDatabase: current.questContent.cardDatabase,
        selectedPackageTides,
      });
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "dreamJourney" ||
            runtime.completed ||
            !runtime.optionIds.includes(optionId) ||
            !arraysEqual(
              room.questState.resolvedPackage?.selectedTides ?? [],
              selectedPackageTides,
            )
          ) {
            return room;
          }

          const applied = applyPreparedDreamJourneyEffect({
            prev: room.questState,
            effect: journey.effect,
            prepared,
          });
          if (applied === null) {
            return room;
          }
          const next = completeSiteAndReturnToDreamscape(
            {
              ...applied,
              siteRuntime: {
                ...applied.siteRuntime,
                [siteId]: {
                  ...runtime,
                  completed: true,
                },
              },
            },
            siteId,
          );

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "completeDreamJourneyOption",
                source: "dream_journey",
                summary: {
                  siteId,
                  optionId,
                  effectType: journey.effect.type,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const ensureTemptingOfferRuntime = useCallback((siteId: string) => {
    const current = currentRef.current;
    const site = findSite(current.state, siteId);
    const expectedSiteType = site?.type ?? null;
    const expectedIsEnhanced = site?.isEnhanced ?? false;
    const optionCount = site?.isEnhanced ? 3 : 2;
    const runtime: TemptingOfferSiteRuntime | null =
      current.state.siteRuntime[siteId] === undefined
        ? {
          kind: "temptingOffer",
          optionIds: shuffled(
            TEMPTING_OFFERS.map((_, index) => temptingOfferOptionId(index)),
          ).slice(0, optionCount),
          completed: false,
        }
        : null;
    const now = new Date().toISOString();
    const actionId = runtime === null ? null : crypto.randomUUID();

    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) {
          return room ?? undefined;
        }
        if (room.questState.siteRuntime[siteId] !== undefined) {
          return room;
        }
        if (
          runtime === null ||
          actionId === null ||
          !siteRuntimeAssumptionMatches(
            room.questState,
            siteId,
            expectedSiteType,
            expectedIsEnhanced,
          )
        ) {
          return room;
        }

        return {
          ...room,
          questState: {
            ...room.questState,
            siteRuntime: {
              ...room.questState.siteRuntime,
              [siteId]: runtime,
            },
          },
          metadata: {
            ...room.metadata,
            updatedAt: now,
          },
          actionLog: {
            ...(room.actionLog ?? {}),
            [actionId]: {
              timestamp: now,
              actorId: current.session.clientId,
              action: "ensureTemptingOfferRuntime",
              source: "site_reveal",
              summary: {
                siteId,
                optionCount,
              },
            },
          },
        };
      },
    });
  }, []);

  const completeTemptingOfferOption = useCallback(
    (siteId: string, optionId: string) => {
      const current = currentRef.current;
      const offer = findTemptingOfferOption(optionId);
      if (offer === undefined) {
        return;
      }
      const selectedPackageTides = [
        ...(current.state.resolvedPackage?.selectedTides ?? []),
      ];
      const prepared = prepareTemptingOfferEffects({
        state: current.state,
        benefit: offer.benefit,
        cost: offer.cost,
        cardDatabase: current.questContent.cardDatabase,
        selectedPackageTides,
        dreamsignTemplates: current.questContent.dreamsignTemplates,
      });
      const now = new Date().toISOString();
      const actionId = crypto.randomUUID();

      writeRoomTransaction({
        database: current.database,
        roomId: current.session.roomId,
        updater: (room) => {
          if (room === null || room.questState === null) {
            return room ?? undefined;
          }
          if (room.questState.visitedSites.includes(siteId)) {
            return room;
          }
          const runtime = room.questState.siteRuntime[siteId];
          if (
            runtime === undefined ||
            runtime.kind !== "temptingOffer" ||
            runtime.completed ||
            !runtime.optionIds.includes(optionId) ||
            !arraysEqual(
              room.questState.resolvedPackage?.selectedTides ?? [],
              selectedPackageTides,
            )
          ) {
            return room;
          }
          let next: QuestState | null = applyPreparedTemptingOfferEffect({
            prev: room.questState,
            effect: offer.benefit,
            prepared,
          });
          if (next === null) {
            return room;
          }
          next = applyPreparedTemptingOfferEffect({
            prev: next,
            effect: offer.cost,
            prepared,
          });
          if (next === null) {
            return room;
          }

          next = completeSiteAndReturnToDreamscape(
            {
              ...next,
              siteRuntime: {
                ...next.siteRuntime,
                [siteId]: {
                  ...runtime,
                  completed: true,
                },
              },
            },
            siteId,
          );

          return {
            ...room,
            questState: next,
            metadata: {
              ...room.metadata,
              updatedAt: now,
            },
            actionLog: {
              ...(room.actionLog ?? {}),
              [actionId]: {
                timestamp: now,
                actorId: current.session.clientId,
                action: "completeTemptingOfferOption",
                source: "tempting_offer",
                summary: {
                  siteId,
                  optionId,
                  benefitType: offer.benefit.type,
                  costType: offer.cost.type,
                },
              },
            },
          };
        },
      });
    },
    [],
  );

  const mutations = useMemo<QuestMutations>(
    () => ({
      changeEssence,
      startQuest,
      completeSite,
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      ensureEssenceSiteRuntime,
      acceptEssenceSite,
      ensureShopRuntime,
      buyShopSlot,
      rerollShop,
      ensureCardChoiceRuntime,
      acceptTransfigurationChoice,
      acceptDuplicationChoice,
      ensureDreamJourneyRuntime,
      completeDreamJourneyOption,
      ensureTemptingOfferRuntime,
      completeTemptingOfferOption,
      pickDraftCard,
      addCard: (_cardNumber: number, _source: string) => {
        unavailableMutation("addCard");
      },
      addBaneCard: (_cardNumber: number, _source: string) => {
        unavailableMutation("addBaneCard");
      },
      removeCard: (_entryId: string, _source: string) => {
        unavailableMutation("removeCard");
      },
      transfigureCard: (
        _entryId: string,
        _type: TransfigurationType,
        _effectDescription: string,
        _effectDetails: Record<string, unknown>,
      ) => {
        unavailableMutation("transfigureCard");
      },
      setDreamcallerSelection,
      setCardSourceDebug,
      addDreamsign,
      removeDreamsign,
      setRemainingDreamsignPool,
      incrementCompletionLevel: (
        _essenceReward: number,
        _rewardCardNumber: number | null,
        _rewardCardName: string | null,
        _isMiniboss: boolean,
      ) => {
        unavailableMutation("incrementCompletionLevel");
      },
      setScreen,
      markSiteVisited: (_siteId: string) => {
        unavailableMutation("markSiteVisited");
      },
      setCurrentDreamscape,
      updateAtlas,
      setDraftState,
      setFailureSummary,
      resetQuest,
    }),
    [
      addDreamsign,
      buyShopSlot,
      changeEssence,
      completeSite,
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      ensureEssenceSiteRuntime,
      acceptEssenceSite,
      ensureCardChoiceRuntime,
      acceptTransfigurationChoice,
      acceptDuplicationChoice,
      ensureDreamJourneyRuntime,
      completeDreamJourneyOption,
      ensureTemptingOfferRuntime,
      completeTemptingOfferOption,
      ensureShopRuntime,
      pickDraftCard,
      rerollShop,
      removeDreamsign,
      resetQuest,
      setCardSourceDebug,
      setCurrentDreamscape,
      setDraftState,
      setDreamcallerSelection,
      setFailureSummary,
      setRemainingDreamsignPool,
      setScreen,
      startQuest,
      updateAtlas,
    ],
  );

  const value = useMemo<QuestContextValue>(
    () => ({
      state,
      mutations,
      cardDatabase: questContent.cardDatabase,
      questContent,
    }),
    [mutations, questContent, state],
  );

  return (
    <QuestContextProvider value={value}>
      <PlayableBattleCacheProvider cache={playableBattleCache}>
        {children}
      </PlayableBattleCacheProvider>
    </QuestContextProvider>
  );
}
