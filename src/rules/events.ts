// The reducer-internal typed view of every event that folds over `FoldState`.
//
// At the engine boundary a `GameEvent.payload` is `Record<string, unknown>`
// (see src/eventlog/types.ts): the log stores untyped JSON. This module is the
// rules layer's *typed* view — one payload interface per event type, unified
// into the `TypedGameEvent` discriminated union — plus the classification sets
// (CAS-exempt, decision-neutral) the root CAS policy consults.
//
// Every row of the plan's "Legacy mutation → event mapping" table plus the
// battle events line appears here. Domain reducer cases land per-task; until a
// type has a case the root reducer routes it to a bounce (never a throw), so
// declaring a type here is safe before its behaviour exists.
//
// Payloads use UUIDs and indices only — never card names (AGENTS.md). Complex
// payload shapes (screens, atlases, snapshots, draft state, battle commands)
// are typed as `unknown` here so this file stays import-light; the owning task
// narrows them when it implements the domain case.

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
  BEGIN_TUTORIAL_BATTLE: { tutorialRunId: string; driverClientId: string };
  RESTART_TUTORIAL_BATTLE: {
    battleId: string;
    previousDriverClientId: string;
    driverClientId: string;
  };
  EXIT_TUTORIAL_BATTLE: { battleId: string };

  // --- essence & limits ---
  ADJUST_ESSENCE: { delta: number };
  SET_ESSENCE: { value: number };
  ADJUST_ESSENCE_CAP: { delta: number };
  SET_ESSENCE_CAP: { value: number };
  SET_MAX_DREAMSIGNS: { value: number };
  SET_COMPLETION_LEVEL: { value: number };

  // --- lifecycle ---
  START_QUEST: Record<string, unknown>;
  RESET_QUEST: Record<string, never>;
  LOAD_STATE: { snapshot: unknown; battle?: unknown };

  // --- dreamAvatar ---
  SELECT_DREAM_AVATAR: { dreamAvatarId: string };
  REROLL_DREAM_AVATAR_OFFER: Record<string, never>;

  // --- navigation ---
  SET_SCREEN: { screen: unknown; activeSiteId?: string | null };
  TRAVEL_TO_DREAMSCAPE: { nodeId: string };
  MARK_SITE_VISITED: { siteId: string };
  DISMISS_STARTING_DECK_POPUP: Record<string, never>;

  // --- deck & transfiguration ---
  ADD_CARD: {
    cardId: string;
    transfiguration?: unknown;
    isBane?: boolean;
    source?: unknown;
  };
  REMOVE_DECK_ENTRY: { entryId: string };
  PURGE_DECK_CARDS: { entryIds: string[] };
  DUPLICATE_DECK_ENTRY: { entryId: string };
  SET_DECK_ENTRY_STAT_OVERRIDE: { entryId: string; override: unknown };
  SET_DECK_ENTRY_KEYWORDS: { entryId: string; keywords: unknown };
  SET_DECK_ENTRY_TYPE: { entryId: string; typeChange: unknown };
  TRANSFIGURE_CARD: { entryId: string; transfiguration: unknown };
  ACCEPT_TRANSFIGURATION_CHOICE: { siteId: string; entryId: string };
  ACCEPT_DUPLICATION_CHOICE: { siteId: string; entryId: string };
  PURGE_ALL_BANE_CARDS: Record<string, never>;
  PURGE_RANDOM_BANE_CARDS: { count: number };

  // --- dreamsigns ---
  ADD_DREAMSIGN: { dreamsignId: string };
  REMOVE_DREAMSIGN: { dreamsignId: string };
  SET_DREAMSIGN_POOL: { ids: string[] };
  SET_DREAMSIGN_IS_BANE: { dreamsignId: string; isBane: boolean };

  // --- draft ---
  SET_DRAFT_STATE: { draftState: unknown };
  PICK_DRAFT_CARD: { packIndex: number; cardId: string };
  REROLL_DRAFT_OFFER: { siteId: string };
  ENTER_DRAFT_SITE: { siteId: string };

  // --- sites ---
  OPEN_SITE: { siteId: string };
  COMPLETE_DREAM_AUGURY: { siteId: string };
  ACCEPT_REWARD: { siteId: string; choiceIndex?: number };
  ACCEPT_DREAMSIGN_OFFER: { siteId: string; dreamsignId: string };
  REJECT_DREAMSIGN_OFFER: { siteId: string };
  ACCEPT_ESSENCE: { siteId: string };
  REROLL_DREAM_AUGURY: { siteId: string };
  FORCE_DREAM_AUGURY_ARCHETYPE: { siteId: string; archetypeId: string };
  COMPLETE_SITE: { siteId: string };

  // --- merchant & shop ---
  ACCEPT_MERCHANT_OFFER: { siteId: string; offer?: unknown };
  DECLINE_MERCHANT: { siteId: string };
  BUY_SHOP_SLOT: { siteId: string; slotIndex: number };
  REROLL_SHOP: { siteId: string };
  GRANT_FREE_REROLLS: { count: number };
  APPLY_SHOP_DISCOUNT: { percent: number };

  // --- modifiers & atlas ---
  PUSH_BATTLE_MODIFIER: { modifier: unknown };
  PUSH_TEMPORARY_BANE_GRANT: Record<string, unknown>;
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
  UPDATE_ATLAS: { atlas: unknown };
  SET_CARD_SOURCE_DEBUG: { state: unknown };

  // --- battle lifecycle bridges ---
  END_BATTLE: { result: "victory" | "defeat" };

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
  };
  // A single player gesture that the automation planner expanded into an ordered
  // list of battle commands (e.g. a play that also spends energy, or a turn
  // handoff that resolves the Challenge, ramps energy, and draws). Each element
  // is a `BattleCommand`, validated in the domain case; the whole list applies
  // all-or-nothing so no half-applied gesture can exist in the log.
  BATTLE_GESTURE: { commands: unknown[] };
  BATTLE_AI_DEFEND: { aiSide: string };
  COMPLETE_TUTORIAL_BATTLE_PRESENTATION: { presentationId: string };
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
    "SET_CARD_NOTE",
    "SET_CARD_SOURCE_DEBUG",
    "MARK_SITE_VISITED",
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
  BEGIN_TUTORIAL_BATTLE: true,
  RESTART_TUTORIAL_BATTLE: true,
  EXIT_TUTORIAL_BATTLE: true,
  ADJUST_ESSENCE: true,
  SET_ESSENCE: true,
  ADJUST_ESSENCE_CAP: true,
  SET_ESSENCE_CAP: true,
  SET_MAX_DREAMSIGNS: true,
  SET_COMPLETION_LEVEL: true,
  START_QUEST: true,
  RESET_QUEST: true,
  LOAD_STATE: true,
  SELECT_DREAM_AVATAR: true,
  REROLL_DREAM_AVATAR_OFFER: true,
  SET_SCREEN: true,
  TRAVEL_TO_DREAMSCAPE: true,
  MARK_SITE_VISITED: true,
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
  PURGE_ALL_BANE_CARDS: true,
  PURGE_RANDOM_BANE_CARDS: true,
  ADD_DREAMSIGN: true,
  REMOVE_DREAMSIGN: true,
  SET_DREAMSIGN_POOL: true,
  SET_DREAMSIGN_IS_BANE: true,
  SET_DRAFT_STATE: true,
  PICK_DRAFT_CARD: true,
  REROLL_DRAFT_OFFER: true,
  ENTER_DRAFT_SITE: true,
  OPEN_SITE: true,
  COMPLETE_DREAM_AUGURY: true,
  ACCEPT_REWARD: true,
  ACCEPT_DREAMSIGN_OFFER: true,
  REJECT_DREAMSIGN_OFFER: true,
  ACCEPT_ESSENCE: true,
  REROLL_DREAM_AUGURY: true,
  FORCE_DREAM_AUGURY_ARCHETYPE: true,
  COMPLETE_SITE: true,
  ACCEPT_MERCHANT_OFFER: true,
  DECLINE_MERCHANT: true,
  BUY_SHOP_SLOT: true,
  REROLL_SHOP: true,
  GRANT_FREE_REROLLS: true,
  APPLY_SHOP_DISCOUNT: true,
  PUSH_BATTLE_MODIFIER: true,
  PUSH_TEMPORARY_BANE_GRANT: true,
  BAN_SITE_TYPE: true,
  BOOST_SITE_APPEARANCE: true,
  REPLACE_SITE_TYPE: true,
  ADD_SITE_TO_DREAMSCAPE: true,
  UPDATE_ATLAS: true,
  SET_CARD_SOURCE_DEBUG: true,
  END_BATTLE: true,
  BEGIN_BATTLE: true,
  SET_BATTLE_AUTOMATION: true,
  BATTLE_COMMAND: true,
  BATTLE_REPOSITION_CHARACTER: true,
  BATTLE_PLAY_CARD: true,
  BATTLE_GESTURE: true,
  BATTLE_AI_DEFEND: true,
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
