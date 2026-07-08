// The coop actions facade: one named creator per rules-layer event type.
//
// Every creator builds a single event's `{ type, payload }` draft (UUIDs and
// indices only — never card names) and appends it through the injected
// `append` function. The mapping from creator to event type is the authoritative
// "Legacy mutation → event mapping" table in the coop plan; `actions.test.ts`
// pins that every creator's type exists in the rules-layer union and that the
// union is fully covered (no drift in either direction).
//
// Two construction paths so the facade is usable in both contexts:
//   - `makeActions(append)` — a pure factory, testable in isolation with a fake
//     append (no React, no Firebase).
//   - `useActions()` (see hooks.ts) — binds `append` to the room's LogClient and
//     adds the RESOLVE_PROMPT confirmed-prompt guard.
//
// Signatures mirror the legacy `QuestMutations` call ergonomics
// (src/state/quest-context.tsx) closely enough that Task 26 can back that
// interface with these creators; complex payload shapes are typed `unknown`
// here to keep this module import-light (the reducer's domain case is the one
// place that narrows them).
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Client layer" (actions facade).

import type { EventDraft } from "../eventlog/client";

/**
 * Appends a stamped event, resolving to its committed seq. In production this
 * is the room LogClient's `submit`; in tests it is a fake that records drafts.
 * An `actor` on the draft overrides the client's own id (Task 27's AI loop
 * appends with `actor: "ai:<clientId>"`).
 */
export type AppendFn = (draft: EventDraft) => Promise<number>;

/** The full set of named action creators the screens call. */
export interface CoopActions {
  // --- essence & limits ---
  changeEssence: (delta: number) => Promise<number>;
  setEssence: (value: number) => Promise<number>;
  changeMaxEssence: (delta: number) => Promise<number>;
  setEssenceCap: (value: number) => Promise<number>;
  setMaxDreamsigns: (value: number) => Promise<number>;
  setCompletionLevel: (value: number) => Promise<number>;

  // --- lifecycle ---
  startQuest: (payload?: Record<string, unknown>) => Promise<number>;
  resetQuest: () => Promise<number>;
  loadState: (snapshot: unknown, battle?: unknown) => Promise<number>;

  // --- dreamcaller ---
  selectDreamcaller: (dreamcallerId: string) => Promise<number>;

  // --- navigation ---
  setScreen: (screen: unknown, activeSiteId?: string | null) => Promise<number>;
  travelToDreamscape: (nodeId: string) => Promise<number>;
  markSiteVisited: (siteId: string) => Promise<number>;
  dismissStartingDeckPopup: () => Promise<number>;

  // --- deck & transfiguration ---
  addCard: (options: {
    cardId: string;
    transfiguration?: unknown;
    isBane?: boolean;
    source?: unknown;
  }) => Promise<number>;
  removeDeckEntry: (entryId: string) => Promise<number>;
  purgeDeckCards: (
    entryIds: readonly string[],
    options?: {
      siteId?: string;
      cost?: number;
      baneDreamsignIndices?: readonly number[];
    },
  ) => Promise<number>;
  duplicateDeckEntry: (entryId: string) => Promise<number>;
  setDeckEntryStatOverride: (entryId: string, override: unknown) => Promise<number>;
  setDeckEntryKeywords: (entryId: string, keywords: unknown) => Promise<number>;
  setDeckEntryType: (entryId: string, typeChange: unknown) => Promise<number>;
  transfigureCard: (entryId: string, transfiguration: unknown) => Promise<number>;
  acceptTransfigurationChoice: (siteId: string, entryId: string) => Promise<number>;
  acceptDuplicationChoice: (siteId: string, entryId: string) => Promise<number>;
  purgeAllBaneCards: () => Promise<number>;
  purgeRandomBaneCards: (count: number) => Promise<number>;

  // --- dreamsigns ---
  addDreamsign: (dreamsignId: string) => Promise<number>;
  removeDreamsign: (dreamsignId: string) => Promise<number>;
  setDreamsignPool: (ids: readonly string[]) => Promise<number>;
  setDreamsignIsBane: (dreamsignId: string, isBane: boolean) => Promise<number>;

  // --- draft ---
  setDraftState: (draftState: unknown) => Promise<number>;
  pickDraftCard: (packIndex: number, cardId: string) => Promise<number>;

  // --- sites ---
  openSite: (siteId: string) => Promise<number>;
  completeDreamAugury: (siteId: string) => Promise<number>;
  acceptReward: (siteId: string, choiceIndex?: number) => Promise<number>;
  acceptDreamsignOffer: (siteId: string, dreamsignId: string) => Promise<number>;
  rejectDreamsignOffer: (siteId: string) => Promise<number>;
  acceptEssence: (siteId: string) => Promise<number>;
  rerollDreamAugury: (siteId: string) => Promise<number>;
  forceDreamAuguryArchetype: (siteId: string, archetypeId: string) => Promise<number>;
  completeSite: (siteId: string) => Promise<number>;

  // --- merchant & shop ---
  acceptMerchantOffer: (siteId: string, offer?: unknown) => Promise<number>;
  declineMerchant: (siteId: string) => Promise<number>;
  buyShopSlot: (siteId: string, slotIndex: number) => Promise<number>;
  rerollShop: (siteId: string) => Promise<number>;
  grantFreeRerolls: (count: number) => Promise<number>;
  applyShopDiscount: (percent: number) => Promise<number>;

  // --- modifiers & atlas ---
  pushBattleModifier: (modifier: unknown) => Promise<number>;
  pushTemporaryBaneGrant: (payload: Record<string, unknown>) => Promise<number>;
  banSiteType: (siteType: string, dreamscapesRemaining: number) => Promise<number>;
  boostSiteAppearance: (
    siteType: string,
    percent: number,
    dreamscapesRemaining: number,
  ) => Promise<number>;
  replaceSiteType: (
    nodeId: string,
    fromSiteType: string,
    toSiteType: string,
  ) => Promise<number>;
  addSiteToDreamscape: (nodeId: string, siteType: string) => Promise<number>;
  updateAtlas: (atlas: unknown) => Promise<number>;
  setCardSourceDebug: (state: unknown) => Promise<number>;

  // --- battle lifecycle bridges ---
  endBattle: (result: "victory" | "defeat") => Promise<number>;
  questFailed: (summary: unknown) => Promise<number>;

  // --- battle events ---
  beginBattle: (siteId: string) => Promise<number>;
  battleCommand: (command: unknown) => Promise<number>;
  resolvePrompt: (promptId: number, resolution: unknown) => Promise<number>;
  setCardNote: (
    instanceId: string,
    note: { noteId: string; text: string; expiry: unknown },
  ) => Promise<number>;
}

/**
 * Build the action facade over an `append` function. Pure and dependency-free:
 * the caller supplies `append` (the room LogClient's `submit` in production, a
 * fake in tests), and every creator is a thin payload-builder that appends one
 * event.
 */
export function makeActions(append: AppendFn): CoopActions {
  const emit = (type: string, payload: Record<string, unknown>): Promise<number> =>
    append({ type, payload });

  return {
    // --- essence & limits ---
    changeEssence: (delta) => emit("ADJUST_ESSENCE", { delta }),
    setEssence: (value) => emit("SET_ESSENCE", { value }),
    changeMaxEssence: (delta) => emit("ADJUST_ESSENCE_CAP", { delta }),
    setEssenceCap: (value) => emit("SET_ESSENCE_CAP", { value }),
    setMaxDreamsigns: (value) => emit("SET_MAX_DREAMSIGNS", { value }),
    setCompletionLevel: (value) => emit("SET_COMPLETION_LEVEL", { value }),

    // --- lifecycle ---
    startQuest: (payload = {}) => emit("START_QUEST", { ...payload }),
    resetQuest: () => emit("RESET_QUEST", {}),
    loadState: (snapshot, battle) =>
      emit("LOAD_STATE", battle === undefined ? { snapshot } : { snapshot, battle }),

    // --- dreamcaller ---
    selectDreamcaller: (dreamcallerId) => emit("SELECT_DREAMCALLER", { dreamcallerId }),

    // --- navigation ---
    setScreen: (screen, activeSiteId) =>
      emit(
        "SET_SCREEN",
        activeSiteId === undefined ? { screen } : { screen, activeSiteId },
      ),
    travelToDreamscape: (nodeId) => emit("TRAVEL_TO_DREAMSCAPE", { nodeId }),
    markSiteVisited: (siteId) => emit("MARK_SITE_VISITED", { siteId }),
    dismissStartingDeckPopup: () => emit("DISMISS_STARTING_DECK_POPUP", {}),

    // --- deck & transfiguration ---
    addCard: (options) => emit("ADD_CARD", { ...options }),
    removeDeckEntry: (entryId) => emit("REMOVE_DECK_ENTRY", { entryId }),
    purgeDeckCards: (entryIds, options) =>
      emit("PURGE_DECK_CARDS", {
        entryIds: [...entryIds],
        ...(options?.siteId === undefined ? {} : { siteId: options.siteId }),
        ...(options?.cost === undefined ? {} : { cost: options.cost }),
        ...(options?.baneDreamsignIndices === undefined
          ? {}
          : { baneDreamsignIndices: [...options.baneDreamsignIndices] }),
      }),
    duplicateDeckEntry: (entryId) => emit("DUPLICATE_DECK_ENTRY", { entryId }),
    setDeckEntryStatOverride: (entryId, override) =>
      emit("SET_DECK_ENTRY_STAT_OVERRIDE", { entryId, override }),
    setDeckEntryKeywords: (entryId, keywords) =>
      emit("SET_DECK_ENTRY_KEYWORDS", { entryId, keywords }),
    setDeckEntryType: (entryId, typeChange) =>
      emit("SET_DECK_ENTRY_TYPE", { entryId, typeChange }),
    transfigureCard: (entryId, transfiguration) =>
      emit("TRANSFIGURE_CARD", { entryId, transfiguration }),
    acceptTransfigurationChoice: (siteId, entryId) =>
      emit("ACCEPT_TRANSFIGURATION_CHOICE", { siteId, entryId }),
    acceptDuplicationChoice: (siteId, entryId) =>
      emit("ACCEPT_DUPLICATION_CHOICE", { siteId, entryId }),
    purgeAllBaneCards: () => emit("PURGE_ALL_BANE_CARDS", {}),
    purgeRandomBaneCards: (count) => emit("PURGE_RANDOM_BANE_CARDS", { count }),

    // --- dreamsigns ---
    addDreamsign: (dreamsignId) => emit("ADD_DREAMSIGN", { dreamsignId }),
    removeDreamsign: (dreamsignId) => emit("REMOVE_DREAMSIGN", { dreamsignId }),
    setDreamsignPool: (ids) => emit("SET_DREAMSIGN_POOL", { ids: [...ids] }),
    setDreamsignIsBane: (dreamsignId, isBane) =>
      emit("SET_DREAMSIGN_IS_BANE", { dreamsignId, isBane }),

    // --- draft ---
    setDraftState: (draftState) => emit("SET_DRAFT_STATE", { draftState }),
    pickDraftCard: (packIndex, cardId) => emit("PICK_DRAFT_CARD", { packIndex, cardId }),

    // --- sites ---
    openSite: (siteId) => emit("OPEN_SITE", { siteId }),
    completeDreamAugury: (siteId) => emit("COMPLETE_DREAM_AUGURY", { siteId }),
    acceptReward: (siteId, choiceIndex) =>
      emit(
        "ACCEPT_REWARD",
        choiceIndex === undefined ? { siteId } : { siteId, choiceIndex },
      ),
    acceptDreamsignOffer: (siteId, dreamsignId) =>
      emit("ACCEPT_DREAMSIGN_OFFER", { siteId, dreamsignId }),
    rejectDreamsignOffer: (siteId) => emit("REJECT_DREAMSIGN_OFFER", { siteId }),
    acceptEssence: (siteId) => emit("ACCEPT_ESSENCE", { siteId }),
    rerollDreamAugury: (siteId) => emit("REROLL_DREAM_AUGURY", { siteId }),
    forceDreamAuguryArchetype: (siteId, archetypeId) =>
      emit("FORCE_DREAM_AUGURY_ARCHETYPE", { siteId, archetypeId }),
    completeSite: (siteId) => emit("COMPLETE_SITE", { siteId }),

    // --- merchant & shop ---
    acceptMerchantOffer: (siteId, offer) =>
      emit("ACCEPT_MERCHANT_OFFER", offer === undefined ? { siteId } : { siteId, offer }),
    declineMerchant: (siteId) => emit("DECLINE_MERCHANT", { siteId }),
    buyShopSlot: (siteId, slotIndex) => emit("BUY_SHOP_SLOT", { siteId, slotIndex }),
    rerollShop: (siteId) => emit("REROLL_SHOP", { siteId }),
    grantFreeRerolls: (count) => emit("GRANT_FREE_REROLLS", { count }),
    applyShopDiscount: (percent) => emit("APPLY_SHOP_DISCOUNT", { percent }),

    // --- modifiers & atlas ---
    pushBattleModifier: (modifier) => emit("PUSH_BATTLE_MODIFIER", { modifier }),
    pushTemporaryBaneGrant: (payload) => emit("PUSH_TEMPORARY_BANE_GRANT", { ...payload }),
    banSiteType: (siteType, dreamscapesRemaining) =>
      emit("BAN_SITE_TYPE", { siteType, dreamscapesRemaining }),
    boostSiteAppearance: (siteType, percent, dreamscapesRemaining) =>
      emit("BOOST_SITE_APPEARANCE", { siteType, percent, dreamscapesRemaining }),
    replaceSiteType: (nodeId, fromSiteType, toSiteType) =>
      emit("REPLACE_SITE_TYPE", { nodeId, fromSiteType, toSiteType }),
    addSiteToDreamscape: (nodeId, siteType) =>
      emit("ADD_SITE_TO_DREAMSCAPE", { nodeId, siteType }),
    updateAtlas: (atlas) => emit("UPDATE_ATLAS", { atlas }),
    setCardSourceDebug: (state) => emit("SET_CARD_SOURCE_DEBUG", { state }),

    // --- battle lifecycle bridges ---
    endBattle: (result) => emit("END_BATTLE", { result }),
    questFailed: (summary) => emit("QUEST_FAILED", { summary }),

    // --- battle events ---
    beginBattle: (siteId) => emit("BEGIN_BATTLE", { siteId }),
    battleCommand: (command) => emit("BATTLE_COMMAND", { command }),
    resolvePrompt: (promptId, resolution) =>
      emit("RESOLVE_PROMPT", { promptId, resolution }),
    setCardNote: (instanceId, note) => emit("SET_CARD_NOTE", { instanceId, note }),
  };
}
