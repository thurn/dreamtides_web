import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { QuestContent } from "../data/quest-content";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import type { CardData } from "../types/cards";
import type {
  DreamcallerContent,
  PackageTideId,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type {
  CardSourceDebugState,
  CardChoiceSiteRuntime,
  CardChoiceTransfigurationOffer,
  DeckEntry,
  DreamAtlas,
  Dreamsign,
  EssenceSiteRuntime,
  QuestFailureSummary,
  QuestState,
  RewardSiteRuntime,
  Screen,
  ShopSiteRuntime,
  SiteState,
  TransfigurationType,
} from "../types/quest";
import type { DraftState } from "../types/draft";
import {
  countRemainingCards,
  countRemainingUniqueCards,
  initializeDraftState,
} from "../draft/draft-engine";
import { logEvent, resetLog } from "../logging";
import { resetBattleCompletionBridge } from "../battle/integration/battle-completion-bridge";
import {
  clearPersistedQuestState,
  loadQuestState,
  saveQuestState,
} from "./quest-state-storage";
import { deriveEntryIdCounter } from "./deck-entry-ids";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { createStartInBattleState } from "../runtime/start-in-battle-state";
import {
  clampEssence,
  completeQuestSite,
  setQuestScreen,
  startQuestFromDreamcaller,
} from "./quest-state-actions";
import { generateRewardSiteData } from "../rewards/reward-generator";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";
import {
  generateShopInventory,
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
import { sampleRewardCards } from "../data/tide-weights";

export { deriveEntryIdCounter };


/** Mutation functions exposed by the quest context. */
export interface QuestMutations {
  changeEssence: (delta: number, source: string) => void;
  startQuest: (dreamcaller: DreamcallerContent) => void;
  completeSite: (siteId: string, source: string) => void;
  ensureRewardSiteRuntime: (siteId: string) => void;
  /**
   * Accepts the Dreamsign Reward at the given site. When the player is at the
   * 12-Dreamsign cap, `purgeIndex` selects an existing Dreamsign to replace;
   * without it the mutation no-ops at the cap so the UI can prompt a purge.
   */
  acceptRewardSite: (siteId: string, purgeIndex?: number) => void;
  ensureDreamsignOfferRuntime: (siteId: string, optionCount: number) => void;
  acceptDreamsignOffer: (
    siteId: string,
    dreamsign: Dreamsign,
    purgeIndex?: number,
  ) => void;
  /**
   * Rejects the Dreamsign Offering at the given site. Rejecting carries no
   * reward; it simply marks the runtime as resolved and completes the site.
   */
  rejectDreamsignOffer: (siteId: string) => void;
  ensureEssenceSiteRuntime: (siteId: string, isEnhanced: boolean) => void;
  acceptEssenceSite: (siteId: string) => void;
  ensureShopRuntime: (site: SiteState, specialtyOnly: boolean) => void;
  /**
   * Buys the shop slot at `slotIndex`. For a Dreamsign slot when the player
   * is at the 12-Dreamsign cap, `purgeIndex` selects an existing Dreamsign to
   * replace; without it the mutation no-ops at the cap so the UI can prompt a
   * purge.
   */
  buyShopSlot: (
    siteId: string,
    slotIndex: number,
    purgeIndex?: number,
  ) => void;
  rerollShop: (site: SiteState) => void;
  ensureCardChoiceRuntime: (
    siteId: string,
    kind: "transfiguration" | "duplication",
  ) => void;
  acceptTransfigurationChoice: (
    siteId: string,
    entryId: string,
    type: TransfigurationType,
    effectDescription: string,
    effectDetails: Record<string, unknown>,
  ) => void;
  acceptDuplicationChoice: (
    siteId: string,
    entryId: string,
    copyCount: number,
  ) => void;
  ensureDreamJourneyRuntime: (siteId: string) => void;
  completeDreamJourneyOption: (siteId: string, optionId: string) => void;
  pickDraftCard: (siteId: string, cardNumber: number) => void;
  addCard: (cardNumber: number, source: string) => void;
  addBaneCard: (cardNumber: number, source: string) => void;
  removeCard: (entryId: string, source: string) => void;
  /**
   * Removes up to 3 chosen Bane cards / Bane Dreamsigns at a Cleanse site,
   * then completes the site. Non-Bane selections are ignored and the total
   * is capped at 3.
   */
  cleanseBanes: (
    siteId: string,
    cardEntryIds: string[],
    dreamsignIndices: number[],
  ) => void;
  transfigureCard: (
    entryId: string,
    type: TransfigurationType,
    effectDescription: string,
    effectDetails: Record<string, unknown>,
  ) => void;
  setDreamcallerSelection: (resolvedPackage: ResolvedDreamcallerPackage) => void;
  setCardSourceDebug: (
    cardSourceDebug: CardSourceDebugState | null,
    source: string,
  ) => void;
  /**
   * Adds a Dreamsign. When the player is at the 12-Dreamsign cap, `purgeIndex`
   * selects an existing Dreamsign to replace; without it the mutation no-ops
   * at the cap so the UI can prompt a purge.
   */
  addDreamsign: (
    dreamsign: Dreamsign,
    sourceSiteType: string,
    purgeIndex?: number,
  ) => void;
  removeDreamsign: (index: number, reason: string) => void;
  setRemainingDreamsignPool: (
    remainingDreamsignPool: string[],
    source: string,
  ) => void;
  incrementCompletionLevel: (
    essenceReward: number,
    omenReward: number,
    rewardCardNumber: number | null,
    rewardCardName: string | null,
    isMiniboss: boolean,
  ) => void;
  setScreen: (screen: Screen) => void;
  markSiteVisited: (siteId: string) => void;
  setCurrentDreamscape: (nodeId: string | null) => void;
  updateAtlas: (atlas: DreamAtlas) => void;
  setDraftState: (draftState: DraftState, source: string) => void;
  setFailureSummary: (
    failureSummary: QuestFailureSummary | null,
    source: string,
  ) => void;
  /**
   * Marks the one-time starter-deck reveal popup as dismissed. Called from
   * the popup's "Continue" button so subsequent reloads of the same room
   * land directly on the first dreamscape.
   */
  dismissStartingDeckPopup: () => void;
  /**
   * Replaces an uninitialized quest state with a battle-ready state, skipping
   * Dreamcaller selection and the starter-deck popup. Drives the
   * `?startInBattle=1` runtime flag. No-op once a Dreamcaller is selected so
   * a reload of the same room does not clobber in-progress state.
   */
  bootstrapStartInBattle: () => void;
  resetQuest: () => void;
}

/** The value provided by the quest context. */
export interface QuestContextValue {
  state: QuestState;
  mutations: QuestMutations;
  cardDatabase: Map<number, CardData>;
  questContent: QuestContent;
}

export const QuestContext = createContext<QuestContextValue | null>(null);

export function QuestContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: QuestContextValue;
}) {
  return (
    <QuestContext.Provider value={value}>{children}</QuestContext.Provider>
  );
}

function screenName(screen: Screen): string {
  return screen.type === "site" ? `site:${screen.siteId}` : screen.type;
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

function findDreamJourneyOption(optionId: string) {
  return DREAM_JOURNEYS.find((journey) => dreamJourneyOptionId(journey) === optionId);
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

function applyDreamJourneyEffect({
  prev,
  effect,
  cardDatabase,
  selectedPackageTides,
  nextEntryId,
}: {
  prev: QuestState;
  effect: JourneyEffect;
  cardDatabase: Map<number, CardData>;
  selectedPackageTides: readonly PackageTideId[];
  nextEntryId: () => string;
}): QuestState {
  const removeRandomCards = (state: QuestState, count: number): QuestState => {
    const toRemove = shuffled(state.deck.filter((entry) => !entry.isBane)).slice(0, count);
    if (toRemove.length === 0) {
      return state;
    }
    const removedEntryIds = new Set(toRemove.map((entry) => entry.entryId));
    for (const entry of toRemove) {
      const card = cardDatabase.get(entry.cardNumber);
      logEvent("card_removed", {
        cardNumber: entry.cardNumber,
        cardName: card?.name ?? `Unknown Card #${String(entry.cardNumber)}`,
        source: "dream_journey",
      });
    }
    return {
      ...state,
      deck: state.deck.filter((entry) => !removedEntryIds.has(entry.entryId)),
    };
  };

  const addRandomCards = (state: QuestState, count: number): QuestState => {
    const cards = sampleRewardCards(cardDatabase, count, selectedPackageTides);
    return {
      ...state,
      deck: [
        ...state.deck,
        ...cards.map((card) => {
          logEvent("card_added", {
            cardNumber: card.cardNumber,
            cardName: card.name,
            source: "dream_journey",
          });
          return {
            entryId: nextEntryId(),
            cardNumber: card.cardNumber,
            transfiguration: null,
            isBane: false,
          };
        }),
      ],
    };
  };

  const addBaneCards = (state: QuestState, count: number): QuestState => {
    const cards = sampleRewardCards(cardDatabase, count);
    return {
      ...state,
      deck: [
        ...state.deck,
        ...cards.map((card) => {
          logEvent("card_added", {
            cardNumber: card.cardNumber,
            cardName: card.name,
            source: "dream_journey_bane",
            isBane: true,
          });
          return {
            entryId: nextEntryId(),
            cardNumber: card.cardNumber,
            transfiguration: null,
            isBane: true,
          };
        }),
      ],
    };
  };

  const changeEssence = (state: QuestState, delta: number): QuestState => {
    const newValue = clampEssence(state.essence + delta, state.essenceCap);
    logEvent("essence_changed", {
      oldValue: state.essence,
      newValue,
      delta,
      source: "dream_journey",
    });
    return { ...state, essence: newValue };
  };

  switch (effect.type) {
    case "addEssence":
      return changeEssence(prev, effect.amount);
    case "removeEssence":
      return changeEssence(prev, -effect.amount);
    case "removeRandomCards":
      return removeRandomCards(prev, effect.count);
    case "addRandomCards":
      return addRandomCards(prev, effect.count);
    case "addEssenceAndRemoveCards":
      return removeRandomCards(
        changeEssence(prev, effect.essenceAmount),
        effect.removeCount,
      );
    case "removeCardsAndAddRandomCards":
      return addRandomCards(
        removeRandomCards(prev, effect.removeCount),
        effect.addCount,
      );
    case "upgradeRandomCards": {
      const types = ["Viridian", "Golden", "Scarlet", "Azure", "Bronze"] as const;
      const toUpgrade = shuffled(prev.deck.filter((entry) => entry.transfiguration === null)).slice(0, effect.count);
      const upgrades = new Map<string, TransfigurationType>();
      for (const entry of toUpgrade) {
        const type = types[Math.floor(Math.random() * types.length)];
        const card = cardDatabase.get(entry.cardNumber);
        upgrades.set(entry.entryId, type);
        logEvent("card_transfigured", {
          cardNumber: entry.cardNumber,
          cardName: card?.name ?? `Unknown Card #${String(entry.cardNumber)}`,
          transfigurationType: type,
          effectDescription: "Dream Journey upgrade",
          modifiedFields: { source: "dreamJourney", type },
        });
      }
      return {
        ...prev,
        deck: prev.deck.map((entry) => {
          const type = upgrades.get(entry.entryId);
          return type === undefined ? entry : { ...entry, transfiguration: type };
        }),
      };
    }
    case "addBaneCards":
      return addBaneCards(prev, effect.count);
    case "addEssenceAndAddBaneCards":
      return addBaneCards(
        changeEssence(prev, effect.essenceAmount),
        effect.baneCount,
      );
    case "addRandomCardsAndAddBaneCards":
      return addBaneCards(
        addRandomCards(prev, effect.addCount),
        effect.baneCount,
      );
    case "reduceMaxDreamsigns":
      return {
        ...prev,
        maxDreamsigns: Math.max(0, prev.maxDreamsigns - effect.amount),
      };
  }
}

export function createDefaultState(): QuestState {
  return {
    essence: 250,
    essenceCap: 500,
    omens: 0,
    maxDreamsigns: 12,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      nodes: {},
      edges: [],
      startingNodeId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
  };
}

export function applyDreamcallerSelection(
  prev: QuestState,
  resolvedPackage: ResolvedDreamcallerPackage,
): QuestState {
  return {
    ...prev,
    dreamcaller: toQuestDreamcaller(resolvedPackage.dreamcaller),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
  };
}

export function applyRemainingDreamsignPool(
  prev: QuestState,
  remainingDreamsignPool: string[],
): QuestState {
  return {
    ...prev,
    remainingDreamsignPool: [...remainingDreamsignPool],
  };
}

export function applyCardSourceDebug(
  prev: QuestState,
  cardSourceDebug: CardSourceDebugState | null,
): QuestState {
  return {
    ...prev,
    cardSourceDebug:
      cardSourceDebug === null
        ? null
        : {
          ...cardSourceDebug,
          entries: cardSourceDebug.entries.map((entry) => ({
            ...entry,
            cardTides: [...entry.cardTides],
            matchedMandatoryTides: [...entry.matchedMandatoryTides],
            matchedOptionalTides: [...entry.matchedOptionalTides],
          })),
        },
  };
}

export function applyDraftState(
  prev: QuestState,
  draftState: DraftState,
): QuestState {
  return {
    ...prev,
    draftState,
  };
}

/** Provides quest state and mutation functions to the component tree. */
export function QuestProvider({
  children,
  cardDatabase,
  questContent,
  runtimeConfig = {
    seedOverride: null,
    startInBattle: false,
    enableAi: false,
    gameId: null,
  },
}: {
  children: ReactNode;
  cardDatabase: Map<number, CardData>;
  questContent: QuestContent;
  runtimeConfig?: RuntimeConfig;
}) {
  const isStartInBattleFixture = runtimeConfig.startInBattle;
  // FIND-01-2: hydrate from sessionStorage so an in-tab reload preserves the
  // dreamcaller pick and quest progress. `loadQuestState()` validates and
  // version-checks the snapshot, returning `null` (default state) on any
  // schema mismatch or storage error.
  const [state, setState] = useState<QuestState>(
    () =>
      (isStartInBattleFixture
        ? createStartInBattleState(questContent)
        : loadQuestState())
      ?? createDefaultState(),
  );
  // Track the highest deck `entryId` numeric suffix observed in the restored
  // snapshot so newly-added cards continue from the right counter rather than
  // colliding with restored ids.
  const entryIdCounter = useRef(deriveEntryIdCounter(state.deck));

  // FIND-01-2: write through to sessionStorage on every state change so a
  // mid-run reload (F5, accidental refresh, crash recovery) lands back on the
  // same screen with the same dreamcaller, deck, atlas, and active site.
  useEffect(() => {
    if (isStartInBattleFixture) {
      clearPersistedQuestState();
      return;
    }
    saveQuestState(state);
  }, [isStartInBattleFixture, state]);

  function nextEntryId(): string {
    entryIdCounter.current += 1;
    return `deck-${String(entryIdCounter.current)}`;
  }

  const changeEssence = useCallback((delta: number, source: string) => {
    setState((prev) => {
      const oldValue = prev.essence;
      const newValue = clampEssence(oldValue + delta, prev.essenceCap);
      logEvent("essence_changed", {
        oldValue,
        newValue,
        delta,
        source,
      });
      return { ...prev, essence: newValue };
    });
  }, []);

  const startQuest = useCallback(
    (dreamcaller: DreamcallerContent) => {
      setState((prev) => {
        const resolvedPackage = questContent.resolvedPackagesByDreamcallerId.get(
          dreamcaller.id,
        );
        if (resolvedPackage === undefined) {
          throw new Error(`Missing resolved package for ${dreamcaller.id}`);
        }

        const starterCardNumbers = STARTER_CARD_NUMBERS.filter(
          (cardNumber) =>
            !prev.deck.some((entry) => entry.cardNumber === cardNumber),
        );
        const next = startQuestFromDreamcaller({
          prev,
          dreamcaller,
          questContent,
        });

        for (const cardNumber of starterCardNumbers) {
          const card = cardDatabase.get(cardNumber);
          logEvent("card_added", {
            cardNumber,
            cardName: card?.name ?? `Unknown Card #${String(cardNumber)}`,
            source: "quest_start_starter_deck",
          });
        }

        logEvent("starter_deck_initialized", {
          starterCardNumbers,
          starterCardNames: starterCardNumbers.map(
            (cardNumber) =>
              cardDatabase.get(cardNumber)?.name ??
              `Unknown Card #${String(cardNumber)}`,
          ),
          totalDeckSize: next.deck.length,
        });

        initializeDraftState(cardDatabase, resolvedPackage);
        if (next.draftState !== null) {
          logEvent("draft_state_updated", {
            source: "quest_start",
            pickNumber: next.draftState.pickNumber,
            sitePicksCompleted: next.draftState.sitePicksCompleted,
            currentOfferSize: next.draftState.currentOffer.length,
            remainingCards: countRemainingCards(
              next.draftState.remainingCopiesByCard,
            ),
            remainingUniqueCards: countRemainingUniqueCards(
              next.draftState.remainingCopiesByCard,
            ),
          });
        }

        logEvent("quest_started", {
          initialEssence: next.essence,
          startingDeckSize: next.deck.length,
          dreamcallerId: dreamcaller.id,
          dreamcallerName: dreamcaller.name,
          packageSummary: {
            mandatoryTides: resolvedPackage.mandatoryTides,
            optionalSubset: resolvedPackage.optionalSubset,
            selectedTides: resolvedPackage.selectedTides,
          },
          selectedPackageTides: resolvedPackage.selectedTides,
          draftPoolSize: resolvedPackage.draftPoolSize,
          dreamsignPoolSize: resolvedPackage.dreamsignPoolIds.length,
          dreamscapesGenerated: Object.keys(next.atlas.nodes).length - 1,
        });

        if (next.currentDreamscape !== null) {
          const node = next.atlas.nodes[next.currentDreamscape];
          logEvent("dreamscape_entered", {
            dreamscapeId: next.currentDreamscape,
            biomeName: node?.biomeName ?? "unknown",
          });
        }
        logEvent("screen_transition", {
          from: screenName(prev.screen),
          to: screenName(next.screen),
        });

        entryIdCounter.current = deriveEntryIdCounter(next.deck);
        return next;
      });
    },
    [cardDatabase, questContent],
  );

  const completeSite = useCallback((siteId: string, source: string) => {
    setState((prev) => {
      if (prev.visitedSites.includes(siteId)) {
        return prev;
      }
      logEvent("site_completed", { siteId, source });
      return setQuestScreen(completeQuestSite(prev, siteId), {
        type: "dreamscape",
      });
    });
  }, []);

  const ensureRewardSiteRuntime = useCallback(
    (siteId: string) => {
      setState((prev) => {
        if (prev.siteRuntime[siteId] !== undefined) {
          return prev;
        }

        const generated = generateRewardSiteData({
          dreamsignTemplates: questContent.dreamsignTemplates,
          remainingDreamsignPoolIds: prev.remainingDreamsignPool,
          selectedPackageTides: prev.resolvedPackage?.selectedTides ?? [],
          regenerationPoolIds: prev.resolvedPackage?.dreamsignPoolIds ?? [],
        });
        const runtime: RewardSiteRuntime = {
          kind: "reward",
          reward: generated.reward,
          remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          accepted: false,
        };

        if (generated.spentDreamsignPoolIds.length > 0) {
          logEvent("dreamsign_pool_updated", {
            source: "reward_site_revealed",
            remainingDreamsignPoolSize:
              generated.remainingDreamsignPoolIds.length,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          });
        }

        return {
          ...prev,
          remainingDreamsignPool:
            generated.spentDreamsignPoolIds.length > 0
              ? generated.remainingDreamsignPoolIds
              : prev.remainingDreamsignPool,
          siteRuntime: {
            ...prev.siteRuntime,
            [siteId]: runtime,
          },
        };
      });
    },
    [cardDatabase, questContent.dreamsignTemplates],
  );

  const acceptRewardSite = useCallback(
    (siteId: string, purgeIndex?: number) => {
      setState((prev) => {
        const runtime = prev.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "reward" ||
          runtime.accepted
        ) {
          return prev;
        }

        let next: QuestState = prev;
        const reward = runtime.reward;
        if (reward.rewardType === "dreamsign") {
          const purgedDreamsign =
            purgeIndex === undefined ? null : prev.dreamsigns[purgeIndex];
          if (
            (purgeIndex !== undefined && purgedDreamsign == null) ||
            (prev.dreamsigns.length >= prev.maxDreamsigns &&
              purgeIndex === undefined)
          ) {
            return prev;
          }
          const dreamsign: Dreamsign = reward.dreamsign;
          if (purgedDreamsign !== null) {
            logEvent("dreamsign_removed", {
              name: purgedDreamsign.name,
              imageName: purgedDreamsign.imageName ?? null,
              reason: "purged_for_new_dreamsign",
            });
          }
          logEvent("dreamsign_acquired", {
            name: dreamsign.name,
            imageName: dreamsign.imageName ?? null,
            isBane: dreamsign.isBane,
            sourceSiteType: "Reward",
          });
          const dreamsigns =
            purgeIndex === undefined
              ? [...next.dreamsigns, dreamsign]
              : next.dreamsigns.map((existing, index) =>
                index === purgeIndex ? dreamsign : existing,
              );
          next = { ...next, dreamsigns };
        } else {
          const oldValue = next.essence;
          const newValue = clampEssence(
            oldValue + reward.essenceAmount,
            next.essenceCap,
          );
          logEvent("essence_changed", {
            oldValue,
            newValue,
            delta: reward.essenceAmount,
            source: "reward_site",
          });
          next = { ...next, essence: newValue };
        }

        const site = findSite(next, siteId);
        logEvent("site_completed", {
          siteType: "Reward",
          isEnhanced: site?.isEnhanced ?? false,
        });
        next = setQuestScreen(completeQuestSite(next, siteId), {
          type: "dreamscape",
        });

        return {
          ...next,
          siteRuntime: {
            ...next.siteRuntime,
            [siteId]: {
              ...runtime,
              accepted: true,
            },
          },
        };
      });
    },
    [],
  );

  const ensureDreamsignOfferRuntime = useCallback(
    (siteId: string, optionCount: number) => {
      setState((prev) => {
        if (prev.siteRuntime[siteId] !== undefined) {
          return prev;
        }

        const revealed = drawDreamsignOptions(
          prev.remainingDreamsignPool,
          questContent.dreamsignTemplates,
          optionCount,
          prev.resolvedPackage?.dreamsignPoolIds ?? [],
        );
        const site = findSite(prev, siteId);
        const source =
          site?.type === "DreamsignDraft"
            ? "dreamsign_draft_revealed"
            : "dreamsign_offering_revealed";
        logEvent("dreamsign_pool_updated", {
          source,
          remainingDreamsignPoolSize: revealed.remainingDreamsignPool.length,
          remainingDreamsignPool: revealed.remainingDreamsignPool,
        });

        return {
          ...prev,
          remainingDreamsignPool: revealed.remainingDreamsignPool,
          siteRuntime: {
            ...prev.siteRuntime,
            [siteId]: {
              kind: "dreamsignOffer",
              offeredDreamsigns: revealed.offeredDreamsigns,
              remainingDreamsignPool: revealed.remainingDreamsignPool,
              accepted: false,
            },
          },
        };
      });
    },
    [questContent.dreamsignTemplates],
  );

  const acceptDreamsignOffer = useCallback(
    (siteId: string, dreamsign: Dreamsign, purgeIndex?: number) => {
      setState((prev) => {
        const runtime = prev.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "dreamsignOffer" ||
          runtime.accepted
        ) {
          return prev;
        }
        const purgedDreamsign =
          purgeIndex === undefined ? null : prev.dreamsigns[purgeIndex];
        if (
          (purgeIndex !== undefined && purgedDreamsign == null) ||
          (prev.dreamsigns.length >= prev.maxDreamsigns &&
            purgeIndex === undefined)
        ) {
          return prev;
        }
        const offered = runtime.offeredDreamsigns.some((candidate) =>
          candidate.id !== undefined && dreamsign.id !== undefined
            ? candidate.id === dreamsign.id
            : candidate.name === dreamsign.name,
        );
        if (!offered) {
          return prev;
        }
        const site = findSite(prev, siteId);
        const sourceSiteType =
          site?.type === "DreamsignDraft"
            ? "DreamsignDraft"
            : "DreamsignOffering";

        const dreamsigns =
          purgeIndex === undefined
            ? [...prev.dreamsigns, dreamsign]
            : prev.dreamsigns.map((existing, index) =>
              index === purgeIndex ? dreamsign : existing,
            );
        if (purgedDreamsign !== null) {
          logEvent("dreamsign_removed", {
            name: purgedDreamsign.name,
            imageName: purgedDreamsign.imageName ?? null,
            reason: "purged_for_new_dreamsign",
          });
        }
        logEvent("dreamsign_acquired", {
          name: dreamsign.name,
          imageName: dreamsign.imageName ?? null,
          isBane: dreamsign.isBane,
          sourceSiteType,
        });
        logEvent("site_completed", {
          siteType: sourceSiteType,
          isEnhanced: site?.isEnhanced ?? false,
        });

        const next = setQuestScreen(
          completeQuestSite(
            {
              ...prev,
              dreamsigns,
              siteRuntime: {
                ...prev.siteRuntime,
                [siteId]: {
                  ...runtime,
                  accepted: true,
                },
              },
            },
            siteId,
          ),
          { type: "dreamscape" },
        );
        return next;
      });
    },
    [],
  );

  const rejectDreamsignOffer = useCallback((siteId: string) => {
    setState((prev) => {
      if (prev.visitedSites.includes(siteId)) {
        return prev;
      }
      const runtime = prev.siteRuntime[siteId];
      if (
        runtime === undefined ||
        runtime.kind !== "dreamsignOffer" ||
        runtime.accepted
      ) {
        return prev;
      }

      const site = findSite(prev, siteId);
      logEvent("site_completed", {
        siteType: "DreamsignOffering",
        outcome: "Rejected",
        isEnhanced: site?.isEnhanced ?? false,
      });

      return setQuestScreen(
        completeQuestSite(
          {
            ...prev,
            siteRuntime: {
              ...prev.siteRuntime,
              [siteId]: {
                ...runtime,
                accepted: true,
              },
            },
          },
          siteId,
        ),
        { type: "dreamscape" },
      );
    });
  }, []);

  const ensureEssenceSiteRuntime = useCallback(
    (siteId: string, isEnhanced: boolean) => {
      setState((prev) => {
        if (prev.siteRuntime[siteId] !== undefined) {
          return prev;
        }

        const runtime: EssenceSiteRuntime = {
          kind: "essence",
          amount: isEnhanced
            ? randomIntInRange(400, 600)
            : randomIntInRange(200, 300),
          accepted: false,
        };

        return {
          ...prev,
          siteRuntime: {
            ...prev.siteRuntime,
            [siteId]: runtime,
          },
        };
      });
    },
    [],
  );

  const acceptEssenceSite = useCallback((siteId: string) => {
    setState((prev) => {
      const runtime = prev.siteRuntime[siteId];
      if (
        runtime === undefined ||
        runtime.kind !== "essence" ||
        runtime.accepted
      ) {
        return prev;
      }

      const oldValue = prev.essence;
      const newValue = clampEssence(oldValue + runtime.amount, prev.essenceCap);
      logEvent("essence_changed", {
        oldValue,
        newValue,
        delta: runtime.amount,
        source: "essence_site",
      });
      const site = findSite(prev, siteId);
      logEvent("site_completed", {
        siteType: "Essence",
        outcome: `Granted ${String(runtime.amount)} essence`,
        isEnhanced: site?.isEnhanced ?? false,
      });

      const next = setQuestScreen(
        completeQuestSite(
          {
            ...prev,
            essence: newValue,
            siteRuntime: {
              ...prev.siteRuntime,
              [siteId]: {
                ...runtime,
                accepted: true,
              },
            },
          },
          siteId,
        ),
        { type: "dreamscape" },
      );
      return next;
    });
  }, []);

  const ensureShopRuntime = useCallback(
    (site: SiteState, specialtyOnly: boolean) => {
      setState((prev) => {
        if (prev.siteRuntime[site.id] !== undefined) {
          return prev;
        }

        const generated = generateShopInventory({
          cardDatabase,
          draftState: prev.draftState,
          remainingDreamsignPoolIds: prev.remainingDreamsignPool,
          dreamsignTemplates: questContent.dreamsignTemplates,
          dreamsignRegenerationPoolIds:
            prev.resolvedPackage?.dreamsignPoolIds ?? [],
          specialtyTides: specialtyOnly
            ? (prev.resolvedPackage?.mandatoryTides ?? [])
            : [],
        });
        logEvent("dreamsign_pool_updated", {
          source: "shop_inventory_revealed",
          remainingDreamsignPoolSize:
            generated.remainingDreamsignPoolIds.length,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
        });
        const runtime: ShopSiteRuntime = {
          kind: "shop",
          slots: shopSlotsToRuntime(generated.slots),
          rerollCount: 0,
          remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          restrictedTide: generated.restrictedTide,
        };

        return {
          ...prev,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          draftState: generated.draftState,
          siteRuntime: {
            ...prev.siteRuntime,
            [site.id]: runtime,
          },
        };
      });
    },
    [cardDatabase, questContent.dreamsignTemplates],
  );

  const buyShopSlot = useCallback(
    (siteId: string, slotIndex: number, purgeIndex?: number) => {
      setState((prev) => {
        if (prev.visitedSites.includes(siteId)) {
          return prev;
        }
        const runtime = prev.siteRuntime[siteId];
        if (runtime === undefined || runtime.kind !== "shop") {
          return prev;
        }
        const slot = runtime.slots[slotIndex];
        if (slot === undefined || slot.purchased) {
          return prev;
        }

        const price = runtimeSlotPrice(slot);
        // Cards cost essence; Dreamsigns cost omens.
        const payInOmens = slot.itemType === "dreamsign";
        const availableCurrency = payInOmens ? prev.omens : prev.essence;
        if (price > availableCurrency) {
          return prev;
        }
        const purgedDreamsign =
          slot.itemType === "dreamsign" && purgeIndex !== undefined
            ? prev.dreamsigns[purgeIndex]
            : null;
        if (
          slot.itemType === "dreamsign" &&
          ((purgeIndex !== undefined && purgedDreamsign == null) ||
            (purgeIndex === undefined &&
              prev.dreamsigns.length >= prev.maxDreamsigns))
        ) {
          return prev;
        }

        let next: QuestState = prev;
        if (payInOmens) {
          const newOmens = prev.omens - price;
          logEvent("omens_changed", {
            oldValue: prev.omens,
            newValue: newOmens,
            delta: -price,
            source: "shop_purchase",
          });
          next = { ...next, omens: newOmens };
        } else {
          const newEssence = clampEssence(
            prev.essence - price,
            prev.essenceCap,
          );
          logEvent("essence_changed", {
            oldValue: prev.essence,
            newValue: newEssence,
            delta: -price,
            source: "shop_purchase",
          });
          next = { ...next, essence: newEssence };
        }
        const site = findSite(prev, siteId);
        const isSpecialtyShop = site?.type === "SpecialtyShop";
        if (slot.itemType === "card") {
          const card = cardDatabase.get(slot.cardNumber);
          const source = isSpecialtyShop ? "specialty_shop" : "shop";
          logEvent("card_added", {
            cardNumber: slot.cardNumber,
            cardName:
              card?.name ?? `Unknown Card #${String(slot.cardNumber)}`,
            source,
          });
          const purchaseDetails: Record<string, unknown> = {
            itemType: "card",
            cardNumber: slot.cardNumber,
            cardName:
              card?.name ?? `Unknown Card #${String(slot.cardNumber)}`,
            basePrice: slot.basePrice,
            discountedPrice: price,
            essenceRemaining: next.essence,
          };
          if (isSpecialtyShop) {
            purchaseDetails.isSpecialtyShop = true;
            purchaseDetails.isEnhanced = site?.isEnhanced ?? false;
          }
          logEvent("shop_purchase", purchaseDetails);
          next = {
            ...next,
            deck: [
              ...next.deck,
              {
                entryId: nextEntryId(),
                cardNumber: slot.cardNumber,
                transfiguration: null,
                isBane: false,
              },
            ],
          };
        } else {
          if (purgedDreamsign !== null) {
            logEvent("dreamsign_removed", {
              name: purgedDreamsign.name,
              imageName: purgedDreamsign.imageName ?? null,
              reason: "purged_for_new_dreamsign",
            });
          }
          logEvent("dreamsign_acquired", {
            name: slot.dreamsign.name,
            imageName: slot.dreamsign.imageName ?? null,
            isBane: slot.dreamsign.isBane,
            sourceSiteType: "Shop",
          });
          logEvent("shop_purchase", {
            itemType: "dreamsign",
            dreamsignName: slot.dreamsign.name,
            basePrice: slot.basePrice,
            discountedPrice: price,
            omensRemaining: next.omens,
          });
          next = {
            ...next,
            dreamsigns:
              purgeIndex === undefined
                ? [...next.dreamsigns, slot.dreamsign]
                : next.dreamsigns.map((existing, index) =>
                  index === purgeIndex ? slot.dreamsign : existing,
                ),
          };
        }

        return {
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
      });
    },
    [cardDatabase],
  );

  const rerollShop = useCallback(
    (site: SiteState) => {
      setState((prev) => {
        if (prev.visitedSites.includes(site.id)) {
          return prev;
        }
        const runtime = prev.siteRuntime[site.id];
        if (runtime === undefined || runtime.kind !== "shop") {
          return prev;
        }
        if (runtime.rerollCount > 0) {
          return prev;
        }

        const cost = rerollCost(0, site.isEnhanced);
        if (cost > prev.omens) {
          return prev;
        }

        const generated = generateShopInventory({
          cardDatabase,
          draftState: prev.draftState,
          remainingDreamsignPoolIds: runtime.remainingDreamsignPoolIds,
          dreamsignTemplates: questContent.dreamsignTemplates,
          dreamsignRegenerationPoolIds:
            prev.resolvedPackage?.dreamsignPoolIds ?? [],
          specialtyTides:
            runtime.restrictedTide === null ? [] : [runtime.restrictedTide],
        });
        const replacements = shopSlotsToRuntime(generated.slots);
        let replacementIndex = 0;
        const rerollCount = runtime.rerollCount + 1;
        const slots = runtime.slots.map((candidate) => {
          if (candidate.purchased) return candidate;
          const replacement = replacements[replacementIndex];
          replacementIndex += 1;
          return replacement ?? candidate;
        });
        const newOmens = prev.omens - cost;
        logEvent("omens_changed", {
          oldValue: prev.omens,
          newValue: newOmens,
          delta: -cost,
          source: "shop_reroll",
        });
        logEvent("shop_reroll", {
          rerollCost: cost,
          rerollCount,
        });
        logEvent("dreamsign_pool_updated", {
          source: "shop_reroll_revealed",
          remainingDreamsignPoolSize:
            generated.remainingDreamsignPoolIds.length,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
        });

        return {
          ...prev,
          omens: newOmens,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          draftState: generated.draftState,
          siteRuntime: {
            ...prev.siteRuntime,
            [site.id]: {
              ...runtime,
              slots,
              rerollCount,
              remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
            },
          },
        };
      });
    },
    [cardDatabase, questContent.dreamsignTemplates],
  );

  const ensureCardChoiceRuntime = useCallback(
    (siteId: string, kind: "transfiguration" | "duplication") => {
      setState((prev) => {
        if (prev.siteRuntime[siteId] !== undefined) {
          return prev;
        }
        const site = findSite(prev, siteId);
        const runtime = buildCardChoiceRuntime({
          siteId,
          deck: prev.deck,
          cardDatabase,
          kind,
          isEnhanced: site?.isEnhanced ?? false,
        });

        return {
          ...prev,
          siteRuntime: {
            ...prev.siteRuntime,
            [siteId]: runtime,
          },
        };
      });
    },
    [cardDatabase],
  );

  const acceptTransfigurationChoice = useCallback(
    (
      siteId: string,
      entryId: string,
      type: TransfigurationType,
      effectDescription: string,
      effectDetails: Record<string, unknown>,
    ) => {
      setState((prev) => {
        if (prev.visitedSites.includes(siteId)) {
          return prev;
        }
        const runtime = prev.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "cardChoice" ||
          runtime.choiceKind !== "transfiguration" ||
          !Array.isArray(runtime.transfigurationOffers) ||
          runtime.acceptedEntryIds.length > 0 ||
          !runtime.entryIds.includes(entryId)
        ) {
          return prev;
        }
        const entry = prev.deck.find((candidate) => candidate.entryId === entryId);
        if (entry === undefined || entry.transfiguration !== null) {
          return prev;
        }
        const card = cardDatabase.get(entry.cardNumber);
        if (card === undefined) {
          return prev;
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
          return prev;
        }

        logEvent("card_transfigured", {
          cardNumber: entry.cardNumber,
          cardName: card.name,
          transfigurationType: offered.type,
          effectDescription: offered.effectDescription,
          modifiedFields: offered.effectDetails,
        });
        logEvent("site_completed", {
          siteType: "Transfiguration",
          outcome: "completed",
        });

        const next = setQuestScreen(
          completeQuestSite(
            {
              ...prev,
              deck: prev.deck.map((candidate) =>
                candidate.entryId === entryId
                  ? { ...candidate, transfiguration: offered.type }
                  : candidate,
              ),
              siteRuntime: {
                ...prev.siteRuntime,
                [siteId]: {
                  ...runtime,
                  acceptedEntryIds: [entryId],
                },
              },
            },
            siteId,
          ),
          { type: "dreamscape" },
        );
        return next;
      });
    },
    [cardDatabase],
  );

  const acceptDuplicationChoice = useCallback(
    (siteId: string, entryId: string, copyCount: number) => {
      setState((prev) => {
        if (prev.visitedSites.includes(siteId) || copyCount < 1) {
          return prev;
        }
        const runtime = prev.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "cardChoice" ||
          runtime.choiceKind !== "duplication" ||
          runtime.acceptedEntryIds.length > 0 ||
          !runtime.entryIds.includes(entryId)
        ) {
          return prev;
        }
        const entry = prev.deck.find((candidate) => candidate.entryId === entryId);
        if (entry === undefined) {
          return prev;
        }
        const card = cardDatabase.get(entry.cardNumber);
        if (card === undefined) {
          return prev;
        }
        const expectedCopyCount = duplicationCopyCount(siteId, entryId);
        if (copyCount !== expectedCopyCount) {
          return prev;
        }

        logEvent("card_duplicated", {
          cardNumber: card.cardNumber,
          cardName: card.name,
          copyCount: expectedCopyCount,
        });

        const copies: DeckEntry[] = [];
        for (let i = 0; i < expectedCopyCount; i += 1) {
          logEvent("card_added", {
            cardNumber: card.cardNumber,
            cardName: card.name,
            source: "duplication",
          });
          copies.push({
            entryId: nextEntryId(),
            cardNumber: card.cardNumber,
            transfiguration: null,
            isBane: false,
          });
        }
        logEvent("site_completed", {
          siteType: "Duplication",
          outcome: "completed",
        });

        return setQuestScreen(
          completeQuestSite(
            {
              ...prev,
              deck: [...prev.deck, ...copies],
              siteRuntime: {
                ...prev.siteRuntime,
                [siteId]: {
                  ...runtime,
                  acceptedEntryIds: [entryId],
                },
              },
            },
            siteId,
          ),
          { type: "dreamscape" },
        );
      });
    },
    [cardDatabase],
  );

  const ensureDreamJourneyRuntime = useCallback((siteId: string) => {
    setState((prev) => {
      if (prev.siteRuntime[siteId] !== undefined) {
        return prev;
      }
      const site = findSite(prev, siteId);
      const optionCount = site?.isEnhanced ? 3 : 2;
      const optionIds = shuffled(DREAM_JOURNEYS)
        .slice(0, optionCount)
        .map(dreamJourneyOptionId);

      return {
        ...prev,
        siteRuntime: {
          ...prev.siteRuntime,
          [siteId]: {
            kind: "dreamJourney",
            optionIds,
            completed: false,
          },
        },
      };
    });
  }, []);

  const completeDreamJourneyOption = useCallback(
    (siteId: string, optionId: string) => {
      setState((prev) => {
        if (prev.visitedSites.includes(siteId)) {
          return prev;
        }
        const runtime = prev.siteRuntime[siteId];
        if (
          runtime === undefined ||
          runtime.kind !== "dreamJourney" ||
          runtime.completed ||
          !runtime.optionIds.includes(optionId)
        ) {
          return prev;
        }
        const journey = findDreamJourneyOption(optionId);
        if (journey === undefined) {
          return prev;
        }
        const selectedPackageTides = prev.resolvedPackage?.selectedTides ?? [];
        let next = applyDreamJourneyEffect({
          prev,
          effect: journey.effect,
          cardDatabase,
          selectedPackageTides,
          nextEntryId,
        });
        logEvent("dream_journey_chosen", {
          journeyName: journey.name,
          effectType: journey.effect.type,
        });
        const site = findSite(prev, siteId);
        logEvent("site_completed", {
          siteType: "DreamJourney",
          isEnhanced: site?.isEnhanced ?? false,
        });
        next = setQuestScreen(
          completeQuestSite(
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
          ),
          { type: "dreamscape" },
        );
        return next;
      });
    },
    [cardDatabase],
  );

  const pickDraftCard = useCallback(
    (_siteId: string, _cardNumber: number) => {
      throw new Error(
        "pickDraftCard is provided by the multiplayer provider after draft conversion",
      );
    },
    [],
  );

  const addCard = useCallback(
    (cardNumber: number, source: string) => {
      const card = cardDatabase.get(cardNumber);
      const cardName = card?.name ?? `Unknown Card #${String(cardNumber)}`;
      logEvent("card_added", {
        cardNumber,
        cardName,
        source,
      });
      const entryId = nextEntryId();
      setState((prev) => {
        const entry: DeckEntry = {
          entryId,
          cardNumber,
          transfiguration: null,
          isBane: false,
        };
        return { ...prev, deck: [...prev.deck, entry] };
      });
    },
    [cardDatabase],
  );

  const addBaneCard = useCallback(
    (cardNumber: number, source: string) => {
      const card = cardDatabase.get(cardNumber);
      const cardName = card?.name ?? `Unknown Card #${String(cardNumber)}`;
      logEvent("card_added", {
        cardNumber,
        cardName,
        source,
        isBane: true,
      });
      const entryId = nextEntryId();
      setState((prev) => {
        const entry: DeckEntry = {
          entryId,
          cardNumber,
          transfiguration: null,
          isBane: true,
        };
        return { ...prev, deck: [...prev.deck, entry] };
      });
    },
    [cardDatabase],
  );

  const removeCard = useCallback(
    (entryId: string, source: string) => {
      setState((prev) => {
        const entry = prev.deck.find((e) => e.entryId === entryId);
        if (!entry) return prev;
        const card = cardDatabase.get(entry.cardNumber);
        const cardName =
          card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
        logEvent("card_removed", {
          cardNumber: entry.cardNumber,
          cardName,
          source,
        });
        const deck = prev.deck.filter((e) => e.entryId !== entryId);
        return { ...prev, deck };
      });
    },
    [cardDatabase],
  );

  const cleanseBanes = useCallback(
    (
      siteId: string,
      cardEntryIds: string[],
      dreamsignIndices: number[],
    ) => {
      setState((prev) => {
        if (prev.visitedSites.includes(siteId)) {
          return prev;
        }
        const cardIdSelection = new Set(cardEntryIds);
        const baneCardEntryIds = prev.deck
          .filter((entry) => entry.isBane && cardIdSelection.has(entry.entryId))
          .map((entry) => entry.entryId);
        const baneDreamsignIndices = [...new Set(dreamsignIndices)]
          .filter((index) => prev.dreamsigns[index]?.isBane === true)
          .sort((a, b) => a - b);

        // Up to 3 banes total may be removed at a Cleanse site.
        const cappedCardEntryIds = baneCardEntryIds.slice(0, 3);
        const cappedDreamsignIndices = baneDreamsignIndices.slice(
          0,
          Math.max(0, 3 - cappedCardEntryIds.length),
        );
        const cardIdSet = new Set(cappedCardEntryIds);
        const dreamsignIndexSet = new Set(cappedDreamsignIndices);

        const removedCards = prev.deck
          .filter((entry) => cardIdSet.has(entry.entryId))
          .map((entry) => ({
            cardNumber: entry.cardNumber,
            cardName:
              cardDatabase.get(entry.cardNumber)?.name
              ?? `Unknown Card #${String(entry.cardNumber)}`,
          }));
        const removedDreamsigns = prev.dreamsigns
          .filter((_, index) => dreamsignIndexSet.has(index))
          .map((dreamsign) => dreamsign.name);

        logEvent("cleanse_completed", {
          banesRemovedCount: removedCards.length + removedDreamsigns.length,
          removedCards,
          removedDreamsigns,
        });

        return setQuestScreen(
          completeQuestSite(
            {
              ...prev,
              deck: prev.deck.filter(
                (entry) => !cardIdSet.has(entry.entryId),
              ),
              dreamsigns: prev.dreamsigns.filter(
                (_, index) => !dreamsignIndexSet.has(index),
              ),
            },
            siteId,
          ),
          { type: "dreamscape" },
        );
      });
    },
    [cardDatabase],
  );

  const transfigureCard = useCallback(
    (
      entryId: string,
      type: TransfigurationType,
      effectDescription: string,
      effectDetails: Record<string, unknown>,
    ) => {
      setState((prev) => {
        const entry = prev.deck.find((e) => e.entryId === entryId);
        if (!entry) return prev;
        const card = cardDatabase.get(entry.cardNumber);
        const cardName =
          card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
        logEvent("card_transfigured", {
          cardNumber: entry.cardNumber,
          cardName,
          transfigurationType: type,
          effectDescription,
          modifiedFields: effectDetails,
        });
        const deck = prev.deck.map((e) =>
          e.entryId === entryId ? { ...e, transfiguration: type } : e,
        );
        return { ...prev, deck };
      });
    },
    [cardDatabase],
  );

  const setDreamcallerSelection = useCallback(
    (resolvedPackage: ResolvedDreamcallerPackage) => {
      setState((prev) => applyDreamcallerSelection(prev, resolvedPackage));
    },
    [],
  );

  const setCardSourceDebug = useCallback(
    (cardSourceDebug: CardSourceDebugState | null, source: string) => {
      logEvent("card_source_debug_updated", {
        source,
        isVisible: cardSourceDebug !== null,
        screenLabel: cardSourceDebug?.screenLabel ?? null,
        surface: cardSourceDebug?.surface ?? null,
        cardCount: cardSourceDebug?.entries.length ?? 0,
      });
      setState((prev) => applyCardSourceDebug(prev, cardSourceDebug));
    },
    [],
  );

  const addDreamsign = useCallback(
    (dreamsign: Dreamsign, sourceSiteType: string, purgeIndex?: number) => {
      setState((prev) => {
        const purgedDreamsign =
          purgeIndex === undefined ? null : prev.dreamsigns[purgeIndex];
        if (
          (purgeIndex !== undefined && purgedDreamsign == null) ||
          (purgeIndex === undefined &&
            prev.dreamsigns.length >= prev.maxDreamsigns)
        ) {
          return prev;
        }
        if (purgedDreamsign !== null) {
          logEvent("dreamsign_removed", {
            name: purgedDreamsign.name,
            imageName: purgedDreamsign.imageName ?? null,
            reason: "purged_for_new_dreamsign",
          });
        }
        logEvent("dreamsign_acquired", {
          name: dreamsign.name,
          imageName: dreamsign.imageName ?? null,
          isBane: dreamsign.isBane,
          sourceSiteType,
        });
        const dreamsigns =
          purgeIndex === undefined
            ? [...prev.dreamsigns, dreamsign]
            : prev.dreamsigns.map((existing, index) =>
              index === purgeIndex ? dreamsign : existing,
            );
        return { ...prev, dreamsigns };
      });
    },
    [],
  );

  const removeDreamsign = useCallback((index: number, reason: string) => {
    setState((prev) => {
      const dreamsign = prev.dreamsigns[index];
      if (!dreamsign) return prev;
      logEvent("dreamsign_removed", {
        name: dreamsign.name,
        imageName: dreamsign.imageName ?? null,
        reason,
      });
      const dreamsigns = prev.dreamsigns.filter((_, i) => i !== index);
      return { ...prev, dreamsigns };
    });
  }, []);

  const setRemainingDreamsignPool = useCallback(
    (remainingDreamsignPool: string[], source: string) => {
      logEvent("dreamsign_pool_updated", {
        source,
        remainingDreamsignPoolSize: remainingDreamsignPool.length,
        remainingDreamsignPool,
      });
      setState((prev) =>
        applyRemainingDreamsignPool(prev, remainingDreamsignPool),
      );
    },
    [],
  );

  const incrementCompletionLevel = useCallback(
    (
      essenceReward: number,
      omenReward: number,
      rewardCardNumber: number | null,
      rewardCardName: string | null,
      isMiniboss: boolean,
    ) => {
      setState((prev) => {
        const newLevel = prev.completionLevel + 1;
        const newOmens = prev.omens + omenReward;
        logEvent("battle_won", {
          completionLevel: newLevel,
          essenceReward,
          omenReward,
          rewardCardNumber,
          rewardCardName,
          isMiniboss,
        });
        if (omenReward !== 0) {
          logEvent("omens_changed", {
            oldValue: prev.omens,
            newValue: newOmens,
            delta: omenReward,
            source: "battle_reward",
          });
        }
        const screen: Screen =
          newLevel >= 7 ? { type: "questComplete" } : prev.screen;
        if (newLevel >= 7) {
          logEvent("screen_transition", {
            from: screenName(prev.screen),
            to: screenName(screen),
          });
        }
        return {
          ...prev,
          completionLevel: newLevel,
          omens: newOmens,
          screen,
        };
      });
    },
    [],
  );

  const setScreen = useCallback((screen: Screen) => {
    setState((prev) => {
      logEvent("screen_transition", {
        from: screenName(prev.screen),
        to: screenName(screen),
      });
      const activeSiteId =
        screen.type === "site" ? screen.siteId : null;
      return { ...prev, screen, activeSiteId };
    });
  }, []);

  const markSiteVisited = useCallback((siteId: string) => {
    setState((prev) => {
      if (prev.visitedSites.includes(siteId)) return prev;
      logEvent("site_visited", { siteId });
      const updatedNodes = { ...prev.atlas.nodes };
      for (const [nodeId, node] of Object.entries(updatedNodes)) {
        const siteIndex = node.sites.findIndex((s) => s.id === siteId);
        if (siteIndex !== -1) {
          const updatedSites = node.sites.map((s, i) =>
            i === siteIndex ? { ...s, isVisited: true } : s,
          );
          updatedNodes[nodeId] = { ...node, sites: updatedSites };
          break;
        }
      }
      return {
        ...prev,
        visitedSites: [...prev.visitedSites, siteId],
        atlas: { ...prev.atlas, nodes: updatedNodes },
      };
    });
  }, []);

  const setCurrentDreamscape = useCallback((nodeId: string | null) => {
    setState((prev) => {
      if (nodeId !== null) {
        const node = prev.atlas.nodes[nodeId];
        logEvent("dreamscape_entered", {
          dreamscapeId: nodeId,
          biomeName: node?.biomeName ?? "unknown",
        });
      }
      return {
        ...prev,
        currentDreamscape: nodeId,
        visitedSites: nodeId !== null ? [] : prev.visitedSites,
      };
    });
  }, []);

  const updateAtlas = useCallback((atlas: DreamAtlas) => {
    setState((prev) => ({ ...prev, atlas }));
  }, []);

  const setDraftState = useCallback((draftState: DraftState, source: string) => {
    logEvent("draft_state_updated", {
      source,
      pickNumber: draftState.pickNumber,
      sitePicksCompleted: draftState.sitePicksCompleted,
      currentOfferSize: draftState.currentOffer.length,
      remainingCards: countRemainingCards(draftState.remainingCopiesByCard),
      remainingUniqueCards: countRemainingUniqueCards(draftState.remainingCopiesByCard),
    });
    setState((prev) => applyDraftState(prev, draftState));
  }, []);

  const setFailureSummary = useCallback(
    (failureSummary: QuestFailureSummary | null, source: string) => {
      logEvent("quest_failure_summary_updated", {
        source,
        isPresent: failureSummary !== null,
        battleId: failureSummary?.battleId ?? null,
        result: failureSummary?.result ?? null,
        siteId: failureSummary?.siteId ?? null,
        dreamscapeIdOrNone: failureSummary?.dreamscapeIdOrNone ?? null,
      });
      setState((prev) => ({
        ...prev,
        failureSummary: failureSummary === null ? null : { ...failureSummary },
      }));
    },
    [],
  );

  const dismissStartingDeckPopup = useCallback(() => {
    setState((prev) => {
      if (prev.hasSeenStartingDeckPopup) {
        return prev;
      }
      logEvent("starting_deck_popup_dismissed", {
        deckSize: prev.deck.length,
      });
      return { ...prev, hasSeenStartingDeckPopup: true };
    });
  }, []);

  const bootstrapStartInBattle = useCallback(() => {
    setState((prev) => {
      if (prev.dreamcaller !== null) {
        return prev;
      }
      return createStartInBattleState(questContent) ?? prev;
    });
  }, [questContent]);

  const resetQuest = useCallback(() => {
    // Ordering invariant: `resetLog()` clears the ring buffer before any
    // dependent reset hooks run so downstream subscribers (bridge, queries)
    // observe the cleared log. `resetBattleCompletionBridge` is intentionally
    // silent today — if it ever starts emitting a reset event, either reorder
    // this so `resetLog()` happens last, or log `quest_reset` before wiping so
    // the reset sequence stays visible.
    resetLog();
    entryIdCounter.current = 0;
    resetBattleCompletionBridge();
    clearPersistedQuestState();
    logEvent("quest_reset", {
      remainingDreamsignPoolSize: 0,
      hasResolvedPackage: false,
      hasDraftState: false,
    });
    setState(createDefaultState());
  }, []);

  const mutations = useMemo<QuestMutations>(
    () => ({
      changeEssence,
      startQuest,
      completeSite,
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      rejectDreamsignOffer,
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
      pickDraftCard,
      addCard,
      addBaneCard,
      removeCard,
      cleanseBanes,
      transfigureCard,
      setDreamcallerSelection,
      setCardSourceDebug,
      addDreamsign,
      removeDreamsign,
      setRemainingDreamsignPool,
      incrementCompletionLevel,
      setScreen,
      markSiteVisited,
      setCurrentDreamscape,
      updateAtlas,
      setDraftState,
      setFailureSummary,
      dismissStartingDeckPopup,
      bootstrapStartInBattle,
      resetQuest,
    }),
    [
      changeEssence,
      startQuest,
      completeSite,
      ensureRewardSiteRuntime,
      acceptRewardSite,
      ensureDreamsignOfferRuntime,
      acceptDreamsignOffer,
      rejectDreamsignOffer,
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
      pickDraftCard,
      addCard,
      addBaneCard,
      removeCard,
      cleanseBanes,
      transfigureCard,
      setDreamcallerSelection,
      setCardSourceDebug,
      addDreamsign,
      removeDreamsign,
      setRemainingDreamsignPool,
      incrementCompletionLevel,
      setScreen,
      markSiteVisited,
      setCurrentDreamscape,
      updateAtlas,
      setDraftState,
      setFailureSummary,
      dismissStartingDeckPopup,
      bootstrapStartInBattle,
      resetQuest,
    ],
  );

  const value = useMemo<QuestContextValue>(
    () => ({ state, mutations, cardDatabase, questContent }),
    [state, mutations, cardDatabase, questContent],
  );

  return <QuestContextProvider value={value}>{children}</QuestContextProvider>;
}

/** Hook to access the quest state and mutation functions. */
export function useQuest(): QuestContextValue {
  const context = useContext(QuestContext);
  if (context === null) {
    throw new Error("useQuest must be used within a QuestProvider");
  }
  return context;
}
