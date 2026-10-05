import type { EngineCatalog } from "../catalog";
import type { ChooseNumberPrompt, ChooseTargetsPrompt } from "../prompts/types";
import { matchesCharacter, matchingCharacters, resolvePlayer } from "../dsl/selectors";
import type { CharacterRef, Condition, TargetSpec, ValueExpr, Variant } from "../dsl/types";
import { instanceOf } from "../rules/zones";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { primitiveDefinition } from "./registry";
import type { EffectEnv, EffectNode } from "./types";

/**
 * Every play-time target spec in an effect, in walk order. A spec object
 * used in several places is one target ("that character"), listed once.
 */
export function collectTargets(effect: EffectNode): TargetSpec[] {
  const specs: TargetSpec[] = [];
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

/** The characters a target spec may choose now. */
export function targetCandidates(
  state: BattleState,
  catalog: EngineCatalog,
  spec: TargetSpec,
  controller: Side,
  source: InstanceId,
): InstanceId[] {
  return matchingCharacters(state, catalog, spec.selector, controller, source);
}

/**
 * Chooses the targets for every spec, in order, as play-time prompts. A
 * required target with no candidate raises an empty prompt, which makes the
 * play illegal (rules § Targeting).
 */
export function chooseTargets(
  ctx: StepContext,
  specs: readonly TargetSpec[],
  controller: Side,
  source: InstanceId,
): InstanceId[][] {
  return specs.map((spec) => {
    const candidates = targetCandidates(ctx.state, ctx.catalog, spec, controller, source);
    const count = spec.count ?? 1;
    const chosen = ctx.choose<ChooseTargetsPrompt>({
      kind: "chooseTargets",
      side: controller,
      purpose: {
        source,
        cardId: instanceOf(ctx.state, source).cardId,
        ability: 0,
        role: "target",
      },
      candidates,
      min: spec.upTo === true ? 0 : count,
      max: count,
    });
    return [...chosen];
  });
}

/** Chooses X as a play-time prompt: at least 1, at most the energy left after the fixed cost. */
export function chooseX(ctx: StepContext, controller: Side, source: InstanceId, available: number): number {
  return ctx.choose<ChooseNumberPrompt>({
    kind: "chooseNumber",
    side: controller,
    purpose: { source, cardId: instanceOf(ctx.state, source).cardId, ability: 0, role: "chooseX" },
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
    case "self":
      return instanceOf(ctx.state, env.source).zone === "play" ? [env.source] : [];
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

export interface ResolveOptions {
  readonly source: InstanceId;
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
  };
  env.run(effect);
}
