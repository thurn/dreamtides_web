// The shape of one Dreamtides 97 event, declared once beside its subsystem:
// the phase of the run it folds in, how its logged payload parses, how it
// folds, and the intent key that applies it at most once. The subsystem tables
// in this directory spread into `D97_EVENTS` (./index.ts), from which the
// payload types, the rules layer's event tables, the reducer's dispatch and
// the `actions.d97(intent)` facade derive.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type { EventContext } from "../../../eventlog/types";
import type { IntentKey } from "../../../types/identifiers";
import { d97BattleOf, type D97BattleFoldState } from "../../battle/fold";
import type { FoldState } from "../../fold-state";
import type { D97FoldTransition } from "../d97-encounters";
import type { D97Transition } from "../d97-run";
import { isD97Overworld, type D97AvatarSelectState, type D97OverworldState, type D97Run } from "../d97-state";

/**
 * Where in a D97 game an event folds, checked once by the dispatcher before
 * the payload parses; an event outside its phase bounces. The slice end is
 * no event's phase: every intent bounces there.
 *
 * - `avatarSelect`: no run yet, on Avatar select.
 * - `overworld`: a started run on the overworld, with no battle running.
 * - `inBattle`: a started run's D97 battle running, from the overworld.
 */
export type D97Phase = "avatarSelect" | "overworld" | "inBattle";

/** What an Avatar select fold sees. */
export interface D97SelectInput {
  readonly state: FoldState;
  readonly d97: D97AvatarSelectState;
}

/** What an overworld fold sees: the run, out of battle. */
export interface D97RunInput {
  readonly state: FoldState;
  readonly d97: D97OverworldState;
  readonly run: D97Run;
}

/** What an in-battle fold sees: the run and its D97 battle. */
export interface D97BattleInput extends D97RunInput {
  readonly battle: D97BattleFoldState;
}

/** The fold input each phase guarantees. */
export interface D97PhaseInputs {
  readonly avatarSelect: D97SelectInput;
  readonly overworld: D97RunInput;
  readonly inBattle: D97BattleInput;
}

/** Each phase's check: the fold input when `state` is in it, or null. */
const D97_PHASES: { readonly [Phase in D97Phase]: (state: FoldState) => D97PhaseInputs[Phase] | null } = {
  avatarSelect: (state) => {
    const d97 = state.d97;
    return d97 === undefined || d97.run !== null || state.battle !== null ? null : { state, d97 };
  },
  overworld: (state) => {
    const d97 = state.d97;
    return d97 === undefined || !isD97Overworld(d97) || state.battle !== null ? null : { state, d97, run: d97.run };
  },
  inBattle: (state) => {
    const d97 = state.d97;
    const battle = d97BattleOf(state.battle);
    return d97 === undefined || !isD97Overworld(d97) || battle === null ? null : { state, d97, run: d97.run, battle };
  },
};

/** The fold input when `state` is in `phase`, or null when it is not. */
export function d97PhaseInput<Phase extends D97Phase>(phase: Phase, state: FoldState): D97PhaseInputs[Phase] | null {
  return D97_PHASES[phase](state);
}

/** A D97 fold's applied result: a new D97 slice, or a whole new fold state. */
export type D97Outcome = D97Transition | D97FoldTransition;

/** One D97 event's declaration. `Payload` is the logged payload's typed shape. */
export interface D97EventSpec<Phase extends D97Phase, Payload extends Record<string, unknown>> {
  readonly phase: Phase;
  /** The typed payload of a logged payload, or null to bounce. */
  readonly parse: (raw: Record<string, unknown>) => Payload | null;
  /** The event's fold in its phase, or null to bounce. */
  readonly fold: (input: D97PhaseInputs[Phase], payload: NoInfer<Payload>, ctx: EventContext) => D97Outcome | null;
  /** The key applying the intent at most once; unkeyed intents may repeat. */
  readonly intentKey?: (payload: NoInfer<Payload>) => IntentKey;
}

/** Declare one D97 event; its payload type is what `parse` returns. */
export function d97Event<Phase extends D97Phase, Payload extends Record<string, unknown>>(
  spec: D97EventSpec<Phase, Payload>,
): D97EventSpec<Phase, Payload> {
  return spec;
}

/** One parser per payload field: the field's value, or null when it is malformed. */
type FieldParsers<Payload> = { readonly [Field in keyof Payload]: (value: unknown) => Payload[Field] | null };

/**
 * A payload parser from one parser per field; any malformed field bounces.
 * Bind it to a module constant: written inline in a spec, its payload type
 * infers as the bare record and the spec's fold no longer typechecks.
 */
export function payloadOf<Payload extends Record<string, unknown>>(
  fields: FieldParsers<Payload>,
): (raw: Record<string, unknown>) => Payload | null {
  return (raw) => {
    const payload: Record<string, unknown> = {};
    for (const [field, parse] of Object.entries<(value: unknown) => unknown>(fields)) {
      const value = parse(raw[field]);
      if (value === null) return null;
      payload[field] = value;
    }
    return payload as Payload;
  };
}

/** A boolean field. */
export function booleanFromUnknown(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** An integer field. */
export function integerFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
