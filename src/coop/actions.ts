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
import type { GambleGameId, GravokGateId } from "../types/gamble";
import type {
  RandomSiteDestinationType,
  SiteType,
  TransfigurationType,
} from "../types/journey";
import { SELECTION_RULES_VERSION } from "../reward-selection";
import type { BattleId } from "../types/identifiers";
import type { PresentationId } from "../types/identifiers";
import type { DreamAvatarId } from "../types/identifiers";
import type { SiteId } from "../types/identifiers";
import type { AtlasNodeId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { DeckEntryId } from "../types/identifiers";
import type { DreamsignId } from "../types/identifiers";
import type { ShuffleCommitment } from "../types/identifiers";
import type { BattleCardId } from "../types/identifiers";
import type { TutorialAiActionOverrideId } from "../types/identifiers";
import type {
  AuguryArchetypeId,
  CardTutorialScreenKey,
  ClientId,
  ExplorationActionId,
  FrontDoorActionId,
  IntentKey,
  JourneyId,
  NoteId,
  TutorialActionId,
  TutorialRunId,
} from "../types/identifiers";
import type { BattleSide, BattlefieldSlotId } from "../battle/types";
import { asIntentKey } from "../types/identifiers";

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
    actionId: FrontDoorActionId,
    detail?: unknown,
  ) => Promise<number>;
  advanceFrontDoor: (
    from: "mainExiting" | "loading",
    journeyId: JourneyId,
  ) => Promise<number>;
  beginTutorial: (
    actions: readonly TutorialAction[],
    options?: BeginTutorialOptions,
  ) => Promise<number>;
  completeTutorialAction: (
    runId: TutorialRunId,
    actionId: TutorialActionId,
  ) => Promise<number>;
  takePlaytestControl: (
    previousControllerClientId: ClientId | null,
  ) => Promise<number>;
  beginTutorialBattle: (tutorialRunId: TutorialRunId) => Promise<number>;
  restartTutorialBattle: (battleId: BattleId) => Promise<number>;
  exitTutorialBattle: (battleId: BattleId) => Promise<number>;
  openCardTutorialGuidance: (
    screenKey: CardTutorialScreenKey,
    cardIds: readonly CardId[],
  ) => Promise<number>;
  completeCardTutorialGuidance: (
    presentationId: PresentationId,
    screenKey: CardTutorialScreenKey,
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
  selectDreamAvatar: (dreamAvatarId: DreamAvatarId) => Promise<number>;
  rerollDreamAvatarOffer: () => Promise<number>;

  // --- navigation ---
  enterSite: (siteId: SiteId) => Promise<number>;
  travelToDreamscape: (nodeId: AtlasNodeId) => Promise<number>;
  regenerateAtlas: (completionLevel?: number) => Promise<number>;
  dismissStartingDeckPopup: () => Promise<number>;

  // --- deck & transfiguration ---
  addCard: (options: {
    cardId: CardId;
    transfiguration?: unknown;
    source?: unknown;
  }) => Promise<number>;
  removeDeckEntry: (entryId: DeckEntryId) => Promise<number>;
  purgeDeckCards: (
    siteId: SiteId,
    entryIds: readonly DeckEntryId[],
  ) => Promise<number>;
  duplicateDeckEntry: (entryId: DeckEntryId) => Promise<number>;
  setDeckEntryStatOverride: (
    entryId: DeckEntryId,
    override: unknown,
  ) => Promise<number>;
  setDeckEntryKeywords: (
    entryId: DeckEntryId,
    keywords: unknown,
  ) => Promise<number>;
  setDeckEntryType: (
    entryId: DeckEntryId,
    typeChange: unknown,
  ) => Promise<number>;
  transfigureCard: (
    entryId: DeckEntryId,
    transfiguration: unknown,
  ) => Promise<number>;
  acceptTransfigurationChoice: (
    siteId: SiteId,
    entryId: DeckEntryId,
  ) => Promise<number>;
  acceptDuplicationChoice: (
    siteId: SiteId,
    entryId: DeckEntryId,
  ) => Promise<number>;
  purgeAllNightmareCards: () => Promise<number>;
  purgeRandomNightmareCards: (count: number) => Promise<number>;

  // --- dreamsigns ---
  addDreamsign: (dreamsignId: DreamsignId) => Promise<number>;
  removeDreamsign: (dreamsignId: DreamsignId) => Promise<number>;
  setDreamsignPool: (ids: readonly DreamsignId[]) => Promise<number>;

  // --- draft ---
  setDraftState: (draftState: unknown) => Promise<number>;
  pickDraftCard: (packIndex: number, cardId: CardId) => Promise<number>;
  rerollDraftOffer: (siteId: SiteId) => Promise<number>;
  enterDraftSite: (siteId: SiteId, runId?: JourneyId) => Promise<number>;

  // --- sites ---
  openSite: (
    siteId: SiteId,
    runId?: JourneyId,
    siteType?: SiteType,
    gambleGameId?: GambleGameId,
  ) => Promise<number>;
  chooseRandomSite: (
    siteId: SiteId,
    siteType: RandomSiteDestinationType,
  ) => Promise<number>;
  resolveExplorationChoice: (
    siteId: SiteId,
    actionId: ExplorationActionId,
    selection?: unknown,
  ) => Promise<number>;
  completeAugury: (siteId: SiteId) => Promise<number>;
  acceptReward: (siteId: SiteId, choiceIndex?: number) => Promise<number>;
  acceptDreamsignOffer: (
    siteId: SiteId,
    dreamsignId: DreamsignId,
  ) => Promise<number>;
  rejectDreamsignOffer: (siteId: SiteId) => Promise<number>;
  acceptEssence: (siteId: SiteId, runId?: JourneyId) => Promise<number>;
  rerollAugury: (siteId: SiteId) => Promise<number>;
  forceAuguryArchetype: (
    siteId: SiteId,
    archetypeId: AuguryArchetypeId,
  ) => Promise<number>;
  completeSite: (siteId: SiteId, runId?: JourneyId) => Promise<number>;
  placeGravokWager: (siteId: SiteId, gateId: GravokGateId) => Promise<number>;
  settleGravokWager: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  playAgainGravokWager: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  replaceGravokWagerDreamsign: (
    siteId: SiteId,
    replacedDreamsignId: DreamsignId,
  ) => Promise<number>;
  drawTidemarkLadderClimb: (siteId: SiteId) => Promise<number>;
  settleTidemarkLadderClimb: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  replaceTidemarkLadderClimbDreamsign: (
    siteId: SiteId,
    replacedDreamsignId: DreamsignId,
  ) => Promise<number>;
  drawStarwayStairs: (siteId: SiteId) => Promise<number>;
  settleStarwayStairs: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  cashOutStarwayStairs: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
  ) => Promise<number>;
  playAgainStarwayStairs: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  drawFourSuitReprise: (
    siteId: SiteId,
    entryId: DeckEntryId,
  ) => Promise<number>;
  settleFourSuitReprise: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  chooseFourSuitRepriseTransfiguration: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    type: TransfigurationType,
  ) => Promise<number>;
  playAgainFourSuitReprise: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  dealBlackjack: (siteId: SiteId) => Promise<number>;
  hitBlackjack: (siteId: SiteId) => Promise<number>;
  standBlackjack: (siteId: SiteId) => Promise<number>;
  settleBlackjack: (
    siteId: SiteId,
    shuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;
  playAgainBlackjack: (
    siteId: SiteId,
    previousShuffleCommitment: ShuffleCommitment,
    runId?: JourneyId,
  ) => Promise<number>;

  // --- merchant & shop ---
  acceptMerchantOffer: (siteId: SiteId, offer?: unknown) => Promise<number>;
  declineMerchant: (siteId: SiteId) => Promise<number>;
  buyShopSlot: (siteId: SiteId, slotIndex: number) => Promise<number>;
  rerollShop: (siteId: SiteId) => Promise<number>;
  grantFreeRerolls: (count: number) => Promise<number>;
  applyShopDiscount: (percent: number) => Promise<number>;

  // --- modifiers & atlas ---
  pushBattleModifier: (modifier: unknown) => Promise<number>;
  pushTemporaryNightmareGrant: (payload: {
    cardId: CardId;
    count: number;
    battlesRemaining: number;
    source: string;
  }) => Promise<number>;
  banSiteType: (
    siteType: SiteType,
    dreamscapesRemaining: number,
  ) => Promise<number>;
  boostSiteAppearance: (
    siteType: SiteType,
    percent: number,
    dreamscapesRemaining: number,
  ) => Promise<number>;
  replaceSiteType: (
    nodeId: AtlasNodeId,
    fromSiteType: SiteType,
    toSiteType: SiteType,
  ) => Promise<number>;
  addSiteToDreamscape: (
    nodeId: AtlasNodeId,
    siteType: SiteType,
  ) => Promise<number>;
  setCardSourceDebug: (state: unknown) => Promise<number>;

  // --- battle lifecycle bridges ---
  endBattle: () => Promise<number>;

  // --- battle events ---
  beginBattle: (
    siteId: SiteId,
    seedOverride?: number | null,
  ) => Promise<number>;
  setBattleAutomation: (enabled: boolean) => Promise<number>;
  battleCommand: (
    command: unknown,
    intentKey?: IntentKey,
    actor?: string,
  ) => Promise<number>;
  battleRepositionCharacter: (
    battleCardId: BattleCardId,
    destination: {
      readonly side: "player";
      readonly zone: "backRank" | "frontRank";
      readonly slotId: BattlefieldSlotId;
    },
  ) => Promise<number>;
  battlePlayCard: (
    battleCardId: BattleCardId,
    targetBattleCardIds: readonly BattleCardId[],
    intentKey?: IntentKey,
    actor?: string,
    aiChoices?: unknown,
    characterDestination?: {
      readonly side: "player" | "enemy";
      readonly zone: "backRank";
      readonly slotId: BattlefieldSlotId;
    },
    tutorialAiActionOverrideId?: TutorialAiActionOverrideId,
  ) => Promise<number>;
  /** Submit an ordered list of battle commands as one all-or-nothing event. */
  battleGesture: (
    commands: readonly unknown[],
    intentKey?: IntentKey,
    actor?: string,
  ) => Promise<number>;
  battleAiBlock: (
    aiSide: BattleSide,
    actor: string,
    intentKey?: IntentKey,
  ) => Promise<number>;
  completeTutorialBattlePresentation: (
    presentationId: PresentationId,
    intentKey: IntentKey,
    actor: string,
    messageIndex?: number,
  ) => Promise<number>;
  resolvePrompt: (
    promptId: number,
    resolution: unknown,
    intentKey?: IntentKey,
    actor?: string,
  ) => Promise<number>;
  setCardNote: (
    instanceId: BattleCardId,
    note: { noteId: NoteId; text: string; expiry: unknown },
  ) => Promise<number>;
}

/**
 * Build the action facade over an `append` function. Pure and dependency-free:
 * the caller supplies `append` (the room LogClient's `submit` in production, a
 * fake in tests), and every creator is a thin payload-builder that appends one
 * event.
 */
export function makeActions(
  append: AppendFn,
  options: { selectionRulesVersion?: string | null } = {},
): CoopActions {
  const selectionRulesVersion =
    options.selectionRulesVersion === undefined
      ? SELECTION_RULES_VERSION
      : options.selectionRulesVersion;
  const emit = (
    type: string,
    payload: Record<string, unknown>,
    intentKey?: IntentKey,
  ): Promise<number> =>
    append({
      type,
      payload,
      ...(intentKey === undefined ? {} : { intentKey }),
    });
  const siteIntentKey = (
    kind: string,
    siteId: SiteId,
    runId?: JourneyId,
  ): IntentKey => asIntentKey(`${kind}:${runId ?? "unscoped"}:${siteId}`);

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
        asIntentKey(`tutorial:${runId}:complete:${actionId}`),
      ),
    takePlaytestControl: (previousControllerClientId) =>
      emit("TAKE_PLAYTEST_CONTROL", { previousControllerClientId }),
    beginTutorialBattle: (tutorialRunId) =>
      emit(
        "BEGIN_TUTORIAL_BATTLE",
        { tutorialRunId },
        asIntentKey(`tutorial-battle:${tutorialRunId}:begin`),
      ),
    restartTutorialBattle: (battleId) =>
      emit(
        "RESTART_TUTORIAL_BATTLE",
        { battleId },
        asIntentKey(`tutorial-battle:${battleId}:restart`),
      ),
    exitTutorialBattle: (battleId) =>
      emit(
        "EXIT_TUTORIAL_BATTLE",
        { battleId },
        asIntentKey(`tutorial-battle:${battleId}:exit`),
      ),
    openCardTutorialGuidance: (screenKey, cardIds) =>
      emit(
        "OPEN_CARD_TUTORIAL_GUIDANCE",
        {
          screenKey,
          cardIds: [...cardIds],
        },
        asIntentKey(`card-tutorial:${screenKey}:open`),
      ),
    completeCardTutorialGuidance: (presentationId, screenKey) =>
      emit(
        "COMPLETE_CARD_TUTORIAL_GUIDANCE",
        { presentationId },
        asIntentKey(`card-tutorial:${screenKey}:complete`),
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
    purgeAllNightmareCards: () => emit("PURGE_ALL_NIGHTMARE_CARDS", {}),
    purgeRandomNightmareCards: (count) =>
      emit("PURGE_RANDOM_NIGHTMARE_CARDS", { count }),

    // --- dreamsigns ---
    addDreamsign: (dreamsignId) => emit("ADD_DREAMSIGN", { dreamsignId }),
    removeDreamsign: (dreamsignId) => emit("REMOVE_DREAMSIGN", { dreamsignId }),
    setDreamsignPool: (ids) => emit("SET_DREAMSIGN_POOL", { ids: [...ids] }),

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
    openSite: (siteId, runId, siteType, gambleGameId) =>
      emit(
        "OPEN_SITE",
        {
          siteId,
          ...(gambleGameId === undefined ? {} : { gambleGameId }),
          ...(selectionRulesVersion === null ? {} : { selectionRulesVersion }),
        },
        asIntentKey(
          gambleGameId === undefined
            ? siteIntentKey(`open-site:${siteType ?? "unknown"}`, siteId, runId)
            : `${siteIntentKey(`open-site:${siteType ?? "unknown"}`, siteId, runId)}:${gambleGameId}`,
        ),
      ),
    chooseRandomSite: (siteId, siteType) =>
      emit("CHOOSE_RANDOM_SITE", { siteId, siteType }),
    resolveExplorationChoice: (siteId, actionId, selection) =>
      emit("RESOLVE_EXPLORATION_CHOICE", {
        siteId,
        actionId,
        ...(selectionRulesVersion === null ? {} : { selectionRulesVersion }),
        ...(selection === undefined ? {} : { selection }),
      }),
    completeAugury: (siteId) => emit("COMPLETE_AUGURY", { siteId }),
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
    rerollAugury: (siteId) => emit("REROLL_AUGURY", { siteId }),
    forceAuguryArchetype: (siteId, archetypeId) =>
      emit("FORCE_AUGURY_ARCHETYPE", { siteId, archetypeId }),
    completeSite: (siteId, runId) =>
      emit(
        "COMPLETE_SITE",
        { siteId },
        siteIntentKey("complete-site", siteId, runId),
      ),
    placeGravokWager: (siteId, gateId) =>
      emit("PLACE_GRAVOK_WAGER", { siteId, gateId }),
    settleGravokWager: (siteId, shuffleCommitment, runId) =>
      emit(
        "SETTLE_GRAVOK_WAGER",
        { siteId, shuffleCommitment },
        asIntentKey(
          `${siteIntentKey("settle-gravok-wager", siteId, runId)}:${shuffleCommitment}`,
        ),
      ),
    playAgainGravokWager: (siteId, previousShuffleCommitment, runId) =>
      emit(
        "PLAY_AGAIN_GRAVOK_WAGER",
        { siteId, previousShuffleCommitment },
        asIntentKey(
          `${siteIntentKey("play-again-gravok-wager", siteId, runId)}:${previousShuffleCommitment}`,
        ),
      ),
    replaceGravokWagerDreamsign: (siteId, replacedDreamsignId) =>
      emit("REPLACE_GRAVOK_WAGER_DREAMSIGN", {
        siteId,
        replacedDreamsignId,
      }),
    drawTidemarkLadderClimb: (siteId) =>
      emit("DRAW_TIDEMARK_LADDER_CLIMB", { siteId }),
    settleTidemarkLadderClimb: (siteId, shuffleCommitment, runId) =>
      emit(
        "SETTLE_TIDEMARK_LADDER_CLIMB",
        { siteId, shuffleCommitment },
        asIntentKey(
          `${siteIntentKey("settle-tidemark-ladder-climb", siteId, runId)}:${shuffleCommitment}`,
        ),
      ),
    replaceTidemarkLadderClimbDreamsign: (siteId, replacedDreamsignId) =>
      emit("REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN", {
        siteId,
        replacedDreamsignId,
      }),
    drawStarwayStairs: (siteId) => emit("DRAW_STARWAY_STAIRS", { siteId }),
    settleStarwayStairs: (siteId, shuffleCommitment, runId) =>
      emit(
        "SETTLE_STARWAY_STAIRS",
        { siteId, shuffleCommitment },
        asIntentKey(
          `${siteIntentKey("settle-starway-stairs", siteId, runId)}:${shuffleCommitment}`,
        ),
      ),
    cashOutStarwayStairs: (siteId, shuffleCommitment) =>
      emit("CASH_OUT_STARWAY_STAIRS", { siteId, shuffleCommitment }),
    playAgainStarwayStairs: (siteId, previousShuffleCommitment, runId) =>
      emit(
        "PLAY_AGAIN_STARWAY_STAIRS",
        { siteId, previousShuffleCommitment },
        asIntentKey(
          `${siteIntentKey("play-again-starway-stairs", siteId, runId)}:${previousShuffleCommitment}`,
        ),
      ),
    drawFourSuitReprise: (siteId, entryId) =>
      emit("DRAW_FOUR_SUIT_REPRISE", { siteId, entryId }),
    settleFourSuitReprise: (siteId, shuffleCommitment, runId) =>
      emit(
        "SETTLE_FOUR_SUIT_REPRISE",
        { siteId, shuffleCommitment },
        asIntentKey(
          `${siteIntentKey("settle-four-suit-reprise", siteId, runId)}:${shuffleCommitment}`,
        ),
      ),
    chooseFourSuitRepriseTransfiguration: (siteId, shuffleCommitment, type) =>
      emit("CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION", {
        siteId,
        shuffleCommitment,
        type,
      }),
    playAgainFourSuitReprise: (siteId, previousShuffleCommitment, runId) =>
      emit(
        "PLAY_AGAIN_FOUR_SUIT_REPRISE",
        { siteId, previousShuffleCommitment },
        asIntentKey(
          `${siteIntentKey("play-again-four-suit-reprise", siteId, runId)}:${previousShuffleCommitment}`,
        ),
      ),
    dealBlackjack: (siteId) => emit("DEAL_BLACKJACK", { siteId }),
    hitBlackjack: (siteId) => emit("HIT_BLACKJACK", { siteId }),
    standBlackjack: (siteId) => emit("STAND_BLACKJACK", { siteId }),
    settleBlackjack: (siteId, shuffleCommitment, runId) =>
      emit(
        "SETTLE_BLACKJACK",
        { siteId, shuffleCommitment },
        asIntentKey(
          `${siteIntentKey("settle-blackjack", siteId, runId)}:${shuffleCommitment}`,
        ),
      ),
    playAgainBlackjack: (siteId, previousShuffleCommitment, runId) =>
      emit(
        "PLAY_AGAIN_BLACKJACK",
        { siteId, previousShuffleCommitment },
        asIntentKey(
          `${siteIntentKey("play-again-blackjack", siteId, runId)}:${previousShuffleCommitment}`,
        ),
      ),

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
    pushTemporaryNightmareGrant: (payload) =>
      emit("PUSH_TEMPORARY_NIGHTMARE_GRANT", { ...payload }),
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
    battlePlayCard: (
      battleCardId,
      targetBattleCardIds,
      intentKey,
      actor,
      aiChoices,
      characterDestination,
      tutorialAiActionOverrideId,
    ) =>
      append({
        type: "BATTLE_PLAY_CARD",
        payload: {
          battleCardId,
          targetBattleCardIds: [...targetBattleCardIds],
          ...(aiChoices === undefined ? {} : { aiChoices }),
          ...(characterDestination === undefined
            ? {}
            : { characterDestination }),
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
