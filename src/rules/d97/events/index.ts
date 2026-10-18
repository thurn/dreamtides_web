// Every Dreamtides 97 event, one spec each (./spec.ts), spread from the
// subsystem tables beside this file. The rules layer's payload map
// (../../events.ts), the reducer's D97 dispatch and the `actions.d97(intent)`
// facade derive from `D97_EVENTS`; the rules layer's runtime tables read its
// types from ./catalog.ts, which the compiler holds to these keys.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type { EventContext } from "../../../eventlog/types";
import type { IntentKey } from "../../../types/identifiers";
import type { FoldState } from "../../fold-state";
import type { D97FoldTransition } from "../d97-encounters";
import { DECK_EVENTS } from "./deck";
import { ENCOUNTER_EVENTS } from "./encounters";
import { QUEST_EVENTS } from "./quests";
import { RUN_EVENTS } from "./run";
import { SHOP_EVENTS } from "./shop";
import { D97_PHASES, type D97Outcome, type D97Phase, type D97SelectInput } from "./spec";
import { TRAVEL_EVENTS } from "./travel";

/** Every D97 event's spec, by event type. */
export const D97_EVENTS = {
  ...RUN_EVENTS,
  ...DECK_EVENTS,
  ...ENCOUNTER_EVENTS,
  ...QUEST_EVENTS,
  ...SHOP_EVENTS,
  ...TRAVEL_EVENTS,
};

/** The event types of the Dreamtides 97 namespace. */
export type D97EventType = keyof typeof D97_EVENTS;

/** Each D97 event's typed payload: what its spec's `parse` returns. */
export type D97EventPayloads = {
  [Type in D97EventType]: NonNullable<ReturnType<(typeof D97_EVENTS)[Type]["parse"]>>;
};

/** One D97 intent event, typed by its event type. */
export type D97Intent = {
  readonly [Type in D97EventType]: { readonly type: Type; readonly payload: D97EventPayloads[Type] };
}[D97EventType];

/**
 * A spec with its phase and payload erased. Each table entry pairs its phase,
 * parser and fold, so the dispatcher may call one through this view.
 */
interface ErasedSpec {
  readonly phase: D97Phase;
  readonly parse: (raw: Record<string, unknown>) => Record<string, unknown> | null;
  readonly fold: (input: D97SelectInput, payload: Record<string, unknown>, ctx: EventContext) => D97Outcome | null;
  readonly intentKey?: (payload: Record<string, unknown>) => IntentKey;
}

function specOf(type: D97EventType): ErasedSpec {
  return D97_EVENTS[type] as unknown as ErasedSpec;
}

/** The intent key `intent` is recorded under, if its event is keyed. */
export function d97IntentKey(intent: D97Intent): IntentKey | undefined {
  return specOf(intent.type).intentKey?.(intent.payload);
}

/**
 * Fold one D97 event of a D97 game: bounce (null) outside the event's phase
 * or on a malformed payload, otherwise its fold's result over the whole fold
 * state.
 */
export function foldD97Event(
  state: FoldState,
  type: D97EventType,
  raw: Record<string, unknown>,
  ctx: EventContext,
): D97FoldTransition | null {
  const spec = specOf(type);
  const input = state.d97 === undefined ? null : D97_PHASES[spec.phase](state, state.d97);
  const payload = input === null ? null : spec.parse(raw);
  const outcome = input === null || payload === null ? null : spec.fold(input, payload, ctx);
  if (outcome === null) return null;
  return "state" in outcome
    ? outcome
    : { state: { ...state, d97: outcome.d97 }, logRecords: outcome.logRecords };
}
