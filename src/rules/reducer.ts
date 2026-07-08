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
// type has a case it falls through to a bounce. `ADJUST_ESSENCE` is the first
// real case, implemented here as the CAS-policy probe.

import type { EventContext, EventOutcome, GameEvent } from "../eventlog/types";
import {
  CAS_EXEMPT_EVENT_TYPES,
  DECISION_NEUTRAL_EVENT_TYPES,
} from "./events";
import type { FoldState } from "./fold-state";

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
  _ctx: EventContext,
): ReduceResult {
  switch (event.type) {
    case "ADJUST_ESSENCE":
      return applyAdjustEssence(state, event);
    default:
      // Not-yet-implemented or unknown type — recorded no-op.
      return bounce(state);
  }
}

/**
 * `ADJUST_ESSENCE { delta }` — mirrors legacy `changeEssence`: add `delta` to
 * quest essence and clamp the result to `[0, essenceCap]`. A non-finite delta
 * is malformed and bounces.
 */
function applyAdjustEssence(state: FoldState, event: GameEvent): ReduceResult {
  const delta = event.payload?.delta;
  if (typeof delta !== "number" || !Number.isFinite(delta)) {
    return bounce(state);
  }
  const { essence, essenceCap } = state.quest;
  const next = clampEssence(essence + delta, essenceCap);
  return {
    state: { ...state, quest: { ...state.quest, essence: next } },
    outcome: "applied",
  };
}

/** Clamp essence to `[0, cap]` (mirrors `clampEssence` in quest-state-actions). */
function clampEssence(value: number, cap: number): number {
  return Math.max(0, Math.min(value, cap));
}

function bounce(state: FoldState): ReduceResult {
  return { state, outcome: "bounced" };
}
