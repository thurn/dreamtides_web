import type { EngineCatalog } from "../catalog";
import type { ChooseModePrompt, ChooseTargetsPrompt, PromptPurpose } from "../prompts/types";
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

/** Every node of an effect tree, every mode of a modal node included. Throws on an unregistered primitive. */
export function everyNode(effect: EffectNode): EffectNode[] {
  const nodes: EffectNode[] = [];
  const walk = (node: EffectNode): void => {
    if (nodes.includes(node)) return;
    nodes.push(node);
    for (const child of primitiveDefinition(node.op).children?.(node) ?? []) walk(child);
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

/** Play-time choices for one effect: its chosen modes and its targets, both in walk order. */
export interface EffectChoices {
  readonly modes: readonly number[];
  readonly targets: readonly (readonly InstanceId[])[];
}

/**
 * Splits the flat play-time choices of a card's event abilities, made in
 * printed order, into each ability's own modes and targets.
 */
export function splitChoices(effects: readonly EffectNode[], choices: EffectChoices): EffectChoices[] {
  let modeOffset = 0;
  let targetOffset = 0;
  return effects.map((effect) => {
    const chosen = chosenModes(effect, choices.modes.slice(modeOffset));
    const targetCount = collectTargets(effect, chosen).length;
    const split = {
      modes: choices.modes.slice(modeOffset, modeOffset + chosen.size),
      targets: choices.targets.slice(targetOffset, targetOffset + targetCount),
    };
    modeOffset += chosen.size;
    targetOffset += targetCount;
    return split;
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
  /** Modes and targets chosen at play time, in walk order. */
  readonly choices: EffectChoices;
}

/** Resolves an effect tree with plain synchronous rules code, under the modes chosen at play time. */
export function resolveEffect(ctx: StepContext, effect: EffectNode, options: ResolveOptions): void {
  const chosen = chosenModes(effect, options.choices.modes);
  const specs = collectTargets(effect, chosen);
  const env: EffectEnv = {
    source: options.source,
    ability: options.ability,
    controller: options.controller,
    variant: options.variant,
    x: options.x,
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
      return purposeOf(options.source, options.cardId, options.ability, role);
    },
  };
  env.run(effect);
}
