// The reducer-internal typed view of every event that folds over `FoldState`.
//
// At the engine boundary a `GameEvent.payload` is `Record<string, unknown>`
// (see src/eventlog/types.ts): the log stores untyped JSON. This module is the
// rules layer's *typed* view — one payload interface per event type, unified
// into the `TypedGameEvent` discriminated union — plus the classification sets
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
 * Maps each event `type` literal to its payload interface. Keys are the
 * authoritative set of event types the rules layer understands.
 */
export interface EventPayloads {
  // --- standalone front door ---
  FRONT_DOOR_ACTION: {
    surface: "main" | "tutorial";
    actionId: string;
    detail?: unknown;
  };
  ADVANCE_FRONT_DOOR: {
    from: "mainExiting" | "loading";
    journeyId: string;
  };
  BEGIN_TUTORIAL: { actions: unknown };
  COMPLETE_TUTORIAL_ACTION: { runId: string; actionId: string };
  TAKE_PLAYTEST_CONTROL: { previousControllerClientId: string | null };
  BEGIN_TUTORIAL_BATTLE: { tutorialRunId: string };
  RESTART_TUTORIAL_BATTLE: {
    battleId: string;
  };
  EXIT_TUTORIAL_BATTLE: { battleId: string };
  OPEN_CARD_TUTORIAL_GUIDANCE: { screenKey: string; cardIds: string[] };
  COMPLETE_CARD_TUTORIAL_GUIDANCE: { presentationId: string };

  // --- essence & limits ---
  ADJUST_ESSENCE: { delta: number };
  SET_ESSENCE: { value: number };
  SET_MAX_DREAMSIGNS: { value: number };

  // --- lifecycle ---
  START_JOURNEY: Record<string, unknown>;
  RESET_JOURNEY: Record<string, never>;
  LOAD_STATE: { snapshot: unknown; battle?: unknown };

  // --- dreamAvatar ---
  SELECT_DREAM_AVATAR: { dreamAvatarId: string };
  REROLL_DREAM_AVATAR_OFFER: Record<string, never>;

  // --- navigation ---
  ENTER_SITE: { siteId: string };
  TRAVEL_TO_DREAMSCAPE: { nodeId: string };
  REGENERATE_ATLAS: { completionLevel?: number };
  DISMISS_STARTING_DECK_POPUP: Record<string, never>;

  // --- deck & transfiguration ---
  ADD_CARD: {
    cardId: string;
    transfiguration?: unknown;
    source?: unknown;
  };
  REMOVE_DECK_ENTRY: { entryId: string };
  PURGE_DECK_CARDS: { siteId: string; entryIds: string[] };
  DUPLICATE_DECK_ENTRY: { entryId: string };
  SET_DECK_ENTRY_STAT_OVERRIDE: { entryId: string; override: unknown };
  SET_DECK_ENTRY_KEYWORDS: { entryId: string; keywords: unknown };
  SET_DECK_ENTRY_TYPE: { entryId: string; typeChange: unknown };
  TRANSFIGURE_CARD: { entryId: string; transfiguration: unknown };
  ACCEPT_TRANSFIGURATION_CHOICE: { siteId: string; entryId: string };
  ACCEPT_DUPLICATION_CHOICE: { siteId: string; entryId: string };
  PURGE_ALL_NIGHTMARE_CARDS: Record<string, never>;
  PURGE_RANDOM_NIGHTMARE_CARDS: { count: number };

  // --- dreamsigns ---
  ADD_DREAMSIGN: { dreamsignId: string };
  REMOVE_DREAMSIGN: { dreamsignId: string };
  SET_DREAMSIGN_POOL: { ids: string[] };

  // --- draft ---
  SET_DRAFT_STATE: { draftState: unknown };
  PICK_DRAFT_CARD: { packIndex: number; cardId: string };
  REROLL_DRAFT_OFFER: { siteId: string };
  ENTER_DRAFT_SITE: { siteId: string };

  // --- sites ---
  OPEN_SITE: {
    siteId: string;
    selectionRulesVersion?: string;
    gambleGameId?:
      | "gravok-three-gate-wager"
      | "tidemark-ladder-climb"
      | "starway-stairs"
      | "four-suit-reprise";
  };
  CHOOSE_RANDOM_SITE: { siteId: string; siteType: string };
  RESOLVE_EXPLORATION_CHOICE: {
    siteId: string;
    actionId: string;
    selectionRulesVersion?: string;
    selection?: unknown;
  };
  COMPLETE_AUGURY: { siteId: string };
  ACCEPT_REWARD: { siteId: string; choiceIndex?: number };
  ACCEPT_DREAMSIGN_OFFER: { siteId: string; dreamsignId: string };
  REJECT_DREAMSIGN_OFFER: { siteId: string };
  ACCEPT_ESSENCE: { siteId: string };
  REROLL_AUGURY: { siteId: string };
  FORCE_AUGURY_ARCHETYPE: { siteId: string; archetypeId: string };
  COMPLETE_SITE: { siteId: string };
  PLACE_GRAVOK_WAGER: {
    siteId: string;
    gateId: "six" | "nine" | "jack";
  };
  SETTLE_GRAVOK_WAGER: { siteId: string; shuffleCommitment: string };
  PLAY_AGAIN_GRAVOK_WAGER: {
    siteId: string;
    previousShuffleCommitment: string;
  };
  REPLACE_GRAVOK_WAGER_DREAMSIGN: {
    siteId: string;
    replacedDreamsignId: string;
  };
  DRAW_TIDEMARK_LADDER_CLIMB: { siteId: string };
  SETTLE_TIDEMARK_LADDER_CLIMB: {
    siteId: string;
    shuffleCommitment: string;
  };
  REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN: {
    siteId: string;
    replacedDreamsignId: string;
  };
  DRAW_STARWAY_STAIRS: { siteId: string };
  SETTLE_STARWAY_STAIRS: {
    siteId: string;
    shuffleCommitment: string;
  };
  CASH_OUT_STARWAY_STAIRS: { siteId: string; shuffleCommitment: string };
  PLAY_AGAIN_STARWAY_STAIRS: {
    siteId: string;
    previousShuffleCommitment: string;
  };
  DRAW_FOUR_SUIT_REPRISE: { siteId: string; entryId: string };
  SETTLE_FOUR_SUIT_REPRISE: {
    siteId: string;
    shuffleCommitment: string;
  };
  CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION: {
    siteId: string;
    shuffleCommitment: string;
    type: string;
  };
  PLAY_AGAIN_FOUR_SUIT_REPRISE: {
    siteId: string;
    previousShuffleCommitment: string;
  };

  // --- merchant & shop ---
  ACCEPT_MERCHANT_OFFER: { siteId: string; offer?: unknown };
  DECLINE_MERCHANT: { siteId: string };
  BUY_SHOP_SLOT: { siteId: string; slotIndex: number };
  REROLL_SHOP: { siteId: string };
  GRANT_FREE_REROLLS: { count: number };
  APPLY_SHOP_DISCOUNT: { percent: number };

  // --- modifiers & atlas ---
  PUSH_BATTLE_MODIFIER: { modifier: unknown };
  PUSH_TEMPORARY_NIGHTMARE_GRANT: {
    cardId: string;
    count: number;
    battlesRemaining: number;
    source: string;
  };
  BAN_SITE_TYPE: { siteType: string; dreamscapesRemaining: number };
  BOOST_SITE_APPEARANCE: {
    siteType: string;
    percent: number;
    dreamscapesRemaining: number;
  };
  REPLACE_SITE_TYPE: {
    nodeId: string;
    fromSiteType: string;
    toSiteType: string;
  };
  ADD_SITE_TO_DREAMSCAPE: { nodeId: string; siteType: string };
  SET_CARD_SOURCE_DEBUG: { state: unknown };

  // --- battle lifecycle bridges ---
  END_BATTLE: Record<string, never>;

  // --- battle events (no legacy 1:1) ---
  BEGIN_BATTLE: { siteId: string; seedOverride?: number };
  SET_BATTLE_AUTOMATION: { enabled: boolean };
  BATTLE_COMMAND: { command: unknown };
  BATTLE_REPOSITION_CHARACTER: {
    battleCardId: string;
    destination: unknown;
  };
  BATTLE_PLAY_CARD: {
    battleCardId: string;
    targetBattleCardIds: string[];
    aiChoices?: unknown;
    characterDestination?: unknown;
    tutorialAiActionOverrideId?: string;
  };
  // A single player gesture that the automation planner expanded into an ordered
  // list of battle commands (e.g. a play that also spends energy, or a turn
  // handoff that resolves the Challenge, ramps energy, and draws). Each element
  // is a `BattleCommand`, validated in the domain case; the whole list applies
  // all-or-nothing so no half-applied gesture can exist in the log.
  BATTLE_GESTURE: { commands: unknown[] };
  BATTLE_AI_BLOCK: { aiSide: string };
  COMPLETE_TUTORIAL_BATTLE_PRESENTATION: {
    presentationId: string;
    messageIndex?: number;
  };
  RESOLVE_PROMPT: { promptId: number; resolution: unknown };
  // `note` is the `{ noteId, text, expiry }` shape the battle note editor
  // writes; `expiry` is a `BattleCardNoteExpiry`, kept as `unknown` here so this
  // file stays import-light (the domain case narrows it).
  SET_CARD_NOTE: {
    instanceId: string;
    note: { noteId: string; text: string; expiry: unknown };
  };
}

/** Every event `type` string the rules layer recognizes. */
export type GameEventType = keyof EventPayloads;

/**
 * The typed, discriminated view of an event: `type` narrows `payload`. This is
 * the reducer-internal counterpart to the engine's untyped `GameEvent`.
 */
export type TypedGameEvent<T extends GameEventType = GameEventType> = {
  [K in T]: { readonly type: K; readonly payload: EventPayloads[K] };
}[T];

// ---------------------------------------------------------------------------
// Classification sets consulted by the root CAS policy.
// ---------------------------------------------------------------------------

/**
 * CAS-exempt types skip CAS-policy rules 2–4 (rule 5 validation still runs).
 * Site bootstrap is serialized by an event-log intent key and may safely pass
 * a partner's CAS window. Card notes and card-source provenance carry no
 * game-rules meaning.
 */
export const CAS_EXEMPT_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "FRONT_DOOR_ACTION",
  "ADVANCE_FRONT_DOOR",
  "BEGIN_TUTORIAL",
  "COMPLETE_TUTORIAL_ACTION",
  "TAKE_PLAYTEST_CONTROL",
  "OPEN_CARD_TUTORIAL_GUIDANCE",
  "COMPLETE_CARD_TUTORIAL_GUIDANCE",
  "SET_CARD_NOTE",
  "SET_CARD_SOURCE_DEBUG",
  "OPEN_SITE",
  "ENTER_DRAFT_SITE",
]);

/**
 * Decision-neutral types are additionally ignored by CAS rule 3. Presentation
 * state carries no game-rules meaning, and site bootstrap only materializes the
 * deterministic runtime or offer for an already-selected site.
 */
export const DECISION_NEUTRAL_EVENT_TYPES: ReadonlySet<string> =
  new Set<string>([
    "FRONT_DOOR_ACTION",
    "ADVANCE_FRONT_DOOR",
    "BEGIN_TUTORIAL",
  "COMPLETE_TUTORIAL_ACTION",
  "TAKE_PLAYTEST_CONTROL",
    "OPEN_CARD_TUTORIAL_GUIDANCE",
    "COMPLETE_CARD_TUTORIAL_GUIDANCE",
    "SET_CARD_NOTE",
    "SET_CARD_SOURCE_DEBUG",
    "DISMISS_STARTING_DECK_POPUP",
    "OPEN_SITE",
    "ENTER_DRAFT_SITE",
  ]);

/**
 * The set of all recognized event types, keyed as a `Record<GameEventType,
 * true>` so it is a compile-time-tied enumeration of `EventPayloads`' keys —
 * TypeScript rejects this literal if it is missing a key `EventPayloads`
 * declares, or names one `EventPayloads` does not. `_exhaustive` below is a
 * second, explicit assignment-based check of the same tie (belt-and-braces:
 * it fails to compile independently of how this literal's own type
 * annotation is written), so the registry and the payload map can never drift
 * apart silently (audit finding P3-5).
 */
const KNOWN_EVENT_TYPES_AS_OBJECT: Record<GameEventType, true> = {
  FRONT_DOOR_ACTION: true,
  ADVANCE_FRONT_DOOR: true,
  BEGIN_TUTORIAL: true,
  COMPLETE_TUTORIAL_ACTION: true,
  TAKE_PLAYTEST_CONTROL: true,
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
  SELECT_DREAM_AVATAR: true,
  REROLL_DREAM_AVATAR_OFFER: true,
  ENTER_SITE: true,
  TRAVEL_TO_DREAMSCAPE: true,
  REGENERATE_ATLAS: true,
  DISMISS_STARTING_DECK_POPUP: true,
  ADD_CARD: true,
  REMOVE_DECK_ENTRY: true,
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
  ACCEPT_MERCHANT_OFFER: true,
  DECLINE_MERCHANT: true,
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
  SET_BATTLE_AUTOMATION: true,
  BATTLE_COMMAND: true,
  BATTLE_REPOSITION_CHARACTER: true,
  BATTLE_PLAY_CARD: true,
  BATTLE_GESTURE: true,
  BATTLE_AI_BLOCK: true,
  COMPLETE_TUTORIAL_BATTLE_PRESENTATION: true,
  RESOLVE_PROMPT: true,
  SET_CARD_NOTE: true,
};

// Fails to compile on drift between EventPayloads and KNOWN_EVENT_TYPES_AS_OBJECT.
const _exhaustive: Record<keyof EventPayloads, true> =
  KNOWN_EVENT_TYPES_AS_OBJECT;
void _exhaustive;

/** The set of all recognized event types (for routing / validation). */
export const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<string>(
  Object.keys(KNOWN_EVENT_TYPES_AS_OBJECT),
);

/**
 * `KNOWN_EVENT_TYPES` members that deliberately have no `routeDomain` case —
 * e.g. a type reserved for a future task. `reducer.test.ts`'s registry-tie
 * test requires every OTHER member to route to a real (non-`default`) case;
 * this set is the escape hatch for a type that is intentionally exempt from
 * that check. Empty today — every declared event type is routed.
 */
export const INTENTIONALLY_UNROUTED_EVENT_TYPES: ReadonlySet<string> =
  new Set<string>();

/** Narrows a raw event `type` string to a known `GameEventType`. */
export function isKnownEventType(type: string): type is GameEventType {
  return KNOWN_EVENT_TYPES.has(type);
}
