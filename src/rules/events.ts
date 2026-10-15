import type {
  AtlasNodeId,
  AuguryArchetypeId,
  BattleId,
  CardTutorialScreenKey,
  ChoiceId,
  DeckEntryId,
  AvatarId,
  DreamsignId,
  ExplorationActionId,
  FrontDoorActionId,
  JourneyId,
  OfferId,
  PresentationId,
  PromptId,
  ShuffleCommitment,
  SiteId,
  TutorialActionId,
  TutorialRunId,
} from "../types/identifiers";
import { identityKeys } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { StableDigest } from "../types/stable-digest";
import type { TutorialAction } from "../types/tutorial";
import type { JourneyMutationSource } from "../types/journey-source";
import type {
  RandomSiteDestinationType,
  SiteType,
  TransfigurationType,
} from "../types/journey";
import type { BattleSide } from "../battle/types";
import type { SelectionRulesVersion } from "../reward-selection/types";
import type { EventType } from "../eventlog/types";

// The reducer-internal typed view of every event that folds over `FoldState`.
//
// At the engine boundary a `GameEvent.payload` is `Record<string, unknown>`
// (see src/eventlog/types.ts): the log stores untyped JSON. This module is the
// rules layer's *typed* view — one payload interface per event type, collected in
// `EventPayloads` — plus the classification sets
// (CAS-exempt, decision-neutral) the root CAS policy consults.
//
// Payloads use UUIDs, selections, and indices — never card names (AGENTS.md).
// Derived outcomes, prices, rewards, routes, and progression stay in the
// reducer. Complex debug snapshots and battle commands are typed as `unknown`
// here so this file stays import-light; the owning domain case validates them.

// ---------------------------------------------------------------------------
// Payload map — the single source of truth for event type → payload shape.
// ---------------------------------------------------------------------------

/**
 * The fields an Augury decline names: the encounter the player saw and the
 * offer the decline resolves against. The site content provider regenerates
 * the encounter and rejects a stale signature or unknown offer. Payload shapes
 * are type aliases (not interfaces) so they stay assignable to the log's
 * `Record<string, unknown>` payload.
 */
export type AuguryDeclinePayload = {
  encounterSignature: StableDigest;
  offerId: OfferId;
  selectionRulesVersion?: SelectionRulesVersion;
  choice?: { choiceId: ChoiceId };
};

/** An Augury acceptance additionally names the archetype of the taken offer. */
export type AuguryAcceptPayload = AuguryDeclinePayload & {
  archetypeId: AuguryArchetypeId;
};

/**
 * Maps each event `type` literal to its payload interface. Keys are the
 * authoritative set of event types the rules layer understands.
 */
export interface EventPayloads {
  // --- standalone front door ---
  FRONT_DOOR_ACTION: {
    surface: "main" | "tutorial";
    actionId: FrontDoorActionId;
    detail?: unknown;
  };
  ADVANCE_FRONT_DOOR: {
    from: "mainExiting" | "loading";
    journeyId: JourneyId;
  };
  BEGIN_TUTORIAL: {
    actions: TutorialAction[];
    startActionId?: TutorialActionId;
    startAtEnd?: true;
  };
  COMPLETE_TUTORIAL_ACTION: {
    runId: TutorialRunId;
    actionId: TutorialActionId;
  };
  BEGIN_TUTORIAL_BATTLE: { tutorialRunId: TutorialRunId };
  RESTART_TUTORIAL_BATTLE: {
    battleId: BattleId;
  };
  EXIT_TUTORIAL_BATTLE: { battleId: BattleId };
  OPEN_CARD_TUTORIAL_GUIDANCE: {
    screenKey: CardTutorialScreenKey;
    cardIds: CardId[];
  };
  COMPLETE_CARD_TUTORIAL_GUIDANCE: { presentationId: PresentationId };

  // --- essence & limits ---
  ADJUST_ESSENCE: { delta: number };
  SET_ESSENCE: { value: number };
  SET_MAX_DREAMSIGNS: { value: number };

  // --- lifecycle ---
  START_JOURNEY: Record<string, unknown>;
  RESET_JOURNEY: Record<string, never>;
  LOAD_STATE: { snapshot: unknown; battle?: unknown };

  // --- avatar ---
  SELECT_AVATAR: { avatarId: AvatarId };
  REROLL_AVATAR_OFFER: Record<string, never>;

  // --- navigation ---
  ENTER_SITE: { siteId: SiteId };
  TRAVEL_TO_DREAMSCAPE: { nodeId: AtlasNodeId };
  REGENERATE_ATLAS: { completionLevel?: number };
  DISMISS_STARTING_DECK_POPUP: Record<string, never>;

  // --- deck & transfiguration ---
  ADD_CARD: {
    cardId: CardId;
    transfiguration?: unknown;
    source?: unknown;
  };
  REMOVE_DECK_ENTRY: { entryId: DeckEntryId };
  RESOLVE_JOURNEY_DUPLICATION: { siteId: SiteId; dreamsignId: DreamsignId; heldIndex: number; choiceIndex: number; earnedSeq: number; entryId: DeckEntryId | null };
  RESOLVE_JOURNEY_TRANSFIGURATION: { siteId: SiteId; dreamsignId: DreamsignId; heldIndex: number; choiceIndex: number; entryIds: DeckEntryId[] };
  RESOLVE_AFTER_BATTLE_DREAMSIGN: { siteId: SiteId; dreamsignId: DreamsignId; heldIndex: number; choiceIndex: number; earnedSeq: number; offeredDreamsignId: DreamsignId | null; purgeIndex?: number };
  RESOLVE_DREAMSIGN_COPY: { sourceDreamsignId: DreamsignId; heldIndex: number; choiceIndex: number; permissionSeq: number; targetHeldIndex: number; expectedTargetDreamsignId: DreamsignId };
  RESOLVE_STARTER_PURGE: { dreamsignId: DreamsignId; heldIndex: number; choiceIndex: number; permissionSeq: number; entryIds: DeckEntryId[] };
  RESOLVE_JOURNEY_PURGE: { siteId: SiteId; dreamsignId: DreamsignId; heldIndex: number; choiceIndex: number; entryIds: DeckEntryId[] };
  PURGE_DECK_CARDS: { siteId: SiteId; entryIds: DeckEntryId[] };
  DUPLICATE_DECK_ENTRY: { entryId: DeckEntryId };
  SET_DECK_ENTRY_STAT_OVERRIDE: { entryId: DeckEntryId; override: unknown };
  SET_DECK_ENTRY_KEYWORDS: { entryId: DeckEntryId; keywords: unknown };
  SET_DECK_ENTRY_TYPE: { entryId: DeckEntryId; typeChange: unknown };
  TRANSFIGURE_CARD: { entryId: DeckEntryId; transfiguration: unknown };
  ACCEPT_TRANSFIGURATION_CHOICE: {
    siteId: SiteId;
    entryId: DeckEntryId;
    type?: TransfigurationType;
  };
  ACCEPT_DUPLICATION_CHOICE: { siteId: SiteId; entryId: DeckEntryId };
  PURGE_ALL_NIGHTMARE_CARDS: Record<string, never>;
  PURGE_RANDOM_NIGHTMARE_CARDS: { count: number };

  // --- dreamsigns ---
  // `purgeIndex` names the held Dreamsign the new one replaces at the cap.
  ADD_DREAMSIGN: { dreamsignId: DreamsignId; purgeIndex?: number };
  REMOVE_DREAMSIGN: { dreamsignId: DreamsignId };
  SET_DREAMSIGN_POOL: { ids: DreamsignId[] };

  // --- draft ---
  SET_DRAFT_STATE: { draftState: unknown };
  PICK_DRAFT_CARD: { packIndex: number; cardId: CardId };
  REROLL_DRAFT_OFFER: { siteId: SiteId };
  ENTER_DRAFT_SITE: { siteId: SiteId };

  // --- sites ---
  OPEN_SITE: {
    siteId: SiteId;
    selectionRulesVersion: SelectionRulesVersion;
    gambleGameId?:
      | "gravok-three-gate-wager"
      | "tidemark-ladder-climb"
      | "starway-stairs"
      | "four-suit-reprise"
      | "blackjack";
  };
  CHOOSE_RANDOM_SITE: { siteId: SiteId; siteType: RandomSiteDestinationType };
  REROLL_EXPLORATION: {
    siteId: SiteId;
    dreamsignId: DreamsignId;
    expectedEncounterCardId: CardId;
    expectedRerollCount: number;
    selectionRulesVersion: SelectionRulesVersion;
  };
  RESOLVE_EXPLORATION_CHOICE: {
    expectedEncounterCardId?: CardId;
    expectedRerollCount?: number;
    siteId: SiteId;
    actionId: ExplorationActionId;
    selectionRulesVersion: SelectionRulesVersion;
    selection?: unknown;
  };
  COMPLETE_AUGURY: { siteId: SiteId };
  ACCEPT_REWARD: { siteId: SiteId; purgeIndex?: number };
  ACCEPT_DREAMSIGN_OFFER: {
    siteId: SiteId;
    dreamsignId: DreamsignId;
    purgeIndex?: number;
  };
  REJECT_DREAMSIGN_OFFER: { siteId: SiteId };
  ACCEPT_ESSENCE: { siteId: SiteId };
  REROLL_AUGURY: { siteId: SiteId };
  // A null `archetypeId` clears the forced archetype.
  FORCE_AUGURY_ARCHETYPE: {
    siteId: SiteId;
    archetypeId: AuguryArchetypeId | null;
  };
  COMPLETE_SITE: { siteId: SiteId };
  PLACE_GRAVOK_WAGER: {
    siteId: SiteId;
    gateId: "six" | "nine" | "jack";
  };
  SETTLE_GRAVOK_WAGER: { siteId: SiteId; shuffleCommitment: ShuffleCommitment };
  PLAY_AGAIN_GRAVOK_WAGER: {
    siteId: SiteId;
    previousShuffleCommitment: ShuffleCommitment;
  };
  REPLACE_GRAVOK_WAGER_DREAMSIGN: {
    siteId: SiteId;
    replacedDreamsignId: DreamsignId;
  };
  DRAW_TIDEMARK_LADDER_CLIMB: { siteId: SiteId };
  SETTLE_TIDEMARK_LADDER_CLIMB: {
    siteId: SiteId;
    shuffleCommitment: ShuffleCommitment;
  };
  REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN: {
    siteId: SiteId;
    replacedDreamsignId: DreamsignId;
  };
  DRAW_STARWAY_STAIRS: { siteId: SiteId };
  SETTLE_STARWAY_STAIRS: {
    siteId: SiteId;
    shuffleCommitment: ShuffleCommitment;
  };
  CASH_OUT_STARWAY_STAIRS: {
    siteId: SiteId;
    shuffleCommitment: ShuffleCommitment;
  };
  PLAY_AGAIN_STARWAY_STAIRS: {
    siteId: SiteId;
    previousShuffleCommitment: ShuffleCommitment;
  };
  DRAW_FOUR_SUIT_REPRISE: { siteId: SiteId; entryId: DeckEntryId };
  SETTLE_FOUR_SUIT_REPRISE: {
    siteId: SiteId;
    shuffleCommitment: ShuffleCommitment;
  };
  CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION: {
    siteId: SiteId;
    shuffleCommitment: ShuffleCommitment;
    type: TransfigurationType;
  };
  PLAY_AGAIN_FOUR_SUIT_REPRISE: {
    siteId: SiteId;
    previousShuffleCommitment: ShuffleCommitment;
  };
  DEAL_BLACKJACK: { siteId: SiteId };
  HIT_BLACKJACK: { siteId: SiteId };
  STAND_BLACKJACK: { siteId: SiteId };
  SETTLE_BLACKJACK: { siteId: SiteId; shuffleCommitment: ShuffleCommitment };
  PLAY_AGAIN_BLACKJACK: {
    siteId: SiteId;
    previousShuffleCommitment: ShuffleCommitment;
  };

  // --- augury & shop ---
  ACCEPT_AUGURY_OFFER: { siteId: SiteId } & AuguryAcceptPayload;
  DECLINE_AUGURY: { siteId: SiteId } & AuguryDeclinePayload;
  BUY_SHOP_SLOT: { siteId: SiteId; slotIndex: number; purgeIndex?: number };
  REROLL_SHOP: { siteId: SiteId };
  GRANT_FREE_REROLLS: { count: number };
  APPLY_SHOP_DISCOUNT: { percent: number };

  // --- modifiers & atlas ---
  PUSH_BATTLE_MODIFIER: { modifier: unknown };
  PUSH_TEMPORARY_NIGHTMARE_GRANT: {
    cardId: CardId;
    count: number;
    battlesRemaining: number;
    source: JourneyMutationSource;
  };
  BAN_SITE_TYPE: { siteType: SiteType; dreamscapesRemaining: number };
  BOOST_SITE_APPEARANCE: {
    siteType: SiteType;
    percent: number;
    dreamscapesRemaining: number;
  };
  REPLACE_SITE_TYPE: {
    nodeId: AtlasNodeId;
    fromSiteType: SiteType;
    toSiteType: SiteType;
  };
  ADD_SITE_TO_DREAMSCAPE: { nodeId: AtlasNodeId; siteType: SiteType };
  SET_CARD_SOURCE_DEBUG: { state: unknown };

  // --- battle lifecycle bridges ---
  END_BATTLE: Record<string, never>;

  // --- battle events ---
  BEGIN_BATTLE: { siteId: SiteId; seedOverride?: number };
  COMPLETE_TUTORIAL_BATTLE_PRESENTATION: {
    presentationId: PresentationId;
    messageIndex?: number;
  };
  // Engine intents of a journey battle (engine-design § Fold integration).
  // Each names its side; `action` is an engine `Action` and `value` an engine
  // `Answer`, validated by the domain case and the engine fold adapter.
  BATTLE_ACTION: { side: BattleSide; action: unknown; override?: import("../engine/policy/overrides").PolicyOverrideSelection };
  TUTORIAL_CARD_ATTEMPT: { battleId: BattleId; instance: import("../engine").InstanceId };
  BATTLE_ANSWER: { side: BattleSide; promptId: PromptId; value: unknown };
  BATTLE_CANCEL: { side: BattleSide; promptId: PromptId };
  // An engine debug action (D4) of a journey battle, development builds
  // only: `op` is a `DebugOp` (src/engine/debug/debug-actions.ts), validated
  // by the domain case. A production build bounces it.
  BATTLE_DEBUG: { op: unknown };
}

/** Every event `type` string the rules layer recognizes. */
export type GameEventType = keyof EventPayloads;

// ---------------------------------------------------------------------------
// Classification sets consulted by the root CAS policy.
// ---------------------------------------------------------------------------

/**
 * CAS-exempt types skip CAS-policy rules 2–4 (rule 5 validation still runs).
 * Site bootstrap is serialized by an event-log intent key and may safely pass
 * a partner's CAS window. Card-source provenance and engine debug actions
 * carry no game-rules meaning a partner decides on.
 */
export const CAS_EXEMPT_EVENT_TYPES: ReadonlySet<GameEventType> = new Set([
  "FRONT_DOOR_ACTION",
  "ADVANCE_FRONT_DOOR",
  "BEGIN_TUTORIAL",
  "COMPLETE_TUTORIAL_ACTION",
  "COMPLETE_TUTORIAL_BATTLE_PRESENTATION",
  "OPEN_CARD_TUTORIAL_GUIDANCE",
  "COMPLETE_CARD_TUTORIAL_GUIDANCE",
  "SET_CARD_SOURCE_DEBUG",
  "BATTLE_DEBUG",
  "OPEN_SITE",
  "ENTER_DRAFT_SITE",
]);

/**
 * Decision-neutral types are additionally ignored by CAS rule 3. Presentation
 * state carries no game-rules meaning, and site bootstrap only materializes the
 * deterministic runtime or offer for an already-selected site.
 */
export const DECISION_NEUTRAL_EVENT_TYPES: ReadonlySet<GameEventType> =
  new Set([
    "FRONT_DOOR_ACTION",
    "ADVANCE_FRONT_DOOR",
    "BEGIN_TUTORIAL",
    "COMPLETE_TUTORIAL_ACTION",
  "COMPLETE_TUTORIAL_BATTLE_PRESENTATION",
      "OPEN_CARD_TUTORIAL_GUIDANCE",
    "COMPLETE_CARD_TUTORIAL_GUIDANCE",
      "SET_CARD_SOURCE_DEBUG",
    "DISMISS_STARTING_DECK_POPUP",
    "OPEN_SITE",
    "ENTER_DRAFT_SITE",
  ]);

/**
 * Who an intent speaks for, which decides whether held Dreamsigns' journey
 * modifiers react to it (src/rules/journey/modifier-registry.ts).
 *
 * - `gameplay`: a player's flow emits it, or a reward or effect does; journey
 *   modifiers run after it applies.
 * - `administrative`: only debug tools, QA scenes, and developer commands emit
 *   it (exact-value writes and debug edits), or it replaces the whole journey
 *   (`LOAD_STATE`, `RESET_JOURNEY`); journey modifiers never run for it, so the
 *   state it writes is exactly the state it names.
 */
type EventIntentClass = "gameplay" | "administrative";

/**
 * Every event type's intent class. The `satisfies` check rejects a missing or
 * unknown key, so a new event type cannot compile until it is classified.
 */
const EVENT_INTENT_CLASSES = {
  FRONT_DOOR_ACTION: "gameplay",
  ADVANCE_FRONT_DOOR: "gameplay",
  BEGIN_TUTORIAL: "gameplay",
  COMPLETE_TUTORIAL_ACTION: "gameplay",
  BEGIN_TUTORIAL_BATTLE: "gameplay",
  RESTART_TUTORIAL_BATTLE: "gameplay",
  EXIT_TUTORIAL_BATTLE: "gameplay",
  OPEN_CARD_TUTORIAL_GUIDANCE: "gameplay",
  COMPLETE_CARD_TUTORIAL_GUIDANCE: "gameplay",
  ADJUST_ESSENCE: "gameplay",
  SET_ESSENCE: "administrative", // journey state editor
  SET_MAX_DREAMSIGNS: "administrative", // journey state editor
  START_JOURNEY: "gameplay",
  RESET_JOURNEY: "administrative", // whole-journey replacement
  LOAD_STATE: "administrative", // saved snapshots and QA scenes
  SELECT_AVATAR: "gameplay",
  REROLL_AVATAR_OFFER: "gameplay",
  ENTER_SITE: "gameplay",
  TRAVEL_TO_DREAMSCAPE: "gameplay",
  REGENERATE_ATLAS: "administrative", // developer menu and journey state editor
  DISMISS_STARTING_DECK_POPUP: "gameplay",
  ADD_CARD: "gameplay",
  REMOVE_DECK_ENTRY: "gameplay",
  RESOLVE_JOURNEY_DUPLICATION: "gameplay",
  RESOLVE_JOURNEY_TRANSFIGURATION: "gameplay",
  RESOLVE_AFTER_BATTLE_DREAMSIGN: "gameplay",
  RESOLVE_DREAMSIGN_COPY: "gameplay",
  RESOLVE_STARTER_PURGE: "gameplay",
  RESOLVE_JOURNEY_PURGE: "gameplay",
  PURGE_DECK_CARDS: "gameplay",
  DUPLICATE_DECK_ENTRY: "gameplay",
  SET_DECK_ENTRY_STAT_OVERRIDE: "administrative", // journey state editor
  SET_DECK_ENTRY_KEYWORDS: "administrative", // journey state editor
  SET_DECK_ENTRY_TYPE: "administrative", // journey state editor
  TRANSFIGURE_CARD: "gameplay",
  ACCEPT_TRANSFIGURATION_CHOICE: "gameplay",
  ACCEPT_DUPLICATION_CHOICE: "gameplay",
  PURGE_ALL_NIGHTMARE_CARDS: "gameplay",
  PURGE_RANDOM_NIGHTMARE_CARDS: "gameplay",
  ADD_DREAMSIGN: "gameplay",
  REMOVE_DREAMSIGN: "gameplay",
  SET_DREAMSIGN_POOL: "administrative", // exact-value pool write
  SET_DRAFT_STATE: "administrative", // package debug dialog
  PICK_DRAFT_CARD: "gameplay",
  REROLL_DRAFT_OFFER: "administrative", // debug offer reroll
  ENTER_DRAFT_SITE: "gameplay",
  OPEN_SITE: "gameplay",
  CHOOSE_RANDOM_SITE: "gameplay",
  REROLL_EXPLORATION: "gameplay",
  RESOLVE_EXPLORATION_CHOICE: "gameplay",
  COMPLETE_AUGURY: "gameplay",
  ACCEPT_REWARD: "gameplay",
  ACCEPT_DREAMSIGN_OFFER: "gameplay",
  REJECT_DREAMSIGN_OFFER: "gameplay",
  ACCEPT_ESSENCE: "gameplay",
  REROLL_AUGURY: "administrative", // debug offer reroll
  FORCE_AUGURY_ARCHETYPE: "administrative", // Augury debug menu
  COMPLETE_SITE: "gameplay",
  PLACE_GRAVOK_WAGER: "gameplay",
  SETTLE_GRAVOK_WAGER: "gameplay",
  PLAY_AGAIN_GRAVOK_WAGER: "gameplay",
  REPLACE_GRAVOK_WAGER_DREAMSIGN: "gameplay",
  DRAW_TIDEMARK_LADDER_CLIMB: "gameplay",
  SETTLE_TIDEMARK_LADDER_CLIMB: "gameplay",
  REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN: "gameplay",
  DRAW_STARWAY_STAIRS: "gameplay",
  SETTLE_STARWAY_STAIRS: "gameplay",
  CASH_OUT_STARWAY_STAIRS: "gameplay",
  PLAY_AGAIN_STARWAY_STAIRS: "gameplay",
  DRAW_FOUR_SUIT_REPRISE: "gameplay",
  SETTLE_FOUR_SUIT_REPRISE: "gameplay",
  CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION: "gameplay",
  PLAY_AGAIN_FOUR_SUIT_REPRISE: "gameplay",
  DEAL_BLACKJACK: "gameplay",
  HIT_BLACKJACK: "gameplay",
  STAND_BLACKJACK: "gameplay",
  SETTLE_BLACKJACK: "gameplay",
  PLAY_AGAIN_BLACKJACK: "gameplay",
  ACCEPT_AUGURY_OFFER: "gameplay",
  DECLINE_AUGURY: "gameplay",
  BUY_SHOP_SLOT: "gameplay",
  REROLL_SHOP: "gameplay",
  GRANT_FREE_REROLLS: "gameplay",
  APPLY_SHOP_DISCOUNT: "gameplay",
  PUSH_BATTLE_MODIFIER: "gameplay",
  PUSH_TEMPORARY_NIGHTMARE_GRANT: "gameplay",
  BAN_SITE_TYPE: "gameplay",
  BOOST_SITE_APPEARANCE: "gameplay",
  REPLACE_SITE_TYPE: "gameplay",
  ADD_SITE_TO_DREAMSCAPE: "gameplay",
  SET_CARD_SOURCE_DEBUG: "administrative", // card-source diagnostics
  END_BATTLE: "gameplay",
  BEGIN_BATTLE: "gameplay",
  COMPLETE_TUTORIAL_BATTLE_PRESENTATION: "gameplay",
  TUTORIAL_CARD_ATTEMPT: "gameplay",
  BATTLE_ACTION: "gameplay",
  BATTLE_ANSWER: "gameplay",
  BATTLE_CANCEL: "gameplay",
  BATTLE_DEBUG: "administrative", // engine debug panel
} as const satisfies Record<GameEventType, EventIntentClass>;

/** Event types for which journey modifiers never run. */
export type AdministrativeEventType = {
  [T in GameEventType]: (typeof EVENT_INTENT_CLASSES)[T] extends "administrative"
    ? T
    : never;
}[GameEventType];

/** Event types after which held Dreamsigns' journey modifiers run. */
export type GameplayEventType = Exclude<GameEventType, AdministrativeEventType>;

/** Every administrative event type, for exhaustive checks. */
export const ADMINISTRATIVE_EVENT_TYPES: ReadonlySet<AdministrativeEventType> =
  new Set(
    identityKeys(EVENT_INTENT_CLASSES).filter(
      (type): type is AdministrativeEventType =>
        EVENT_INTENT_CLASSES[type] === "administrative",
    ),
  );

/** Narrows a known event type to a gameplay intent. */
export function isGameplayEventType(
  type: GameEventType,
): type is GameplayEventType {
  return EVENT_INTENT_CLASSES[type] === "gameplay";
}

/**
 * The set of all recognized event types, keyed as a `Record<GameEventType,
 * true>` so it is a compile-time-tied enumeration of `EventPayloads`' keys —
 * TypeScript rejects this literal if it is missing a key `EventPayloads`
 * declares, or names one `EventPayloads` does not. `_exhaustive` below is a
 * second, explicit assignment-based check of the same tie (belt-and-braces:
 * it fails to compile independently of how this literal's own type
 * annotation is written), so the registry and the payload map can never drift
 * apart silently.
 */
const KNOWN_EVENT_TYPES_AS_OBJECT: Record<GameEventType, true> = {
  FRONT_DOOR_ACTION: true,
  ADVANCE_FRONT_DOOR: true,
  BEGIN_TUTORIAL: true,
  COMPLETE_TUTORIAL_ACTION: true,
  BEGIN_TUTORIAL_BATTLE: true,
  RESTART_TUTORIAL_BATTLE: true,
  EXIT_TUTORIAL_BATTLE: true,
  OPEN_CARD_TUTORIAL_GUIDANCE: true,
  COMPLETE_CARD_TUTORIAL_GUIDANCE: true,
  ADJUST_ESSENCE: true,
  SET_ESSENCE: true,
  SET_MAX_DREAMSIGNS: true,
  START_JOURNEY: true,
  RESET_JOURNEY: true,
  LOAD_STATE: true,
  SELECT_AVATAR: true,
  REROLL_AVATAR_OFFER: true,
  ENTER_SITE: true,
  TRAVEL_TO_DREAMSCAPE: true,
  REGENERATE_ATLAS: true,
  DISMISS_STARTING_DECK_POPUP: true,
  ADD_CARD: true,
  REMOVE_DECK_ENTRY: true,
  RESOLVE_JOURNEY_DUPLICATION: true,
  RESOLVE_JOURNEY_TRANSFIGURATION: true,
  RESOLVE_AFTER_BATTLE_DREAMSIGN: true,
  RESOLVE_DREAMSIGN_COPY: true,
  RESOLVE_STARTER_PURGE: true,
  RESOLVE_JOURNEY_PURGE: true,
  PURGE_DECK_CARDS: true,
  DUPLICATE_DECK_ENTRY: true,
  SET_DECK_ENTRY_STAT_OVERRIDE: true,
  SET_DECK_ENTRY_KEYWORDS: true,
  SET_DECK_ENTRY_TYPE: true,
  TRANSFIGURE_CARD: true,
  ACCEPT_TRANSFIGURATION_CHOICE: true,
  ACCEPT_DUPLICATION_CHOICE: true,
  PURGE_ALL_NIGHTMARE_CARDS: true,
  PURGE_RANDOM_NIGHTMARE_CARDS: true,
  ADD_DREAMSIGN: true,
  REMOVE_DREAMSIGN: true,
  SET_DREAMSIGN_POOL: true,
  SET_DRAFT_STATE: true,
  PICK_DRAFT_CARD: true,
  REROLL_DRAFT_OFFER: true,
  ENTER_DRAFT_SITE: true,
  OPEN_SITE: true,
  CHOOSE_RANDOM_SITE: true,
  REROLL_EXPLORATION: true,
  RESOLVE_EXPLORATION_CHOICE: true,
  COMPLETE_AUGURY: true,
  ACCEPT_REWARD: true,
  ACCEPT_DREAMSIGN_OFFER: true,
  REJECT_DREAMSIGN_OFFER: true,
  ACCEPT_ESSENCE: true,
  REROLL_AUGURY: true,
  FORCE_AUGURY_ARCHETYPE: true,
  COMPLETE_SITE: true,
  PLACE_GRAVOK_WAGER: true,
  SETTLE_GRAVOK_WAGER: true,
  PLAY_AGAIN_GRAVOK_WAGER: true,
  REPLACE_GRAVOK_WAGER_DREAMSIGN: true,
  DRAW_TIDEMARK_LADDER_CLIMB: true,
  SETTLE_TIDEMARK_LADDER_CLIMB: true,
  REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN: true,
  DRAW_STARWAY_STAIRS: true,
  SETTLE_STARWAY_STAIRS: true,
  CASH_OUT_STARWAY_STAIRS: true,
  PLAY_AGAIN_STARWAY_STAIRS: true,
  DRAW_FOUR_SUIT_REPRISE: true,
  SETTLE_FOUR_SUIT_REPRISE: true,
  CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION: true,
  PLAY_AGAIN_FOUR_SUIT_REPRISE: true,
  DEAL_BLACKJACK: true,
  HIT_BLACKJACK: true,
  STAND_BLACKJACK: true,
  SETTLE_BLACKJACK: true,
  PLAY_AGAIN_BLACKJACK: true,
  ACCEPT_AUGURY_OFFER: true,
  DECLINE_AUGURY: true,
  BUY_SHOP_SLOT: true,
  REROLL_SHOP: true,
  GRANT_FREE_REROLLS: true,
  APPLY_SHOP_DISCOUNT: true,
  PUSH_BATTLE_MODIFIER: true,
  PUSH_TEMPORARY_NIGHTMARE_GRANT: true,
  BAN_SITE_TYPE: true,
  BOOST_SITE_APPEARANCE: true,
  REPLACE_SITE_TYPE: true,
  ADD_SITE_TO_DREAMSCAPE: true,
  SET_CARD_SOURCE_DEBUG: true,
  END_BATTLE: true,
  BEGIN_BATTLE: true,
  COMPLETE_TUTORIAL_BATTLE_PRESENTATION: true,
  TUTORIAL_CARD_ATTEMPT: true,
  BATTLE_ACTION: true,
  BATTLE_ANSWER: true,
  BATTLE_CANCEL: true,
  BATTLE_DEBUG: true,
};

// Fails to compile on drift between EventPayloads and KNOWN_EVENT_TYPES_AS_OBJECT.
const _exhaustive: Record<keyof EventPayloads, true> =
  KNOWN_EVENT_TYPES_AS_OBJECT;
void _exhaustive;

/** The set of all recognized event types (for routing / validation). */
export const KNOWN_EVENT_TYPES: ReadonlySet<GameEventType> = new Set(
  identityKeys(KNOWN_EVENT_TYPES_AS_OBJECT),
);

/**
 * `KNOWN_EVENT_TYPES` members that deliberately have no `routeDomain` case —
 * e.g. a type reserved for a future task. `reducer.test.ts`'s registry-tie
 * test requires every OTHER member to route to a real (non-`default`) case;
 * this set is the escape hatch for a type that is intentionally exempt from
 * that check. Empty today — every declared event type is routed.
 */
export const INTENTIONALLY_UNROUTED_EVENT_TYPES: ReadonlySet<GameEventType> =
  new Set();

/** Narrows a raw event `type` string to a known `GameEventType`. */
export function isKnownEventType(type: EventType): type is GameEventType {
  return (KNOWN_EVENT_TYPES as ReadonlySet<EventType>).has(type);
}
