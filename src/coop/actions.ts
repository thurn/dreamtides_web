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
// Signatures mirror the legacy `JourneyMutations` call ergonomics
// (src/state/journey-context.tsx) closely enough that Task 26 can back that
// interface with these creators; complex payload shapes are typed `unknown`
// here to keep this module import-light (the reducer's domain case is the one
// place that narrows them).
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Client layer" (actions facade).

import type { EventDraft } from "../eventlog/client";
import type { BeginTutorialOptions, TutorialAction } from "../types/tutorial";
import type { GravokGateId } from "../types/gamble";

/**
 * Appends a stamped event, resolving to its committed seq. In production this
 * is the room LogClient's `submit`; in tests it is a fake that records drafts.
 * An `actor` on the draft overrides the client's own id (Task 27's AI loop
 * appends with `actor: "ai:<clientId>"`).
 */
export type AppendFn = (draft: EventDraft) => Promise<number>;

/** The full set of named action creators the screens call. */
export interface CoopActions {
  // --- standalone front door ---
  frontDoorAction: (
    surface: "main" | "tutorial",
    actionId: string,
    detail?: unknown,
  ) => Promise<number>;
  advanceFrontDoor: (
    from: "mainExiting" | "loading",
    journeyId: string,
  ) => Promise<number>;
  beginTutorial: (
    actions: readonly TutorialAction[],
    options?: BeginTutorialOptions,
  ) => Promise<number>;
  completeTutorialAction: (runId: string, actionId: string) => Promise<number>;
  takePlaytestControl: (
    previousControllerClientId: string | null,
  ) => Promise<number>;
  beginTutorialBattle: (tutorialRunId: string) => Promise<number>;
  restartTutorialBattle: (battleId: string) => Promise<number>;
  exitTutorialBattle: (battleId: string) => Promise<number>;
  openCardTutorialGuidance: (
    screenKey: string,
    cardIds: readonly string[],
  ) => Promise<number>;
  completeCardTutorialGuidance: (
    presentationId: string,
    screenKey: string,
  ) => Promise<number>;

  // --- essence & limits ---
  changeEssence: (delta: number) => Promise<number>;
  setEssence: (value: number) => Promise<number>;
  setMaxDreamsigns: (value: number) => Promise<number>;

  // --- lifecycle ---
  startJourney: (payload?: Record<string, unknown>) => Promise<number>;
  resetJourney: () => Promise<number>;
  loadState: (snapshot: unknown, battle?: unknown) => Promise<number>;

  // --- dreamAvatar ---
  selectDreamAvatar: (dreamAvatarId: string) => Promise<number>;
  rerollDreamAvatarOffer: () => Promise<number>;

  // --- navigation ---
  enterSite: (siteId: string) => Promise<number>;
  travelToDreamscape: (nodeId: string) => Promise<number>;
  regenerateAtlas: (completionLevel?: number) => Promise<number>;
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
    siteId: string,
    entryIds: readonly string[],
  ) => Promise<number>;
  duplicateDeckEntry: (entryId: string) => Promise<number>;
  setDeckEntryStatOverride: (
    entryId: string,
    override: unknown,
  ) => Promise<number>;
  setDeckEntryKeywords: (entryId: string, keywords: unknown) => Promise<number>;
  setDeckEntryType: (entryId: string, typeChange: unknown) => Promise<number>;
  transfigureCard: (
    entryId: string,
    transfiguration: unknown,
  ) => Promise<number>;
  acceptTransfigurationChoice: (
    siteId: string,
    entryId: string,
  ) => Promise<number>;
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
  rerollDraftOffer: (siteId: string) => Promise<number>;
  enterDraftSite: (siteId: string, runId?: string) => Promise<number>;

  // --- sites ---
  openSite: (siteId: string, runId?: string) => Promise<number>;
  completeDreamAugury: (siteId: string) => Promise<number>;
  acceptReward: (siteId: string, choiceIndex?: number) => Promise<number>;
  acceptDreamsignOffer: (
    siteId: string,
    dreamsignId: string,
  ) => Promise<number>;
  rejectDreamsignOffer: (siteId: string) => Promise<number>;
  acceptEssence: (siteId: string, runId?: string) => Promise<number>;
  rerollDreamAugury: (siteId: string) => Promise<number>;
  forceDreamAuguryArchetype: (
    siteId: string,
    archetypeId: string,
  ) => Promise<number>;
  completeSite: (siteId: string, runId?: string) => Promise<number>;
  placeGravokWager: (
    siteId: string,
    gateId: GravokGateId,
  ) => Promise<number>;
  replaceGravokWagerDreamsign: (
    siteId: string,
    replacedDreamsignId: string,
  ) => Promise<number>;

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
  banSiteType: (
    siteType: string,
    dreamscapesRemaining: number,
  ) => Promise<number>;
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
  setCardSourceDebug: (state: unknown) => Promise<number>;

  // --- battle lifecycle bridges ---
  endBattle: () => Promise<number>;

  // --- battle events ---
  beginBattle: (
    siteId: string,
    seedOverride?: number | null,
  ) => Promise<number>;
  setBattleAutomation: (enabled: boolean) => Promise<number>;
  battleCommand: (
    command: unknown,
    intentKey?: string,
    actor?: string,
  ) => Promise<number>;
  battleRepositionCharacter: (
    battleCardId: string,
    destination: {
      readonly side: "player";
      readonly zone: "backRank" | "frontRank";
      readonly slotId: string;
    },
  ) => Promise<number>;
  battlePlayCard: (
    battleCardId: string,
    targetBattleCardIds: readonly string[],
    intentKey?: string,
    actor?: string,
    aiChoices?: unknown,
    characterDestination?: {
      readonly side: "player" | "enemy";
      readonly zone: "backRank";
      readonly slotId: string;
    },
    tutorialAiActionOverrideId?: string,
  ) => Promise<number>;
  /** Submit an ordered list of battle commands as one all-or-nothing event. */
  battleGesture: (
    commands: readonly unknown[],
    intentKey?: string,
    actor?: string,
  ) => Promise<number>;
  battleAiBlock: (aiSide: string, actor: string, intentKey?: string) => Promise<number>;
  completeTutorialBattlePresentation: (
    presentationId: string,
    intentKey: string,
    actor: string,
    messageIndex?: number,
  ) => Promise<number>;
  resolvePrompt: (promptId: number, resolution: unknown, intentKey?: string, actor?: string) => Promise<number>;
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
  const emit = (
    type: string,
    payload: Record<string, unknown>,
    intentKey?: string,
  ): Promise<number> =>
    append({
      type,
      payload,
      ...(intentKey === undefined ? {} : { intentKey }),
    });
  const siteIntentKey = (
    kind: string,
    siteId: string,
    runId?: string,
  ): string => `${kind}:${runId ?? "unscoped"}:${siteId}`;

  return {
    // --- standalone front door ---
    frontDoorAction: (surface, actionId, detail) =>
      emit(
        "FRONT_DOOR_ACTION",
        detail === undefined
          ? { surface, actionId }
          : { surface, actionId, detail },
      ),
    advanceFrontDoor: (from, journeyId) =>
      append({
        type: "ADVANCE_FRONT_DOOR",
        payload: { from, journeyId },
        intentKey: `front-door:${journeyId}:${from}`,
      }),
    beginTutorial: (actions, options) =>
      emit(
        "BEGIN_TUTORIAL",
        {
          actions: [...actions],
          ...(options?.startActionId === undefined
            ? {}
            : { startActionId: options.startActionId }),
          ...(options?.startAtEnd === true ? { startAtEnd: true } : {}),
        },
        options?.intentKey,
      ),
    completeTutorialAction: (runId, actionId) =>
      emit(
        "COMPLETE_TUTORIAL_ACTION",
        { runId, actionId },
        `tutorial:${runId}:complete:${actionId}`,
      ),
    takePlaytestControl: (previousControllerClientId) =>
      emit("TAKE_PLAYTEST_CONTROL", { previousControllerClientId }),
    beginTutorialBattle: (tutorialRunId) =>
      emit(
        "BEGIN_TUTORIAL_BATTLE",
        { tutorialRunId },
        `tutorial-battle:${tutorialRunId}:begin`,
      ),
    restartTutorialBattle: (battleId) =>
      emit(
        "RESTART_TUTORIAL_BATTLE",
        { battleId },
        `tutorial-battle:${battleId}:restart`,
      ),
    exitTutorialBattle: (battleId) =>
      emit(
        "EXIT_TUTORIAL_BATTLE",
        { battleId },
        `tutorial-battle:${battleId}:exit`,
      ),
    openCardTutorialGuidance: (screenKey, cardIds) =>
      emit(
        "OPEN_CARD_TUTORIAL_GUIDANCE",
        {
          screenKey,
          cardIds: [...cardIds],
        },
        `card-tutorial:${screenKey}:open`,
      ),
    completeCardTutorialGuidance: (presentationId, screenKey) =>
      emit(
        "COMPLETE_CARD_TUTORIAL_GUIDANCE",
        { presentationId },
        `card-tutorial:${screenKey}:complete`,
      ),

    // --- essence & limits ---
    changeEssence: (delta) => emit("ADJUST_ESSENCE", { delta }),
    setEssence: (value) => emit("SET_ESSENCE", { value }),
    setMaxDreamsigns: (value) => emit("SET_MAX_DREAMSIGNS", { value }),

    // --- lifecycle ---
    startJourney: (payload = {}) => emit("START_JOURNEY", { ...payload }),
    resetJourney: () => emit("RESET_JOURNEY", {}),
    loadState: (snapshot, battle) =>
      emit(
        "LOAD_STATE",
        battle === undefined ? { snapshot } : { snapshot, battle },
      ),

    // --- dreamAvatar ---
    selectDreamAvatar: (dreamAvatarId) =>
      emit("SELECT_DREAM_AVATAR", { dreamAvatarId }),
    rerollDreamAvatarOffer: () => emit("REROLL_DREAM_AVATAR_OFFER", {}),

    // --- navigation ---
    enterSite: (siteId) => emit("ENTER_SITE", { siteId }),
    travelToDreamscape: (nodeId) => emit("TRAVEL_TO_DREAMSCAPE", { nodeId }),
    regenerateAtlas: (completionLevel) =>
      emit(
        "REGENERATE_ATLAS",
        completionLevel === undefined ? {} : { completionLevel },
      ),
    dismissStartingDeckPopup: () => emit("DISMISS_STARTING_DECK_POPUP", {}),

    // --- deck & transfiguration ---
    addCard: (options) => emit("ADD_CARD", { ...options }),
    removeDeckEntry: (entryId) => emit("REMOVE_DECK_ENTRY", { entryId }),
    purgeDeckCards: (siteId, entryIds) =>
      emit("PURGE_DECK_CARDS", {
        siteId,
        entryIds: [...entryIds],
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
    pickDraftCard: (packIndex, cardId) =>
      emit("PICK_DRAFT_CARD", { packIndex, cardId }),
    rerollDraftOffer: (siteId) => emit("REROLL_DRAFT_OFFER", { siteId }),
    enterDraftSite: (siteId, runId) =>
      emit(
        "ENTER_DRAFT_SITE",
        { siteId },
        siteIntentKey("enter-draft-site", siteId, runId),
      ),

    // --- sites ---
    openSite: (siteId, runId) =>
      emit("OPEN_SITE", { siteId }, siteIntentKey("open-site", siteId, runId)),
    completeDreamAugury: (siteId) => emit("COMPLETE_DREAM_AUGURY", { siteId }),
    acceptReward: (siteId, choiceIndex) =>
      emit(
        "ACCEPT_REWARD",
        choiceIndex === undefined ? { siteId } : { siteId, choiceIndex },
      ),
    acceptDreamsignOffer: (siteId, dreamsignId) =>
      emit("ACCEPT_DREAMSIGN_OFFER", { siteId, dreamsignId }),
    rejectDreamsignOffer: (siteId) =>
      emit("REJECT_DREAMSIGN_OFFER", { siteId }),
    acceptEssence: (siteId, runId) =>
      emit(
        "ACCEPT_ESSENCE",
        { siteId },
        siteIntentKey("accept-essence", siteId, runId),
      ),
    rerollDreamAugury: (siteId) => emit("REROLL_DREAM_AUGURY", { siteId }),
    forceDreamAuguryArchetype: (siteId, archetypeId) =>
      emit("FORCE_DREAM_AUGURY_ARCHETYPE", { siteId, archetypeId }),
    completeSite: (siteId, runId) =>
      emit(
        "COMPLETE_SITE",
        { siteId },
        siteIntentKey("complete-site", siteId, runId),
      ),
    placeGravokWager: (siteId, gateId) =>
      emit("PLACE_GRAVOK_WAGER", { siteId, gateId }),
    replaceGravokWagerDreamsign: (siteId, replacedDreamsignId) =>
      emit("REPLACE_GRAVOK_WAGER_DREAMSIGN", {
        siteId,
        replacedDreamsignId,
      }),

    // --- merchant & shop ---
    acceptMerchantOffer: (siteId, offer) =>
      emit(
        "ACCEPT_MERCHANT_OFFER",
        offer === undefined ? { siteId } : { siteId, offer },
      ),
    declineMerchant: (siteId) => emit("DECLINE_MERCHANT", { siteId }),
    buyShopSlot: (siteId, slotIndex) =>
      emit("BUY_SHOP_SLOT", { siteId, slotIndex }),
    rerollShop: (siteId) => emit("REROLL_SHOP", { siteId }),
    grantFreeRerolls: (count) => emit("GRANT_FREE_REROLLS", { count }),
    applyShopDiscount: (percent) => emit("APPLY_SHOP_DISCOUNT", { percent }),

    // --- modifiers & atlas ---
    pushBattleModifier: (modifier) =>
      emit("PUSH_BATTLE_MODIFIER", { modifier }),
    pushTemporaryBaneGrant: (payload) =>
      emit("PUSH_TEMPORARY_BANE_GRANT", { ...payload }),
    banSiteType: (siteType, dreamscapesRemaining) =>
      emit("BAN_SITE_TYPE", { siteType, dreamscapesRemaining }),
    boostSiteAppearance: (siteType, percent, dreamscapesRemaining) =>
      emit("BOOST_SITE_APPEARANCE", {
        siteType,
        percent,
        dreamscapesRemaining,
      }),
    replaceSiteType: (nodeId, fromSiteType, toSiteType) =>
      emit("REPLACE_SITE_TYPE", { nodeId, fromSiteType, toSiteType }),
    addSiteToDreamscape: (nodeId, siteType) =>
      emit("ADD_SITE_TO_DREAMSCAPE", { nodeId, siteType }),
    setCardSourceDebug: (state) => emit("SET_CARD_SOURCE_DEBUG", { state }),

    // --- battle lifecycle bridges ---
    endBattle: () => emit("END_BATTLE", {}),

    // --- battle events ---
    beginBattle: (siteId, seedOverride) =>
      emit("BEGIN_BATTLE", {
        siteId,
        ...(seedOverride === undefined || seedOverride === null
          ? {}
          : { seedOverride }),
      }),
    setBattleAutomation: (enabled) =>
      emit("SET_BATTLE_AUTOMATION", { enabled }),
    battleCommand: (command, intentKey, actor) =>
      append({
        type: "BATTLE_COMMAND",
        payload: { command },
        ...(intentKey === undefined ? {} : { intentKey }),
        ...(actor === undefined ? {} : { actor }),
      }),
    battleRepositionCharacter: (battleCardId, destination) =>
      emit("BATTLE_REPOSITION_CHARACTER", {
        battleCardId,
        destination,
      }),
    battlePlayCard: (battleCardId, targetBattleCardIds, intentKey, actor, aiChoices, characterDestination, tutorialAiActionOverrideId) =>
      append({
        type: "BATTLE_PLAY_CARD",
        payload: {
          battleCardId,
          targetBattleCardIds: [...targetBattleCardIds],
          ...(aiChoices === undefined ? {} : { aiChoices }),
          ...(characterDestination === undefined ? {} : { characterDestination }),
          ...(tutorialAiActionOverrideId === undefined
            ? {}
            : { tutorialAiActionOverrideId }),
        },
        ...(intentKey === undefined ? {} : { intentKey }),
        ...(actor === undefined ? {} : { actor }),
      }),
    battleGesture: (commands, intentKey, actor) =>
      append({
        type: "BATTLE_GESTURE",
        payload: { commands: [...commands] },
        ...(intentKey === undefined ? {} : { intentKey }),
        ...(actor === undefined ? {} : { actor }),
      }),
    battleAiBlock: (aiSide, actor, intentKey) =>
      append({
        type: "BATTLE_AI_BLOCK",
        payload: { aiSide },
        actor,
        ...(intentKey === undefined ? {} : { intentKey }),
      }),
    completeTutorialBattlePresentation: (
      presentationId,
      intentKey,
      actor,
      messageIndex,
    ) =>
      append({
        type: "COMPLETE_TUTORIAL_BATTLE_PRESENTATION",
        payload: {
          presentationId,
          ...(messageIndex === undefined ? {} : { messageIndex }),
        },
        intentKey,
        actor,
      }),
    resolvePrompt: (promptId, resolution, intentKey, actor) =>
      append({
        type: "RESOLVE_PROMPT",
        payload: { promptId, resolution },
        ...(intentKey === undefined ? {} : { intentKey }),
        ...(actor === undefined ? {} : { actor }),
      }),
    setCardNote: (instanceId, note) =>
      emit("SET_CARD_NOTE", { instanceId, note }),
  };
}
