/**
 * The step-kind registry. Each kind is declared in its own module; adding a
 * kind adds its module, one import, one union member, and one entry below.
 * The `satisfies` clause makes a missing entry a type error.
 */
import { activate, type ActivateStep } from "./activate";
import { advancePhase, type AdvancePhaseStep } from "./advance-phase";
import { beginBattle, type BeginBattleStep } from "./begin-battle";
import { challengeLane, type ChallengeLaneStep } from "./challenge-lane";
import { payToEnd, type PayToEndStep } from "./pay-to-end";
import { play, type PlayStep } from "./play";
import { reposition, type RepositionStep } from "./reposition";
import { resolveTop, type ResolveTopStep } from "./resolve-top";
import { resolveTrigger, type ResolveTriggerStep } from "./resolve-trigger";
import type { StepDefinition } from "../types";

export type Step =
  | ActivateStep
  | AdvancePhaseStep
  | BeginBattleStep
  | ChallengeLaneStep
  | PayToEndStep
  | PlayStep
  | RepositionStep
  | ResolveTopStep
  | ResolveTriggerStep;

export type StepKind = Step["kind"];

export type StepOf<K extends StepKind> = Extract<Step, { kind: K }>;

export const STEP_DEFINITIONS = {
  activate,
  advancePhase,
  beginBattle,
  challengeLane,
  payToEnd,
  play,
  reposition,
  resolveTop,
  resolveTrigger,
} as const satisfies { readonly [K in StepKind]: StepDefinition<StepOf<K>> };

export function stepDefinition<K extends StepKind>(kind: K): StepDefinition<StepOf<K>> {
  return STEP_DEFINITIONS[kind] as StepDefinition<StepOf<K>>;
}
