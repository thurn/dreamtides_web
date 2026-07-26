// The root fold and CAS (compare-and-swap) policy for the coop event-sourcing
// rules layer.
//
// `reduceGameEvent` is the single reducer the engine folds a room's log with
// (it matches `EngineConfig.reducer`). It applies the design spec's §Root fold
// and CAS policy rules 1–6 verbatim, then routes surviving events to a domain
// case. It BOUNCES on any invalid event content — malformed, stale, or unknown
// intents leave state untouched — but a *throw* from a domain case is a
// programmer error and PROPAGATES to the engine's fold containment
// (`fold.ts`: dev rethrow, prod `FoldError` → `fold_error`). The single
// exception is a matching `RESOLVE_PROMPT`, whose domain throw is contained here
// (see `reduceGameEvent`) because rule 4 would otherwise wedge the room.
//
// Domain cases land per-task by extending the `routeDomain` switch. Until a
// type has a case it falls through to a bounce. The quest lifecycle, essence,
// and navigation cases live in `./quest/lifecycle` as pure `(quest, payload)`
// functions; `routeDomain` wraps their result over the fold state.

import type { BounceReason, EventContext, GameEvent } from "../eventlog/types";
import {
  CAS_EXEMPT_EVENT_TYPES,
  DECISION_NEUTRAL_EVENT_TYPES,
  isKnownEventType,
  type GameEventType,
} from "./events";
import type { FoldState } from "./fold-state";
import type { QuestState } from "../types/quest";
import * as frontDoor from "./front-door";
import * as battleEvents from "./battle/battle-events";
import * as deck from "./quest/deck";
import * as draft from "./quest/draft";
import * as lifecycle from "./quest/lifecycle";
import * as shop from "./quest/shop";
import * as sites from "./quest/sites";

/** The reducer's return shape (matches `EngineConfig.reducer`). */
export type ReduceResult =
  | { state: FoldState; outcome: "applied"; bounceReason?: never }
  | {
      state: FoldState;
      outcome: "bounced";
      bounceReason: BounceReason;
    };

/**
 * Folds a single event over the room's state per the CAS policy.
 *
 * Rules 1–6 (design spec §Root fold and CAS policy):
 *   1. CAS-exempt types (`SET_CARD_NOTE`, `OPEN_SITE`, `ENTER_DRAFT_SITE`)
 *      skip rules 2–4.
 *   2. A RESOLVE_PROMPT matching the open prompt skips rules 3–4.
 *   3. An unknown intervening window, or one holding an applied partner event
 *      that is not decision-neutral, bounces.
 *   4. A pending prompt bounces any non-(matching-resolve) intent.
 *   5. Route to the domain case; invalid-in-state or unimplemented → bounce.
 *   6. Return the new state (applied) or the untouched state (bounced).
 *
 * Bounces on any invalid event content; a throw from a domain case is a
 * programmer error and propagates to the engine's containment. The one
 * sanctioned catch (a matching `RESOLVE_PROMPT`) is documented at its site.
 */
export function reduceGameEvent(
  state: FoldState,
  event: GameEvent,
  ctx: EventContext,
): ReduceResult {
  const exempt = isCasExempt(event.type); // rule 1
  const matchingResolve = isMatchingResolve(state, event); // rule 2

  if (!exempt && !matchingResolve) {
    // rule 3 — compare-and-swap with the self-chain / decision-neutral carve-out
    if (ctx.intervening === "unknown") {
      return bounce(state, "unknown_conflict");
    }
    if (!isInterveningWindowClear(ctx.intervening, event.actor)) {
      return bounce(state, "partner_conflict");
    }
    // rule 4 — prompt gate
    if (state.battle?.pendingPrompt != null) {
      return bounce(state, "prompt_pending");
    }
  }

  // rule 5 — domain routing.
  if (matchingResolve) {
    // THE SINGLE SANCTIONED CATCH IN THE RULES LAYER. A matching RESOLVE_PROMPT
    // (rule 2 passed, so `state.battle.pendingPrompt` is non-null) must never
    // leave the prompt open on a throw: rule 4 makes a stuck-open prompt
    // PERMANENT — every retry re-throws and every other event bounces, wedging
    // the room forever. So a throwing resolve deterministically clears the
    // prompt and drops queued automation, keeping the board at its last good
    // value. The result is identical on both clients, so the fold stays
    // convergent. Every OTHER domain throw propagates to `fold.ts` containment.
    try {
      return routeDomain(state, event, ctx);
    } catch {
      return {
        state: {
          ...state,
          battle: { ...state.battle!, pendingPrompt: null, effectQueue: [] },
        },
        outcome: "applied",
      };
    }
  }
  return routeDomain(state, event, ctx);
}

/**
 * Rule 1 predicate: CAS-exempt types skip rules 2–4. Exported for direct unit
 * testing (its effect is otherwise only observable once the exempt types gain
 * domain cases).
 *
 * The invariant this exemption leans on is NOT "no exempt type alters battle
 * state" — `SET_CARD_NOTE` does write `board.cardInstances[id].notes`. The
 * real invariant is narrower: no CAS-exempt type alters DECISION-RELEVANT
 * battle state. A note carries no game-rules meaning (it never gates or
 * changes what any other event does), so it is safe for it to apply through a
 * partner's intervening window and even while a prompt is open. Any future
 * CAS-exempt type must uphold this same narrower invariant, not the broader
 * (and already false) one.
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
export function isMatchingResolve(state: FoldState, event: GameEvent): boolean {
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
 * Rule 5: dispatch to the domain reducer for `event.type`. An unrecognized
 * type string bounces immediately. Once narrowed to {@link GameEventType} the
 * switch below is a COMPILE-TIME-EXHAUSTIVE match over every key of
 * `EventPayloads` (see events.ts) — its `default` arm assigns `type` to
 * `never`, so adding a payload-map key without adding a case here fails to
 * typecheck, tying the registry directly to the routing (audit finding P3-5;
 * `events.test.ts` also asserts this at the type level with a runtime probe
 * over every `KNOWN_EVENT_TYPES` member).
 */
export function routeDomain(
  state: FoldState,
  event: GameEvent,
  ctx: EventContext,
): ReduceResult {
  if (!isKnownEventType(event.type)) {
    // Unrecognized type string — recorded no-op, never a throw.
    return bounce(state);
  }
  const payload = event.payload ?? {};
  const quest = state.quest;
  const type: GameEventType = event.type;
  switch (type) {
    // --- standalone front door ---
    case "FRONT_DOOR_ACTION":
      return frontDoorCase(
        state,
        frontDoor.frontDoorAction(state.frontDoor, payload, ctx),
      );
    case "ADVANCE_FRONT_DOOR":
      return frontDoorCase(
        state,
        frontDoor.advanceFrontDoor(state.frontDoor, payload),
      );
    case "BEGIN_TUTORIAL":
      return frontDoorCase(
        state,
        frontDoor.beginTutorial(state.frontDoor, payload, ctx),
      );
    case "COMPLETE_TUTORIAL_ACTION":
      return frontDoorCase(
        state,
        frontDoor.completeTutorialAction(state.frontDoor, payload),
      );
    case "BEGIN_TUTORIAL_BATTLE":
      return foldCase(
        state,
        battleEvents.beginTutorialBattle(state, payload, ctx, event.actor),
      );
    case "RESTART_TUTORIAL_BATTLE":
      return foldCase(
        state,
        battleEvents.restartTutorialBattle(state, payload, ctx, event.actor),
      );
    case "EXIT_TUTORIAL_BATTLE":
      return foldCase(state, battleEvents.exitTutorialBattle(state, payload, event.actor));

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
    case "REROLL_DREAMCALLER_OFFER":
      return questCase(state, lifecycle.rerollDreamcallerOffer(quest));
    case "START_QUEST":
      return questCase(state, lifecycle.startQuest(quest, payload, ctx));

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
      return questCase(
        state,
        sites.acceptTransfigurationChoice(quest, payload),
      );
    case "ACCEPT_DUPLICATION_CHOICE":
      return questCase(
        state,
        sites.acceptDuplicationChoice(quest, payload, ctx),
      );

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
      return questCase(state, sites.acceptEssence(quest, payload, ctx));
    case "REROLL_DREAM_AUGURY":
      return questCase(state, sites.rerollDreamAugury(quest, payload));
    case "FORCE_DREAM_AUGURY_ARCHETYPE":
      return questCase(state, sites.forceDreamAuguryArchetype(quest, payload));
    case "COMPLETE_SITE":
      return questCase(state, sites.completeSite(quest, payload));

    // --- shop, merchant & modifiers ---
    case "BUY_SHOP_SLOT":
      return questCase(state, shop.buyShopSlot(quest, payload, ctx));
    case "REROLL_SHOP":
      return questCase(state, shop.rerollShop(quest, payload, ctx));
    case "GRANT_FREE_REROLLS":
      return questCase(state, shop.grantFreeRerolls(quest, payload));
    case "APPLY_SHOP_DISCOUNT":
      return questCase(state, shop.applyShopDiscount(quest, payload));
    case "ACCEPT_MERCHANT_OFFER":
      return questCase(state, shop.acceptMerchantOffer(quest, payload, ctx));
    case "DECLINE_MERCHANT":
      return questCase(state, shop.declineMerchant(quest, payload, ctx));
    case "PUSH_BATTLE_MODIFIER":
      return questCase(state, shop.pushBattleModifier(quest, payload));
    case "PUSH_TEMPORARY_BANE_GRANT":
      return questCase(state, shop.pushTemporaryBaneGrant(quest, payload, ctx));
    case "BAN_SITE_TYPE":
      return questCase(state, shop.banSiteType(quest, payload));
    case "BOOST_SITE_APPEARANCE":
      return questCase(state, shop.boostSiteAppearance(quest, payload));
    case "REPLACE_SITE_TYPE":
      return questCase(state, shop.replaceSiteType(quest, payload));
    case "ADD_SITE_TO_DREAMSCAPE":
      return questCase(state, shop.addSiteToDreamscape(quest, payload));
    case "UPDATE_ATLAS":
      return questCase(state, shop.updateAtlas(quest, payload));
    case "SET_CARD_SOURCE_DEBUG":
      return questCase(state, shop.setCardSourceDebug(quest, payload));

    // --- draft ---
    case "PICK_DRAFT_CARD":
      return questCase(state, draft.pickDraftCard(quest, payload, ctx));
    case "REROLL_DRAFT_OFFER":
      return questCase(state, draft.rerollDraftOffer(quest, payload, ctx));
    case "ENTER_DRAFT_SITE":
      return questCase(state, draft.enterDraftSite(quest, payload, ctx));
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

    // --- battle lifecycle (create / tear down the battle slice) ---
    case "BEGIN_BATTLE":
      return foldCase(state, battleEvents.beginBattle(state, payload, ctx));
    case "SET_BATTLE_AUTOMATION":
      return foldCase(state, battleEvents.setBattleAutomation(state, payload));
    case "END_BATTLE":
      return foldCase(state, battleEvents.endBattle(state, payload));
    case "BATTLE_COMMAND":
      return foldCase(state, battleEvents.battleCommand(state, payload, ctx, event.actor));
    case "BATTLE_PLAY_CARD":
      return foldCase(state, battleEvents.battlePlayCard(state, payload, ctx, event.actor));
    case "BATTLE_GESTURE":
      return foldCase(state, battleEvents.battleGesture(state, payload, ctx, event.actor));
    case "BATTLE_AI_DEFEND":
      return foldCase(state, battleEvents.battleAiDefend(state, payload, ctx, event.actor));

    // --- in-battle prompt resolution & card notes (touch the battle slice) ---
    case "RESOLVE_PROMPT":
      return foldCase(state, battleEvents.resolvePrompt(state, payload, ctx, event.actor));
    case "SET_CARD_NOTE":
      return foldCase(state, battleEvents.setCardNote(state, payload, ctx));

    // --- whole-fold cases (touch the battle slice) ---
    case "RESET_QUEST":
      return foldCase(state, lifecycle.resetQuest(state));
    case "LOAD_STATE":
      return foldCase(state, lifecycle.loadState(state, payload, ctx));

    default: {
      // Compile-time exhaustiveness: if this still typechecks, `type` is
      // `never` here — every `GameEventType` has a case above.
      const _exhaustive: never = type;
      void _exhaustive;
      return bounce(state);
    }
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

function frontDoorCase(
  state: FoldState,
  nextFrontDoor: FoldState["frontDoor"] | null,
): ReduceResult {
  if (nextFrontDoor === null) return bounce(state);
  return {
    state: { ...state, frontDoor: nextFrontDoor },
    outcome: "applied",
  };
}

/** Wrap a whole-fold domain result: `null` bounces, a new `FoldState` applies. */
function foldCase(state: FoldState, nextState: FoldState | null): ReduceResult {
  if (nextState === null) return bounce(state);
  return { state: nextState, outcome: "applied" };
}

function bounce(
  state: FoldState,
  bounceReason: BounceReason = "invalid_action",
): ReduceResult {
  return { state, outcome: "bounced", bounceReason };
}
