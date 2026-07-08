// The root fold and CAS (compare-and-swap) policy for the coop event-sourcing
// rules layer.
//
// `reduceGameEvent` is the single reducer the engine folds a room's log with
// (it matches `EngineConfig.reducer`). It applies the design spec's §Root fold
// and CAS policy rules 1–6 verbatim, then routes surviving events to a domain
// case. It NEVER throws on event content — malformed, stale, or unknown intents
// bounce, leaving state untouched. Throwing is reserved for programmer errors.
//
// Domain cases land per-task by extending the `routeDomain` switch. Until a
// type has a case it falls through to a bounce. The quest lifecycle, essence,
// and navigation cases live in `./quest/lifecycle` as pure `(quest, payload)`
// functions; `routeDomain` wraps their result over the fold state.

import type { EventContext, EventOutcome, GameEvent } from "../eventlog/types";
import {
  CAS_EXEMPT_EVENT_TYPES,
  DECISION_NEUTRAL_EVENT_TYPES,
} from "./events";
import type { FoldState } from "./fold-state";
import type { QuestState } from "../types/quest";
import * as deck from "./quest/deck";
import * as draft from "./quest/draft";
import * as lifecycle from "./quest/lifecycle";
import * as sites from "./quest/sites";

/** The reducer's return shape (matches `EngineConfig.reducer`). */
export interface ReduceResult {
  state: FoldState;
  outcome: EventOutcome;
}

/**
 * Folds a single event over the room's state per the CAS policy.
 *
 * Rules 1–6 (design spec §Root fold and CAS policy):
 *   1. CAS-exempt types (`SET_CARD_NOTE`, `OPEN_SITE`) skip rules 2–4.
 *   2. A RESOLVE_PROMPT matching the open prompt skips rules 3–4.
 *   3. An unknown intervening window, or one holding an applied partner event
 *      that is not decision-neutral, bounces.
 *   4. A pending prompt bounces any non-(matching-resolve) intent.
 *   5. Route to the domain case; invalid-in-state or unimplemented → bounce.
 *   6. Return the new state (applied) or the untouched state (bounced).
 *
 * Guaranteed not to throw for any event content.
 */
export function reduceGameEvent(
  state: FoldState,
  event: GameEvent,
  ctx: EventContext,
): ReduceResult {
  try {
    const exempt = isCasExempt(event.type); // rule 1
    const matchingResolve = isMatchingResolve(state, event); // rule 2

    if (!exempt && !matchingResolve) {
      // rule 3 — compare-and-swap with the self-chain / decision-neutral carve-out
      if (!isInterveningWindowClear(ctx.intervening, event.actor)) {
        return bounce(state);
      }
      // rule 4 — prompt gate
      if (state.battle?.pendingPrompt != null) {
        return bounce(state);
      }
    }

    // rule 5 — domain routing
    return routeDomain(state, event, ctx);
  } catch {
    // rule 5/6 safety: no event content may throw — treat as a bounce.
    return bounce(state);
  }
}

/**
 * Rule 1 predicate: CAS-exempt types skip rules 2–4. Exported for direct unit
 * testing (its effect is otherwise only observable once the exempt types gain
 * domain cases).
 */
export function isCasExempt(type: string): boolean {
  return CAS_EXEMPT_EVENT_TYPES.has(type);
}

/**
 * Rule 2 predicate: true when `event` is a RESOLVE_PROMPT whose `promptId`
 * matches the currently open prompt. Such an event skips rules 3–4 (the
 * prompt's options were fixed when it opened, so nothing intervening can change
 * what the resolution means). `promptId` is a `number` (the seq of the opening
 * event); a missing or non-number payload value never matches and never throws.
 * Exported for direct unit testing independent of the RESOLVE_PROMPT domain case.
 */
export function isMatchingResolve(
  state: FoldState,
  event: GameEvent,
): boolean {
  if (event.type !== "RESOLVE_PROMPT") {
    return false;
  }
  const pending = state.battle?.pendingPrompt;
  if (pending == null) {
    return false;
  }
  const promptId = event.payload?.promptId;
  return (
    typeof promptId === "number" &&
    Number.isFinite(promptId) &&
    promptId === pending.promptId
  );
}

/**
 * Rule 3: the intervening window is clear when it is enumerable AND holds no
 * applied partner event of a non-decision-neutral type. `"unknown"` (the window
 * was compacted away) is never clear — it cannot be inspected, so we bounce.
 * Exported for direct unit testing.
 */
export function isInterveningWindowClear(
  intervening: EventContext["intervening"],
  actor: string,
): boolean {
  if (intervening === "unknown") {
    return false;
  }
  for (const entry of intervening) {
    if (
      entry.actor !== actor &&
      !DECISION_NEUTRAL_EVENT_TYPES.has(entry.type)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Rule 5: dispatch to the domain reducer for `event.type`. Later tasks extend
 * this switch. Unknown or unimplemented types bounce (never throw).
 */
function routeDomain(
  state: FoldState,
  event: GameEvent,
  ctx: EventContext,
): ReduceResult {
  const payload = event.payload ?? {};
  const quest = state.quest;
  switch (event.type) {
    // --- essence & limits ---
    case "ADJUST_ESSENCE":
      return questCase(state, lifecycle.adjustEssence(quest, payload));
    case "SET_ESSENCE":
      return questCase(state, lifecycle.setEssence(quest, payload));
    case "ADJUST_ESSENCE_CAP":
      return questCase(state, lifecycle.adjustEssenceCap(quest, payload));
    case "SET_ESSENCE_CAP":
      return questCase(state, lifecycle.setEssenceCap(quest, payload));
    case "SET_MAX_DREAMSIGNS":
      return questCase(state, lifecycle.setMaxDreamsigns(quest, payload));
    case "SET_COMPLETION_LEVEL":
      return questCase(state, lifecycle.setCompletionLevel(quest, payload));

    // --- navigation ---
    case "SET_SCREEN":
      return questCase(state, lifecycle.setScreen(quest, payload));
    case "TRAVEL_TO_DREAMSCAPE":
      return questCase(state, lifecycle.travelToDreamscape(quest, payload));
    case "MARK_SITE_VISITED":
      return questCase(state, lifecycle.markSiteVisited(quest, payload));
    case "DISMISS_STARTING_DECK_POPUP":
      return questCase(state, lifecycle.dismissStartingDeckPopup(quest));

    // --- dreamcaller & run assembly ---
    case "SELECT_DREAMCALLER":
      return questCase(state, lifecycle.selectDreamcaller(quest, payload));
    case "START_QUEST":
      return questCase(state, lifecycle.startQuest(quest, payload));

    // --- deck & transfiguration ---
    case "ADD_CARD":
      return questCase(state, deck.addCard(quest, payload, ctx));
    case "REMOVE_DECK_ENTRY":
      return questCase(state, deck.removeDeckEntry(quest, payload));
    case "PURGE_DECK_CARDS":
      return questCase(state, sites.purgeDeckCards(quest, payload));
    case "DUPLICATE_DECK_ENTRY":
      return questCase(state, deck.duplicateDeckEntry(quest, payload, ctx));
    case "SET_DECK_ENTRY_STAT_OVERRIDE":
      return questCase(state, deck.setDeckEntryStatOverride(quest, payload));
    case "SET_DECK_ENTRY_KEYWORDS":
      return questCase(state, deck.setDeckEntryKeywords(quest, payload));
    case "SET_DECK_ENTRY_TYPE":
      return questCase(state, deck.setDeckEntryType(quest, payload));
    case "TRANSFIGURE_CARD":
      return questCase(state, deck.transfigureCard(quest, payload));
    case "PURGE_ALL_BANE_CARDS":
      return questCase(state, deck.purgeAllBaneCards(quest));
    case "PURGE_RANDOM_BANE_CARDS":
      return questCase(state, deck.purgeRandomBaneCards(quest, payload, ctx));

    case "ACCEPT_TRANSFIGURATION_CHOICE":
      return questCase(state, sites.acceptTransfigurationChoice(quest, payload));
    case "ACCEPT_DUPLICATION_CHOICE":
      return questCase(state, sites.acceptDuplicationChoice(quest, payload, ctx));

    // --- sites ---
    case "OPEN_SITE":
      return questCase(state, sites.openSite(quest, payload, ctx));
    case "COMPLETE_DREAM_AUGURY":
      return questCase(state, sites.completeDreamAugury(quest, payload));
    case "ACCEPT_REWARD":
      return questCase(state, sites.acceptReward(quest, payload));
    case "ACCEPT_DREAMSIGN_OFFER":
      return questCase(state, sites.acceptDreamsignOffer(quest, payload));
    case "REJECT_DREAMSIGN_OFFER":
      return questCase(state, sites.rejectDreamsignOffer(quest, payload));
    case "ACCEPT_ESSENCE":
      return questCase(state, sites.acceptEssence(quest, payload));
    case "REROLL_DREAM_AUGURY":
      return questCase(state, sites.rerollDreamAugury(quest, payload));
    case "FORCE_DREAM_AUGURY_ARCHETYPE":
      return questCase(state, sites.forceDreamAuguryArchetype(quest, payload));
    case "COMPLETE_SITE":
      return questCase(state, sites.completeSite(quest, payload));

    // --- draft ---
    case "PICK_DRAFT_CARD":
      return questCase(state, draft.pickDraftCard(quest, payload, ctx));
    case "SET_DRAFT_STATE":
      return questCase(state, draft.setDraftState(quest, payload));

    // --- dreamsigns ---
    case "ADD_DREAMSIGN":
      return questCase(state, deck.addDreamsign(quest, payload));
    case "REMOVE_DREAMSIGN":
      return questCase(state, deck.removeDreamsign(quest, payload));
    case "SET_DREAMSIGN_POOL":
      return questCase(state, deck.setDreamsignPool(quest, payload));
    case "SET_DREAMSIGN_IS_BANE":
      return questCase(state, deck.setDreamsignIsBane(quest, payload));

    // --- whole-fold cases (touch the battle slice) ---
    case "RESET_QUEST":
      return foldCase(state, lifecycle.resetQuest(state));
    case "LOAD_STATE":
      return foldCase(state, lifecycle.loadState(state, payload));

    default:
      // Not-yet-implemented or unknown type — recorded no-op.
      return bounce(state);
  }
}

/**
 * Wrap a quest-only domain result: `null` bounces (invalid-in-state / malformed
 * payload), a new `QuestState` is applied over the existing battle slice.
 */
function questCase(
  state: FoldState,
  nextQuest: QuestState | null,
): ReduceResult {
  if (nextQuest === null) return bounce(state);
  return { state: { ...state, quest: nextQuest }, outcome: "applied" };
}

/** Wrap a whole-fold domain result: `null` bounces, a new `FoldState` applies. */
function foldCase(
  state: FoldState,
  nextState: FoldState | null,
): ReduceResult {
  if (nextState === null) return bounce(state);
  return { state: nextState, outcome: "applied" };
}

function bounce(state: FoldState): ReduceResult {
  return { state, outcome: "bounced" };
}
