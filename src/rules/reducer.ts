import { validJourneySubtypeIntent, validJourneySubtypeScreen, validJourneySubtypeBattleBinding } from "./journey/journey-subtype";
import { resolveTypeRemap, validTypeRemapIntent, validJourneyTypeRemap, validTypeRemapBattleBinding } from "./journey/journey-type-remap";
import { finishBeforeBattlePurge, prepareBeforeBattlePurge } from "./journey/journey-before-battle-purge";
import { duplicationSiteQuote, journeyDuplicationRecord, resolveJourneyDuplication } from "./journey/journey-duplication";
import { deckEntryIdFromUnknown } from "../types/identifiers";
import { journeyDreamsignGains } from "./journey/journey-dreamsign-gains";
import { resolveAfterBattleDreamsign, resolveDreamsignCopy, validDreamsignCopyIntent } from "./journey/journey-on-gain";
import { hasStarterOpeningContinuation, resolveOpeningHandEntry, validOpeningHandIntent } from "./journey/journey-battle-init";
import { essencePurgeSource, essenceReplacementSource } from "./journey/journey-essence";
// The root fold and CAS (compare-and-swap) policy for the event-sourcing rules
// layer.
//
// `reduceGameEvent` is the single reducer the engine folds a game's log with
// (it matches `EngineConfig.reducer`). It applies the CAS policy rules 1–6
// documented on `reduceGameEvent`, then routes surviving events to a domain
// case. It BOUNCES on any invalid event content — malformed, stale, or unknown
// intents leave state untouched — but a *throw* from a domain case is a
// programmer error and PROPAGATES to the engine's fold containment
// (`fold.ts`: dev rethrow, prod `FoldError` → `fold_error`). Engine prompt
// errors are contained by the shared engine adapter.
//
// `routeDomain` holds one case per event type. The journey cases live in
// `./journey/` as pure `(journey, payload[, ctx])` functions; `routeDomain`
// wraps their result over the fold state.

import type {
  BounceReason,
  EventActor,
  EventContext,
  EventType,
  GameEvent,
  ReducerLogRecord,
} from "../eventlog/types";
import {
  CAS_EXEMPT_EVENT_TYPES,
  DECISION_NEUTRAL_EVENT_TYPES,
  isGameplayEventType,
  isKnownEventType,
  type GameEventType,
} from "./events";
import type { FoldState } from "./fold-state";
import type { JourneyPurgeOccurrence, JourneyPurgeTransition, JourneyState } from "../types/journey";
import * as frontDoor from "./front-door";
import * as battleEvents from "./battle/tutorial-lifecycle";
import * as journeyBattle from "./battle/journey-battle";
import {
  applyEngineDebug,
  pendingEnginePrompt,
  reduceEngineIntentWithCommits,
} from "./battle/engine-battle";
import type { Engine } from "../engine";
import { journeyBattleOf, tutorialBattleOf } from "./battle/fold";
import * as deck from "./journey/deck";
import * as draft from "./journey/draft";
import * as lifecycle from "./journey/lifecycle";
import * as gamble from "./journey/gamble";
import * as shop from "./journey/shop";
import * as sites from "./journey/sites";
import { journeyTransfigurationCard, journeyTransfigurationOccurrences, resolveJourneyTransfiguration } from "./journey/journey-transfiguration";
import { resolveStarterPurge, validStarterPurgeIntent } from "./journey/journey-starter-acquisition";
import { resolveJourneyPurge } from "./journey/journey-purge";
import { preventsJourneyPurge } from "./journey/journey-purge-prohibition";
import * as journeySites from "./journey/journey-sites";
import * as cardTutorial from "./card-tutorial-guidance";
import { assertFoldInvariants } from "./invariants";
import { siteIdFromUnknown } from "../types/identifiers";
import {
  journeyModifierRegistry,
  type JourneyModifierRegistry,
} from "./journey/modifier-registry";

/** The reducer's return shape (matches `EngineConfig.reducer`). */
export type ReduceResult =
  | { state: FoldState; outcome: "applied"; bounceReason?: never; logRecords?: readonly ReducerLogRecord[]; purges?: readonly JourneyPurgeOccurrence[] }
  | {
      state: FoldState;
      outcome: "bounced";
      bounceReason: BounceReason;
      logRecords?: never;
    };

/**
 * Folds a single event over the game's state per the CAS policy.
 *
 * Rules 1–6:
 *   1. CAS-exempt types (`SET_CARD_SOURCE_DEBUG`, `OPEN_SITE`, `ENTER_DRAFT_SITE`)
 *      skip rules 2–4.
 *   2. BATTLE_ANSWER or BATTLE_CANCEL matching the engine prompt skips rules 3–4.
 *   3. An unknown intervening window, or one holding an applied partner event
 *      that is not decision-neutral, bounces.
 *   4. A pending engine prompt bounces any other intent.
 *   5. Route to the domain case; invalid-in-state or unimplemented → bounce.
 *   6. Return the new state (applied) or the untouched state (bounced).
 *
 * Bounces on any invalid event content; a throw from a domain case is a
 * programmer error and propagates to the engine's containment.
 */
export function reduceGameEvent(
  state: FoldState,
  event: GameEvent,
  ctx: EventContext,
  modifiers: JourneyModifierRegistry = journeyModifierRegistry,
): ReduceResult {
  const exempt = isCasExempt(event.type); // rule 1
  const matchingEngineAnswer = isMatchingEngineAnswer(state, event); // rule 2

  if (!exempt && !matchingEngineAnswer) {
    // rule 3 — compare-and-swap with the self-chain / decision-neutral carve-out
    if (ctx.intervening === "unknown") {
      return bounce(state, "unknown_conflict");
    }
    if (!isInterveningWindowClear(ctx.intervening, event.actor)) {
      return bounce(state, "partner_conflict");
    }
    // rule 4 — prompt gate
    if (
      pendingEnginePrompt(state.battle, battleEngine()) !== null && !(event.type === "RESOLVE_OPENING_HAND_ENTRY" && validOpeningHandIntent(state.journey, event.payload ?? {}, state.battle, modifiers)) && !(event.type === "RESOLVE_JOURNEY_SUBTYPE" && validJourneySubtypeIntent(state.journey, event.payload ?? {}, state.battle, modifiers)) && !(event.type === "REMOVE_DREAMSIGN" && state.journey.screen.type === "journeyDreamsign" && state.journey.screen.choice.kind === "subtype") && !(event.type === "RESOLVE_TYPE_REMAP" && validTypeRemapIntent(state.journey, event.payload ?? {}, state.battle, modifiers)) && !(event.type === "RESOLVE_DREAMSIGN_COPY" && validDreamsignCopyIntent(state.journey, event.payload ?? {}, state.battle, modifiers)) && !(event.type === "RESOLVE_STARTER_PURGE" && validStarterPurgeIntent(state.journey, event.payload ?? {}, state.battle, modifiers)) && !(event.type === "REMOVE_DREAMSIGN" && state.journey.screen.type === "journeyDreamsign" && state.journey.screen.choice.kind === "typeRemap")
    ) {
      return bounce(state, "prompt_pending");
    }
  }

  let nextRandomIndex = 0;
  const domainContext: EventContext = { ...ctx, rng(index) {
    nextRandomIndex = Math.max(nextRandomIndex, index + 1);
    return ctx.rng(index);
  } };
  const result = routeDomain(state, event, domainContext, modifiers);
  return finishTransition(state, event, result, modifiers, ctx, () => {
    const drawIndex = nextRandomIndex++;
    return { value: ctx.rng(drawIndex), drawIndex };
  });
}

/**
 * Apply journey hooks only after domain validation, before final invariants,
 * and only for a gameplay intent that changed the journey. Administrative
 * intents (`EVENT_INTENT_CLASSES` in ./events) write exactly the state they
 * name.
 */
function finishTransition(
  before: FoldState,
  event: GameEvent,
  result: ReduceResult,
  modifiers: JourneyModifierRegistry,
  ctx: EventContext,
  random: () => { readonly value: number; readonly drawIndex: number },
): ReduceResult {
  const seq = ctx.seq;
  if (event.type === "RESOLVE_JOURNEY_SUBTYPE" && result.outcome === "applied") {
    const resumed = modifiers.resumeSubtype({ journey: before.journey, payload: event.payload ?? {}, battle: before.battle, seq, random });
    return resumed === null ? bounce(before) : enforceInvariants(event, { ...result, state: { ...result.state, journey: resumed.journey }, logRecords: resumed.logRecords }, modifiers);
  }
  if (event.type === "BEGIN_BATTLE" && result.outcome === "applied" && result.state.battle === null && result.state.journey.screen.type === "journeyPurge" && result.state.journey.screen.choice.kind === "beforeBattle") return enforceInvariants(event, result, modifiers);
  if (
    result.outcome === "applied" &&
    result.state.journey !== before.journey &&
    isKnownEventType(event.type) &&
    isGameplayEventType(event.type)
  ) {
    if ((result.purges?.length ?? 0) > 0 && preventsJourneyPurge(result.state.journey, modifiers)) {
      return bounce(before, "invalid_action");
    }
    const siteId = siteIdFromUnknown(event.payload?.siteId) ??
      (before.journey.screen.type === "site" ? before.journey.screen.siteId : null);
    // Domain occurrences are frozen once; modifier-produced copies are not inputs.
    const transfigurations = event.type !== "TRANSFIGURE_CARD" && result.state.journey.dreamsigns.some((sign) => modifiers.lookup(sign.id)?.journeyTransfiguration?.kind === "copyTransfiguredEvent")
      ? journeyTransfigurationOccurrences(before.journey, result.state.journey) : [];
    const domain = result.state.journey;
    const records: ReducerLogRecord[] = [];
    if (event.type === "ACCEPT_TRANSFIGURATION_CHOICE" || event.type === "RESOLVE_JOURNEY_TRANSFIGURATION") {
      const changed = domain.deck.filter((entry) => before.journey.deck.some((old) => old.entryId === entry.entryId && old.transfiguration === null) && entry.transfiguration !== null);
      records.push({ event: "journey_transfiguration_resolved", fields: { eventType: event.type, siteId,
        ...(event.type === "RESOLVE_JOURNEY_TRANSFIGURATION" ? { dreamsignId: event.payload.dreamsignId, heldIndex: event.payload.heldIndex, choiceIndex: event.payload.choiceIndex } : {}),
        selectedEntryIds: event.type === "RESOLVE_JOURNEY_TRANSFIGURATION" ? event.payload.entryIds : [event.payload.entryId],
        transformations: changed.map((entry) => {
          const old = before.journey.deck.find((candidate) => candidate.entryId === entry.entryId)!;
          const runtime = siteId === null ? undefined : before.journey.siteRuntime[siteId];
          const offers = runtime?.kind === "cardChoice" && runtime.choiceKind === "transfiguration"
            ? runtime.transfigurationOffers.filter((offer) => offer.entryId === entry.entryId) : [];
          const quote = offers.find((offer) => offer.type === entry.transfiguration);
          const details = event.type === "RESOLVE_JOURNEY_TRANSFIGURATION" ? journeyTransfigurationCard(old) : null;
          return { entryId: entry.entryId, cardId: quote?.previewCard.id ?? details?.cardId ?? null, type: entry.transfiguration,
            ...(entry.transfigurationApplications === undefined ? {} : { transfigurationApplications: entry.transfigurationApplications }),
            applicableForms: event.type === "RESOLVE_JOURNEY_TRANSFIGURATION" && entry.transfigurationApplications !== undefined
              ? (details?.applicableForms ?? []).filter((form) => form !== "Perfected") : details?.forms ?? offers.map((offer) => offer.type), essenceCost: quote?.essenceCost ?? 0,
            ...(quote === undefined ? {} : { effectDetails: quote.effectDetails }) };
        }),
        essenceBefore: before.journey.essence, essenceAfter: domain.essence } });
    }
    if (siteId !== null && sites.findSite(before.journey, siteId)?.type === "Transfiguration" &&
      !sites.findSite(before.journey, siteId)?.isVisited && sites.findSite(domain, siteId)?.isVisited) {
      records.push({ event: "site_completed", fields: { siteId, siteType: "Transfiguration", eventType: event.type } });
    }
    const applied = modifiers.apply({
      before: before.journey,
      journey: result.state.journey,
      dreamsignGains: journeyDreamsignGains(before.journey, result.state.journey, event),
      battleBinding: result.state.battle === null ? null : { battleId: result.state.battle.init.battleId, mode: result.state.battle.mode.kind },
      eventType: event.type,
      seq, random, transfigurations,
      siteId,
      ...(result.purges === undefined ? {} : { purges: result.purges }),
    });
    result = {
      ...result,
      state: applied.journey === result.state.journey
        ? result.state
        : { ...result.state, journey: applied.journey },
      ...([...records, ...applied.logRecords].length === 0
        ? {}
        : { logRecords: [...(result.logRecords ?? []), ...records, ...applied.logRecords] }),
    };
  }
  if (result.outcome === "applied" && event.type === "RESOLVE_JOURNEY_PURGE" && before.journey.screen.type === "journeyPurge" && before.journey.screen.choice.kind === "beforeBattle") {
    const finalJourney = result.state.journey;
    const transition = finishBeforeBattlePurge(result.state, before.journey.screen.choice, ctx);
    if (transition === null || transition.state.battle === null) return bounce(before);
    const committed = modifiers.applyBattleCommits({ journey: transition.state.journey, battleId: transition.state.battle.init.battleId, siteId: transition.state.battle.init.siteId, seq, steps: transition.committedSteps });
    result = { ...result, state: { ...transition.state, journey: committed.journey }, logRecords: [...(result.logRecords ?? []), ...committed.logRecords,
      { event: "journey_before_battle_started", fields: { siteId: before.journey.screen.choice.siteId, earnedSeq: before.journey.screen.choice.earnedSeq, battleId: transition.state.battle.init.battleId, entryIds: finalJourney.deck.map(({ entryId }) => entryId), essence: finalJourney.essence, dreamsignIds: finalJourney.dreamsigns.map(({ id }) => id) } }] };
  }
  return enforceInvariants(event, result, modifiers);
}

function enforceInvariants(
  event: GameEvent,
  result: ReduceResult,
  registry: JourneyModifierRegistry,
): ReduceResult {
  if (result.outcome === "applied" && event.type !== "LOAD_STATE") {
    assertFoldInvariants(result.state, registry);
  }
  return result;
}

/**
 * Rule 1 predicate: CAS-exempt types skip rules 2–4. Exported for direct unit
 * testing (its effect is otherwise only observable once the exempt types gain
 * domain cases).
 *
 * The invariant this exemption leans on is that no CAS-exempt type alters
 * DECISION-RELEVANT battle state a partner could have decided on, so it is
 * safe for it to apply through a partner's intervening window and even while
 * a prompt is open. Any future CAS-exempt type must uphold this invariant.
 */
export function isCasExempt(type: EventType): boolean {
  return isKnownEventType(type) && CAS_EXEMPT_EVENT_TYPES.has(type);
}

/**
 * Rule 2 for engine prompts: true when `event` is a `BATTLE_ANSWER` or
 * `BATTLE_CANCEL` naming the prompt the journey battle's in-flight engine
 * step is suspended on. A prompt id names the committed state, the attempt,
 * and the answers so far, so nothing intervening can have changed what it
 * asks. Exported for direct unit testing.
 */
export function isMatchingEngineAnswer(
  state: FoldState,
  event: GameEvent,
): boolean {
  if (event.type !== "BATTLE_ANSWER" && event.type !== "BATTLE_CANCEL") {
    return false;
  }
  const pending = pendingEnginePrompt(state.battle, battleEngine());
  return pending !== null && event.payload?.promptId === pending.prompt.id;
}

/**
 * `BATTLE_DEBUG { op }`: an engine debug action (D4) over a journey battle's
 * engine slice, in a development build; `null` bounces it, as a production
 * build always does. CAS-exempt, so an undo also applies while a prompt is
 * pending; every other action needs a decision boundary.
 */
function reduceEngineDebug(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const engine = battleEngine();
  const battle = journeyBattleOf(state.battle);
  if (engine === null || battle === null) {
    return null;
  }
  const fold = battle.engine;
  const applied = applyEngineDebug(engine, fold.slice, payload, ctx.seq);
  return applied === null
    ? null
    : { ...state, battle: { ...battle, engine: { ...fold, slice: applied.slice } } };
}

/** The engine journey battles play on, from the registered battle-init provider. */
function battleEngine(): Engine | null {
  return journeyBattle.getBattleInitProvider()?.engine ?? null;
}

/**
 * Rule 3: the intervening window is clear when it is enumerable AND holds no
 * applied partner event of a non-decision-neutral type. `"unknown"` (the window
 * was compacted away) is never clear — it cannot be inspected, so we bounce.
 * Exported for direct unit testing.
 */
export function isInterveningWindowClear(
  intervening: EventContext["intervening"],
  actor: EventActor,
): boolean {
  if (intervening === "unknown") {
    return false;
  }
  for (const entry of intervening) {
    if (
      entry.actor !== actor &&
      (!isKnownEventType(entry.type) ||
        !DECISION_NEUTRAL_EVENT_TYPES.has(entry.type))
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
 * typecheck, tying the registry directly to the routing (`events.test.ts`
 * also asserts this at the type level with a runtime probe over every
 * `KNOWN_EVENT_TYPES` member).
 */
export function routeDomain(
  state: FoldState,
  event: GameEvent,
  ctx: EventContext,
  modifiers: JourneyModifierRegistry = journeyModifierRegistry,
): ReduceResult {
  if (!isKnownEventType(event.type)) {
    // Unrecognized type string — recorded no-op, never a throw.
    return bounce(state);
  }
  const payload = event.payload ?? {};
  const journey = state.journey;
  const type: GameEventType = event.type;
  if (type === "REMOVE_DREAMSIGN" && hasStarterOpeningContinuation(journey, modifiers)) return bounce(state);
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "openingHand" &&
    (isGameplayEventType(type) || type === "BATTLE_DEBUG") && type !== "RESOLVE_OPENING_HAND_ENTRY") return bounce(state);
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "subtype" &&
    (isGameplayEventType(type) || type === "BATTLE_DEBUG") && type !== "RESOLVE_JOURNEY_SUBTYPE" && type !== "REMOVE_DREAMSIGN") return bounce(state);
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "typeRemap" &&
    (isGameplayEventType(type) || type === "BATTLE_DEBUG") && type !== "RESOLVE_TYPE_REMAP" && type !== "REMOVE_DREAMSIGN") return bounce(state);
  if (journey.screen.type === "journeyStarterPurge" && (isGameplayEventType(type) || type === "BATTLE_DEBUG") && type !== "RESOLVE_STARTER_PURGE" && type !== "REMOVE_DREAMSIGN") return bounce(state);
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "copy" &&
    (isGameplayEventType(type) || type === "BATTLE_DEBUG") && type !== "RESOLVE_DREAMSIGN_COPY") return bounce(state);
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "afterBattle" && isGameplayEventType(type) &&
    type !== "RESOLVE_AFTER_BATTLE_DREAMSIGN" && type !== "ADD_DREAMSIGN" && type !== "REMOVE_DREAMSIGN") return bounce(state);
  if (
    tutorialBattleOf(state.battle)?.tutorialPresentation != null &&
    type !== "COMPLETE_TUTORIAL_BATTLE_PRESENTATION" &&
    (type === "END_BATTLE" || type === "BATTLE_ACTION" || type === "BATTLE_ANSWER" || type === "BATTLE_CANCEL" || type === "TUTORIAL_CARD_ATTEMPT")
  ) {
    return bounce(state);
  }
  if (journey.screen.type === "journeyDuplication" && isGameplayEventType(type) &&
    type !== "RESOLVE_JOURNEY_DUPLICATION" && type !== "ADD_DREAMSIGN" && type !== "REMOVE_DREAMSIGN") return bounce(state);
  const preparationSiteId = siteIdFromUnknown(payload.siteId);
  if ((type === "OPEN_SITE" || type === "ACCEPT_ESSENCE") && preparationSiteId !== null &&
    journey.siteRuntime[preparationSiteId] === undefined && sites.findSite(journey, preparationSiteId)?.type === "Essence" &&
    essenceReplacementSource(journey, modifiers) === null && essencePurgeSource(journey, modifiers) !== null &&
    (state.battle !== null || !(journey.screen.type === "dreamscape" || journey.screen.type === "site" && journey.screen.siteId === preparationSiteId))) {
    return bounce(state);
  }
  if ((journey.screen.type === "journeyPurge" || journey.screen.type === "journeyTransfiguration") && isGameplayEventType(type) &&
    !(journey.screen.type === "journeyPurge" && type === "RESOLVE_JOURNEY_PURGE") &&
    !(journey.screen.type === "journeyTransfiguration" && type === "RESOLVE_JOURNEY_TRANSFIGURATION") &&
    type !== "ADD_DREAMSIGN" && type !== "REMOVE_DREAMSIGN" &&
    !(journey.screen.type === "journeyPurge" && type === "ACCEPT_ESSENCE" && journey.screen.choice.kind === "essenceSite" && payload.siteId === journey.screen.choice.siteId)) {
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
        frontDoor.beginTutorial(state.frontDoor, payload, ctx, state.journey),
      );
    case "COMPLETE_TUTORIAL_ACTION":
      return frontDoorCase(
        state,
        frontDoor.completeTutorialAction(state.frontDoor, payload, ctx),
      );
    case "BEGIN_TUTORIAL_BATTLE":
      return foldCase(
        state,
        battleEvents.beginTutorialBattle(state, payload, ctx),
      );
    case "RESTART_TUTORIAL_BATTLE":
      return foldCase(
        state,
        battleEvents.restartTutorialBattle(state, payload, ctx),
      );
    case "EXIT_TUTORIAL_BATTLE":
      return foldCase(
        state,
        battleEvents.exitTutorialBattle(state, payload, ctx),
      );
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
      return journeyCase(
        state,
        lifecycle.regenerateAtlas(journey, payload, ctx),
      );
    case "DISMISS_STARTING_DECK_POPUP":
      return journeyCase(state, lifecycle.dismissStartingDeckPopup(journey));

    // --- avatar & run assembly ---
    case "SELECT_AVATAR":
      return journeyCase(state, lifecycle.selectAvatar(journey, payload));
    case "REROLL_AVATAR_OFFER":
      return journeyCase(state, lifecycle.rerollAvatarOffer(journey));
    case "START_JOURNEY":
      return journeyCase(state, lifecycle.startJourney(journey, payload, ctx));

    // --- deck & transfiguration ---
    case "ADD_CARD":
      return journeyCase(state, deck.addCard(journey, payload, ctx));
    case "REMOVE_DECK_ENTRY":
      return journeyCase(state, deck.removeDeckEntry(journey, payload));
    case "RESOLVE_JOURNEY_SUBTYPE":
      return validJourneySubtypeIntent(journey, payload, state.battle, modifiers) ? { state, outcome: "applied" } : bounce(state);
    case "RESOLVE_TYPE_REMAP": {
      const result = journeyCase(state, resolveTypeRemap(journey, payload, state.battle, modifiers));
      return result.outcome === "bounced" ? result : { ...result, logRecords: [{ event: "journey_modifier_applied", fields: { dreamsignId: payload.sourceDreamsignId, heldIndex: payload.heldIndex, hook: "type_remap_resolved", choiceIndex: payload.choiceIndex, permissionSeq: payload.permissionSeq, chosenSubtype: payload.chosenSubtype, priorTypeRemap: journey.typeRemap ?? null, deckEntryIds: journey.deck.map(entry => entry.entryId) } }] };
    }
    case "RESOLVE_OPENING_HAND_ENTRY": {
      const transition = resolveOpeningHandEntry(journey, payload, state.battle, modifiers);
      const result = journeyCase(state, transition?.journey ?? null);
      return result.outcome !== "applied" ? result : { ...result, logRecords: [{ event: "journey_modifier_applied", fields: {
        dreamsignId: payload.dreamsignId, heldIndex: payload.heldIndex, hook: "opening_hand_entry_selected",
        choiceIndex: payload.choiceIndex, permissionSeq: payload.permissionSeq, entryId: payload.entryId,
        cardId: transition!.cardId, selected: payload.entryId === null ? 0 : 1,
      } }] };
    }
    case "RESOLVE_DREAMSIGN_COPY": {
      const result = journeyCase(state, resolveDreamsignCopy(journey, payload, state.battle, modifiers));
      return result.outcome === "bounced" ? result : { ...result, logRecords: [{ event: "journey_modifier_applied", fields: { dreamsignId: payload.sourceDreamsignId, heldIndex: payload.heldIndex, hook: "dreamsign_copy_resolved", choiceIndex: payload.choiceIndex, permissionSeq: payload.permissionSeq, targetHeldIndex: payload.targetHeldIndex, targetDreamsignId: payload.expectedTargetDreamsignId } }] };
    }
    case "RESOLVE_AFTER_BATTLE_DREAMSIGN": {
      const result = journeyCase(state, resolveAfterBattleDreamsign(journey, payload, modifiers));
      return result.outcome === "bounced" ? result : { ...result, logRecords: [{ event: "journey_dreamsign_choice_resolved", fields: { siteId: payload.siteId, dreamsignId: payload.dreamsignId, heldIndex: payload.heldIndex, choiceIndex: payload.choiceIndex, earnedSeq: payload.earnedSeq, offeredDreamsignId: payload.offeredDreamsignId, purgeIndex: payload.purgeIndex ?? null } }] };
    }
    case "RESOLVE_JOURNEY_DUPLICATION": {
      const result = journeyCase(state, resolveJourneyDuplication(journey, payload, ctx.seq, modifiers));
      if (result.outcome !== "applied" || journey.screen.type !== "journeyDuplication") return result;
      const choice = journey.screen.choice, source = choice.sources[choice.index];
      return { ...result, logRecords: [journeyDuplicationRecord(journey, result.state.journey, {
        siteId: choice.siteId, selectedEntryId: deckEntryIdFromUnknown(payload.entryId), dreamsignId: source.dreamsignId,
        heldIndex: source.heldIndex, choiceIndex: choice.index, ...(source.kind === "duplication" ? { earnedSeq: source.earnedSeq } : {}),
      })] };
    }
    case "RESOLVE_JOURNEY_TRANSFIGURATION":
      return journeyCase(state, resolveJourneyTransfiguration(journey, payload, ctx, modifiers));
    case "RESOLVE_JOURNEY_PURGE": {
      if (journey.screen.type === "journeyPurge" && journey.screen.choice.kind === "beforeBattle" && journey.screen.choice.earnedSeq >= ctx.seq) return bounce(state);
      const result = journeyPurgeCase(state, resolveJourneyPurge(journey, payload, modifiers));
      return result.outcome === "bounced" ? result : { ...result, logRecords: [{ event: "journey_purge_resolved",
        fields: { siteId: payload.siteId, dreamsignId: payload.dreamsignId, heldIndex: payload.heldIndex,
          choiceIndex: payload.choiceIndex, ...(journey.screen.type === "journeyPurge" && journey.screen.choice.kind === "beforeBattle" ? { earnedSeq: journey.screen.choice.earnedSeq, minimumDeckSize: journey.screen.choice.minimumDeckSize } : {}), purges: result.purges ?? [] } }] };
    }
    case "PURGE_DECK_CARDS":
      return journeyPurgeCase(state, sites.purgeDeckCards(journey, payload));
    case "DUPLICATE_DECK_ENTRY":
      return journeyCase(state, deck.duplicateDeckEntry(journey, payload, ctx));
    case "SET_DECK_ENTRY_STAT_OVERRIDE":
      return journeyCase(
        state,
        deck.setDeckEntryStatOverride(journey, payload),
      );
    case "SET_DECK_ENTRY_KEYWORDS":
      return journeyCase(state, deck.setDeckEntryKeywords(journey, payload));
    case "SET_DECK_ENTRY_TYPE":
      return journeyCase(state, deck.setDeckEntryType(journey, payload));
    case "TRANSFIGURE_CARD":
      return journeyCase(state, deck.transfigureCard(journey, payload));
    case "PURGE_ALL_NIGHTMARE_CARDS":
      return journeyPurgeCase(state, deck.purgeAllNightmareCards(journey));
    case "PURGE_RANDOM_NIGHTMARE_CARDS":
      return journeyPurgeCase(
        state,
        deck.purgeRandomNightmareCards(journey, payload, ctx),
      );

    case "ACCEPT_TRANSFIGURATION_CHOICE":
      return journeyCase(
        state,
        sites.acceptTransfigurationChoice(journey, payload),
      );
    case "ACCEPT_DUPLICATION_CHOICE": {
      const result = journeyCase(state, sites.acceptDuplicationChoice(journey, payload, ctx, modifiers));
      const siteId = siteIdFromUnknown(payload.siteId);
      if (result.outcome !== "applied" || siteId === null) return result;
      const quote = duplicationSiteQuote(journey, modifiers);
      return { ...result, logRecords: [journeyDuplicationRecord(journey, result.state.journey, {
        siteId, selectedEntryId: deckEntryIdFromUnknown(payload.entryId), dreamsignId: quote.dreamsignId, heldIndex: quote.heldIndex,
      })] };
    }

    // --- sites ---
    case "OPEN_SITE": {
      const result = journeyCase(state, sites.openSite(journey, payload, ctx, modifiers));
      const siteId = siteIdFromUnknown(payload.siteId);
      const runtime = siteId === null ? undefined : result.state.journey.siteRuntime[siteId];
      if (result.outcome !== "applied" || !sites.isEnhancedDreamsignReward(runtime)) return result;
      const quote = runtime.enhancedDreamsignOffer;
      return { ...result, logRecords: [{ event: "enhanced_reward_prepared", fields: {
        siteId, standardDreamsignId: quote.standardDreamsignId,
        offeredDreamsignIds: quote.offeredDreamsigns.map((sign) => sign.id),
        requestedCount: quote.requestedCount, offeredCount: quote.offeredDreamsigns.length,
        selectionRulesVersion: quote.selectionRulesVersion,
        remainingDreamsignPoolIds: runtime.remainingDreamsignPoolIds,
      } }] };
    }
    case "CHOOSE_RANDOM_SITE":
      return journeyCase(state, sites.chooseRandomSite(journey, payload));
    case "REROLL_EXPLORATION":
      return journeyCase(state, journeySites.rerollExploration(journey, payload, modifiers));
    case "RESOLVE_EXPLORATION_CHOICE":
      return journeyPurgeCase(
        state,
        sites.resolveExplorationChoice(journey, payload, ctx),
      );
    case "COMPLETE_AUGURY":
      return journeyCase(state, sites.completeAugury(journey, payload));
    case "ACCEPT_REWARD":
      return journeyCase(state, sites.acceptReward(journey, payload));
    case "ACCEPT_DREAMSIGN_OFFER": {
      const result = journeyCase(state, sites.acceptDreamsignOffer(journey, payload));
      const siteId = siteIdFromUnknown(payload.siteId);
      const runtime = siteId === null ? undefined : journey.siteRuntime[siteId];
      if (result.outcome !== "applied" || !sites.isEnhancedDreamsignReward(runtime)) return result;
      const purged = typeof payload.purgeIndex === "number" ? journey.dreamsigns[payload.purgeIndex] : undefined;
      return { ...result, logRecords: [{ event: "enhanced_reward_accepted", fields: {
        siteId, dreamsignId: payload.dreamsignId,
        ...(purged === undefined ? {} : { replacedDreamsignId: purged.id }),
        selectionRulesVersion: runtime.enhancedDreamsignOffer.selectionRulesVersion,
      } }] };
    }
    case "REJECT_DREAMSIGN_OFFER": {
      const result = journeyCase(state, sites.rejectDreamsignOffer(journey, payload));
      const siteId = siteIdFromUnknown(payload.siteId);
      const runtime = siteId === null ? undefined : journey.siteRuntime[siteId];
      if (result.outcome !== "applied" || !sites.isEnhancedDreamsignReward(runtime)) return result;
      return { ...result, logRecords: [{ event: "enhanced_reward_declined", fields: {
        siteId, offeredDreamsignIds: runtime.enhancedDreamsignOffer.offeredDreamsigns.map((sign) => sign.id),
        selectionRulesVersion: runtime.enhancedDreamsignOffer.selectionRulesVersion,
      } }] };
    }
    case "ACCEPT_ESSENCE":
      return journeyCase(state, sites.acceptEssence(journey, payload, ctx, modifiers));
    case "REROLL_AUGURY":
      return journeyCase(state, sites.rerollAugury(journey, payload));
    case "FORCE_AUGURY_ARCHETYPE":
      return journeyCase(state, sites.forceAuguryArchetype(journey, payload));
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
    case "DRAW_TIDEMARK_LADDER_CLIMB":
      return journeyCase(
        state,
        gamble.drawTidemarkLadderClimb(journey, payload),
      );
    case "SETTLE_TIDEMARK_LADDER_CLIMB":
      return journeyCase(
        state,
        gamble.settleTidemarkLadderClimb(journey, payload),
      );
    case "REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN":
      return journeyCase(
        state,
        gamble.replaceTidemarkLadderClimbDreamsign(journey, payload),
      );
    case "DRAW_STARWAY_STAIRS":
      return journeyCase(state, gamble.drawStarwayStairs(journey, payload));
    case "SETTLE_STARWAY_STAIRS":
      return journeyCase(state, gamble.settleStarwayStairs(journey, payload));
    case "CASH_OUT_STARWAY_STAIRS":
      return journeyCase(state, gamble.cashOutStarwayStairs(journey, payload));
    case "PLAY_AGAIN_STARWAY_STAIRS":
      return journeyCase(
        state,
        gamble.playAgainStarwayStairs(journey, payload, ctx),
      );
    case "DRAW_FOUR_SUIT_REPRISE":
      return journeyCase(state, gamble.drawFourSuitReprise(journey, payload));
    case "SETTLE_FOUR_SUIT_REPRISE":
      return journeyPurgeCase(
        state,
        gamble.settleFourSuitReprise(journey, payload, ctx, modifiers),
      );
    case "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION":
      return journeyCase(
        state,
        gamble.chooseFourSuitRepriseTransfiguration(journey, payload),
      );
    case "PLAY_AGAIN_FOUR_SUIT_REPRISE":
      return journeyCase(
        state,
        gamble.playAgainFourSuitReprise(journey, payload),
      );
    case "DEAL_BLACKJACK":
      return journeyCase(state, gamble.dealBlackjack(journey, payload));
    case "HIT_BLACKJACK":
      return journeyCase(state, gamble.hitBlackjack(journey, payload));
    case "STAND_BLACKJACK":
      return journeyCase(state, gamble.standBlackjack(journey, payload));
    case "SETTLE_BLACKJACK":
      return journeyCase(state, gamble.settleBlackjack(journey, payload));
    case "PLAY_AGAIN_BLACKJACK":
      return journeyCase(
        state,
        gamble.playAgainBlackjack(journey, payload, ctx),
      );

    // --- shop, augury & modifiers ---
    case "BUY_SHOP_SLOT":
      return journeyCase(state, shop.buyShopSlot(journey, payload, ctx, modifiers));
    case "REROLL_SHOP":
      return journeyCase(state, shop.rerollShop(journey, payload, ctx, modifiers));
    case "GRANT_FREE_REROLLS":
      return journeyCase(state, shop.grantFreeRerolls(journey, payload));
    case "APPLY_SHOP_DISCOUNT":
      return journeyCase(state, shop.applyShopDiscount(journey, payload));
    case "ACCEPT_AUGURY_OFFER":
      return journeyPurgeCase(
        state,
        shop.acceptAuguryOffer(journey, payload, ctx),
      );
    case "DECLINE_AUGURY":
      return journeyPurgeCase(state, shop.declineAugury(journey, payload, ctx));
    case "PUSH_BATTLE_MODIFIER":
      return journeyCase(state, shop.pushBattleModifier(journey, payload));
    case "PUSH_TEMPORARY_NIGHTMARE_GRANT":
      return journeyCase(
        state,
        shop.pushTemporaryNightmareGrant(journey, payload, ctx),
      );
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
      return journeyCase(state, draft.pickDraftCard(journey, payload, ctx, modifiers));
    case "REROLL_DRAFT_OFFER":
      return journeyCase(state, draft.rerollDraftOffer(journey, payload, ctx));
    case "ENTER_DRAFT_SITE":
      return journeyCase(state, draft.enterDraftSite(journey, payload, ctx, modifiers));
    case "SET_DRAFT_STATE":
      return journeyCase(state, draft.setDraftState(journey, payload));

    // --- dreamsigns ---
    case "ADD_DREAMSIGN":
      return journeyCase(state, deck.addDreamsign(journey, payload));
    case "REMOVE_DREAMSIGN": {
      const next = deck.removeDreamsign(journey, payload);
      if (next !== null && journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "typeRemap" && (!validJourneyTypeRemap(next, modifiers) || !validTypeRemapBattleBinding(next, state.battle))) return journeyCase(state, null);
      if (next !== null && journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "subtype" && (!validJourneySubtypeScreen(next.screen, next, modifiers) || !validJourneySubtypeBattleBinding(next, state.battle))) return journeyCase(state, null);
      return journeyCase(state, next);
    }
    case "SET_DREAMSIGN_POOL":
      return journeyCase(state, deck.setDreamsignPool(journey, payload));
    // --- battle lifecycle (create / tear down the battle slice) ---
    case "BEGIN_BATTLE": {
      const prepared = prepareBeforeBattlePurge(state, payload, ctx, modifiers);
      if (prepared !== null && prepared.journey.screen.type === "journeyPurge" && prepared.journey.screen.choice.kind === "beforeBattle") {
        const choice = prepared.journey.screen.choice;
        return { state: prepared, outcome: "applied", logRecords: [{ event: "journey_before_battle_purge_prepared", fields: { ...choice, deckSize: journey.deck.length } }] };
      }
      const transition = journeyBattle.beginBattleWithCommits(state, payload, ctx);
      if (transition === null || transition.state.battle === null) return bounce(state);
      const applied = modifiers.applyBattleCommits({ journey: transition.state.journey, battleId: transition.state.battle.init.battleId, siteId: transition.state.battle.init.siteId, seq: ctx.seq, steps: transition.committedSteps });
      return { state: { ...transition.state, journey: applied.journey }, outcome: "applied", logRecords: applied.logRecords };
    }
    case "RESOLVE_STARTER_PURGE": {
      const transition = resolveStarterPurge(journey, payload, state.battle, modifiers);
      const result = journeyPurgeCase(state, transition);
      return result.outcome !== "applied" ? result : { ...result, logRecords: [{ event: "journey_starter_purge_resolved", fields: { dreamsignId: payload.dreamsignId, heldIndex: payload.heldIndex, choiceIndex: payload.choiceIndex, permissionSeq: payload.permissionSeq, purges: transition!.purges } }] };
    }
    case "END_BATTLE":
      return foldCase(state, journeyBattle.endBattle(state, payload, ctx));
    case "COMPLETE_TUTORIAL_BATTLE_PRESENTATION":
      return foldCase(state,battleEvents.completeTutorialBattlePresentation(state,payload));
    case "TUTORIAL_CARD_ATTEMPT":
      return foldCase(state,battleEvents.tutorialCardAttempt(state,payload,ctx));

    // --- engine intents of a journey battle ---
    case "BATTLE_ACTION":
    case "BATTLE_ANSWER":
    case "BATTLE_CANCEL": {
      const transition = reduceEngineIntentWithCommits(state,type,payload,ctx,battleEngine());
      let next = transition?.state ?? null;
      const applied = next?.battle?.mode.kind === "journey" && transition !== null
        ? modifiers.applyBattleCommits({ journey: next.journey, battleId: next.battle.init.battleId, siteId: next.battle.init.siteId, seq: ctx.seq, steps: transition.committedSteps }) : null;
      if (next !== null && applied !== null) next = { ...next, journey: applied.journey };
      const base = foldCase(state,next);
      const result = base.outcome === "applied" && applied !== null ? { ...base, logRecords: applied.logRecords } : base;
      const before = tutorialBattleOf(state.battle), after = tutorialBattleOf(next?.battle ?? null);
      const committed = after !== null ? after.overrideCommits.slice(before?.overrideCommits.length ?? 0) : [];
      return result.outcome !== "applied" || committed.length === 0 ? result : {...result,logRecords:committed.map(override=>({event:"tutorial_ai_override_committed",fields:{battleId:after!.init.battleId,...override}}))};
    }

    case "BATTLE_DEBUG":
      return foldCase(state, reduceEngineDebug(state, payload, ctx));

    // --- whole-fold cases (touch the battle slice) ---
    case "RESET_JOURNEY":
      return foldCase(state, lifecycle.resetJourney(state, ctx));
    case "LOAD_STATE":
      return foldCase(state, lifecycle.loadState(state, payload, ctx, modifiers));

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

/** Preserve validated purge occurrences across the existing journey reconciliation. */
function journeyPurgeCase(state: FoldState, transition: JourneyPurgeTransition | null): ReduceResult {
  if (transition === null) return bounce(state);
  const result = journeyCase(state, transition.journey);
  if (result.outcome !== "applied") return result;
  const prevented = transition.preventedPurges ?? [];
  return { ...result, purges: transition.purges,
    ...(prevented.length === 0 ? {} : { logRecords: [
      ...(result.logRecords ?? []),
      ...prevented.map((occurrence) => ({ event: "journey_purge_prevented",
        fields: { eventType: "SETTLE_FOUR_SUIT_REPRISE", ...occurrence } })),
    ] }),
  };
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
