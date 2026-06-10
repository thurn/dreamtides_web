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
import { mergeCardKeywordModification } from "../card-type-change";
import type { CardData } from "../types/cards";
import type {
  DreamcallerContent,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type {
  BattleModifier,
  CardKeywordModification,
  CardTypeChange,
  CardSourceDebugState,
  CardChoiceSiteRuntime,
  CardChoiceTransfigurationOffer,
  DeckEntry,
  DreamAtlas,
  DreamJourneySiteRuntime,
  Dreamsign,
  DreamscapeModifier,
  EssenceSiteRuntime,
  QuestFailureSummary,
  QuestState,
  RewardSiteRuntime,
  Screen,
  ShopSiteRuntime,
  SiteState,
  SiteType,
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
  addSiteToCurrentDreamscape,
  clampEssence,
  completeQuestSite,
  setQuestScreen,
  startQuestFromDreamcaller,
} from "./quest-state-actions";
import { generateRewardSiteData } from "../rewards/reward-generator";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";
import {
  effectivePrice,
  generateShopInventory,
  replayShopDraftState,
  rerollCost,
  shopSlotsToRuntime,
} from "../shop/shop-generator";
import {
  assignTransfiguration,
  transfigurationEffectDetails,
} from "../transfiguration/transfiguration-logic";
import {
  resolveMerchantCommit,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "../journey_v2";
import type {
  MerchantAcceptRequest,
  MerchantApplyPayload,
  MerchantCommitRequest,
  MerchantDeclineRequest,
  MerchantOfferActionResult,
} from "../journey_v2";

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
  /**
   * Marks a Dream Journey site as completed and returns to the dreamscape.
   * The journey screen is responsible for any narrative interaction; the
   * mutation itself applies no deck or resource changes — it lazily ensures
   * a runtime slot exists, flips the `completed` flag, and walks the
   * visit-tracking bookkeeping.
   */
  completeDreamJourneySite: (siteId: string) => void;
  /**
   * Records a commit to a `hiddenUntilCommit` offer. Validates the encounter
   * signature, verifies the offer is hidden, writes
   * `merchantCommittedOfferId` into `siteRuntime[siteId]`, and forfeits the
   * other offer. The site is NOT completed — the player must follow up with
   * `acceptDreamMerchantOffer` to pick from the revealed candidate set.
   */
  commitDreamMerchantOffer: (
    siteId: string,
    request: MerchantCommitRequest,
  ) => MerchantOfferActionResult | void;
  acceptDreamMerchantOffer: (
    siteId: string,
    request: MerchantAcceptRequest,
  ) => MerchantOfferActionResult | void;
  declineDreamMerchant: (
    siteId: string,
    request: MerchantDeclineRequest,
  ) => void;
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
  /**
   * Apply a transfiguration to a deck entry, or clear it when `type` is
   * `null`. The null variant supports Dream Journey reward templates that
   * "remove transfiguration"; `effectDescription` is the upstream source
   * string and `effectDetails` is forwarded into the `card_transfigured`
   * log payload.
   */
  transfigureCard: (
    entryId: string,
    type: TransfigurationType | null,
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

  // ---- Dream Journey effect plumbing (Wave 1) ----
  /** Adjust omens by `delta`; clamps at 0 (omens are uncapped above). */
  changeOmens: (delta: number, source: string) => void;
  /** Set essence to `value`, clamped to `[0, essenceCap]`. */
  setEssence: (value: number, source: string) => void;
  /** Add `delta` to `essenceCap`; current essence clamps to the new cap. */
  changeMaxEssence: (delta: number, source: string) => void;
  /**
   * Add a non-bane card to the deck by catalog `cardId`. Mirrors `addCard`,
   * but resolves the catalog id internally by linear-scanning the small
   * card database (the same pattern `pushTemporaryBaneGrant` uses). On a
   * miss this no-ops and logs a console warning.
   */
  addCardById: (cardId: string, source: string) => string | null;
  addCardByIdWithTransfiguration: (
    cardId: string,
    type: TransfigurationType,
    source: string,
  ) => string | null;
  /** Add a bane-flagged card to the deck by catalog `cardId`. Same lookup
   *  semantics as `addCardById`. */
  addBaneCardById: (cardId: string, source: string) => void;
  /** Remove the deck entry with the given entryId. Mirrors `removeCard`. */
  removeDeckEntry: (entryId: string, source: string) => void;
  /** Add a duplicate of the deck entry with the given entryId. */
  duplicateDeckEntry: (entryId: string, source: string) => void;
  changeDeckEntryType: (
    entryId: string,
    typeChange: CardTypeChange,
    source: string,
  ) => void;
  changeDeckEntryKeywords: (
    entryId: string,
    keywordModification: CardKeywordModification,
    source: string,
  ) => void;
  /**
   * Remove up to `count` bane cards from the deck via uniform random
   * selection (using `Math.random`). When fewer banes exist than `count`,
   * all of them are removed; non-positive counts no-op.
   */
  purgeRandomBaneCards: (count: number, source: string) => void;
  /** Remove every bane card from the deck. */
  purgeAllBaneCards: (source: string) => void;
  /**
   * Stack a battle-window reward-reduction modifier. Decremented per battle
   * in `incrementCompletionLevel`; entries at zero drop.
   */
  pushBattleRewardModifier: (
    kind: "flat" | "percent",
    amount: number,
    battles: number,
    source: string,
  ) => void;
  /**
   * Add `count` bane cards by name to the deck immediately and stack a
   * `temporary_bane_grant` modifier that removes the added entries when its
   * `battlesRemaining` counter reaches zero. The bane's catalog cardNumber
   * is resolved via `questContent.cardDatabase`; an unknown name no-ops.
   */
  pushTemporaryBaneGrant: (
    baneName: string,
    count: number,
    battles: number,
    source: string,
  ) => void;
  /**
   * Add a fresh, unvisited site of `siteType` to either the current
   * dreamscape (`"current"`) or the dreamscape adjacent to the current one
   * via the atlas edge list (`"next"`). No-ops when the target dreamscape
   * cannot be located.
   */
  addSiteToDreamscape: (
    placement: "current" | "next",
    siteType: SiteType,
    source: string,
  ) => void;
  /**
   * Swap one unvisited site of `from` for a fresh site of `to` in the
   * current dreamscape. No-ops when no eligible site exists.
   */
  replaceSiteType: (
    from: SiteType,
    to: SiteType,
    source: string,
  ) => void;
  /**
   * Stack a dreamscape-window modifier that hides every site of `siteType`
   * for the next `dreamscapes` dreamscapes the player enters. The atlas
   * generator consumes the modifier during future site composition. Only
   * `"Shop"` and `"DreamsignOffering"` map to a dreamscape-modifier kind;
   * the type is narrowed here so unsupported site types fail at compile time.
   */
  removeSiteTypeFromNextDreamscapes: (
    siteType: "Shop" | "DreamsignOffering",
    dreamscapes: number,
    source: string,
  ) => void;
  /** Increment `shopModifiers.freeRerolls` by `count`. */
  grantFreeShopRerolls: (count: number, source: string) => void;
  /** Add `percent` to `shopModifiers.essenceDiscountPercent`. */
  applyShopEssenceDiscount: (percent: number, source: string) => void;
  /** Increment `shopModifiers.upcomingOmenDiscounts` by `count`. */
  grantShopOmenDiscounts: (count: number, source: string) => void;
  /**
   * Stack a `boost_site_appearance` modifier for the next `dreamscapes`
   * dreamscapes; atlas generation consumes it during future site composition.
   */
  boostSiteAppearance: (
    siteType: SiteType,
    percent: number,
    dreamscapes: number,
    source: string,
  ) => void;
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
  itemType: "card" | "dreamsign";
  basePrice: number;
  discountPercent: number;
}, modifiers: {
  essenceDiscountPercent: number;
  upcomingOmenDiscounts?: number;
}): number {
  return effectivePrice(slot, modifiers);
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

function merchantRequestLogFields(
  siteId: string,
  request: MerchantAcceptRequest | MerchantDeclineRequest | MerchantCommitRequest,
): Record<string, unknown> {
  return {
    siteId,
    offerId: request.offerId,
    archetypeId: "archetypeId" in request ? request.archetypeId : null,
    choiceId: "choice" in request ? (request.choice?.choiceId ?? null) : null,
  };
}

function merchantPayloadLogFields(
  payload: MerchantApplyPayload,
): Record<string, unknown> {
  const cardUuids = new Set<string>();
  const cardNumbers = new Set<number>();
  const entryIds = new Set<string>();
  const dreamsignIds = new Set<string>();
  const payloadKinds: string[] = [];

  const collect = (current: MerchantApplyPayload): void => {
    payloadKinds.push(current.kind);
    switch (current.kind) {
      case "add_catalog_card":
        cardUuids.add(current.cardUuid);
        cardNumbers.add(current.cardNumber);
        break;
      case "add_dreamsign":
        dreamsignIds.add(current.dreamsignId);
        break;
      case "transfigure_deck_entry":
      case "duplicate_deck_entry":
      case "remove_deck_entry":
      case "change_deck_entry_keywords":
      case "change_deck_entry_type":
        cardUuids.add(current.cardUuid);
        cardNumbers.add(current.cardNumber);
        entryIds.add(current.entryId);
        break;
      case "add_site":
        break;
      case "composite":
        for (const child of current.children) {
          collect(child);
        }
        break;
    }
  };

  collect(payload);
  return {
    payloadKind: payload.kind,
    payloadKinds,
    cardUuids: [...cardUuids],
    cardNumbers: [...cardNumbers],
    entryIds: [...entryIds],
    dreamsignIds: [...dreamsignIds],
  };
}

function shuffled<T>(items: readonly T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

/**
 * Walk every site in the atlas and synthesize a fresh `site-<n>` id whose
 * numeric suffix exceeds every existing one. Used by Dream Journey effects
 * that inject new sites into a live atlas; the prototype's atlas generator
 * uses a module-scoped counter that is not safe to mix with player-driven
 * mutations, so we derive the next id from current state instead.
 */
function nextSiteIdFromAtlas(atlas: DreamAtlas): string {
  let max = 0;
  for (const node of Object.values(atlas.nodes)) {
    for (const site of node.sites) {
      const match = /^site-(\d+)$/.exec(site.id);
      if (match !== null) {
        const num = Number.parseInt(match[1], 10);
        if (Number.isFinite(num) && num > max) {
          max = num;
        }
      }
    }
  }
  return `site-${String(max + 1)}`;
}

/**
 * Locate the dreamscape adjacent to the current one via the atlas edge list.
 * Returns `null` when there is no current dreamscape, no forward-facing edges
 * touch it, or the connected node id is missing from the atlas. Already-
 * completed neighbours are skipped so the player never receives sites in
 * dreamscapes they cannot re-enter. The first edge order wins so the choice
 * is deterministic for the caller.
 */
function findNextDreamscapeId(atlas: DreamAtlas, currentId: string | null): string | null {
  if (currentId === null) {
    return null;
  }
  for (const [a, b] of atlas.edges) {
    const other = a === currentId ? b : b === currentId ? a : null;
    if (other === null) continue;
    const neighbour = atlas.nodes[other];
    if (neighbour !== undefined && neighbour.status !== "completed") {
      return other;
    }
  }
  return null;
}

/** Insert `site` into the node identified by `nodeId`. */
function atlasWithAddedSite(
  atlas: DreamAtlas,
  nodeId: string,
  site: SiteState,
): DreamAtlas {
  const node = atlas.nodes[nodeId];
  if (node === undefined) return atlas;
  return {
    ...atlas,
    nodes: {
      ...atlas.nodes,
      [nodeId]: { ...node, sites: [...node.sites, site] },
    },
  };
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

export function createDefaultState(): QuestState {
  return {
    seed: "default",
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
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
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
          entries: cardSourceDebug.entries.map((entry) => ({ ...entry })),
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
    aiMode: false,
    basicAutomation: false,
    gameId: null,
    databaseMode: "emulator",
    journeyVariant: "classic",
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

        if (next.resolvedPackage !== null) {
          initializeDraftState(cardDatabase, next.resolvedPackage);
        }
        if (next.draftState !== null) {
          logEvent("draft_state_updated", {
            source: "quest_start",
            pickNumber: next.draftState.pickNumber,
            sitePicksCompleted: next.draftState.sitePicksCompleted,
            currentOfferSize: next.draftState.currentOffer.length,
            ...(next.draftState.mode === "pool"
              ? {
                  remainingCards: countRemainingCards(
                    next.draftState.remainingCopiesByCard,
                  ),
                  remainingUniqueCards: countRemainingUniqueCards(
                    next.draftState.remainingCopiesByCard,
                  ),
                }
              : {}),
          });
        }

        logEvent("quest_started", {
          initialEssence: next.essence,
          startingDeckSize: next.deck.length,
          dreamcallerId: dreamcaller.id,
          dreamcallerName: dreamcaller.name,
          draftPoolSize: next.resolvedPackage?.draftPoolSize ?? 0,
          dreamsignPoolSize:
            next.resolvedPackage?.dreamsignPoolIds.length ?? 0,
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

        const site = findSite(prev, siteId);
        const revealed = drawDreamsignOptions(
          prev.remainingDreamsignPool,
          questContent.dreamsignTemplates,
          optionCount,
          prev.resolvedPackage?.dreamsignPoolIds ?? [],
        );
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

        // The deck-fit draft modes (replay, fresh20) have no card multiset;
        // shops draw from a transient pool built from the package's idf3 draft
        // pool, and the live draft state is preserved unchanged on write-back.
        const isDeckFitDraft =
          prev.draftState?.mode === "replay"
          || prev.draftState?.mode === "fresh20";
        const shopDraftState = isDeckFitDraft
          ? replayShopDraftState(prev.resolvedPackage)
          : prev.draftState;
        const generated = generateShopInventory({
          cardDatabase,
          draftState: shopDraftState,
          remainingDreamsignPoolIds: prev.remainingDreamsignPool,
          dreamsignTemplates: questContent.dreamsignTemplates,
          dreamsignRegenerationPoolIds:
            prev.resolvedPackage?.dreamsignPoolIds ?? [],
          starterDecklistCardNumbers: specialtyOnly
            ? (prev.resolvedPackage?.starterDecklistCardNumbers ?? [])
            : undefined,
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
        };

        return {
          ...prev,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          // Pool mode persists the spent multiset; the deck-fit modes keep their
          // own draft state (the transient shop pool is discarded).
          draftState: isDeckFitDraft ? prev.draftState : generated.draftState,
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

        const priceBeforeOmenDiscount = runtimeSlotPrice(slot, {
          essenceDiscountPercent: prev.shopModifiers.essenceDiscountPercent,
        });
        const price = runtimeSlotPrice(slot, {
          essenceDiscountPercent: prev.shopModifiers.essenceDiscountPercent,
          upcomingOmenDiscounts: prev.shopModifiers.upcomingOmenDiscounts,
        });
        // Cards cost essence; Dreamsigns cost omens.
        const payInOmens = slot.itemType === "dreamsign";
        const omenDiscountApplied = payInOmens && price < priceBeforeOmenDiscount;
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
          const upcomingOmenDiscounts = omenDiscountApplied
            ? prev.shopModifiers.upcomingOmenDiscounts - 1
            : prev.shopModifiers.upcomingOmenDiscounts;
          logEvent("omens_changed", {
            oldValue: prev.omens,
            newValue: newOmens,
            delta: -price,
            source: "shop_purchase",
          });
          next = {
            ...next,
            omens: newOmens,
            shopModifiers: {
              ...prev.shopModifiers,
              upcomingOmenDiscounts,
            },
          };
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
            omenDiscountApplied,
            upcomingOmenDiscountsRemaining:
              next.shopModifiers.upcomingOmenDiscounts,
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

        // Free-reroll grants from Dream Journey rewards consume before any
        // omen cost would be charged; only fall back to omens when the
        // free-reroll bank is empty.
        const useFreeReroll = prev.shopModifiers.freeRerolls > 0;
        const cost = useFreeReroll ? 0 : rerollCost(0, site.isEnhanced);
        if (!useFreeReroll && cost > prev.omens) {
          return prev;
        }

        // The deck-fit draft modes (replay, fresh20) have no card multiset; the
        // reroll draws from a transient pool built from the package's idf3 draft
        // pool and the live draft state is preserved unchanged on write-back.
        const isDeckFitDraft =
          prev.draftState?.mode === "replay"
          || prev.draftState?.mode === "fresh20";
        const shopDraftState = isDeckFitDraft
          ? replayShopDraftState(prev.resolvedPackage)
          : prev.draftState;
        const generated = generateShopInventory({
          cardDatabase,
          draftState: shopDraftState,
          remainingDreamsignPoolIds: runtime.remainingDreamsignPoolIds,
          dreamsignTemplates: questContent.dreamsignTemplates,
          dreamsignRegenerationPoolIds:
            prev.resolvedPackage?.dreamsignPoolIds ?? [],
          starterDecklistCardNumbers:
            site.type === "SpecialtyShop"
              ? (prev.resolvedPackage?.starterDecklistCardNumbers ?? [])
              : undefined,
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
        const newOmens = useFreeReroll ? prev.omens : prev.omens - cost;
        if (!useFreeReroll) {
          logEvent("omens_changed", {
            oldValue: prev.omens,
            newValue: newOmens,
            delta: -cost,
            source: "shop_reroll",
          });
        }
        logEvent("shop_reroll", {
          rerollCost: cost,
          rerollCount,
          freeReroll: useFreeReroll,
        });
        logEvent("dreamsign_pool_updated", {
          source: "shop_reroll_revealed",
          remainingDreamsignPoolSize:
            generated.remainingDreamsignPoolIds.length,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
        });

        const nextShopModifiers = useFreeReroll
          ? {
            ...prev.shopModifiers,
            freeRerolls: prev.shopModifiers.freeRerolls - 1,
          }
          : prev.shopModifiers;

        return {
          ...prev,
          omens: newOmens,
          remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          // Pool mode persists the spent multiset; the deck-fit modes keep their
          // own draft state (the transient shop pool is discarded).
          draftState: isDeckFitDraft ? prev.draftState : generated.draftState,
          shopModifiers: nextShopModifiers,
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

  const completeDreamJourneySite = useCallback((siteId: string) => {
    setState((prev) => {
      if (prev.visitedSites.includes(siteId)) {
        return prev;
      }
      const existingRuntime = prev.siteRuntime[siteId];
      if (
        existingRuntime !== undefined &&
        (existingRuntime.kind !== "dreamJourney" || existingRuntime.completed)
      ) {
        return prev;
      }
      const runtime: DreamJourneySiteRuntime =
        existingRuntime?.kind === "dreamJourney"
          ? existingRuntime
          : { kind: "dreamJourney", completed: false };
      const site = findSite(prev, siteId);
      logEvent("site_completed", {
        siteType: "DreamJourney",
        isEnhanced: site?.isEnhanced ?? false,
      });
      return setQuestScreen(
        completeQuestSite(
          {
            ...prev,
            siteRuntime: {
              ...prev.siteRuntime,
              [siteId]: { ...runtime, completed: true },
            },
          },
          siteId,
        ),
        { type: "dreamscape" },
      );
    });
  }, []);

  const commitDreamMerchantOffer = useCallback(
    (siteId: string, request: MerchantCommitRequest) => {
      let outcome: MerchantOfferActionResult = { ok: true };
      setState((prev) => {
        const site = findSite(prev, siteId);
        if (site === null) {
          outcome = { ok: false, reason: "site_unavailable" };
          logEvent("merchant_offer_validation_failed", {
            ...merchantRequestLogFields(siteId, request),
            reason: "site_unavailable",
          });
          return prev;
        }

        const result = resolveMerchantCommit({
          state: prev,
          questContent,
          site,
          request,
        });
        if (!result.ok) {
          outcome = { ok: false, reason: result.reason };
          logEvent("merchant_offer_validation_failed", {
            ...merchantRequestLogFields(siteId, request),
            reason: result.reason,
          });
          return prev;
        }

        outcome = { ok: true };
        logEvent("merchant_offer_committed", {
          ...merchantRequestLogFields(siteId, request),
          archetypeId: result.offer.archetypeId,
          targetKey: result.offer.targetKey,
        });
        return result.state;
      });
      return outcome;
    },
    [questContent],
  );

  const acceptDreamMerchantOffer = useCallback(
    (siteId: string, request: MerchantAcceptRequest) => {
      let outcome: MerchantOfferActionResult = { ok: true };
      setState((prev) => {
        const site = findSite(prev, siteId);
        if (site === null) {
          outcome = { ok: false, reason: "site_unavailable" };
          logEvent("merchant_offer_validation_failed", {
            ...merchantRequestLogFields(siteId, request),
            reason: "site_unavailable",
          });
          return prev;
        }

        const result = resolveMerchantOffer({
          state: prev,
          questContent,
          site,
          request,
        });
        if (!result.ok) {
          outcome = { ok: false, reason: result.reason };
          logEvent("merchant_offer_validation_failed", {
            ...merchantRequestLogFields(siteId, request),
            reason: result.reason,
          });
          return prev;
        }

        outcome = { ok: true };
        logEvent("merchant_offer_accepted", {
          ...merchantRequestLogFields(siteId, request),
          archetypeId: result.offer.archetypeId,
          targetKey: result.offer.targetKey,
          ...merchantPayloadLogFields(result.appliedPayload),
        });
        entryIdCounter.current = deriveEntryIdCounter(result.state.deck);
        return result.state;
      });
      return outcome;
    },
    [questContent],
  );

  const declineDreamMerchant = useCallback(
    (siteId: string, request: MerchantDeclineRequest) => {
      setState((prev) => {
        const site = findSite(prev, siteId);
        if (site === null) {
          logEvent("merchant_offer_validation_failed", {
            ...merchantRequestLogFields(siteId, request),
            reason: "site_unavailable",
          });
          return prev;
        }

        const result = resolveMerchantDecline({
          state: prev,
          questContent,
          site,
          request,
        });
        if (!result.ok) {
          logEvent("merchant_offer_validation_failed", {
            ...merchantRequestLogFields(siteId, request),
            reason: result.reason,
          });
          return prev;
        }

        logEvent("merchant_offer_declined", {
          ...merchantRequestLogFields(siteId, request),
        });
        return result.state;
      });
    },
    [questContent],
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
      type: TransfigurationType | null,
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

  const changeDeckEntryType = useCallback(
    (entryId: string, typeChange: CardTypeChange, source: string) => {
      setState((prev) => {
        const entry = prev.deck.find((e) => e.entryId === entryId);
        if (!entry) return prev;
        const card = cardDatabase.get(entry.cardNumber);
        const cardName =
          card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
        logEvent("card_type_changed", {
          cardNumber: entry.cardNumber,
          cardName,
          entryId,
          source,
          predicateId: typeChange.predicateId,
          cardType: typeChange.cardType,
          subtype: typeChange.subtype,
          label: typeChange.label,
        });
        const deck = prev.deck.map((e) =>
          e.entryId === entryId ? { ...e, typeChange } : e,
        );
        return { ...prev, deck };
      });
    },
    [cardDatabase],
  );

  const changeDeckEntryKeywords = useCallback(
    (
      entryId: string,
      keywordModification: CardKeywordModification,
      source: string,
    ) => {
      setState((prev) => {
        const entry = prev.deck.find((e) => e.entryId === entryId);
        if (!entry) return prev;
        const card = cardDatabase.get(entry.cardNumber);
        const cardName =
          card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
        const nextKeywordModification = mergeCardKeywordModification(
          entry.keywordModification,
          keywordModification,
        );
        logEvent("card_keywords_changed", {
          cardNumber: entry.cardNumber,
          cardName,
          entryId,
          source,
          keywords: nextKeywordModification,
        });
        const deck = prev.deck.map((e) =>
          e.entryId === entryId
            ? { ...e, keywordModification: nextKeywordModification }
            : e,
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

        // Decay battle-window modifiers. `incrementCompletionLevel` only fires
        // on a completed battle (see battle-completion-bridge), so an
        // unconditional decrement here matches "drops at zero on the same
        // tick" semantics. Temporary bane grants additionally purge the deck
        // entries they brought in when their counter hits zero.
        const droppedBaneEntryIds = new Set<string>();
        const nextBattleModifiers: BattleModifier[] = [];
        for (const modifier of prev.battleModifiers) {
          const remaining = modifier.battlesRemaining - 1;
          if (remaining <= 0) {
            if (modifier.kind === "temporary_bane_grant") {
              for (const entryId of modifier.addedEntryIds) {
                droppedBaneEntryIds.add(entryId);
              }
            }
            continue;
          }
          nextBattleModifiers.push({ ...modifier, battlesRemaining: remaining });
        }
        const nextDeck =
          droppedBaneEntryIds.size === 0
            ? prev.deck
            : prev.deck.filter(
              (entry) => !droppedBaneEntryIds.has(entry.entryId),
            );

        return {
          ...prev,
          completionLevel: newLevel,
          omens: newOmens,
          screen,
          battleModifiers: nextBattleModifiers,
          deck: nextDeck,
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

      // Decay dreamscape-window modifiers when the player moves to a
      // different dreamscape. Re-selecting the same dreamscape (a no-op
      // navigation) does not decrement counters.
      const isAdvancing = nodeId !== null && nodeId !== prev.currentDreamscape;
      const nextDreamscapeModifiers = isAdvancing
        ? prev.dreamscapeModifiers
          .map((modifier) => ({
            ...modifier,
            dreamscapesRemaining: modifier.dreamscapesRemaining - 1,
          }))
          .filter((modifier) => modifier.dreamscapesRemaining > 0)
        : prev.dreamscapeModifiers;

      return {
        ...prev,
        currentDreamscape: nodeId,
        visitedSites: nodeId !== null ? [] : prev.visitedSites,
        dreamscapeModifiers: nextDreamscapeModifiers,
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
      ...(draftState.mode === "pool"
        ? {
            remainingCards: countRemainingCards(draftState.remainingCopiesByCard),
            remainingUniqueCards: countRemainingUniqueCards(
              draftState.remainingCopiesByCard,
            ),
          }
        : {}),
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

  // ---- Dream Journey effect plumbing (Wave 1) ---------------------------

  const changeOmens = useCallback((delta: number, source: string) => {
    setState((prev) => {
      const oldValue = prev.omens;
      const newValue = Math.max(0, oldValue + delta);
      logEvent("omens_changed", {
        oldValue,
        newValue,
        delta,
        source,
      });
      return { ...prev, omens: newValue };
    });
  }, []);

  const setEssence = useCallback((value: number, source: string) => {
    setState((prev) => {
      const oldValue = prev.essence;
      const newValue = clampEssence(value, prev.essenceCap);
      logEvent("essence_changed", {
        oldValue,
        newValue,
        delta: newValue - oldValue,
        source,
      });
      return { ...prev, essence: newValue };
    });
  }, []);

  const changeMaxEssence = useCallback((delta: number, source: string) => {
    setState((prev) => {
      const oldCap = prev.essenceCap;
      const newCap = Math.max(0, oldCap + delta);
      const clampedEssence = clampEssence(prev.essence, newCap);
      logEvent("max_essence_changed", {
        oldValue: oldCap,
        newValue: newCap,
        delta,
        source,
      });
      const next: QuestState = {
        ...prev,
        essenceCap: newCap,
        essence: clampedEssence,
      };
      if (clampedEssence !== prev.essence) {
        logEvent("essence_changed", {
          oldValue: prev.essence,
          newValue: clampedEssence,
          delta: clampedEssence - prev.essence,
          source: "max_essence_clamp",
        });
      }
      return next;
    });
  }, []);

  const addCardById = useCallback(
    (cardId: string, source: string) => {
      // Iterate the small cardDatabase to resolve `cardId` → `cardNumber`.
      // This mirrors `pushTemporaryBaneGrant`; quest content is well under
      // 1k entries so a parallel reverse index is unnecessary.
      let resolved: CardData | null = null;
      for (const candidate of cardDatabase.values()) {
        if (candidate.id === cardId) {
          resolved = candidate;
          break;
        }
      }
      if (resolved === null) {
        console.warn(
          `[quest-context] addCardById: unknown cardId '${cardId}' (source: ${source})`,
        );
        return null;
      }
      const cardNumber = resolved.cardNumber;
      logEvent("card_added", {
        cardNumber,
        cardName: resolved.name,
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
      return entryId;
    },
    [cardDatabase],
  );

  const addCardByIdWithTransfiguration = useCallback(
    (cardId: string, type: TransfigurationType, source: string) => {
      let resolved: CardData | null = null;
      for (const candidate of cardDatabase.values()) {
        if (candidate.id === cardId) {
          resolved = candidate;
          break;
        }
      }
      if (resolved === null) {
        console.warn(
          `[quest-context] addCardByIdWithTransfiguration: unknown cardId '${cardId}' (source: ${source})`,
        );
        return null;
      }
      const cardNumber = resolved.cardNumber;
      logEvent("card_added", {
        cardNumber,
        cardName: resolved.name,
        source,
        transfigurationType: type,
      });
      const entryId = nextEntryId();
      setState((prev) => {
        const entry: DeckEntry = {
          entryId,
          cardNumber,
          transfiguration: type,
          isBane: false,
        };
        return { ...prev, deck: [...prev.deck, entry] };
      });
      return entryId;
    },
    [cardDatabase],
  );

  const addBaneCardById = useCallback(
    (cardId: string, source: string) => {
      let resolved: CardData | null = null;
      for (const candidate of cardDatabase.values()) {
        if (candidate.id === cardId) {
          resolved = candidate;
          break;
        }
      }
      if (resolved === null) {
        console.warn(
          `[quest-context] addBaneCardById: unknown cardId '${cardId}' (source: ${source})`,
        );
        return;
      }
      const cardNumber = resolved.cardNumber;
      logEvent("card_added", {
        cardNumber,
        cardName: resolved.name,
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

  const removeDeckEntry = useCallback(
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

  const duplicateDeckEntry = useCallback(
    (entryId: string, source: string) => {
      const newEntryId = nextEntryId();
      setState((prev) => {
        const entry = prev.deck.find((e) => e.entryId === entryId);
        if (!entry) return prev;
        const card = cardDatabase.get(entry.cardNumber);
        const cardName =
          card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
        logEvent("card_added", {
          cardNumber: entry.cardNumber,
          cardName,
          source,
          duplicatedFrom: entryId,
        });
        const copy: DeckEntry = {
          entryId: newEntryId,
          cardNumber: entry.cardNumber,
          transfiguration: entry.transfiguration,
          ...(entry.typeChange == null ? {} : { typeChange: entry.typeChange }),
          ...(entry.keywordModification == null
            ? {}
            : { keywordModification: entry.keywordModification }),
          isBane: entry.isBane,
        };
        return { ...prev, deck: [...prev.deck, copy] };
      });
    },
    [cardDatabase],
  );

  const purgeRandomBaneCards = useCallback(
    (count: number, source: string) => {
      if (count <= 0) return;
      setState((prev) => {
        const baneIndices: number[] = [];
        prev.deck.forEach((entry, index) => {
          if (entry.isBane) {
            baneIndices.push(index);
          }
        });
        if (baneIndices.length === 0) return prev;
        // Fisher-Yates partial shuffle to pick `min(count, baneIndices.length)`
        // entries uniformly at random.
        const target = Math.min(count, baneIndices.length);
        for (let i = 0; i < target; i += 1) {
          const j = i + Math.floor(Math.random() * (baneIndices.length - i));
          [baneIndices[i], baneIndices[j]] = [baneIndices[j], baneIndices[i]];
        }
        const removed = new Set(baneIndices.slice(0, target));
        const deck = prev.deck.filter((_, index) => !removed.has(index));
        for (const index of removed) {
          const entry = prev.deck[index];
          if (entry === undefined) continue;
          const card = cardDatabase.get(entry.cardNumber);
          const cardName =
            card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
          logEvent("card_removed", {
            cardNumber: entry.cardNumber,
            cardName,
            source,
            isBane: true,
          });
        }
        return { ...prev, deck };
      });
    },
    [cardDatabase],
  );

  const purgeAllBaneCards = useCallback(
    (source: string) => {
      setState((prev) => {
        if (!prev.deck.some((entry) => entry.isBane)) return prev;
        for (const entry of prev.deck) {
          if (!entry.isBane) continue;
          const card = cardDatabase.get(entry.cardNumber);
          const cardName =
            card?.name ?? `Unknown Card #${String(entry.cardNumber)}`;
          logEvent("card_removed", {
            cardNumber: entry.cardNumber,
            cardName,
            source,
            isBane: true,
          });
        }
        return {
          ...prev,
          deck: prev.deck.filter((entry) => !entry.isBane),
        };
      });
    },
    [cardDatabase],
  );

  const pushBattleRewardModifier = useCallback(
    (
      kind: "flat" | "percent",
      amount: number,
      battles: number,
      source: string,
    ) => {
      setState((prev) => {
        const modifier: BattleModifier =
          kind === "flat"
            ? {
              kind: "reward_reduction_flat",
              amount,
              battlesRemaining: battles,
              source,
            }
            : {
              kind: "reward_reduction_percent",
              percent: amount,
              battlesRemaining: battles,
              source,
            };
        logEvent("battle_modifier_pushed", {
          kind: modifier.kind,
          amount,
          battles,
          source,
        });
        return {
          ...prev,
          battleModifiers: [...prev.battleModifiers, modifier],
        };
      });
    },
    [],
  );

  const pushTemporaryBaneGrant = useCallback(
    (baneName: string, count: number, battles: number, source: string) => {
      // Resolve the bane name to a catalog cardNumber. Iterating the small
      // cardDatabase map per call is fine — quest content has under 1k
      // entries — and avoids maintaining a parallel name → number index just
      // for the rare temporary-bane case.
      let cardNumber: number | null = null;
      for (const candidate of cardDatabase.values()) {
        if (candidate.name === baneName) {
          cardNumber = candidate.cardNumber;
          break;
        }
      }
      if (cardNumber === null || count <= 0) {
        console.warn(
          `[quest-context] pushTemporaryBaneGrant: unknown bane '${baneName}' or non-positive count ${String(count)}`,
        );
        return;
      }

      const resolvedCardNumber = cardNumber;
      const addedEntryIds: string[] = [];
      for (let i = 0; i < count; i += 1) {
        addedEntryIds.push(nextEntryId());
      }
      setState((prev) => {
        const card = cardDatabase.get(resolvedCardNumber);
        const cardName =
          card?.name ?? `Unknown Card #${String(resolvedCardNumber)}`;
        const newEntries: DeckEntry[] = addedEntryIds.map((entryId) => ({
          entryId,
          cardNumber: resolvedCardNumber,
          transfiguration: null,
          isBane: true,
        }));
        for (const entryId of addedEntryIds) {
          logEvent("card_added", {
            cardNumber: resolvedCardNumber,
            cardName,
            source,
            isBane: true,
            entryId,
            temporary: true,
          });
        }
        const modifier: BattleModifier = {
          kind: "temporary_bane_grant",
          baneName,
          count,
          battlesRemaining: battles,
          addedEntryIds,
          source,
        };
        logEvent("battle_modifier_pushed", {
          kind: modifier.kind,
          baneName,
          count,
          battles,
          source,
        });
        return {
          ...prev,
          deck: [...prev.deck, ...newEntries],
          battleModifiers: [...prev.battleModifiers, modifier],
        };
      });
    },
    [cardDatabase],
  );

  const addSiteToDreamscape = useCallback(
    (placement: "current" | "next", siteType: SiteType, source: string) => {
      setState((prev) => {
        if (placement === "current") {
          // Delegate to the shared pure function so v2 merchant apply and v1
          // journey rewards share one implementation.
          const next = addSiteToCurrentDreamscape(prev, siteType, source);
          if (next === prev) return prev;
          const currentNodeId = prev.currentDreamscape;
          if (currentNodeId !== null) {
            const nextNode = next.atlas.nodes[currentNodeId];
            const newSite: SiteState | undefined =
              nextNode !== undefined && nextNode.sites.length > 0
                ? nextNode.sites[nextNode.sites.length - 1]
                : undefined;
            if (newSite !== undefined) {
              logEvent("site_added", {
                siteId: newSite.id,
                siteType,
                dreamscapeId: currentNodeId,
                placement,
                source,
              });
            }
          }
          return next;
        }
        const targetId = findNextDreamscapeId(prev.atlas, prev.currentDreamscape);
        if (targetId === null || prev.atlas.nodes[targetId] === undefined) {
          return prev;
        }
        const newSite: SiteState = {
          id: nextSiteIdFromAtlas(prev.atlas),
          type: siteType,
          isEnhanced: false,
          isVisited: false,
        };
        logEvent("site_added", {
          siteId: newSite.id,
          siteType,
          dreamscapeId: targetId,
          placement,
          source,
        });
        return {
          ...prev,
          atlas: atlasWithAddedSite(prev.atlas, targetId, newSite),
        };
      });
    },
    [],
  );

  const replaceSiteType = useCallback(
    (from: SiteType, to: SiteType, source: string) => {
      setState((prev) => {
        const currentId = prev.currentDreamscape;
        if (currentId === null) return prev;
        const node = prev.atlas.nodes[currentId];
        if (node === undefined) return prev;
        const targetIndex = node.sites.findIndex(
          (site) => site.type === from && !site.isVisited,
        );
        if (targetIndex === -1) return prev;
        const replacement: SiteState = {
          id: nextSiteIdFromAtlas(prev.atlas),
          type: to,
          isEnhanced: false,
          isVisited: false,
        };
        const nextSites = node.sites.map((site, index) =>
          index === targetIndex ? replacement : site,
        );
        logEvent("site_replaced", {
          oldSiteId: node.sites[targetIndex].id,
          newSiteId: replacement.id,
          fromType: from,
          toType: to,
          dreamscapeId: currentId,
          source,
        });
        return {
          ...prev,
          atlas: {
            ...prev.atlas,
            nodes: {
              ...prev.atlas.nodes,
              [currentId]: { ...node, sites: nextSites },
            },
          },
        };
      });
    },
    [],
  );

  const removeSiteTypeFromNextDreamscapes = useCallback(
    (
      siteType: "Shop" | "DreamsignOffering",
      dreamscapes: number,
      source: string,
    ) => {
      setState((prev) => {
        // Dreamscape generation hides shop and dreamsign-offering sites via
        // discriminated modifier kinds; map the requested siteType to the
        // matching kind. The parameter is narrowed to the two supported
        // values so a future template typo fails at compile time rather than
        // requiring a runtime warning here.
        const modifier: DreamscapeModifier =
          siteType === "Shop"
            ? {
                kind: "remove_shop_sites",
                dreamscapesRemaining: dreamscapes,
                source,
              }
            : {
                kind: "remove_dreamsign_sites",
                dreamscapesRemaining: dreamscapes,
                source,
              };
        logEvent("dreamscape_modifier_pushed", {
          kind: modifier.kind,
          dreamscapes,
          source,
        });
        return {
          ...prev,
          dreamscapeModifiers: [...prev.dreamscapeModifiers, modifier],
        };
      });
    },
    [],
  );

  const grantFreeShopRerolls = useCallback(
    (count: number, source: string) => {
      setState((prev) => {
        if (count <= 0) return prev;
        logEvent("shop_modifier_pushed", {
          kind: "free_rerolls",
          delta: count,
          source,
        });
        return {
          ...prev,
          shopModifiers: {
            ...prev.shopModifiers,
            freeRerolls: prev.shopModifiers.freeRerolls + count,
          },
        };
      });
    },
    [],
  );

  const applyShopEssenceDiscount = useCallback(
    (percent: number, source: string) => {
      setState((prev) => {
        if (percent <= 0) return prev;
        logEvent("shop_modifier_pushed", {
          kind: "essence_discount",
          delta: percent,
          source,
        });
        return {
          ...prev,
          shopModifiers: {
            ...prev.shopModifiers,
            essenceDiscountPercent:
              prev.shopModifiers.essenceDiscountPercent + percent,
          },
        };
      });
    },
    [],
  );

  const grantShopOmenDiscounts = useCallback(
    (count: number, source: string) => {
      setState((prev) => {
        if (count <= 0) return prev;
        logEvent("shop_modifier_pushed", {
          kind: "omen_discount_tokens",
          delta: count,
          source,
        });
        return {
          ...prev,
          shopModifiers: {
            ...prev.shopModifiers,
            upcomingOmenDiscounts:
              prev.shopModifiers.upcomingOmenDiscounts + count,
          },
        };
      });
    },
    [],
  );

  const boostSiteAppearance = useCallback(
    (
      siteType: SiteType,
      percent: number,
      dreamscapes: number,
      source: string,
    ) => {
      setState((prev) => {
        const modifier: DreamscapeModifier = {
          kind: "boost_site_appearance",
          siteType,
          percent,
          dreamscapesRemaining: dreamscapes,
          source,
        };
        logEvent("dreamscape_modifier_pushed", {
          kind: modifier.kind,
          siteType,
          percent,
          dreamscapes,
          source,
        });
        return {
          ...prev,
          dreamscapeModifiers: [...prev.dreamscapeModifiers, modifier],
        };
      });
    },
    [],
  );

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
      completeDreamJourneySite,
      commitDreamMerchantOffer,
      acceptDreamMerchantOffer,
      declineDreamMerchant,
      pickDraftCard,
      addCard,
      addBaneCard,
      removeCard,
      cleanseBanes,
      transfigureCard,
      changeDeckEntryType,
      changeDeckEntryKeywords,
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
      changeOmens,
      setEssence,
      changeMaxEssence,
      addCardById,
      addCardByIdWithTransfiguration,
      addBaneCardById,
      removeDeckEntry,
      duplicateDeckEntry,
      purgeRandomBaneCards,
      purgeAllBaneCards,
      pushBattleRewardModifier,
      pushTemporaryBaneGrant,
      addSiteToDreamscape,
      replaceSiteType,
      removeSiteTypeFromNextDreamscapes,
      grantFreeShopRerolls,
      applyShopEssenceDiscount,
      grantShopOmenDiscounts,
      boostSiteAppearance,
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
      completeDreamJourneySite,
      commitDreamMerchantOffer,
      acceptDreamMerchantOffer,
      declineDreamMerchant,
      pickDraftCard,
      addCard,
      addBaneCard,
      removeCard,
      cleanseBanes,
      transfigureCard,
      changeDeckEntryType,
      changeDeckEntryKeywords,
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
      changeOmens,
      setEssence,
      changeMaxEssence,
      addCardById,
      addCardByIdWithTransfiguration,
      addBaneCardById,
      removeDeckEntry,
      duplicateDeckEntry,
      purgeRandomBaneCards,
      purgeAllBaneCards,
      pushBattleRewardModifier,
      pushTemporaryBaneGrant,
      addSiteToDreamscape,
      replaceSiteType,
      removeSiteTypeFromNextDreamscapes,
      grantFreeShopRerolls,
      applyShopEssenceDiscount,
      grantShopOmenDiscounts,
      boostSiteAppearance,
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
