/**
 * The step-kind registry. Each kind is declared in its own module; adding a
 * kind adds its module, one import, one union member, and one entry below.
 * The `satisfies` clause makes a missing entry a type error.
 *
 * The loop-iteration kind replays steps through the runner, which looks
 * definitions up here, so this module shares an import cycle with it, and a
 * production bundle can evaluate a kind's module after this one. Each entry
 * is a getter, so the table reads a definition when it is looked up, never
 * while modules load (scripts/import-cycles.mjs).
 */
import { activate, type ActivateStep } from "./activate";
import { advancePhase, type AdvancePhaseStep } from "./advance-phase";
import { beginBattle, type BeginBattleStep } from "./begin-battle";
import { challengeLane, type ChallengeLaneStep } from "./challenge-lane";
import { loopIteration, type LoopIterationStep } from "./loop-iteration";
import { payToEnd, type PayToEndStep } from "./pay-to-end";
import { play, type PlayStep } from "./play";
import { repeatLoop, type RepeatLoopStep } from "./repeat-loop";
import { reposition, type RepositionStep } from "./reposition";
import { resolveTop, type ResolveTopStep } from "./resolve-top";
import { resolveTrigger, type ResolveTriggerStep } from "./resolve-trigger";
import type { StepDefinition } from "../types";

export type Step =
  | ActivateStep
  | AdvancePhaseStep
  | BeginBattleStep
  | ChallengeLaneStep
  | LoopIterationStep
  | PayToEndStep
  | PlayStep
  | RepeatLoopStep
  | RepositionStep
  | ResolveTopStep
  | ResolveTriggerStep;

export type StepKind = Step["kind"];

export type StepOf<K extends StepKind> = Extract<Step, { kind: K }>;

const STEP_DEFINITIONS = {
  get activate() {
    return activate;
  },
  get advancePhase() {
    return advancePhase;
  },
  get beginBattle() {
    return beginBattle;
  },
  get challengeLane() {
    return challengeLane;
  },
  get loopIteration() {
    return loopIteration;
  },
  get payToEnd() {
    return payToEnd;
  },
  get play() {
    return play;
  },
  get repeatLoop() {
    return repeatLoop;
  },
  get reposition() {
    return reposition;
  },
  get resolveTop() {
    return resolveTop;
  },
  get resolveTrigger() {
    return resolveTrigger;
  },
} as const satisfies { readonly [K in StepKind]: StepDefinition<StepOf<K>> };

export function stepDefinition<K extends StepKind>(kind: K): StepDefinition<StepOf<K>> {
  return STEP_DEFINITIONS[kind] as StepDefinition<StepOf<K>>;
}
