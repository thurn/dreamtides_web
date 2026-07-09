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

  // --- dreamcaller ---
  SELECT_DREAMCALLER: { dreamcallerId: string };

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
  BEGIN_BATTLE: { siteId: string };
  BATTLE_COMMAND: { command: unknown };
  // A single player gesture that the automation planner expanded into an ordered
  // list of battle commands (e.g. a play that also spends energy, or a turn
  // handoff that resolves the Challenge, ramps energy, and draws). Each element
  // is a `BattleCommand`, validated in the domain case; the whole list applies
  // all-or-nothing so no half-applied gesture can exist in the log.
  BATTLE_GESTURE: { commands: unknown[] };
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
 * `OPEN_SITE` and `ENTER_DRAFT_SITE` are exempt from *being* bounced (both are
 * idempotent site-entry intents: a concurrent double-entry must converge
 * without a bounce toast) but still count as intervening for other events
 * (each generates an offer); that asymmetry lives in the reducer, not here.
 * `SET_CARD_NOTE` carries no game-rules meaning.
 */
export const CAS_EXEMPT_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "SET_CARD_NOTE",
  "OPEN_SITE",
  "ENTER_DRAFT_SITE",
]);

/**
 * Decision-neutral types are additionally ignored by CAS rule 3: a partner's
 * decision-neutral event in the intervening window must never bounce an
 * unrelated intent. Card notes carry no game-rules meaning. `MARK_SITE_VISITED`
 * and `DISMISS_STARTING_DECK_POPUP` reach a domain case that, on the common
 * already-visited / already-seen path, returns the state unchanged as an applied
 * no-op; treating them as decision-neutral keeps those no-op applies from
 * invalidating a concurrent partner's window.
 */
export const DECISION_NEUTRAL_EVENT_TYPES: ReadonlySet<string> = new Set<string>(
  ["SET_CARD_NOTE", "MARK_SITE_VISITED", "DISMISS_STARTING_DECK_POPUP"],
);

/** The set of all recognized event types (for routing / validation). */
export const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "ADJUST_ESSENCE",
  "SET_ESSENCE",
  "ADJUST_ESSENCE_CAP",
  "SET_ESSENCE_CAP",
  "SET_MAX_DREAMSIGNS",
  "SET_COMPLETION_LEVEL",
  "START_QUEST",
  "RESET_QUEST",
  "LOAD_STATE",
  "SELECT_DREAMCALLER",
  "SET_SCREEN",
  "TRAVEL_TO_DREAMSCAPE",
  "MARK_SITE_VISITED",
  "DISMISS_STARTING_DECK_POPUP",
  "ADD_CARD",
  "REMOVE_DECK_ENTRY",
  "PURGE_DECK_CARDS",
  "DUPLICATE_DECK_ENTRY",
  "SET_DECK_ENTRY_STAT_OVERRIDE",
  "SET_DECK_ENTRY_KEYWORDS",
  "SET_DECK_ENTRY_TYPE",
  "TRANSFIGURE_CARD",
  "ACCEPT_TRANSFIGURATION_CHOICE",
  "ACCEPT_DUPLICATION_CHOICE",
  "PURGE_ALL_BANE_CARDS",
  "PURGE_RANDOM_BANE_CARDS",
  "ADD_DREAMSIGN",
  "REMOVE_DREAMSIGN",
  "SET_DREAMSIGN_POOL",
  "SET_DREAMSIGN_IS_BANE",
  "SET_DRAFT_STATE",
  "PICK_DRAFT_CARD",
  "ENTER_DRAFT_SITE",
  "OPEN_SITE",
  "COMPLETE_DREAM_AUGURY",
  "ACCEPT_REWARD",
  "ACCEPT_DREAMSIGN_OFFER",
  "REJECT_DREAMSIGN_OFFER",
  "ACCEPT_ESSENCE",
  "REROLL_DREAM_AUGURY",
  "FORCE_DREAM_AUGURY_ARCHETYPE",
  "COMPLETE_SITE",
  "ACCEPT_MERCHANT_OFFER",
  "DECLINE_MERCHANT",
  "BUY_SHOP_SLOT",
  "REROLL_SHOP",
  "GRANT_FREE_REROLLS",
  "APPLY_SHOP_DISCOUNT",
  "PUSH_BATTLE_MODIFIER",
  "PUSH_TEMPORARY_BANE_GRANT",
  "BAN_SITE_TYPE",
  "BOOST_SITE_APPEARANCE",
  "REPLACE_SITE_TYPE",
  "ADD_SITE_TO_DREAMSCAPE",
  "UPDATE_ATLAS",
  "SET_CARD_SOURCE_DEBUG",
  "END_BATTLE",
  "BEGIN_BATTLE",
  "BATTLE_COMMAND",
  "BATTLE_GESTURE",
  "RESOLVE_PROMPT",
  "SET_CARD_NOTE",
]);

/** Narrows a raw event `type` string to a known `GameEventType`. */
export function isKnownEventType(type: string): type is GameEventType {
  return KNOWN_EVENT_TYPES.has(type);
}
