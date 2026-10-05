import type { EngineCatalog } from "../catalog";
import type { ChooseNumberPrompt, ChooseTargetsPrompt, PromptPurpose } from "../prompts/types";
import {
  matchesCharacter,
  matchesStackItem,
  matchingCharacters,
  matchingStackItems,
  resolvePlayer,
} from "../dsl/selectors";
import type { CharacterRef, Condition, PlayTimeTarget, StackTargetSpec, ValueExpr, Variant } from "../dsl/types";
import type { AbilitySource, CardId, InstanceId, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { primitiveDefinition } from "./registry";
import type { EffectEnv, EffectNode } from "./types";

/**
 * Every play-time target spec in an effect, in walk order. A spec object
 * used in several places is one target ("that character"), listed once.
 */
export function collectTargets(effect: EffectNode): PlayTimeTarget[] {
  const specs: PlayTimeTarget[] = [];
  const walk = (node: EffectNode): void => {
    const definition = primitiveDefinition(node.op);
    for (const spec of definition.targets?.(node) ?? []) {
      if (!specs.includes(spec)) specs.push(spec);
    }
    for (const child of definition.children?.(node) ?? []) walk(child);
  };
  walk(effect);
  return specs;
}

/** A prompt purpose for an ability of `source`; an emblem's prompts carry no instance or card. */
export function purposeOf(
  source: AbilitySource,
  cardId: CardId | null,
  ability: number,
  role: string,
): PromptPurpose {
  return { source: sourceInstance(source), cardId, ability, role };
}

/** The characters or stack cards a target spec may choose now. */
export function targetCandidates(
  state: BattleState,
  catalog: EngineCatalog,
  spec: PlayTimeTarget,
  controller: Side,
  source: AbilitySource,
): InstanceId[] {
  return spec.kind === "stackTarget"
    ? matchingStackItems(state, catalog, spec.selector, controller, source)
    : matchingCharacters(state, catalog, spec.selector, controller, source);
}

/**
 * Chooses the targets for every spec, in order, as play-time prompts. A
 * required target with no candidate raises an empty prompt, which makes the
 * play illegal (rules § Targeting).
 */
export function chooseTargets(
  ctx: StepContext,
  specs: readonly PlayTimeTarget[],
  controller: Side,
  source: AbilitySource,
  purpose: PromptPurpose,
): InstanceId[][] {
  return specs.map((spec) => {
    const candidates = targetCandidates(ctx.state, ctx.catalog, spec, controller, source);
    const count = spec.kind === "stackTarget" ? 1 : (spec.count ?? 1);
    const chosen = ctx.choose<ChooseTargetsPrompt>({
      kind: "chooseTargets",
      side: controller,
      purpose,
      candidates,
      min: spec.kind === "target" && spec.upTo === true ? 0 : count,
      max: count,
    });
    return [...chosen];
  });
}

/** Chooses X as a play-time prompt: at least 1, at most the energy left after the fixed cost. */
export function chooseX(ctx: StepContext, controller: Side, purpose: PromptPurpose, available: number): number {
  return ctx.choose<ChooseNumberPrompt>({
    kind: "chooseNumber",
    side: controller,
    purpose,
    min: 1,
    max: available,
  });
}

export function evaluate(ctx: StepContext, value: ValueExpr, env: EffectEnv): number {
  if (typeof value === "number") return value;
  switch (value.value) {
    case "x":
      return env.x ?? 0;
    case "count":
      return matchingCharacters(ctx.state, ctx.catalog, value.of, env.controller, env.source).length;
    case "handSize":
      return ctx.state.sides[resolvePlayer(env.controller, value.player)].hand.length;
  }
}

export function checkCondition(ctx: StepContext, condition: Condition, env: EffectEnv): boolean {
  switch (condition.cond) {
    case "controls":
      return (
        matchingCharacters(ctx.state, ctx.catalog, condition.selector, env.controller, env.source)
          .length >= condition.atLeast
      );
    case "energyAtLeast":
      return ctx.state.sides[env.controller].currentEnergy >= condition.amount;
  }
}

/**
 * The characters a character effect applies to now. A chosen target that is
 * no longer legal is skipped; if none remain, that part of the effect does
 * nothing and reports noLegalTarget.
 */
export function resolveCharacters(ctx: StepContext, ref: CharacterRef, env: EffectEnv): InstanceId[] {
  switch (ref.kind) {
    case "self": {
      // An emblem is never a character (P4).
      const self = sourceInstance(env.source);
      return self !== null && ctx.state.instances[self]?.zone === "play" ? [self] : [];
    }
    case "all":
      return matchingCharacters(ctx.state, ctx.catalog, ref.selector, env.controller, env.source);
    case "target": {
      const chosen = env.targetsOf(ref) ?? [];
      const legal = chosen.filter((id) =>
        matchesCharacter(ctx.state, ctx.catalog, ref.selector, id, env.controller, env.source),
      );
      if (legal.length === 0 && chosen.length > 0) {
        ctx.emit({ kind: "noLegalTarget", source: env.source });
      }
      return legal;
    }
  }
}

/**
 * The stack cards a stack target applies to now: chosen targets still on the
 * stack and still matching. If none remain, that part of the effect does
 * nothing and reports noLegalTarget.
 */
export function resolveStackTargets(ctx: StepContext, spec: StackTargetSpec, env: EffectEnv): InstanceId[] {
  const chosen = env.targetsOf(spec) ?? [];
  const legal = chosen.filter((id) =>
    matchesStackItem(ctx.state, ctx.catalog, spec.selector, id, env.controller, env.source),
  );
  if (legal.length === 0 && chosen.length > 0) {
    ctx.emit({ kind: "noLegalTarget", source: env.source });
  }
  return legal;
}

export interface ResolveOptions {
  readonly source: AbilitySource;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  /** The source's card, or `null` for an emblem; prompt purposes carry it. */
  readonly cardId: CardId | null;
  readonly controller: Side;
  readonly variant: Variant;
  readonly x: number | null;
  /** Targets chosen at play time, aligned with collectTargets(effect). */
  readonly targets: readonly (readonly InstanceId[])[];
}

/** Resolves an effect tree with plain synchronous rules code. */
export function resolveEffect(ctx: StepContext, effect: EffectNode, options: ResolveOptions): void {
  const specs = collectTargets(effect);
  const env: EffectEnv = {
    source: options.source,
    ability: options.ability,
    controller: options.controller,
    variant: options.variant,
    x: options.x,
    targetsOf(spec) {
      const index = specs.indexOf(spec);
      return index < 0 ? null : (options.targets[index] ?? null);
    },
    run(node) {
      primitiveDefinition(node.op).resolve(ctx, node, env);
    },
    purpose(role) {
      return purposeOf(options.source, options.cardId, options.ability, role);
    },
  };
  env.run(effect);
}
