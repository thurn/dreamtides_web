import { createContext, useContext, type ReactNode } from "react";
import type { QuestContent } from "../data/quest-content";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import type { CardData } from "../types/cards";
import type {
  DreamcallerContent,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type {
  CardKeywordModification,
  CardTypeChange,
  CardSourceDebugState,
  DreamAtlas,
  Dreamsign,
  QuestFailureSummary,
  QuestState,
  Screen,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../types/quest";
import type { DraftState } from "../types/draft";
import { deriveEntryIdCounter } from "./deck-entry-ids";
import type {
  MerchantAcceptRequest,
  MerchantArchetypeId,
  MerchantDeclineRequest,
  MerchantOfferActionResult,
} from "../journey_v2";

export { deriveEntryIdCounter };


/** Mutation functions exposed by the quest context. */
export interface QuestMutations {
  changeEssence: (delta: number, source: string) => void;
  startQuest: (dreamcaller: DreamcallerContent, seedOverride?: string) => void;
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
  ensureShopRuntime: (site: SiteState) => void;
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
  acceptDuplicationChoice: (siteId: string, entryId: string) => void;
  /**
   * Marks a Dream Augury site as completed and returns to the dreamscape.
   * The augury screen is responsible for any narrative interaction; the
   * mutation itself applies no deck or resource changes — it lazily ensures
   * a runtime slot exists, flips the `completed` flag, and walks the
   * visit-tracking bookkeeping.
   */
  completeDreamAugurySite: (siteId: string) => void;
  acceptDreamMerchantOffer: (
    siteId: string,
    request: MerchantAcceptRequest,
  ) => MerchantOfferActionResult | void;
  declineDreamMerchant: (
    siteId: string,
    request: MerchantDeclineRequest,
  ) => void;
  /**
   * Debug-only: regenerates the Dream Augury encounter for a site using the
   * same quest parameters by bumping `siteRuntime[siteId].rerollNonce`. Any
   * prior commit is cleared so the fresh encounter starts from a clean slate.
   * Optional because it is exposed only by the live quest providers, not by
   * lightweight test/demo mutation stubs.
   */
  rerollDreamAugury?: (siteId: string) => void;
  /**
   * Debug-only: forces the next generated Dream Augury encounter to include an
   * offer of the given archetype (in slot A), or clears the force when passed
   * `null`. Bumps `rerollNonce` so the encounter regenerates, and persists the
   * choice on `siteRuntime[siteId].forcedArchetypeId` so subsequent rerolls keep
   * forcing the same category until it is cleared. An archetype that is not
   * eligible for the current quest state is ignored by the generator. Optional
   * because it is exposed only by the live quest providers.
   */
  forceDreamAuguryArchetype?: (
    siteId: string,
    archetypeId: MerchantArchetypeId | null,
  ) => void;
  pickDraftCard: (siteId: string, cardNumber: number) => void;
  addCard: (cardNumber: number, source: string) => void;
  addBaneCard: (cardNumber: number, source: string) => void;
  removeCard: (entryId: string, source: string) => void;
  /**
   * Apply a transfiguration to a deck entry, or clear it when `type` is
   * `null`. The null variant supports Dream Augury reward templates that
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
    rewardCardNumber: number | null,
    rewardCardName: string | null,
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
  /**
   * Debug-only: replaces an uninitialized quest state with one parked on a
   * developer QA scene (see `src/runtime/qa-scenes.ts`), skipping Dreamcaller
   * selection so screens reachable only by playing battles forward — such as
   * the Dream Atlas boss preview — can be opened directly for browser QA.
   * Drives the `?goto=<scene>` runtime flag. No-op once a Dreamcaller is
   * selected, mirroring `bootstrapStartInBattle`. Optional because only the
   * live multiplayer provider implements it; lightweight test/demo mutation
   * stubs omit it.
   */
  bootstrapQaScene?: (sceneId: string) => void;
  /**
   * Debug-only: replaces the entire quest state with a previously saved
   * snapshot (a named save loaded from the developer's file system via the
   * debug overlay). Clears the battle slot, mirroring `resetQuest`. Optional
   * because only the live multiplayer provider implements it; lightweight
   * test/demo mutation stubs omit it.
   */
  loadQuestState?: (state: QuestState, source: string) => void;
  resetQuest: () => void;

  // ---- Dream Augury effect plumbing (Wave 1) ----
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
  /**
   * Purge the given deck entries at a Purge site: removes the entries, spends
   * `cost` essence, marks the site visited, and returns to the dreamscape, all
   * atomically. `baneDreamsignIndices` removes the listed bane Dreamsigns in
   * the same visit for free (banes are always free to remove at Purge); only
   * indices that point at a bane Dreamsign are removed.
   */
  purgeDeckCards: (
    siteId: string,
    entryIds: readonly string[],
    cost: number,
    source: string,
    baneDreamsignIndices?: readonly number[],
  ) => void;
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
   * Add `count` bane cards to the deck immediately and stack a
   * `temporary_bane_grant` modifier that removes the added entries when its
   * `battlesRemaining` counter reaches zero. The bane's catalog entry is
   * resolved via `questContent.cardDatabase` using `baneCardId` (UUID);
   * `baneName` is a display/log label only and is not used for catalog lookup.
   * An unresolvable `baneCardId` no-ops with a console warning.
   */
  pushTemporaryBaneGrant: (
    baneCardId: string,
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
   * `"Shop"` maps to a dreamscape-modifier kind; the type is narrowed here so
   * unsupported site types fail at compile time.
   */
  removeSiteTypeFromNextDreamscapes: (
    siteType: "Shop",
    dreamscapes: number,
    source: string,
  ) => void;
  /** Increment `shopModifiers.freeRerolls` by `count`. */
  grantFreeShopRerolls: (count: number, source: string) => void;
  /** Add `percent` to `shopModifiers.essenceDiscountPercent`. */
  applyShopEssenceDiscount: (percent: number, source: string) => void;
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

export function createDefaultState(): QuestState {
  return {
    seed: "default",
    essence: 200,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      layers: [],
      nodes: {},
      startingNodeId: "",
      bossNodeId: "",
      bossIncarnationId: null,
      currentNodeId: null,
      knownDreamsignCarrierIds: [],
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

/** Hook to access the quest state and mutation functions. */
export function useQuest(): QuestContextValue {
  const context = useContext(QuestContext);
  if (context === null) {
    throw new Error("useQuest must be used within a QuestContextProvider");
  }
  return context;
}
