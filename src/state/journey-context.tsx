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
  RandomSiteDestinationType,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../types/journey";
import type { DraftState } from "../types/draft";
import type { GambleGameId, GravokGateId } from "../types/gamble";
import { deriveEntryIdCounter } from "./deck-entry-ids";
import type {
  MerchantAcceptRequest,
  MerchantArchetypeId,
  MerchantDeclineRequest,
  MerchantOfferActionResult,
} from "../journey_v2";
import { asAtlasNodeId } from "../types/identifiers";
import type { SiteId } from "../types/identifiers";
import type { ShuffleCommitment } from "../types/identifiers";
import type { DreamsignId, ExplorationActionId } from "../types/identifiers";
import type { DeckEntryId } from "../types/identifiers";
import type { PublicationId } from "../types/identifiers";
import type { AtlasNodeId } from "../types/identifiers";
import type { QaSceneId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";

export { deriveEntryIdCounter };

/** Mutation functions exposed by the journey context. */
export interface JourneyMutations {
  changeEssence: (delta: number, source: string) => void;
  startJourney: (
    dreamAvatar: DreamAvatarContent,
    seedOverride?: string,
  ) => void;
  /** Request a shared debug reroll of the journey-start DreamAvatar offer. */
  rerollDreamAvatarOffer: () => void;
  completeSite: (siteId: SiteId, source: string) => void;
  /** Materialize the shared Three-Gate Wager deck commitment and Dreamsign. */
  ensureGambleSiteRuntime: (
    siteId: SiteId,
    gambleGameId?: GambleGameId,
  ) => void;
  /** Materialize the shared encounter and every randomized follow-up offer. */
  ensureExplorationSiteRuntime: (siteId: SiteId) => void;
  /** Materialize Random Site's configured persisted home choices. */
  ensureRandomSiteRuntime: (siteId: SiteId) => void;
  /** Choose one offered destination; the event log makes first valid choice win. */
  chooseRandomSite: (
    siteId: SiteId,
    siteType: RandomSiteDestinationType,
  ) => void;
  /** Resolve one authored choice and its optional card-selection payload. */
  resolveExplorationChoice: (
    siteId: SiteId,
    actionId: ExplorationActionId,
    selection?: unknown,
  ) => void;
  /** Commit one gate choice; the reducer derives the draw, cost, and payout. */
  placeGravokWager: (siteId: SiteId, gateId: GravokGateId) => void;
  /** Apply the wager's payout when the result announcement appears. */
  settleGravokWager: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Reassemble the deck and lock a fresh draw for another wager. */
  playAgainGravokWager: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Replace a held Dreamsign after a jackpot win at the collection cap. */
  replaceGravokWagerDreamsign: (
    siteId: SiteId,
    replacedDreamsignId: DreamsignId,
  ) => void;
  /** Buy and reveal the next Ladder Climb attempt. */
  drawTidemarkLadderClimb: (siteId: SiteId) => void;
  /** Settle the current Ladder Climb outcome after its card reveal. */
  settleTidemarkLadderClimb: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Replace a held Dreamsign after a Ladder Climb win at the cap. */
  replaceTidemarkLadderClimbDreamsign: (
    siteId: SiteId,
    replacedDreamsignId: DreamsignId,
  ) => void;
  /** Reveal the current Starway Stairs tier. */
  drawStarwayStairs: (siteId: SiteId) => void;
  /** Settle the current Starway Stairs result after its card reveal. */
  settleStarwayStairs: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Bank the latest safe Starway Stairs prize. */
  cashOutStarwayStairs: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Reassemble the deck and prepare another Starway Stairs game. */
  playAgainStarwayStairs: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Pay for one Four-Suit Reprise draw against the selected deck entry. */
  drawFourSuitReprise: (siteId: SiteId, entryId: DeckEntryId) => void;
  /** Reveal and apply the current Four-Suit Reprise outcome. */
  settleFourSuitReprise: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Apply the player's free chosen form after a Spades result. */
  chooseFourSuitRepriseTransfiguration: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    type: TransfigurationType,
  ) => void;
  /** Move the shared visit into its next distinct-card choice. */
  playAgainFourSuitReprise: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Pay for a round and reveal its opening hand. */
  dealBlackjack: (siteId: SiteId) => void;
  /** Pay for and reveal the next committed card. */
  hitBlackjack: (siteId: SiteId) => void;
  /** Finish the round on its current total. */
  standBlackjack: (siteId: SiteId) => void;
  /** Apply the visible hand outcome. */
  settleBlackjack: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => void;
  /** Start and pay for a fresh hand after a settled push. */
  playAgainBlackjack: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
  ) => void;
  ensureRewardSiteRuntime: (siteId: SiteId) => void;
  /**
   * Accepts the Dreamsign Reward at the given site. When the player is at the
   * 12-Dreamsign cap, `purgeIndex` selects an existing Dreamsign to replace;
   * without it the mutation no-ops at the cap so the UI can prompt a purge.
   */
  acceptRewardSite: (siteId: SiteId, purgeIndex?: number) => void;
  ensureDreamsignOfferRuntime: (siteId: SiteId, optionCount: number) => void;
  acceptDreamsignOffer: (
    siteId: SiteId,
    dreamsign: Dreamsign,
    purgeIndex?: number,
  ) => void;
  /**
   * Rejects the Dreamsign Offering at the given site. Rejecting carries no
   * reward; it simply marks the runtime as resolved and completes the site.
   */
  rejectDreamsignOffer: (siteId: SiteId) => void;
  ensureEssenceSiteRuntime: (siteId: SiteId, isEnhanced: boolean) => void;
  acceptEssenceSite: (siteId: SiteId) => void;
  ensureShopRuntime: (site: SiteState) => void;
  /**
   * Buys the shop slot at `slotIndex`. For a Dreamsign slot when the player
   * is at the 12-Dreamsign cap, `purgeIndex` selects an existing Dreamsign to
   * replace; without it the mutation no-ops at the cap so the UI can prompt a
   * purge.
   */
  buyShopSlot: (siteId: SiteId, slotIndex: number, purgeIndex?: number) => void;
  rerollShop: (site: SiteState) => void;
  ensureCardChoiceRuntime: (
    siteId: SiteId,
    kind: "transfiguration" | "duplication",
  ) => void;
  acceptTransfigurationChoice: (
    siteId: SiteId,
    entryId: DeckEntryId,
    type: TransfigurationType,
    effectDescription: string,
    effectDetails: Record<string, unknown>,
  ) => void;
  acceptDuplicationChoice: (siteId: SiteId, entryId: DeckEntryId) => void;
  /**
   * Marks an Augury site as completed and returns to the dreamscape.
   * The augury screen is responsible for any narrative interaction; the
   * mutation itself applies no deck or resource changes — it lazily ensures
   * a runtime slot exists, flips the `completed` flag, and walks the
   * visit-tracking bookkeeping.
   */
  completeAugurySite: (siteId: SiteId) => void;
  acceptDreamMerchantOffer: (
    siteId: SiteId,
    request: MerchantAcceptRequest,
  ) => MerchantOfferActionResult | void;
  declineDreamMerchant: (
    siteId: SiteId,
    request: MerchantDeclineRequest,
  ) => void;
  /**
   * Debug-only: regenerates the Augury encounter for a site using the
   * same journey parameters by bumping `siteRuntime[siteId].rerollNonce`. Any
   * prior commit is cleared so the fresh encounter starts from a clean slate.
   * Optional because it is exposed only by the live journey providers, not by
   * lightweight test/demo mutation stubs.
   */
  rerollAugury?: (siteId: SiteId) => void;
  /**
   * Debug-only: forces the next generated Augury encounter to include an
   * offer of the given archetype (in slot A), or clears the force when passed
   * `null`. Bumps `rerollNonce` so the encounter regenerates, and persists the
   * choice on `siteRuntime[siteId].forcedArchetypeId` so subsequent rerolls keep
   * forcing the same category until it is cleared. An archetype that is not
   * eligible for the current journey state is ignored by the generator. Optional
   * because it is exposed only by the live journey providers.
   */
  forceAuguryArchetype?: (
    siteId: SiteId,
    archetypeId: MerchantArchetypeId | null,
  ) => void;
  pickDraftCard: (siteId: SiteId, cardNumber: number) => void;
  /** Requests a shared debug reroll of the displayed offer at an active draft site. */
  rerollDraftOffer?: (siteId: SiteId) => void;
  /**
   * Enters a draft site, revealing its first offer. The coop event log scopes
   * this intent to the current run and site, so every observing client may
   * request it while the displayed fold catches up.
   */
  enterDraftSite: (siteId: SiteId) => void;
  addCard: (cardNumber: number, source: string) => void;
  removeCard: (entryId: DeckEntryId, source: string) => void;
  /**
   * Apply a transfiguration to a deck entry, or clear it when `type` is
   * `null`. The null variant supports Augury reward templates that
   * "remove transfiguration"; `effectDescription` is the upstream source
   * string and `effectDetails` is forwarded into the `card_transfigured`
   * log payload.
   */
  transfigureCard: (
    entryId: DeckEntryId,
    type: TransfigurationType | null,
    effectDescription: string,
    effectDetails: Record<string, unknown>,
  ) => void;
  setDreamAvatarSelection: (
    resolvedPackage: ResolvedDreamAvatarPackage,
  ) => void;
  setCardSourceDebug: (
    cardSourceDebug: CardSourceDebugState | null,
    source: string,
    publicationId?: PublicationId,
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
    remainingDreamsignPool: DreamsignId[],
    source: string,
  ) => void;
  enterSite: (siteId: SiteId) => void;
  travelToDreamscape: (nodeId: AtlasNodeId) => void;
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
  bootstrapQaScene?: (
    sceneId: QaSceneId,
    explorationCardId?: CardId | null,
    explorationDreamsignCount?: number | null,
    explorationDreamsignCap?: number | null,
    explorationStarterCount?: number | null,
  ) => void;
  /**
   * Debug-only: replaces the entire journey state with a previously saved
   * snapshot (a named save loaded from the developer's file system via the
   * debug overlay). Clears the battle slot, mirroring `resetJourney`. Optional
   * because only the live multiplayer provider implements it; lightweight
   * test/demo mutation stubs omit it.
   */
  loadJourneyState?: (state: JourneyState, source: string) => void;
  /** Debug-only: set `maxDreamsigns` to `value`. */
  setMaxDreamsigns?: (value: number, source: string) => void;
  /** Debug-only: set `completionLevel` to `value`. */
  /** Debug-only: set or clear absolute stat overrides on a deck entry. */
  setDeckEntryStatOverride?: (
    entryId: DeckEntryId,
    statOverride: { energyCost?: number; spark?: number } | null,
    source: string,
  ) => void;
  /** Debug-only: replace (not merge) a deck entry's keyword modification, or
   *  clear it with `null`. */
  setDeckEntryKeywords?: (
    entryId: DeckEntryId,
    keywordModification: CardKeywordModification | null,
    source: string,
  ) => void;
  /** Debug-only: replace or clear a deck entry's type/subtype override. */
  setDeckEntryTypeChange?: (
    entryId: DeckEntryId,
    typeChange: CardTypeChange | null,
    source: string,
  ) => void;
  resetJourney: () => void;

  // ---- Augury effect plumbing (Wave 1) ----
  /** Set essence to a non-negative `value`. */
  setEssence: (value: number, source: string) => void;
  /**
   * Add a card to the deck by catalog `cardId`. Nightmare is marked as the
   * sole Bane by the rules reducer. Mirrors `addCard`,
   * but resolves the catalog id internally by linear-scanning the small
   * card database (the same pattern `pushTemporaryNightmareGrant` uses). On a
   * miss this no-ops and logs a console warning.
   */
  addCardById: (cardId: CardId, source: string) => string | null;
  addCardByIdWithTransfiguration: (
    cardId: CardId,
    type: TransfigurationType,
    source: string,
  ) => string | null;
  /** Remove the deck entry with the given entryId. Mirrors `removeCard`. */
  removeDeckEntry: (entryId: DeckEntryId, source: string) => void;
  /**
   * Purge the given deck entries at a Purge site. The reducer derives the
   * authoritative price from the selected entries, site, and folded modifiers.
   */
  purgeDeckCards: (
    siteId: SiteId,
    entryIds: readonly DeckEntryId[],
    source: string,
  ) => void;
  /** Add a duplicate of the deck entry with the given entryId. */
  duplicateDeckEntry: (entryId: DeckEntryId, source: string) => void;
  changeDeckEntryType: (
    entryId: DeckEntryId,
    typeChange: CardTypeChange,
    source: string,
  ) => void;
  changeDeckEntryKeywords: (
    entryId: DeckEntryId,
    keywordModification: CardKeywordModification,
    source: string,
  ) => void;
  /**
   * Remove up to `count` Nightmare cards from the deck. When fewer Nightmares exist than `count`,
   * all of them are removed; non-positive counts no-op.
   */
  purgeRandomNightmareCards: (count: number, source: string) => void;
  /** Remove every Nightmare card from the deck. */
  purgeAllNightmareCards: (source: string) => void;
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
   * Add `count` Nightmare cards immediately and remove those exact entries
   * after `battles` completed battles.
   */
  pushTemporaryNightmareGrant: (
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
  replaceSiteType: (from: SiteType, to: SiteType, source: string) => void;
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

export function createDefaultState(
  economy: { defaultStartingEssence: number; dreamsignCap: number } = {
    // Compatibility for historical fixtures which construct state without
    // loading the economy catalog.
    defaultStartingEssence: 200,
    dreamsignCap: 12,
  },
): JourneyState {
  return {
    runId: null,
    seed: "default",
    essence: economy.defaultStartingEssence,
    maxDreamsigns: economy.dreamsignCap,
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
      startingNodeId: asAtlasNodeId(""),
      bossNodeId: asAtlasNodeId(""),
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
      freeNextShopModifiers: [],
      freePurchaseModifiers: [],
    },
    siteOfferModifiers: [],
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
  remainingDreamsignPool: DreamsignId[],
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
