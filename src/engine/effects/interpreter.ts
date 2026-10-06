import type { EngineCatalog } from "../catalog";
import type { ChooseModePrompt, ChooseTargetsPrompt, PromptPurpose, PromptRole, PromptSource } from "../prompts/types";
import {
  matchesCharacter,
  matchesStackItem,
  matchingCharacters,
  matchingStackItems,
} from "../dsl/selectors";
import { evaluateValue } from "../dsl/values";
import { supportedBy } from "../continuous/support";
import type { CharacterRef, Condition, PlayTimeTarget, StackTargetSpec, ValueExpr } from "../dsl/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { AbilityOrigin, BattleState, EffectChoices } from "../state/types";
import { BASE_VARIANT } from "../dsl/types";
import type { StepContext } from "../steps/types";
import { primitiveDefinition } from "./registry";
import type { CardRef, EffectEnv, EffectNode } from "./types";

/** The mode chosen at play time for each modal node of an effect. */
export type ChosenModes = ReadonlyMap<EffectNode, number>;

/**
 * Walks an effect tree in play-time order, visiting each node object once
 * (one node used in several places is one node). A modal node descends only
 * into the mode `modeOf` picks for it; any other node into all its children.
 */
function walkPlayTime(
  effect: EffectNode,
  modeOf: (node: EffectNode, modes: readonly EffectNode[]) => number,
  visit: (node: EffectNode) => void,
): void {
  const seen = new Set<EffectNode>();
  const walk = (node: EffectNode): void => {
    if (seen.has(node)) return;
    seen.add(node);
    const definition = primitiveDefinition(node.op);
    visit(node);
    const modes = definition.modes?.(node);
    if (modes === undefined) {
      for (const child of definition.children?.(node) ?? []) walk(child);
      return;
    }
    const chosen = modes[modeOf(node, modes)];
    if (chosen === undefined) throw new Error(`No mode was chosen for a ${node.op} node`);
    walk(chosen);
  };
  walk(effect);
}

/**
 * Every node of an effect tree, every mode of a modal node and every deferred
 * effect included, in a fixed order that floating triggers index into. Throws
 * on an unregistered primitive.
 */
export function everyNode(effect: EffectNode): EffectNode[] {
  const nodes: EffectNode[] = [];
  const walk = (node: EffectNode): void => {
    if (nodes.includes(node)) return;
    nodes.push(node);
    const definition = primitiveDefinition(node.op);
    for (const child of definition.children?.(node) ?? []) walk(child);
    for (const child of definition.deferred?.(node) ?? []) walk(child);
  };
  walk(effect);
  return nodes;
}

function addTargets(specs: PlayTimeTarget[], node: EffectNode): void {
  for (const spec of primitiveDefinition(node.op).targets?.(node) ?? []) {
    if (!specs.includes(spec)) specs.push(spec);
  }
}

/**
 * The play-time target specs of an effect under its chosen modes, in walk
 * order. A spec object used in several places is one target ("that
 * character"), listed once.
 */
export function collectTargets(effect: EffectNode, chosen: ChosenModes): PlayTimeTarget[] {
  const specs: PlayTimeTarget[] = [];
  walkPlayTime(
    effect,
    (node) => {
      const mode = chosen.get(node);
      if (mode === undefined) throw new Error(`No mode was chosen for a ${node.op} node`);
      return mode;
    },
    (node) => addTargets(specs, node),
  );
  return specs;
}

/** Every target spec of an effect in any of its modes, for setup tooling. */
export function everyTarget(effect: EffectNode): PlayTimeTarget[] {
  const specs: PlayTimeTarget[] = [];
  for (const node of everyNode(effect)) addTargets(specs, node);
  return specs;
}

/**
 * Pairs the modes chosen at play time, in walk order, with an effect's modal
 * nodes. Throws when the list is too short or names a mode the node lacks.
 */
export function chosenModes(effect: EffectNode, modes: readonly number[]): Map<EffectNode, number> {
  const chosen = new Map<EffectNode, number>();
  walkPlayTime(
    effect,
    (node, options) => {
      const mode = modes[chosen.size];
      if (mode === undefined || options[mode] === undefined) {
        throw new Error(`Mode ${String(mode)} is not a mode of a ${node.op} node`);
      }
      chosen.set(node, mode);
      return mode;
    },
    () => undefined,
  );
  return chosen;
}

/**
 * A prompt purpose for an ability of `source`, whose definition comes from
 * `origin`: a card source carries its instance and printed card, an emblem
 * its side, kind, and catalog UUID.
 */
export function purposeOf(source: AbilitySource, origin: AbilityOrigin, ability: number, role: PromptRole): PromptPurpose {
  return { source: promptSource(source, origin), cardId: origin.kind === "card" ? origin.cardId : null, ability, role };
}

function promptSource(source: AbilitySource, origin: AbilityOrigin): PromptSource {
  if (typeof source === "string") return source;
  if (source.kind === "avatar" && origin.kind === "avatar") return { kind: "avatar", side: source.side, id: origin.id };
  if (source.kind === "dreamsign" && origin.kind === "dreamsign") {
    return { kind: "dreamsign", side: source.side, index: source.index, id: origin.id };
  }
  throw new Error(`A ${source.kind} source has a ${origin.kind} origin`);
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

/** How many targets a spec takes: "up to N" allows none. */
function targetBounds(spec: PlayTimeTarget): { readonly min: number; readonly max: number } {
  const count = spec.kind === "stackTarget" ? 1 : (spec.count ?? 1);
  return { min: spec.kind === "target" && spec.upTo === true ? 0 : count, max: count };
}

/**
 * Whether a mode could be chosen now: every required target in it has
 * enough candidates, and each modal node inside it has such a mode.
 */
function modeLegal(
  state: BattleState,
  catalog: EngineCatalog,
  node: EffectNode,
  controller: Side,
  source: AbilitySource,
): boolean {
  const definition = primitiveDefinition(node.op);
  const targetsAvailable = (definition.targets?.(node) ?? []).every(
    (spec) => targetCandidates(state, catalog, spec, controller, source).length >= targetBounds(spec).min,
  );
  if (!targetsAvailable) return false;
  const modes = definition.modes?.(node);
  return modes === undefined
    ? (definition.children?.(node) ?? []).every((child) => modeLegal(state, catalog, child, controller, source))
    : modes.some((mode) => modeLegal(state, catalog, mode, controller, source));
}

/**
 * Chooses a mode for each modal node of an effect, in walk order, as
 * play-time prompts; a nested modal node is reached only through its chosen
 * mode. A mode whose required targets have no candidates is not legal, and a
 * node with no legal mode raises an empty prompt, which makes the play
 * illegal.
 */
export function chooseModes(
  ctx: StepContext,
  effect: EffectNode,
  controller: Side,
  source: AbilitySource,
  purpose: PromptPurpose,
): number[] {
  const modes: number[] = [];
  walkPlayTime(
    effect,
    (_, options) => {
      const mode = ctx.choose<ChooseModePrompt>({
        kind: "chooseMode",
        side: controller,
        purpose,
        options: options.map((option, index) => ({
          mode: index,
          legal: modeLegal(ctx.state, ctx.catalog, option, controller, source),
        })),
      });
      modes.push(mode);
      return mode;
    },
    () => undefined,
  );
  return modes;
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
    const chosen = ctx.choose<ChooseTargetsPrompt>({
      kind: "chooseTargets",
      side: controller,
      purpose,
      candidates: targetCandidates(ctx.state, ctx.catalog, spec, controller, source),
      ...targetBounds(spec),
    });
    return [...chosen];
  });
}

/** One ability whose play-time choices are made: its index in its source's ability list and its effect. */
export interface PlayTimeAbility {
  readonly ability: number;
  readonly effect: EffectNode;
}

/**
 * The play-time choices of `abilities` as `source` is played or activated:
 * every ability's modes, in order, then every ability's targets, in order.
 * Returns one entry per ability.
 */
export function choosePlayTime(
  ctx: StepContext,
  abilities: readonly PlayTimeAbility[],
  controller: Side,
  source: AbilitySource,
  purpose: (ability: number, role: PromptRole) => PromptPurpose,
): EffectChoices[] {
  const modes = abilities.map((ability) => chooseModes(ctx, ability.effect, controller, source, purpose(ability.ability, "chooseOne")));
  return abilities.map((ability, index) => {
    const chosen = modes[index] ?? [];
    const specs = collectTargets(ability.effect, chosenModes(ability.effect, chosen));
    return { modes: chosen, targets: chooseTargets(ctx, specs, controller, source, purpose(ability.ability, "target")) };
  });
}

/**
 * Choices for an effect made as it resolves, for a triggered ability, which
 * does not use the stack: modes, then targets, in walk order. A required
 * choice with no legal option makes that part of the effect do nothing (rules
 * § Targeting): a target spec with fewer candidates than it requires gets no
 * targets and no prompt, and a modal node with no legal mode makes the whole
 * effect do nothing (`null`). Each emits noLegalTarget.
 */
export function chooseOnResolution(
  ctx: StepContext,
  effect: EffectNode,
  controller: Side,
  source: AbilitySource,
  purpose: (role: PromptRole) => PromptPurpose,
): EffectChoices | null {
  const modes: number[] = [];
  let blocked = false;
  walkPlayTime(
    effect,
    (_, options) => {
      const legal = options.map((option) => modeLegal(ctx.state, ctx.catalog, option, controller, source));
      if (blocked || !legal.includes(true)) {
        blocked = true;
        return 0;
      }
      const mode = ctx.choose<ChooseModePrompt>({
        kind: "chooseMode",
        side: controller,
        purpose: purpose("chooseOne"),
        options: legal.map((isLegal, index) => ({ mode: index, legal: isLegal })),
      });
      modes.push(mode);
      return mode;
    },
    () => undefined,
  );
  if (blocked) {
    ctx.emit({ kind: "noLegalTarget", source });
    return null;
  }
  const targets = collectTargets(effect, chosenModes(effect, modes)).map((spec) => {
    const candidates = targetCandidates(ctx.state, ctx.catalog, spec, controller, source);
    const bounds = targetBounds(spec);
    if (candidates.length < bounds.min) {
      ctx.emit({ kind: "noLegalTarget", source });
      return [];
    }
    if (candidates.length === 0) return [];
    const chosen = ctx.choose<ChooseTargetsPrompt>({
      kind: "chooseTargets",
      side: controller,
      purpose: purpose("target"),
      candidates,
      min: bounds.min,
      max: Math.min(bounds.max, candidates.length),
    });
    return [...chosen];
  });
  return { modes, targets };
}

/**
 * A value as the effect resolves. A resolving effect locks every value it
 * reads at this moment (RD-hv-7x4l.7-1).
 */
export function evaluate(ctx: StepContext, value: ValueExpr, env: EffectEnv): number {
  return evaluateValue(ctx.state, value, {
    controller: env.controller,
    source: env.source,
    x: env.x,
    count: (selector) => matchingCharacters(ctx.state, ctx.catalog, selector, env.controller, env.source).length,
  });
}

/** What a condition is checked against: the effect's controller and source, and the item's paid optional costs. */
export interface ConditionScope {
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly optionalPaid: readonly boolean[];
}

/** Whether a condition holds now, outside a resolving effect as well (intervening "if" conditions). */
export function conditionHolds(
  state: BattleState,
  catalog: EngineCatalog,
  condition: Condition,
  scope: ConditionScope,
): boolean {
  switch (condition.cond) {
    case "controls":
      return (
        matchingCharacters(state, catalog, condition.selector, scope.controller, scope.source).length >=
        condition.atLeast
      );
    case "energyAtLeast":
      return state.sides[scope.controller].currentEnergy >= condition.amount;
    case "costPaid":
      return scope.optionalPaid[condition.optional] === true;
    case "sourceIn": {
      const instance = sourceInstance(scope.source);
      return instance === null ? condition.zone === "play" : state.instances[instance]?.zone === condition.zone;
    }
  }
}

export function checkCondition(ctx: StepContext, condition: Condition, env: EffectEnv): boolean {
  return conditionHolds(ctx.state, ctx.catalog, condition, env);
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
    case "subject": {
      const subject = env.subject;
      return subject !== null && ctx.state.instances[subject]?.zone === "play" ? [subject] : [];
    }
    case "supported": {
      const self = sourceInstance(env.source);
      const selector = { controller: "you" as const, ...ref.selector };
      return self === null
        ? []
        : supportedBy(ctx.state, self).filter((id) => matchesCharacter(ctx.state, ctx.catalog, selector, id, env.controller, env.source));
    }
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

/**
 * The cards a card reference names now: chosen characters still legal,
 * chosen stack cards still on the stack, or the triggering card or the
 * source wherever it is, while it exists.
 */
export function resolveCards(ctx: StepContext, ref: CardRef, env: EffectEnv): InstanceId[] {
  switch (ref.kind) {
    case "target":
      return resolveCharacters(ctx, ref, env);
    case "stackTarget":
      return resolveStackTargets(ctx, ref, env);
    case "subject":
      return env.subject !== null && ctx.state.instances[env.subject] !== undefined ? [env.subject] : [];
    case "self": {
      const self = sourceInstance(env.source);
      return self !== null && ctx.state.instances[self] !== undefined ? [self] : [];
    }
  }
}

/** Whether resolving an effect could put characters into play (rules § Battlefield Capacity). */
export function effectEntersPlay(effect: EffectNode): boolean {
  return everyNode(effect).some((node) => primitiveDefinition(node.op).entersPlay === true);
}

export interface ResolveOptions {
  readonly source: AbilitySource;
  /** Where the ability's definition comes from; prompt purposes carry its card or emblem. */
  readonly origin: AbilityOrigin;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  /** The ability's whole effect, when `effect` is a part of it (a floating trigger's effect). */
  readonly root?: EffectNode;
  /** The card the triggering event concerns, for a trigger. */
  readonly subject?: InstanceId | null;
  readonly controller: Side;
  readonly x: number | null;
  /** Whether each optional cost of the item was paid, in printed order. */
  readonly optionalPaid: readonly boolean[];
  /** Modes and targets chosen at play time, in walk order. */
  readonly choices: EffectChoices;
}

/** Resolves an effect tree with plain synchronous rules code, under the modes chosen at play time. */
export function resolveEffect(ctx: StepContext, effect: EffectNode, options: ResolveOptions): void {
  const chosen = chosenModes(effect, options.choices.modes);
  const specs = collectTargets(effect, chosen);
  const env: EffectEnv = {
    source: options.source,
    origin: options.origin,
    ability: options.ability,
    root: options.root ?? effect,
    subject: options.subject ?? null,
    controller: options.controller,
    variant: options.origin.kind === "card" ? options.origin.variant : BASE_VARIANT,
    x: options.x,
    optionalPaid: options.optionalPaid,
    duration: null,
    modeOf(node) {
      return chosen.get(node) ?? null;
    },
    targetsOf(spec) {
      const index = specs.indexOf(spec);
      return index < 0 ? null : (options.choices.targets[index] ?? null);
    },
    run(node) {
      primitiveDefinition(node.op).resolve(ctx, node, env);
    },
    purpose(role) {
      return purposeOf(options.source, options.origin, options.ability, role);
    },
  };
  env.run(effect);
}
