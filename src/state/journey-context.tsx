import { createContext, useContext, type ReactNode } from "react";
import type { JourneyContent } from "../data/journey-content";
import { toJourneyDreamAvatar } from "../data/dream-avatar-selection";
import type { CardData } from "../types/cards";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../types/content";
import type {
  CardKeywordModification,
  CardTypeChange,
  CardSourceDebugState,
  Dreamsign,
  JourneyState,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../types/journey";
import type { DraftState } from "../types/draft";
import { deriveEntryIdCounter } from "./deck-entry-ids";
import type {
  MerchantAcceptRequest,
  MerchantArchetypeId,
  MerchantDeclineRequest,
  MerchantOfferActionResult,
} from "../journey_v2";

export { deriveEntryIdCounter };


/** Mutation functions exposed by the journey context. */
export interface JourneyMutations {
  changeEssence: (delta: number, source: string) => void;
  startJourney: (dreamAvatar: DreamAvatarContent, seedOverride?: string) => void;
  /** Request a shared debug reroll of the journey-start DreamAvatar offer. */
  rerollDreamAvatarOffer: () => void;
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
   * same journey parameters by bumping `siteRuntime[siteId].rerollNonce`. Any
   * prior commit is cleared so the fresh encounter starts from a clean slate.
   * Optional because it is exposed only by the live journey providers, not by
   * lightweight test/demo mutation stubs.
   */
  rerollDreamAugury?: (siteId: string) => void;
  /**
   * Debug-only: forces the next generated Dream Augury encounter to include an
   * offer of the given archetype (in slot A), or clears the force when passed
   * `null`. Bumps `rerollNonce` so the encounter regenerates, and persists the
   * choice on `siteRuntime[siteId].forcedArchetypeId` so subsequent rerolls keep
   * forcing the same category until it is cleared. An archetype that is not
   * eligible for the current journey state is ignored by the generator. Optional
   * because it is exposed only by the live journey providers.
   */
  forceDreamAuguryArchetype?: (
    siteId: string,
    archetypeId: MerchantArchetypeId | null,
  ) => void;
  pickDraftCard: (siteId: string, cardNumber: number) => void;
  /** Requests a shared debug reroll of the displayed offer at an active draft site. */
  rerollDraftOffer?: (siteId: string) => void;
  /**
   * Enters a draft site, revealing its first offer. The coop event log scopes
   * this intent to the current run and site, so every observing client may
   * request it while the displayed fold catches up.
   */
  enterDraftSite: (siteId: string) => void;
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
  setDreamAvatarSelection: (resolvedPackage: ResolvedDreamAvatarPackage) => void;
  setCardSourceDebug: (
    cardSourceDebug: CardSourceDebugState | null,
    source: string,
    publicationId?: string,
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
  enterSite: (siteId: string) => void;
  travelToDreamscape: (nodeId: string) => void;
  regenerateAtlas?: (completionLevel?: number) => void;
  setDraftState: (draftState: DraftState, source: string) => void;
  /**
   * Marks the one-time starter-deck reveal popup as dismissed. Called from
   * the popup's "Continue" button so subsequent reloads of the same room
   * land directly on the first dreamscape.
   */
  dismissStartingDeckPopup: () => void;
  /**
   * Debug-only: replaces an uninitialized journey state with one parked on a
   * developer QA scene (see `src/runtime/qa-scenes.ts`), skipping DreamAvatar
   * selection so screens reachable only by playing battles forward — such as
   * the Dream Atlas boss preview — can be opened directly for browser QA.
   * Drives the `?goto=<scene>` runtime flag. No-op once a DreamAvatar is
   * selected. Optional because only the live multiplayer provider implements
   * it; lightweight test/demo mutation stubs omit it.
   */
  bootstrapQaScene?: (sceneId: string) => void;
  /**
   * Debug-only: replaces the entire journey state with a previously saved
   * snapshot (a named save loaded from the developer's file system via the
   * debug overlay). Clears the battle slot, mirroring `resetJourney`. Optional
   * because only the live multiplayer provider implements it; lightweight
   * test/demo mutation stubs omit it.
   */
  loadJourneyState?: (state: JourneyState, source: string) => void;
  /** Debug-only: set `essenceCap` to `value`; current essence reclamps. */
  setEssenceCap?: (value: number, source: string) => void;
  /** Debug-only: set `maxDreamsigns` to `value`. */
  setMaxDreamsigns?: (value: number, source: string) => void;
  /** Debug-only: set `completionLevel` to `value`. */
  /** Debug-only: set or clear absolute stat overrides on a deck entry. */
  setDeckEntryStatOverride?: (
    entryId: string,
    statOverride: { energyCost?: number; spark?: number } | null,
    source: string,
  ) => void;
  /** Debug-only: replace (not merge) a deck entry's keyword modification, or
   *  clear it with `null`. */
  setDeckEntryKeywords?: (
    entryId: string,
    keywordModification: CardKeywordModification | null,
    source: string,
  ) => void;
  /** Debug-only: replace or clear a deck entry's type/subtype override. */
  setDeckEntryTypeChange?: (
    entryId: string,
    typeChange: CardTypeChange | null,
    source: string,
  ) => void;
  /** Debug-only: set the `isBane` flag on the dreamsign at `index`. */
  setDreamsignIsBane?: (index: number, isBane: boolean, source: string) => void;
  resetJourney: () => void;

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
   * Purge the given deck entries at a Purge site. The reducer derives the
   * authoritative price from the selected entries, site, and folded modifiers.
   */
  purgeDeckCards: (
    siteId: string,
    entryIds: readonly string[],
    source: string,
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
   * by the authoritative victory transition; entries at zero drop.
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
   * resolved via `journeyContent.cardDatabase` using `baneCardId` (UUID);
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

/** The value provided by the journey context. */
export interface JourneyContextValue {
  state: JourneyState;
  mutations: JourneyMutations;
  cardDatabase: Map<number, CardData>;
  journeyContent: JourneyContent;
}

export const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: JourneyContextValue;
}) {
  return (
    <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
  );
}

export function createDefaultState(): JourneyState {
  return {
    runId: null,
    seed: "default",
    essence: 200,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: [],
    dreamAvatar: null,
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
    screen: { type: "journeyStart" },
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

export function applyDreamAvatarSelection(
  prev: JourneyState,
  resolvedPackage: ResolvedDreamAvatarPackage,
): JourneyState {
  return {
    ...prev,
    dreamAvatar: toJourneyDreamAvatar(resolvedPackage.dreamAvatar),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
  };
}

export function applyRemainingDreamsignPool(
  prev: JourneyState,
  remainingDreamsignPool: string[],
): JourneyState {
  return {
    ...prev,
    remainingDreamsignPool: [...remainingDreamsignPool],
  };
}

export function applyCardSourceDebug(
  prev: JourneyState,
  cardSourceDebug: CardSourceDebugState | null,
): JourneyState {
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
  prev: JourneyState,
  draftState: DraftState,
): JourneyState {
  return {
    ...prev,
    draftState,
  };
}

/** Hook to access the journey state and mutation functions. */
export function useJourney(): JourneyContextValue {
  const context = useContext(JourneyContext);
  if (context === null) {
    throw new Error("useJourney must be used within a JourneyContextProvider");
  }
  return context;
}
