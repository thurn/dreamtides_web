/**
 * Loop detection after each committed step (rules § Infinite Loops). The
 * runner calls `trackLoops` and `checkMandatoryCycle`; the `repeatLoop` and
 * `loopIteration` steps manage the tracker themselves.
 *
 * - **Optional loops.** Within one acting side's main window of one turn,
 *   the tracker keeps a history: each checkpoint (a `main` decision with an
 *   empty stack and trigger queue) with its loop signature and resources,
 *   and each top-level action with every step and answer it ran. When a
 *   checkpoint's signature equals an earlier one's and the resources between
 *   them gained something for the actor and nothing for the opponent, the
 *   actions between them become the loop on offer.
 * - **Mandatory cycles.** A proved closed copy continuation draws at the
 *   battle's check threshold. Other automatic runs with no stopping choice
 *   check exact repeats: the full state is hashed
 *   after each step and compared with one saved mark (Brent's cycle
 *   detection). The mark moves to the current state after 1, 2, 4, … steps,
 *   counted from the threshold, and then every `mandatoryLoopWindow` steps.
 *   A cycle of at most that many steps is found within about twice the
 *   window of entering it, however late in the run, with constant memory.
 */
import { mainWindowSide } from "../rules/decision";
import { instanceCard, type EngineCatalog } from "../catalog";
import { worksInZone } from "../dsl/abilities";
import { matchingStackItems } from "../dsl/selectors";
import type { Ability, NamedTrigger, Trigger } from "../dsl/types";
import type { EngineEventKind } from "../events";
import type { ChooseOneNode } from "../effects/primitives/choose-one";
import type { CopyCardNode, CopyCardTimesNode } from "../effects/primitives/copy-card";
import type { CreateCopyInHandNode } from "../effects/primitives/create-copy-in-hand";
import type { SequenceNode } from "../effects/primitives/sequence";
import type { TriggerAbilityNode } from "../effects/primitives/trigger-ability";
import type { CardRef, EffectNode } from "../effects/types";
import { abilityOrigin, instanceOrigin, inPlaySources, oncePerTurnKey, originAbilities } from "../rules/activation";
import { endBattle } from "../rules/victory";
import type { Answer } from "../prompts/types";
import { SIDES, sourceKey, type AbilitySource, type InstanceId, type Side, type Zone } from "../state/ids";
import type { AbilityOrigin, BattleState } from "../state/types";
import type { Step } from "../steps/kinds";
import type { RecordedAnswer, StepContext } from "../steps/types";
import { cycleHash, gainsFor, loopResources, loopSignature } from "./signature";
import type { LoopCandidate, LoopCheckpoint, LoopId, LoopScope, LoopTracker } from "./types";
import { triggerEventKinds } from "../triggers/matcher";
import { isClosedCopyEventContinuation } from "./event-copy-continuation";

/** Exhaustive semantic classification: new trigger kinds require a reviewed renewal case. */
function namedRenewals(trigger: Trigger): readonly NamedTrigger[] {
  switch (trigger.on) {
    case "materialized": case "dawn": case "dusk": case "night": case "challenge": case "dissolved":
      return [trigger.on];
    case "either": return trigger.triggers.flatMap(namedRenewals);
    // Copy occasions renew through the independently proved event-copy kernel below;
    // named-admission observers are excluded by its interference checks.
    case "copy": case "namedAbilityTriggered": return [];
    case "play": case "materialize": case "draw": case "foresee": case "handBecomesEmpty": case "discardBatch":
    case "discard": case "erode": case "reclaim": case "abandon": case "leavesPlay":
    case "returnToHand": case "dissolve": case "gainsSpark": case "scores": case "opponentScores":
    case "removesEnemy": case "leavesVoid": case "putIntoVoid": case "challengeWith":
    case "startOfTurn": case "startOfFirstTurn": case "endOfTurn": return [];
  }
  const exhaustive: never = trigger;
  return exhaustive;
}

interface FixedSource {
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly origin: AbilityOrigin;
  readonly zone: Zone;
  readonly abilities: readonly Ability[];
}

interface CopyBody {
  readonly renews: boolean;
  readonly copies: boolean;
  readonly calls: readonly NamedTrigger[];
}

/** Exact equality of an origin's JSON data, independent of object key order. */
function sameOriginData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value: unknown, index: number) => sameOriginData(value, right[index]));
  }
  const a = left as Readonly<Record<string, unknown>>;
  const b = right as Readonly<Record<string, unknown>>;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  return keys.length === Object.keys(b).filter((key) => b[key] !== undefined).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key) && sameOriginData(a[key], b[key]));
}

/** Supported instructions cannot mutate these sources or introduce new functional abilities. */
function fixedCopySources(state: BattleState, catalog: EngineCatalog): FixedSource[] | null {
  if (state.floating.length > 0 || state.payable.length > 0 || (state.linkedBanished?.length ?? 0) > 0) return null;
  const sources: FixedSource[] = [];
  for (const card of Object.values(state.instances)) {
    if ((card.status.gainedAbilities?.length ?? 0) > 0 || card.status.lostAbilities !== undefined) return null;
    const origin = instanceOrigin(card);
    sources.push({ source: card.id, controller: card.controller, origin, zone: card.zone, abilities: originAbilities(catalog, origin) });
  }
  for (const side of SIDES) {
    for (const source of inPlaySources(state, side)) {
      if (typeof source === "string") continue;
      const origin = abilityOrigin(state, source);
      if (origin === null) return null;
      sources.push({ source, controller: side, origin, zone: "play", abilities: originAbilities(catalog, origin) });
    }
  }
  if (sources.some(({ abilities, zone }) => abilities.some((ability) =>
    ability.kind === "static" || (zone === "play" && ability.kind === "winCondition")))) return null;
  return sources;
}

/** A stable, nonempty domain; every possible target copies an event with only unresolved event effects. */
function eventCopyDomain(state: BattleState, catalog: EngineCatalog, ref: CardRef, source: FixedSource): boolean {
  if (ref.kind !== "stackTarget" || ref.selector.cardType !== "event" || ref.selector.preventable !== undefined) return false;
  const cards = matchingStackItems(state, catalog, ref.selector, source.controller, source.source);
  return cards.length > 0 && cards.every((id) => {
    const card = state.instances[id];
    const definition = instanceCard(catalog, card);
    return definition.cardType === "event" && definition.synthetic === undefined &&
      originAbilities(catalog, instanceOrigin(card)).every((ability) => ability.kind === "event");
  });
}

/** All syntactic branches must be safe, including modes which are currently unavailable. */
function copyBody(node: EffectNode, source: FixedSource, state: BattleState, catalog: EngineCatalog, visiting = new Set<EffectNode>()): CopyBody | null {
  if (visiting.has(node)) return null;
  visiting.add(node);
  const walk = (child: EffectNode) => copyBody(child, source, state, catalog, visiting);
  let body: CopyBody | null = null;
  if (node.op === "sequence" || node.op === "chooseOne") {
    const children = node.op === "sequence" ? (node as SequenceNode).effects : (node as ChooseOneNode).modes;
    const parts = children.map(walk);
    if ((node.op === "sequence" || children.length > 0) && parts.every((part): part is CopyBody => part !== null)) body = {
      renews: node.op === "sequence" ? parts.some((part) => part.renews) : parts.every((part) => part.renews),
      copies: parts.some((part) => part.copies), calls: parts.flatMap((part) => part.calls),
    };
  } else if (node.op === "copyCard" || node.op === "copyCardTimes" || node.op === "createCopyInHand") {
    const ref = node.op === "createCopyInHand" ? (node as CreateCopyInHandNode).of : (node as CopyCardNode).card;
    const times = node.op === "copyCardTimes" ? (node as CopyCardTimesNode).times : 1;
    if (Number.isSafeInteger(times) && times >= 0 && eventCopyDomain(state, catalog, ref, source)) {
      body = { renews: false, copies: times > 0, calls: [] };
    }
  } else if (node.op === "triggerAbility") {
    const call = node as TriggerAbilityNode;
    if (call.subject.kind === "self" && typeof source.source === "string" && source.zone === "play") {
      body = { renews: true, copies: false, calls: [call.trigger] };
    }
  }
  visiting.delete(node);
  return body;
}

/**
 * Proves copy-only queued continuations closed under every answer. Physical
 * copies keep their identities and choices; their effects cannot resolve
 * while every FIFO instruction necessarily renews that FIFO. Unsupported
 * conditions, victory predicates, modifiers or interfering listeners fail
 * certification. Creation-trigger renewal needs its own exhaustive semantic
 * case and typed emission-time context when that trigger is implemented.
 */
export function isUnbreakableCopyContinuation(state: BattleState, catalog: EngineCatalog): boolean {
  if (isClosedCopyEventContinuation(state, catalog)) return true;
  if (state.result !== null || state.triggerQueue.length === 0 || state.loops.run !== null) return false;
  const sources = fixedCopySources(state, catalog);
  if (sources === null) return false;
  const emitted: readonly EngineEventKind[] = ["cardCreated", "cardCopied", "triggerQueued", "triggerResolved", "promptAutoAnswered", "revealed"];
  // A dormant condition can become true as copies grow: reject every possible interference.
  if (sources.some(({ abilities, source, zone }) => abilities.some((ability) => ability.kind === "triggered" &&
    (typeof source !== "string" || worksInZone(ability.zone, zone)) &&
    triggerEventKinds(ability.trigger).some((event) => emitted.includes(event))))) return false;
  const pending: { source: FixedSource; ability: number }[] = [];
  for (const trigger of state.triggerQueue) {
    const source = sources.find((candidate) => sourceKey(candidate.source) === sourceKey(trigger.source));
    if (source === undefined || source.zone !== "play" || source.controller !== trigger.controller ||
      !sameOriginData(source.origin, trigger.origin) || trigger.node !== null || trigger.kind !== undefined) return false;
    pending.push({ source, ability: trigger.ability });
  }
  const visited = new Set<ReturnType<typeof oncePerTurnKey>>();
  let copies = false;
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined) return false;
    const { source, ability: index } = next;
    const key = oncePerTurnKey(source.source, index);
    if (visited.has(key)) continue;
    visited.add(key);
    const ability = source.abilities[index];
    if (ability?.kind !== "triggered" || ability.condition !== undefined || ability.oncePerTurn === true) return false;
    const body = copyBody(ability.effect, source, state, catalog);
    if (body === null || !body.renews) return false;
    copies ||= body.copies;
    for (const named of body.calls) {
      const matches = source.abilities.flatMap((candidate, at) => candidate.kind === "triggered" &&
        namedRenewals(candidate.trigger).includes(named) && (named === "dissolved" || worksInZone(candidate.zone, source.zone)) ? [at] : []);
      if (matches.length === 0) return false;
      for (const at of matches) pending.push({ source, ability: at });
    }
  }
  return copies;
}

/** The side deciding at a checkpoint, or `null` when `state` is not one. */
export function checkpointSide(state: BattleState): Side | null {
  if (state.result !== null || state.stack.length > 0 || state.triggerQueue.length > 0 || state.loops.run !== null) {
    return null;
  }
  return mainWindowSide(state);
}

function scopeAt(state: BattleState, side: Side): LoopScope {
  return { turn: state.turn.turnNumber, phase: state.turn.phase, side };
}

function sameScope(a: LoopScope | null, b: LoopScope): boolean {
  return a !== null && a.turn === b.turn && a.phase === b.phase && a.side === b.side;
}

function checkpointOf(state: BattleState, action: number): LoopCheckpoint {
  return { signature: loopSignature(state), resources: loopResources(state), action };
}

function clearHistory(loops: LoopTracker): void {
  loops.scope = null;
  loops.checkpoints = [];
  loops.actions = [];
}

/** Starts a new history at `state` when it is a checkpoint, else keeps none. */
export function restartHistory(state: BattleState): void {
  const { loops } = state;
  const side = checkpointSide(state);
  if (side === null) {
    clearHistory(loops);
    return;
  }
  loops.scope = scopeAt(state, side);
  loops.checkpoints = [checkpointOf(state, 0)];
  loops.actions = [];
}

/**
 * Keeps the history within `limit` actions (the battle data module): the oldest
 * checkpoints, and the actions before the first one kept, are dropped.
 */
function trimHistory(loops: LoopTracker, limit: number): void {
  const excess = loops.actions.length - limit;
  if (excess <= 0) return;
  const first = loops.checkpoints.findIndex((checkpoint) => checkpoint.action >= excess);
  if (first < 0) {
    clearHistory(loops);
    return;
  }
  const base = loops.checkpoints[first]?.action ?? 0;
  loops.checkpoints = loops.checkpoints.slice(first).map((checkpoint) => ({ ...checkpoint, action: checkpoint.action - base }));
  loops.actions = loops.actions.slice(base);
}

/** Whether a side other than the actor made a real choice: an answer that was not forced. */
function contested(answers: readonly RecordedAnswer[], choosers: readonly Side[], actor: Side): boolean {
  return answers.some((answer, index) => answer.auto !== true && choosers[index] !== actor);
}

/** Only selection answers hold instance strings; arrangements hold destination entries. */
function isSelection(value: Answer): value is readonly InstanceId[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

/** Preserve replay metadata and ordered answers, copying selections into their canonical set order. */
function recordedSelections(answers: readonly RecordedAnswer[]): readonly RecordedAnswer[] {
  return answers.map(answer => isSelection(answer.value)
    ? { ...answer, value: [...answer.value].sort() }
    : answer);
}

/**
 * The loop candidate the latest checkpoint completes: from the latest earlier
 * checkpoint it repeats with a gain for `side`.
 */
function findCandidate(loops: LoopTracker, side: Side): LoopCandidate | null {
  const checkpoint = loops.checkpoints[loops.checkpoints.length - 1];
  if (checkpoint === undefined) return null;
  for (let index = loops.checkpoints.length - 2; index >= 0; index--) {
    const earlier = loops.checkpoints[index];
    if (earlier === undefined || earlier.signature !== checkpoint.signature || earlier.action === checkpoint.action) continue;
    if (!gainsFor(side, earlier.resources, checkpoint.resources)) continue;
    const id: LoopId = `l${loops.nextLoop}`;
    loops.nextLoop += 1;
    return { id, side, signature: checkpoint.signature, actions: loops.actions.slice(earlier.action) };
  }
  return null;
}

/**
 * Records a committed step in the history of `work.loops` and updates the
 * loop on offer. `start` is the state the step ran from; `choosers` names the
 * side that gave each answer.
 */
export function trackLoops(
  start: BattleState,
  work: BattleState,
  step: Step,
  answers: readonly RecordedAnswer[],
  choosers: readonly Side[],
  promptsVisibleToActor: readonly boolean[],
  automatic: boolean,
): void {
  if (step.kind === "repeatLoop" || step.kind === "loopIteration") return;
  const { loops } = work;
  if (!automatic) {
    const at = checkpointSide(start);
    if (at !== null) {
      const scope = scopeAt(start, at);
      const recorded = sameScope(loops.scope, scope) && loops.checkpoints[loops.checkpoints.length - 1]?.action === loops.actions.length;
      if (!recorded) {
        if (!sameScope(loops.scope, scope)) clearHistory(loops);
        loops.scope = scope;
        loops.checkpoints.push(checkpointOf(start, loops.actions.length));
      }
    } else {
      // A response: it extends the history only when the history's actor makes it.
      const actor = start.priority;
      if (actor === null || loops.scope === null || !sameScope(loops.scope, scopeAt(start, actor))) clearHistory(loops);
    }
    if (loops.scope !== null) {
      if (contested(answers, choosers, loops.scope.side)) clearHistory(loops);
      else loops.actions.push({ steps: [{ step, answers: recordedSelections(answers), promptsVisibleToActor }] });
    }
  } else if (loops.scope !== null) {
    const last = loops.actions[loops.actions.length - 1];
    if (last !== undefined) {
      if (contested(answers, choosers, loops.scope.side)) clearHistory(loops);
      else loops.actions[loops.actions.length - 1] = { steps: [...last.steps, { step, answers: recordedSelections(answers), promptsVisibleToActor }] };
    }
  }
  const side = checkpointSide(work);
  if (side === null) {
    loops.candidate = null;
    return;
  }
  const scope = scopeAt(work, side);
  if (!sameScope(loops.scope, scope)) {
    loops.scope = scope;
    loops.checkpoints = [checkpointOf(work, 0)];
    loops.actions = [];
    loops.candidate = null;
    return;
  }
  loops.checkpoints.push(checkpointOf(work, loops.actions.length));
  trimHistory(loops, work.config.loopHistoryActions);
  loops.candidate = findCandidate(loops, side);
}

/**
 * Ends a proved closed copy continuation or an exact automatic-state repeat
 * in a draw (rules § Mandatory Loops), checked from `mandatoryLoopCheckFrom`
 * on. A stopping or unproven choice, a top-level decision and an optional
 * loop iteration start a new run; proved independent copy choices preserve it.
 */
export function checkMandatoryCycle(ctx: StepContext, automatic: boolean): void {
  const { state } = ctx;
  const { loops, config } = state;
  if (!automatic) {
    loops.cycle = null;
    return;
  }
  if (state.result !== null || state.automaticSteps < config.mandatoryLoopCheckFrom) return;
  if (isUnbreakableCopyContinuation(state, ctx.catalog)) {
    endBattle(ctx, { kind: "draw", reason: "mandatoryLoop" });
    return;
  }
  const hash = cycleHash(state);
  const mark = loops.cycle;
  if (mark === null) {
    loops.cycle = { hash, at: state.automaticSteps, window: 1 };
    return;
  }
  if (hash === mark.hash) {
    endBattle(ctx, { kind: "draw", reason: "mandatoryLoop" });
    return;
  }
  if (state.automaticSteps - mark.at >= mark.window) {
    loops.cycle = { hash, at: state.automaticSteps, window: Math.min(mark.window * 2, config.mandatoryLoopWindow) };
  }
}
