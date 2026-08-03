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
// type has a case it falls through to a bounce. The journey lifecycle, essence,
// and navigation cases live in `./journey/lifecycle` as pure `(journey, payload)`
// functions; `routeDomain` wraps their result over the fold state.

import type { BounceReason, EventContext, GameEvent } from "../eventlog/types";
import {
  CAS_EXEMPT_EVENT_TYPES,
  DECISION_NEUTRAL_EVENT_TYPES,
  isKnownEventType,
  type GameEventType,
} from "./events";
import type { FoldState } from "./fold-state";
import type { JourneyState } from "../types/journey";
import { readDraftSiteProgress } from "../data/draft-site-bootstrap";
import * as frontDoor from "./front-door";
import * as battleEvents from "./battle/battle-events";
import * as deck from "./journey/deck";
import * as draft from "./journey/draft";
import * as lifecycle from "./journey/lifecycle";
import * as gamble from "./journey/gamble";
import * as shop from "./journey/shop";
import * as sites from "./journey/sites";
import * as cardTutorial from "./card-tutorial-guidance";
import { assertFoldInvariants } from "./invariants";

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
  const controlDecision = authorizePlaytestIntent(state, event);
  if (controlDecision === "reject") {
    return bounce(state, "observer_read_only");
  }
  const routedState: FoldState =
    controlDecision === "claim"
      ? {
          ...state,
          playtestControl: {
            mode: "single-controller",
            controllerClientId: event.actor,
          },
        }
      : state;
  const exempt = isCasExempt(event.type); // rule 1
  const matchingResolve = isMatchingResolve(routedState, event); // rule 2

  if (!exempt && !matchingResolve) {
    // rule 3 — compare-and-swap with the self-chain / decision-neutral carve-out
    if (ctx.intervening === "unknown") {
      return bounce(state, "unknown_conflict");
    }
    if (!isInterveningWindowClear(ctx.intervening, event.actor)) {
      return bounce(state, "partner_conflict");
    }
    // rule 4 — prompt gate
    if (routedState.battle?.pendingPrompt != null) {
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
    let result: ReduceResult;
    try {
      result = routeDomain(routedState, event, ctx);
    } catch {
      result = {
        state: {
          ...routedState,
          battle: { ...routedState.battle!, pendingPrompt: null, effectQueue: [] },
        },
        outcome: "applied",
      };
    }
    const controlled =
      result.outcome === "bounced" && controlDecision === "claim"
        ? { ...result, state }
        : result;
    // Invariant checks stay outside the sanctioned domain-error catch. A
    // semantic programmer error must reach fold containment and diagnostics.
    return enforceInvariants(event, controlled);
  }
  const result = routeDomain(routedState, event, ctx);
  const controlled = result.outcome === "bounced" && controlDecision === "claim"
    ? { ...result, state }
    : result;
  return enforceInvariants(event, controlled);
}

function enforceInvariants(
  event: GameEvent,
  result: ReduceResult,
): ReduceResult {
  if (result.outcome === "applied" && event.type !== "LOAD_STATE") {
    assertFoldInvariants(result.state);
  }
  return result;
}

type PlaytestControlDecision = "allow" | "claim" | "reject";

function authorizePlaytestIntent(
  state: FoldState,
  event: GameEvent,
): PlaytestControlDecision {
  const control = state.playtestControl ?? {
    mode: "collaborative" as const,
    controllerClientId: null,
  };
  if (control.mode !== "single-controller") return "allow";
  if (event.type === "TAKE_PLAYTEST_CONTROL") return "allow";
  if (event.type === "COMPLETE_TUTORIAL_BATTLE_PRESENTATION") {
    const controllerClientId = control.controllerClientId;
    return controllerClientId !== null &&
      (
        event.actor === controllerClientId ||
        event.actor === `tutorial-ai:${controllerClientId}`
      )
      ? "allow"
      : "reject";
  }
  if (isPassiveHostedHandoff(state, event)) return "allow";
  if (!isPlayerControlledIntent(event)) return "allow";
  if (control.controllerClientId === null) {
    if (isFirstTutorialGameplayIntent(state, event)) return "claim";
    return state.frontDoor.phase === "main" ||
      state.frontDoor.phase === "mainExiting" ||
      state.frontDoor.phase === "loading"
      ? "allow"
      : "reject";
  }
  return event.actor === control.controllerClientId ? "allow" : "reject";
}

function isPassiveHostedHandoff(
  state: FoldState,
  event: GameEvent,
): boolean {
  if (
    event.type === "BATTLE_COMMAND" &&
    battleEvents.isPassiveHostedBattleHandoff(
      state,
      event.payload,
      event.intentKey,
    )
  ) {
    return true;
  }
  if (event.type === "OPEN_SITE" || event.type === "ENTER_DRAFT_SITE") {
    const siteId = event.payload.siteId;
    return (
      typeof siteId === "string" &&
      state.journey.screen.type === "site" &&
      state.journey.screen.siteId === siteId &&
      state.journey.activeSiteId === siteId
    );
  }
  if (event.type !== "COMPLETE_SITE") return false;
  const siteId = event.payload.siteId;
  if (typeof siteId !== "string") return false;
  return readDraftSiteProgress(state.journey.draftState, siteId).isComplete;
}

const TUTORIAL_BATTLE_GAMEPLAY_EVENT_TYPES: ReadonlySet<string> = new Set([
  "BATTLE_COMMAND",
  "BATTLE_REPOSITION_CHARACTER",
  "BATTLE_PLAY_CARD",
  "BATTLE_GESTURE",
  "RESOLVE_PROMPT",
]);

function isFirstTutorialGameplayIntent(
  state: FoldState,
  event: GameEvent,
): boolean {
  if (
    event.type === "FRONT_DOOR_ACTION" &&
    event.payload.surface === "tutorial" &&
    event.payload.actionId === "play-card"
  ) {
    return true;
  }
  return state.battle?.mode?.kind === "tutorial" &&
    TUTORIAL_BATTLE_GAMEPLAY_EVENT_TYPES.has(event.type);
}

const PASSIVE_HOSTED_EVENT_TYPES: ReadonlySet<string> = new Set([
  "ADVANCE_FRONT_DOOR",
  "BEGIN_TUTORIAL",
  "COMPLETE_TUTORIAL_ACTION",
  "BEGIN_TUTORIAL_BATTLE",
  "COMPLETE_TUTORIAL_BATTLE_PRESENTATION",
  "OPEN_CARD_TUTORIAL_GUIDANCE",
  "COMPLETE_CARD_TUTORIAL_GUIDANCE",
  "SET_CARD_SOURCE_DEBUG",
]);

function isPlayerControlledIntent(event: GameEvent): boolean {
  if (PASSIVE_HOSTED_EVENT_TYPES.has(event.type)) return false;
  if (
    event.actor.startsWith("tutorial-ai:") ||
    event.actor.startsWith("ai:")
  ) {
    return false;
  }
  return true;
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
  const journey = state.journey;
  const type: GameEventType = event.type;
  if (
    state.battle?.tutorialPresentation != null &&
    type !== "COMPLETE_TUTORIAL_BATTLE_PRESENTATION" &&
    (
      type === "END_BATTLE" ||
      type === "BATTLE_COMMAND" ||
      type === "BATTLE_REPOSITION_CHARACTER" ||
      type === "BATTLE_PLAY_CARD" ||
      type === "BATTLE_GESTURE" ||
      type === "BATTLE_AI_BLOCK" ||
      type === "RESOLVE_PROMPT" ||
      type === "SET_CARD_NOTE"
    )
  ) {
    return bounce(state);
  }
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
    case "TAKE_PLAYTEST_CONTROL":
      return takePlaytestControl(state, payload, event.actor);
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
    case "OPEN_CARD_TUTORIAL_GUIDANCE":
      return foldCase(
        state,
        cardTutorial.openCardTutorialGuidance(state, payload),
      );
    case "COMPLETE_CARD_TUTORIAL_GUIDANCE":
      return foldCase(
        state,
        cardTutorial.completeCardTutorialGuidance(state, payload),
      );

    // --- essence & limits ---
    case "ADJUST_ESSENCE":
      return journeyCase(state, lifecycle.adjustEssence(journey, payload));
    case "SET_ESSENCE":
      return journeyCase(state, lifecycle.setEssence(journey, payload));
    case "SET_MAX_DREAMSIGNS":
      return journeyCase(state, lifecycle.setMaxDreamsigns(journey, payload));
    // --- navigation ---
    case "ENTER_SITE":
      return journeyCase(state, lifecycle.enterSite(journey, payload));
    case "TRAVEL_TO_DREAMSCAPE":
      return journeyCase(state, lifecycle.travelToDreamscape(journey, payload));
    case "REGENERATE_ATLAS":
      return journeyCase(state, lifecycle.regenerateAtlas(journey, payload, ctx));
    case "DISMISS_STARTING_DECK_POPUP":
      return journeyCase(state, lifecycle.dismissStartingDeckPopup(journey));

    // --- dreamAvatar & run assembly ---
    case "SELECT_DREAM_AVATAR":
      return journeyCase(state, lifecycle.selectDreamAvatar(journey, payload));
    case "REROLL_DREAM_AVATAR_OFFER":
      return journeyCase(state, lifecycle.rerollDreamAvatarOffer(journey));
    case "START_JOURNEY":
      return startJourneyCase(
        state,
        lifecycle.startJourney(journey, payload, ctx),
      );

    // --- deck & transfiguration ---
    case "ADD_CARD":
      return journeyCase(state, deck.addCard(journey, payload, ctx));
    case "REMOVE_DECK_ENTRY":
      return journeyCase(state, deck.removeDeckEntry(journey, payload));
    case "PURGE_DECK_CARDS":
      return journeyCase(state, sites.purgeDeckCards(journey, payload));
    case "DUPLICATE_DECK_ENTRY":
      return journeyCase(state, deck.duplicateDeckEntry(journey, payload, ctx));
    case "SET_DECK_ENTRY_STAT_OVERRIDE":
      return journeyCase(state, deck.setDeckEntryStatOverride(journey, payload));
    case "SET_DECK_ENTRY_KEYWORDS":
      return journeyCase(state, deck.setDeckEntryKeywords(journey, payload));
    case "SET_DECK_ENTRY_TYPE":
      return journeyCase(state, deck.setDeckEntryType(journey, payload));
    case "TRANSFIGURE_CARD":
      return journeyCase(state, deck.transfigureCard(journey, payload));
    case "PURGE_ALL_BANE_CARDS":
      return journeyCase(state, deck.purgeAllBaneCards(journey));
    case "PURGE_RANDOM_BANE_CARDS":
      return journeyCase(state, deck.purgeRandomBaneCards(journey, payload, ctx));

    case "ACCEPT_TRANSFIGURATION_CHOICE":
      return journeyCase(
        state,
        sites.acceptTransfigurationChoice(journey, payload),
      );
    case "ACCEPT_DUPLICATION_CHOICE":
      return journeyCase(
        state,
        sites.acceptDuplicationChoice(journey, payload, ctx),
      );

    // --- sites ---
    case "OPEN_SITE":
      return journeyCase(state, sites.openSite(journey, payload, ctx));
    case "RESOLVE_EXPLORATION_CHOICE":
      return journeyCase(
        state,
        sites.resolveExplorationChoice(journey, payload, ctx),
      );
    case "COMPLETE_DREAM_AUGURY":
      return journeyCase(state, sites.completeDreamAugury(journey, payload));
    case "ACCEPT_REWARD":
      return journeyCase(state, sites.acceptReward(journey, payload));
    case "ACCEPT_DREAMSIGN_OFFER":
      return journeyCase(state, sites.acceptDreamsignOffer(journey, payload));
    case "REJECT_DREAMSIGN_OFFER":
      return journeyCase(state, sites.rejectDreamsignOffer(journey, payload));
    case "ACCEPT_ESSENCE":
      return journeyCase(state, sites.acceptEssence(journey, payload, ctx));
    case "REROLL_DREAM_AUGURY":
      return journeyCase(state, sites.rerollDreamAugury(journey, payload));
    case "FORCE_DREAM_AUGURY_ARCHETYPE":
      return journeyCase(state, sites.forceDreamAuguryArchetype(journey, payload));
    case "COMPLETE_SITE":
      return journeyCase(state, sites.completeSite(journey, payload));
    case "PLACE_GRAVOK_WAGER":
      return journeyCase(state, gamble.placeGravokWager(journey, payload));
    case "SETTLE_GRAVOK_WAGER":
      return journeyCase(state, gamble.settleGravokWager(journey, payload));
    case "PLAY_AGAIN_GRAVOK_WAGER":
      return journeyCase(
        state,
        gamble.playAgainGravokWager(journey, payload, ctx),
      );
    case "REPLACE_GRAVOK_WAGER_DREAMSIGN":
      return journeyCase(
        state,
        gamble.replaceGravokWagerDreamsign(journey, payload),
      );

    // --- shop, merchant & modifiers ---
    case "BUY_SHOP_SLOT":
      return journeyCase(state, shop.buyShopSlot(journey, payload, ctx));
    case "REROLL_SHOP":
      return journeyCase(state, shop.rerollShop(journey, payload, ctx));
    case "GRANT_FREE_REROLLS":
      return journeyCase(state, shop.grantFreeRerolls(journey, payload));
    case "APPLY_SHOP_DISCOUNT":
      return journeyCase(state, shop.applyShopDiscount(journey, payload));
    case "ACCEPT_MERCHANT_OFFER":
      return journeyCase(state, shop.acceptMerchantOffer(journey, payload, ctx));
    case "DECLINE_MERCHANT":
      return journeyCase(state, shop.declineMerchant(journey, payload, ctx));
    case "PUSH_BATTLE_MODIFIER":
      return journeyCase(state, shop.pushBattleModifier(journey, payload));
    case "PUSH_TEMPORARY_BANE_GRANT":
      return journeyCase(state, shop.pushTemporaryBaneGrant(journey, payload, ctx));
    case "BAN_SITE_TYPE":
      return journeyCase(state, shop.banSiteType(journey, payload));
    case "BOOST_SITE_APPEARANCE":
      return journeyCase(state, shop.boostSiteAppearance(journey, payload));
    case "REPLACE_SITE_TYPE":
      return journeyCase(state, shop.replaceSiteType(journey, payload));
    case "ADD_SITE_TO_DREAMSCAPE":
      return journeyCase(state, shop.addSiteToDreamscape(journey, payload));
    case "SET_CARD_SOURCE_DEBUG":
      return journeyCase(state, shop.setCardSourceDebug(journey, payload));

    // --- draft ---
    case "PICK_DRAFT_CARD":
      return journeyCase(state, draft.pickDraftCard(journey, payload, ctx));
    case "REROLL_DRAFT_OFFER":
      return journeyCase(state, draft.rerollDraftOffer(journey, payload, ctx));
    case "ENTER_DRAFT_SITE":
      return journeyCase(state, draft.enterDraftSite(journey, payload, ctx));
    case "SET_DRAFT_STATE":
      return journeyCase(state, draft.setDraftState(journey, payload));

    // --- dreamsigns ---
    case "ADD_DREAMSIGN":
      return journeyCase(state, deck.addDreamsign(journey, payload));
    case "REMOVE_DREAMSIGN":
      return journeyCase(state, deck.removeDreamsign(journey, payload));
    case "SET_DREAMSIGN_POOL":
      return journeyCase(state, deck.setDreamsignPool(journey, payload));
    case "SET_DREAMSIGN_IS_BANE":
      return journeyCase(state, deck.setDreamsignIsBane(journey, payload));

    // --- battle lifecycle (create / tear down the battle slice) ---
    case "BEGIN_BATTLE":
      return foldCase(state, battleEvents.beginBattle(state, payload, ctx));
    case "SET_BATTLE_AUTOMATION":
      return foldCase(state, battleEvents.setBattleAutomation(state, payload));
    case "END_BATTLE":
      return foldCase(state, battleEvents.endBattle(state, payload, ctx));
    case "BATTLE_COMMAND":
      return foldCase(state, battleEvents.battleCommand(state, payload, ctx, event.actor));
    case "BATTLE_REPOSITION_CHARACTER":
      return foldCase(
        state,
        battleEvents.battleRepositionCharacter(state, payload, ctx, event.actor),
      );
    case "BATTLE_PLAY_CARD":
      return foldCase(state, battleEvents.battlePlayCard(state, payload, ctx, event.actor));
    case "BATTLE_GESTURE":
      return foldCase(state, battleEvents.battleGesture(state, payload, ctx, event.actor));
    case "BATTLE_AI_BLOCK":
      return foldCase(state, battleEvents.battleAiBlock(state, payload, ctx, event.actor));
    case "COMPLETE_TUTORIAL_BATTLE_PRESENTATION":
      return foldCase(
        state,
        battleEvents.completeTutorialBattlePresentation(state, payload, ctx, event.actor),
      );

    // --- in-battle prompt resolution & card notes (touch the battle slice) ---
    case "RESOLVE_PROMPT":
      return foldCase(state, battleEvents.resolvePrompt(state, payload, ctx, event.actor));
    case "SET_CARD_NOTE":
      return foldCase(state, battleEvents.setCardNote(state, payload, ctx));

    // --- whole-fold cases (touch the battle slice) ---
    case "RESET_JOURNEY":
      return foldCase(state, lifecycle.resetJourney(state));
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

function takePlaytestControl(
  state: FoldState,
  payload: Record<string, unknown>,
  actor: string,
): ReduceResult {
  if (
    state.playtestControl?.mode !== "single-controller" ||
    typeof actor !== "string" ||
    actor.length === 0 ||
    payload.previousControllerClientId !==
      state.playtestControl.controllerClientId ||
    actor === state.playtestControl.controllerClientId
  ) {
    return bounce(state);
  }
  return {
    outcome: "applied",
    state: {
      ...state,
      playtestControl: {
        ...state.playtestControl,
        controllerClientId: actor,
      },
    },
  };
}

/**
 * Wrap a journey-only domain result: `null` bounces (invalid-in-state / malformed
 * payload), a new `JourneyState` is applied over the existing battle slice.
 */
function journeyCase(
  state: FoldState,
  nextJourney: JourneyState | null,
): ReduceResult {
  if (nextJourney === null) return bounce(state);
  return {
    state: cardTutorial.reconcileCardTutorialGuidance({
      ...state,
      journey: nextJourney,
    }),
    outcome: "applied",
  };
}

/**
 * Apply a successfully assembled run and release hosted tutorial authority at
 * the exact event that enters the authored tutorial journey. The lifecycle
 * provider derives `isTutorialJourney` from the pinned DreamAvatar offer and
 * loaded tutorial pool, so the control policy never trusts URL or payload
 * hints. A rejected start returns the untouched single-controller fold.
 */
function startJourneyCase(
  state: FoldState,
  nextJourney: JourneyState | null,
): ReduceResult {
  if (nextJourney === null) return bounce(state);
  return journeyCase(
    nextJourney.isTutorialJourney === true
      ? {
          ...state,
          playtestControl: {
            mode: "collaborative",
            controllerClientId: null,
          },
        }
      : state,
    nextJourney,
  );
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
