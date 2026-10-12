import type { LinkedSourceContext } from "../state/types";
import { linkedSourceContext } from "../rules/linked-banish";
import type { EngineCatalog } from "../catalog";
import type { ChooseModePrompt, ChooseTargetsPrompt, PromptPurpose, PromptRole, PromptSource } from "../prompts/types";
import {
  boundNow,
  matchesCharacter,
  matchesStackItem,
  matchingCharacters,
  matchingStackItems,
  resolvePlayer,
  zoneCount,
  type SourceSparkReader,
} from "../dsl/selectors";
import { evaluateValue } from "../dsl/values";
import { conditionHoldsWith, type ConditionScope } from "../dsl/conditions";
import { cardMatchesFilter, characteristics, characteristicsOf, copiableCostOf } from "../continuous/characteristics";
import { supportedBy } from "../continuous/support";
import type { CharacterRef, Condition, PlayTimeTarget, StackTargetSpec, ValueExpr, ZoneCardSpec, ZoneTargetSpec } from "../dsl/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { AbilityOrigin, BattleState, EffectChoices, SparkGain } from "../state/types";
import { BASE_VARIANT } from "../dsl/types";
import type { StepContext } from "../steps/types";
import { randomDeckRemovalSettler, seesSource, type DeckRemovalBounds, type UnorderedDeckRemovals } from "../view/knowledge";
import { abilityOrigin, originAbilities } from "../rules/activation";
import { effectiveSpark } from "../rules/spark";
import type { BanishCardsNode, BanishNamedCardsNode } from "./primitives/banish-cards";
import type { MaterializeNode } from "./primitives/materialize";
import { primitiveDefinition } from "./registry";
import type { CapturedCardsSpec, CardRef, EffectEnv, EffectNode, MovedCards } from "./types";

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
  if (source.kind === "dreamwell" && origin.kind === "dreamwell" && source.id === origin.id) return source;
  if (source.kind === "avatar" && origin.kind === "avatar") return { kind: "avatar", side: source.side, id: origin.id };
  if (source.kind === "dreamsign" && origin.kind === "dreamsign") {
    return { kind: "dreamsign", side: source.side, index: source.index, id: origin.id };
  }
  throw new Error(`A ${source.kind} source has a ${origin.kind} origin`);
}

/**
 * The cards of `ids` an effect may target now, in order (rules § Targeting):
 * a card that cannot be targeted by effects is never chosen or kept as a
 * target, whoever controls the effect. Only targeted references read this;
 * a selector alone ("all", counts, conditions, Support, triggers, and costs)
 * still matches the card.
 */
function targetable(state: BattleState, catalog: EngineCatalog, ids: InstanceId[]): InstanceId[] {
  if (ids.length === 0) return ids;
  const layers = characteristics(state, catalog);
  return ids.filter((id) => !layers.of(id).keywords.includes("cannotBeTargeted"));
}

/**
 * Whether a card is one a zone reference with a filter may name now: in
 * `side`'s `zone`, matching the filter by its current characteristics, and
 * not the source when the reference says "another".
 */
function inZoneMatching(
  state: BattleState,
  catalog: EngineCatalog,
  spec: Exclude<ZoneCardSpec, { readonly pick: "self" }>,
  side: Side,
  source: AbilitySource,
  id: InstanceId,
): boolean {
  if (!state.sides[side][spec.zone].includes(id)) return false;
  if ((spec.pick === "target" || spec.pick === "every") && spec.another === true && id === sourceInstance(source)) return false;
  return cardMatchesFilter(state, catalog, id, spec.filter);
}

/**
 * Whether a void card is one a zone target may name now: in that void,
 * matching its filter, and within its cost bound, read now against the
 * card's copiable cost (RD-hv-umm2.495-1). The bound is read like a
 * character selector's: an X bound reads `selectorX`, the prepared or resolving
 * ability's X, and otherwise the source card's stored X; a source ✦ bound reads
 * `sourceSpark` (RD-hv-umm2.501-1).
 */
function voidTargetMatching(
  state: BattleState,
  catalog: EngineCatalog,
  spec: ZoneTargetSpec,
  controller: Side,
  source: AbilitySource,
  id: InstanceId,
  selectorX?: number,
  sourceSpark?: SourceSparkReader,
): boolean {
  if (!inZoneMatching(state, catalog, spec, resolvePlayer(controller, spec.player), source, id)) return false;
  const bound = spec.costAtMost;
  if (bound === undefined) return true;
  return copiableCostOf(state, catalog, id) <= boundNow(state, catalog, bound, controller, source, selectorX, sourceSpark);
}

/** The cards in a void a zone target may choose by its filter and cost bound, in void order, targetable or not. */
function matchingVoidCards(
  state: BattleState,
  catalog: EngineCatalog,
  spec: ZoneTargetSpec,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
  sourceSpark?: SourceSparkReader,
): InstanceId[] {
  return state.sides[resolvePlayer(controller, spec.player)].void
    .filter((id) => voidTargetMatching(state, catalog, spec, controller, source, id, selectorX, sourceSpark));
}

/**
 * The characters, stack cards, or void cards a target spec may choose now:
 * matching ones that can be targeted. Bounds by the source's ✦ read
 * `sourceSpark`.
 */
export function targetCandidates(
  state: BattleState,
  catalog: EngineCatalog,
  spec: PlayTimeTarget,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
  sourceSpark?: SourceSparkReader,
): InstanceId[] {
  switch (spec.kind) {
    case "stackTarget":
      return targetable(state, catalog, matchingStackItems(state, catalog, spec.selector, controller, source));
    case "inZone":
      return targetable(state, catalog, matchingVoidCards(state, catalog, spec, controller, source, selectorX, sourceSpark));
    case "target":
      return targetable(state, catalog, matchingCharacters(state, catalog, spec.selector, controller, source, selectorX, sourceSpark));
  }
}

/**
 * "This character's ✦" now (rules § Spark → This character's ✦,
 * RD-hv-umm2.460-1): the source's effective spark while it is in play, else
 * the spark captured as it left play during this step, else `retained`, the
 * value its pending ability kept, else 0.
 */
function sourceSparkNow(ctx: StepContext, source: AbilitySource, retained: number | null): number {
  const self = sourceInstance(source);
  if (self === null) return 0;
  return ctx.state.instances[self]?.zone === "play" ? effectiveSpark(ctx.state, ctx.catalog, self)
    : (ctx.departedSourceSpark.get(self) ?? retained ?? 0);
}

/** The source ✦ reader for an ability choosing its targets, which retains `retained` from a departure in an earlier step. */
function sourceSparkReader(ctx: StepContext, source: AbilitySource, retained: number | null = null): SourceSparkReader {
  return () => sourceSparkNow(ctx, source, retained);
}

/** The source ✦ reader for a resolving effect. */
function resolvingSourceSpark(ctx: StepContext, env: EffectEnv): SourceSparkReader {
  return sourceSparkReader(ctx, env.source, env.lastKnownSourceSpark);
}

/** How many targets a spec takes: "up to N" allows none. */
function targetBounds(spec: PlayTimeTarget): { readonly min: number; readonly max: number } {
  const count = spec.kind === "stackTarget" ? 1 : (spec.count ?? 1);
  return { min: spec.kind !== "stackTarget" && spec.upTo === true ? 0 : count, max: count };
}

type ChoiceBindings = Pick<EffectEnv, "modeOf" | "targetsOf">;

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
  selectorX: number | undefined,
  sourceSpark: SourceSparkReader,
  inherited?: ChoiceBindings,
): boolean {
  const definition = primitiveDefinition(node.op);
  const targetsAvailable = (definition.targets?.(node) ?? []).every(
    (spec) => {
      const bound = inherited?.targetsOf(spec) ?? null;
      return bound !== null ||
        targetCandidates(state, catalog, spec, controller, source, selectorX, sourceSpark).length >= targetBounds(spec).min;
    },
  );
  if (!targetsAvailable) return false;
  const modes = definition.modes?.(node);
  if (modes === undefined) {
    return (definition.children?.(node) ?? []).every((child) => modeLegal(state, catalog, child, controller, source, selectorX, sourceSpark, inherited));
  }
  const bound = inherited?.modeOf(node) ?? null;
  if (bound === null) return modes.some((mode) => modeLegal(state, catalog, mode, controller, source, selectorX, sourceSpark, inherited));
  const chosen = modes[bound];
  return chosen !== undefined && modeLegal(state, catalog, chosen, controller, source, selectorX, sourceSpark, inherited);
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
  selectorX?: number,
): number[] {
  const sourceSpark = sourceSparkReader(ctx, source);
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
          legal: modeLegal(ctx.state, ctx.catalog, option, controller, source, selectorX, sourceSpark),
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
  selectorX?: number,
): InstanceId[][] {
  const sourceSpark = sourceSparkReader(ctx, source);
  return specs.map((spec) => {
    const chosen = ctx.choose<ChooseTargetsPrompt>({
      kind: "chooseTargets",
      side: controller,
      purpose,
      candidates: targetCandidates(ctx.state, ctx.catalog, spec, controller, source, selectorX, sourceSpark),
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
 * Returns one entry per ability. `selectorX` supplies the chosen X for a
 * play or activation before its stack item exists; callers without an
 * explicit binding read the source card's stack or in-play X.
 */
export function choosePlayTime(
  ctx: StepContext,
  abilities: readonly PlayTimeAbility[],
  controller: Side,
  source: AbilitySource,
  purpose: (ability: number, role: PromptRole) => PromptPurpose,
  selectorX?: number,
): EffectChoices[] {
  const modes = abilities.map((ability) => chooseModes(ctx, ability.effect, controller, source, purpose(ability.ability, "chooseOne"), selectorX));
  return abilities.map((ability, index) => {
    const chosen = modes[index] ?? [];
    const specs = collectTargets(ability.effect, chosenModes(ability.effect, chosen));
    return { modes: chosen, targets: chooseTargets(ctx, specs, controller, source, purpose(ability.ability, "target"), selectorX) };
  });
}

/** A mode prompt offering `legal` modes, answered automatically when only one is legal. */
function promptMode(ctx: StepContext, legal: readonly boolean[], controller: Side, purpose: PromptPurpose): number {
  return ctx.choose<ChooseModePrompt>({
    kind: "chooseMode",
    side: controller,
    purpose,
    options: legal.map((isLegal, index) => ({ mode: index, legal: isLegal })),
  });
}

/**
 * A target prompt over `candidates`, which number at least `bounds.min`;
 * none and no prompt when there are no candidates.
 */
function promptTargets(
  ctx: StepContext,
  candidates: InstanceId[],
  bounds: { readonly min: number; readonly max: number },
  controller: Side,
  purpose: PromptPurpose,
): InstanceId[] {
  if (candidates.length === 0) return [];
  const chosen = ctx.choose<ChooseTargetsPrompt>({
    kind: "chooseTargets",
    side: controller,
    purpose,
    candidates,
    min: bounds.min,
    max: Math.min(bounds.max, candidates.length),
  });
  return [...chosen];
}

/**
 * Choices made for a pending triggered ability or a deferred subtree of a
 * resolving card or activated ability: modes, then targets, in walk order. A required
 * choice with no legal option makes that part of the effect do nothing (rules
 * § Targeting): a target spec with fewer candidates than it requires gets no
 * targets and no prompt, and a modal node with no legal mode makes the whole
 * effect do nothing (`null`). Each emits noLegalTarget. Enclosing bindings
 * reuse the same modal node or target spec objects, including mode zero and
 * empty target selections; their legality is checked as the effect resolves.
 * A bound by the source's ✦ reads `lastKnownSourceSpark`, the value the
 * pending ability retained, once its source has left play, as its
 * resolution does (RD-hv-umm2.501-1). `selectorX` supplies the resolving
 * ability's X for deferred choices; when omitted, selectors read stored
 * source X, including trigger callers without a captured binding.
 */
export function chooseOnResolution(
  ctx: StepContext,
  effect: EffectNode,
  controller: Side,
  source: AbilitySource,
  purpose: (role: PromptRole) => PromptPurpose,
  lastKnownSourceSpark?: number | null,
  inherited?: ChoiceBindings,
  selectorX?: number,
): EffectChoices | null {
  const sourceSpark = sourceSparkReader(ctx, source, lastKnownSourceSpark ?? null);
  const modes: number[] = [];
  let blocked = false;
  walkPlayTime(
    effect,
    (node, options) => {
      const bound = inherited?.modeOf(node) ?? null;
      if (bound !== null) {
        modes.push(bound);
        return bound;
      }
      const legal = options.map((option) => modeLegal(ctx.state, ctx.catalog, option, controller, source, selectorX, sourceSpark, inherited));
      if (blocked || !legal.includes(true)) {
        blocked = true;
        return 0;
      }
      const mode = promptMode(ctx, legal, controller, purpose("chooseOne"));
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
    const bound = inherited?.targetsOf(spec) ?? null;
    if (bound !== null) return [...bound];
    const candidates = targetCandidates(ctx.state, ctx.catalog, spec, controller, source, selectorX, sourceSpark);
    const bounds = targetBounds(spec);
    if (candidates.length < bounds.min) {
      ctx.emit({ kind: "noLegalTarget", source });
      return [];
    }
    return promptTargets(ctx, candidates, bounds, controller, purpose("target"));
  });
  return { modes, targets };
}

/**
 * A copy's choices for an effect (D15, RD-hv-7x4l.8-4): its controller makes
 * each of the original's choices again, modes then targets in walk order, as
 * prompts answered automatically when only one answer is legal. Each choice
 * with no legal option keeps the original's, one choice at a time: a modal
 * node with no legal mode keeps the mode the original chose for that node,
 * and a target spec with fewer candidates than it requires keeps the
 * original's targets for that spec. Keeping a choice reports nothing; the
 * copy's resolution re-checks a kept target like any chosen target, and a
 * part whose targets are all illegal then does nothing and reports
 * noLegalTarget. The result shares no arrays with `original`. Throws when
 * `original` lacks a choice the copy keeps, which legal play-time choices
 * never do: a choice reached only through a mode the copy chose anew always
 * has a legal option. `selectorX` is the copy's X, the original's, which
 * X-bounded targets read before the copy's stack item exists.
 */
export function chooseForCopy(
  ctx: StepContext,
  effect: EffectNode,
  controller: Side,
  source: AbilitySource,
  purpose: (role: PromptRole) => PromptPurpose,
  original: EffectChoices,
  selectorX?: number,
): EffectChoices {
  const sourceSpark = sourceSparkReader(ctx, source);
  let originalModes: ChosenModes | null = null;
  const originalModesNow = (): ChosenModes => (originalModes ??= chosenModes(effect, original.modes));
  const modes: number[] = [];
  walkPlayTime(
    effect,
    (node, options) => {
      const legal = options.map((option) => modeLegal(ctx.state, ctx.catalog, option, controller, source, selectorX, sourceSpark));
      const kept = legal.includes(true) ? null : originalModesNow().get(node);
      if (kept === undefined) throw new Error(`The original made no choice for a ${node.op} node its copy keeps`);
      const mode = kept ?? promptMode(ctx, legal, controller, purpose("chooseOne"));
      modes.push(mode);
      return mode;
    },
    () => undefined,
  );
  let originalSpecs: PlayTimeTarget[] | null = null;
  const targets = collectTargets(effect, chosenModes(effect, modes)).map((spec) => {
    const candidates = targetCandidates(ctx.state, ctx.catalog, spec, controller, source, selectorX, sourceSpark);
    const bounds = targetBounds(spec);
    if (candidates.length >= bounds.min) return promptTargets(ctx, candidates, bounds, controller, purpose("target"));
    originalSpecs ??= collectTargets(effect, originalModesNow());
    const kept = original.targets[originalSpecs.indexOf(spec)];
    if (kept === undefined) throw new Error("The original chose no targets for a target its copy keeps");
    return [...kept];
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
    scored: env.scored,
    count: (selector) => matchingCharacters(ctx.state, ctx.catalog, selector, env.controller, env.source, env.x ?? undefined, resolvingSourceSpark(ctx, env)).length,
    countCards: (count) => zoneCount(ctx.state, ctx.catalog, count, env.controller),
    movedCosts: (ref) => env.moved.costs(ref.node),
    sourceSpark: resolvingSourceSpark(ctx, env),
  });
}

/** What a condition is checked against: its controller, source, paid optional costs, and optional resolving X. */
export type { ConditionScope } from "../dsl/conditions";

/** Whether a condition holds now, including intervening conditions outside a resolving effect. */
export function conditionHolds(
  state: BattleState,
  catalog: EngineCatalog,
  condition: Condition,
  scope: ConditionScope,
): boolean {
  let layers: ReturnType<typeof characteristics> | undefined;
  return conditionHoldsWith(state, catalog, (id) => (layers ??= characteristics(state, catalog)).of(id), condition, scope);
}

export function checkCondition(ctx: StepContext, condition: Condition, env: EffectEnv): boolean {
  return conditionHolds(ctx.state, ctx.catalog, condition, env);
}

/**
 * Whether "this character" or "it" names the card `id` now: a card in play,
 * or a character card on the stack in an ability of its own that triggered on
 * its own play, as "When you reclaim this character, it gains +1✦" does
 * (rules § Ability Types → When you reclaim this character). Elsewhere the
 * card is no character.
 */
function namesCharacter(ctx: StepContext, id: InstanceId, env: EffectEnv): boolean {
  const zone = ctx.state.instances[id]?.zone;
  if (zone === "play") return true;
  return zone === "stack" && env.subject === id && sourceInstance(env.source) === id && characteristicsOf(ctx.state, ctx.catalog, id).cardType === "character";
}

/**
 * The characters a character effect applies to now. A chosen target that is
 * no longer legal (it no longer matches, or cannot be targeted now) is
 * skipped; if none remain, that part of the effect does nothing and reports
 * noLegalTarget.
 */
export function resolveCharacters(ctx: StepContext, ref: CharacterRef, env: EffectEnv): InstanceId[] {
  switch (ref.kind) {
    case "self": {
      // An emblem is never a character (P4).
      const self = sourceInstance(env.source);
      return self !== null && namesCharacter(ctx, self, env) ? [self] : [];
    }
    case "all":
      return matchingCharacters(ctx.state, ctx.catalog, ref.selector, env.controller, env.source, env.x ?? undefined, resolvingSourceSpark(ctx, env));
    case "subject": {
      const subject = env.subject;
      return subject !== null && namesCharacter(ctx, subject, env) ? [subject] : [];
    }
    case "supported": {
      const self = sourceInstance(env.source);
      const selector = { controller: "you" as const, ...ref.selector };
      return self === null
        ? []
        : supportedBy(ctx.state, self).filter((id) => matchesCharacter(ctx.state, ctx.catalog, selector, id, env.controller, env.source, env.x ?? undefined, resolvingSourceSpark(ctx, env)));
    }
    case "target": {
      const chosen = env.targetsOf(ref) ?? [];
      const legal = targetable(
        ctx.state,
        ctx.catalog,
        chosen.filter((id) => matchesCharacter(ctx.state, ctx.catalog, ref.selector, id, env.controller, env.source, env.x ?? undefined, resolvingSourceSpark(ctx, env))),
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
 * stack, still matching, and still targetable. If none remain, that part of
 * the effect does nothing and reports noLegalTarget.
 */
export function resolveStackTargets(ctx: StepContext, spec: StackTargetSpec, env: EffectEnv): InstanceId[] {
  const chosen = env.targetsOf(spec) ?? [];
  const legal = targetable(
    ctx.state,
    ctx.catalog,
    chosen.filter((id) => matchesStackItem(ctx.state, ctx.catalog, spec.selector, id, env.controller, env.source)),
  );
  if (legal.length === 0 && chosen.length > 0) {
    ctx.emit({ kind: "noLegalTarget", source: env.source });
  }
  return legal;
}

/** The stream a random zone reference picks its cards from (engine-design § Randomness and replay). */
const RANDOM_SELECTION_STREAM = "random:selection";

/**
 * The cards a zone reference names now (rules § Zones → References to cards
 * in a zone): the chosen void cards still in that void, matching, within
 * their cost bound, and targetable, in the order chosen, reporting
 * noLegalTarget when none remain; every matching card in the zone, in zone order; those of the top cards of
 * the deck that match, top first; up to `count` different matching cards
 * picked at random, in the order picked; or the source while it is in its
 * controller's zone. Naming a card reveals nothing and emits nothing but that
 * noLegalTarget; a random pick advances only its own RNG stream.
 */
function resolveZoneCards(ctx: StepContext, ref: ZoneCardSpec, env: EffectEnv): InstanceId[] {
  const { state, catalog } = ctx;
  if (ref.pick === "self") {
    const self = sourceInstance(env.source);
    return self !== null && state.sides[env.controller][ref.zone].includes(self) ? [self] : [];
  }
  const side = resolvePlayer(env.controller, ref.player);
  const matches = (id: InstanceId): boolean => inZoneMatching(state, catalog, ref, side, env.source, id);
  switch (ref.pick) {
    case "every": {
      const atMost = ref.costAtMost === undefined ? null : evaluate(ctx, ref.costAtMost, env);
      return state.sides[side][ref.zone].filter((id) => matches(id) && (atMost === null || copiableCostOf(state, catalog, id) <= atMost));
    }
    case "top":
      return state.sides[side].deck.slice(0, Math.max(0, ref.count)).filter(matches);
    case "random": {
      const above = ref.costGreaterThan === undefined ? null : evaluate(ctx, ref.costGreaterThan, env);
      const pool = state.sides[side][ref.zone].filter((id) => matches(id) && (above === null || copiableCostOf(state, catalog, id) > above));
      const picked: InstanceId[] = [];
      while (picked.length < ref.count && pool.length > 0) {
        const [card] = pool.splice(Math.floor(ctx.random(RANDOM_SELECTION_STREAM) * pool.length), 1);
        if (card !== undefined) picked.push(card);
      }
      return picked;
    }
    case "target": {
      const chosen = env.targetsOf(ref) ?? [];
      const legal = targetable(state, catalog, chosen.filter((id) => voidTargetMatching(state, catalog, ref, env.controller, env.source, id, env.x ?? undefined, resolvingSourceSpark(ctx, env))));
      if (legal.length === 0 && chosen.length > 0) {
        ctx.emit({ kind: "noLegalTarget", source: env.source });
      }
      return legal;
    }
  }
}

/**
 * The cards a card reference names now: chosen characters still legal,
 * chosen stack cards still on the stack, the triggering card or the source
 * wherever it is, while it exists, the cards a zone reference names, or the
 * captured cards still in play, in the order they entered play. Resolving a
 * captured reference outside a `withMaterialized` binding throws.
 */
export function resolveCards(ctx: StepContext, ref: CardRef | CapturedCardsSpec, env: EffectEnv): InstanceId[] {
  switch (ref.kind) {
    case "captured": {
      if (env.captured === null) throw new Error("A captured card reference resolved outside withMaterialized");
      return env.captured.filter((id) => ctx.state.instances[id]?.zone === "play");
    }
    case "target":
      return resolveCharacters(ctx, ref, env);
    case "stackTarget":
      return resolveStackTargets(ctx, ref, env);
    case "inZone":
      return resolveZoneCards(ctx, ref, env);
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
  readonly linkedSource?: LinkedSourceContext;
  /** Effective spark retained when this pending ability's source left play. */
  readonly lastKnownSourceSpark?: number;
  readonly source: AbilitySource;
  /** Where the ability's definition comes from; prompt purposes carry its card or emblem. */
  readonly origin: AbilityOrigin;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  /** The ability's whole effect, when `effect` is a part of it (a floating trigger's effect). */
  readonly root?: EffectNode;
  /** The card the triggering event concerns, for a trigger. */
  readonly subject?: InstanceId | null;
  /** The gain a "when … gains ✦" trigger matched. */
  readonly gain?: SparkGain | null;
  /** The positive challenge award the scoring trigger matched. */
  readonly scored?: number | null;
  /** The cards a floating or delayed trigger kept from its `withMaterialized` binding. */
  readonly captured?: readonly InstanceId[] | null;
  readonly controller: Side;
  readonly x: number | null;
  /** Whether each optional cost of the item was paid, in printed order. */
  readonly optionalPaid: readonly boolean[];
  /** Modes and targets chosen at play time, in walk order. */
  readonly choices: EffectChoices;
}

/** The nodes whose moved cards a value somewhere in `effect` reads (`MovedCardRef`). */
function movedCardNodes(effect: EffectNode): Set<EffectNode> {
  const nodes = new Set<EffectNode>();
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if ("kind" in value && value.kind === "movedCards" && "node" in value) nodes.add(value.node as EffectNode);
    for (const field of Object.values(value)) visit(field);
  };
  visit(effect);
  return nodes;
}

/**
 * A fresh record of the cards the nodes of `root` move as one resolution
 * runs, kept only for the nodes a value of `root` reads them from.
 */
function movedCardRecord(ctx: StepContext, root: EffectNode): MovedCards {
  const read = movedCardNodes(root);
  const recorded = new Map<EffectNode, readonly number[]>();
  return {
    track(node, resolve) {
      if (!read.has(node)) {
        resolve();
        return;
      }
      const { state, catalog } = ctx;
      const before = Object.values(state.instances).map(({ id }) => ({ id, cost: copiableCostOf(state, catalog, id) }));
      const since = state.clock;
      resolve();
      recorded.set(node, before.filter(({ id }) => {
        const now = state.instances[id];
        return now === undefined || now.enteredZoneAt > since;
      }).map(({ cost }) => cost));
    },
    costs(node) {
      return recorded.get(node) ?? [];
    },
  };
}

/** Resolves one node of an effect in `env`, tracking the cards it moves (`MovedCards`). */
export function resolveNode(ctx: StepContext, node: EffectNode, env: EffectEnv): void {
  const resolve = (): void => primitiveDefinition(node.op).resolve(ctx, node, env);
  const windows = deckRemovalWindows(ctx, node, env);
  env.moved.track(node, windows === null ? resolve : () =>
    ctx.settlingKnowledge(randomDeckRemovalSettler(ctx.state, windows.bounds, windows.unordered), resolve));
}

/** What each viewer can tell of the deck places `node`'s removals leave: a public prefix, and whether they leave in deck order. */
interface DeckRemovalWindows {
  readonly bounds: DeckRemovalBounds;
  readonly unordered: UnorderedDeckRemovals;
}

function deckRemovalWindows(ctx: StepContext, node: EffectNode, env: EffectEnv): DeckRemovalWindows | null {
  if (node.op === "banishCards") return banishDeckWindows(ctx, node as BanishCardsNode, env);
  const bounds = picksAtRandomFromDeck(node) ? {} : materializeDeckBounds(ctx, node, env);
  return bounds === null ? null : { bounds, unordered: {} };
}

/**
 * The declared effect `viewer` can attribute to the ability `env` resolves:
 * `viewer` identifies its source, which still has the origin the ability
 * resolves from, and that origin's declaration at `env.ability` is the tree
 * resolving. `null` when nothing public proves it, as for an opaque synthetic
 * resolver; callers then infer nothing from the ability's text.
 */
export function publicAbilityEffect(ctx: StepContext, env: EffectEnv, viewer: Side): EffectNode | null {
  if (!seesSource(ctx.state, env.source, viewer)) return null;
  const origin = abilityOrigin(ctx.state, env.source);
  if (origin === null || JSON.stringify(origin) !== JSON.stringify(env.origin)) return null;
  if (origin.kind === "card" && ctx.catalog.card(origin.cardId).synthetic?.resolve !== undefined) return null;
  const ability = originAbilities(ctx.catalog, origin)[env.ability];
  if (ability === undefined || !("effect" in ability) || JSON.stringify(ability.effect) !== JSON.stringify(env.root)) return null;
  return ability.effect;
}

/** Public deck-materialization windows, independent of the selected hidden branch. */
function materializeDeckBounds(ctx: StepContext, node: EffectNode, env: EffectEnv): DeckRemovalBounds | null {
  if (node.op !== "materialize") return null;
  const { from } = node as MaterializeNode;
  if ("op" in from || from.zone !== "deck" || (from.pick !== "top" && from.pick !== "every")) return null;
  if (from.pick === "every") return {};
  const viewers: Partial<Record<Side, number>> = {};
  for (const viewer of ["player", "enemy"] as const) {
    const effect = publicAbilityEffect(ctx, env, viewer);
    const limit = effect === null ? null : publicTopDeckLimit(effect);
    if (limit !== null && from.count <= limit) viewers[viewer] = limit;
  }
  return { [resolvePlayer(env.controller, from.player)]: viewers };
}

/** The deepest deck prefix any materialization in `effect` takes from, when each takes a fixed top count. */
function publicTopDeckLimit(effect: EffectNode): number | null {
  const refs = everyNode(effect).filter((part) => part.op === "materialize").map((part) => (part as MaterializeNode).from);
  if (refs.some((ref) => "op" in ref)) return null;
  const decks = refs.filter((ref): ref is ZoneCardSpec => !("op" in ref) && ref.zone === "deck");
  if (decks.length === 0 || decks.some((ref) => ref.pick !== "top" || !Number.isSafeInteger(ref.count))) return null;
  return Math.max(0, ...decks.map((ref) => ref.pick === "top" ? ref.count : 0));
}

/** The deck references of a named banishment, each with the deck's owner. */
function banishedDecks(node: BanishNamedCardsNode, controller: Side): { readonly ref: ZoneCardSpec; readonly owner: Side }[] {
  return node.cards.flatMap((ref) => ref.kind !== "inZone" || ref.zone !== "deck" ? []
    : [{ ref, owner: ref.pick === "self" ? controller : resolvePlayer(controller, ref.player) }]);
}

/**
 * Public deck windows for a named banishment (rules § Keywords and Effects →
 * Banish), independent of the selected hidden branch. Its cards leave in
 * reference order, each reference's in deck order. A viewer who can
 * attribute the ability bounds a deck's anonymous removals by the deepest
 * fixed top count its declared named banishments take from that deck, and
 * sees them leave in deck order only when each of those banishments names
 * that deck once, by top or every cards. Otherwise the whole deck is
 * possible, and the order shows nothing of the cards' places.
 */
function banishDeckWindows(ctx: StepContext, node: BanishCardsNode, env: EffectEnv): DeckRemovalWindows | null {
  if (node.from !== "cards") return null;
  const owners = new Set(banishedDecks(node, env.controller).map(({ owner }) => owner));
  if (owners.size === 0) return null;
  const bounds: Partial<Record<Side, Partial<Record<Side, number>>>> = {};
  const unordered: Partial<Record<Side, Side[]>> = {};
  for (const owner of owners) {
    bounds[owner] = {};
    unordered[owner] = [];
    for (const viewer of ["player", "enemy"] as const) {
      const effect = publicAbilityEffect(ctx, env, viewer);
      const declared = (effect === null ? [] : everyNode(effect))
        .filter((part): part is BanishNamedCardsNode => part.op === "banishCards" && (part as BanishCardsNode).from === "cards")
        .map((part) => banishedDecks(part, env.controller).filter((deck) => deck.owner === owner).map(({ ref }) => ref));
      const refs = declared.flat();
      if (refs.length > 0 && refs.every((ref) => ref.pick === "top" && Number.isSafeInteger(ref.count))) {
        bounds[owner][viewer] = Math.max(...refs.map((ref) => ref.pick === "top" ? ref.count : 0));
      }
      if (refs.length === 0 || declared.some((named) => named.length > 1 || named.some((ref) => ref.pick === "random"))) unordered[owner].push(viewer);
    }
  }
  return { bounds, unordered };
}

/**
 * Whether `node`'s own card references, not its child nodes', pick cards at
 * random from a deck. Such a node resolves under `randomDeckRemovalSettler`
 * (rules § Keywords and Effects → Put on top or on the bottom of a deck,
 * RD-hv-umm2.83-1): the cards that leave a deck are seen leaving in deck
 * order, but which unseen slots they left is random, so as each leaves,
 * before anything observes it, each viewer loses track of the known deck
 * places the removals so far leave open. The deck is not shuffled.
 */
function picksAtRandomFromDeck(node: EffectNode): boolean {
  const visit = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || "op" in value) return false;
    if ("kind" in value && value.kind === "inZone" && "pick" in value && value.pick === "random" && "zone" in value && value.zone === "deck") return true;
    return Object.values(value).some(visit);
  };
  return Object.values(node).some(visit);
}

/** Resolves an effect tree with plain synchronous rules code, under the modes chosen at play time. */
export function resolveEffect(ctx: StepContext, effect: EffectNode, options: ResolveOptions): void {
  const chosen = chosenModes(effect, options.choices.modes);
  const specs = collectTargets(effect, chosen);
  const env: EffectEnv = {
    linkedSource: options.linkedSource ?? (everyNode(effect).some((node) => node.op === "linkedBanish") ? linkedSourceContext(ctx, options.source, options.origin, options.ability) : null),
    source: options.source,
    lastKnownSourceSpark: options.lastKnownSourceSpark ?? null,
    origin: options.origin,
    ability: options.ability,
    root: options.root ?? effect,
    subject: options.subject ?? null,
    gain: options.gain ?? null,
    scored: options.scored ?? null,
    controller: options.controller,
    variant: options.origin.kind === "card" ? options.origin.variant : BASE_VARIANT,
    x: options.x,
    optionalPaid: options.optionalPaid,
    abandonedPosition: options.choices.abandonedPosition ?? null,
    duration: null,
    moved: movedCardRecord(ctx, options.root ?? effect),
    captured: options.captured ?? null,
    modeOf(node) {
      return chosen.get(node) ?? null;
    },
    targetsOf(spec) {
      const index = specs.indexOf(spec);
      return index < 0 ? null : (options.choices.targets[index] ?? null);
    },
    run(node) {
      resolveNode(ctx, node, env);
    },
    purpose(role) {
      return purposeOf(options.source, options.origin, options.ability, role);
    },
  };
  env.run(effect);
}

/**
 * Resolves a subtree chosen during resolution, reusing enclosing object
 * bindings and choosing its unbound modes and targets now. The ability's
 * context and enclosing shared duration persist; nested subtrees read their
 * nearest enclosing choices.
 */
export function resolveChosenEffect(ctx: StepContext, effect: EffectNode, env: EffectEnv): void {
  const choices = chooseOnResolution(ctx, effect, env.controller, env.source, (role) => env.purpose(role), env.lastKnownSourceSpark, env, env.x ?? undefined);
  if (choices === null) return;
  const chosen = chosenModes(effect, choices.modes);
  const specs = collectTargets(effect, chosen);
  const inner: EffectEnv = {
    ...env,
    modeOf(node) {
      return chosen.get(node) ?? env.modeOf(node);
    },
    targetsOf(spec) {
      const index = specs.indexOf(spec);
      return index < 0 ? env.targetsOf(spec) : (choices.targets[index] ?? env.targetsOf(spec));
    },
    run(node) {
      resolveNode(ctx, node, inner);
    },
  };
  inner.run(effect);
}
