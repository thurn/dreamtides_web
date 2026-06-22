import type {
  BattleCardInstance,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
} from "../types";
import { rankSlotIds } from "../types";

export function isFigmentInstance(instance: BattleCardInstance | undefined | null): instance is BattleCardInstance {
  return instance?.provenance.kind === "generated-figment";
}

/**
 * Live board context a figment stack needs to resolve a dynamic base spark.
 * Only `Legion` consumes it today (its spark is the allied-warrior count); when
 * omitted, a Legion falls back to counting its own stack in isolation.
 */
export interface FigmentSparkContext {
  /** Allied warriors controlled by this stack's controller (rules §Figments). */
  alliedWarriorCount: number;
}

/**
 * Returns the member spark array for a figment instance in stack order, topmost
 * first. A figment with no recorded members falls back to a single member at its
 * printed spark so incomplete state still behaves like a one-figment stack. The
 * array is in position order, not sorted: the topmost (active) figment is index
 * 0 and newly materialized figments join the bottom as reserves.
 */
function figmentMembers(instance: BattleCardInstance): number[] {
  const recorded = instance.figments;
  return recorded === undefined || recorded.length === 0
    ? [instance.definition.printedSpark]
    : [...recorded];
}

/**
 * The member spark values of a figment stack in stack order (topmost first).
 * Returns an empty array for non-figment instances.
 */
export function selectFigmentSparks(instance: BattleCardInstance): number[] {
  if (!isFigmentInstance(instance)) {
    return [];
  }

  return figmentMembers(instance);
}

export function selectFigmentCount(instance: BattleCardInstance): number {
  if (!isFigmentInstance(instance)) {
    return 1;
  }

  return instance.figments?.length ?? 1;
}

function normalizeFigmentSubtype(subtype: string): string {
  return subtype.trim().toLowerCase();
}

/**
 * Whether a subtype counts as a Warrior for allied-warrior tallies. Both the
 * `Warrior` and `Legion` figment types are warriors (a Legion is a Warrior),
 * and so is any non-figment character printed as a Warrior.
 */
export function isWarriorSubtype(subtype: string): boolean {
  const normalized = normalizeFigmentSubtype(subtype);
  return normalized === "warrior" || normalized === "legion";
}

function isLegionInstance(instance: BattleCardInstance): boolean {
  return normalizeFigmentSubtype(instance.definition.subtype) === "legion";
}

/**
 * Counts the warriors a side controls in play (rules §Figments — Spark and
 * counting). Each figment counts individually toward the tally, so a stack of
 * three Warrior figments is three allied warriors; a non-figment Warrior counts
 * once. Drives a Legion figment's dynamic spark.
 */
export function countAlliedWarriors(
  state: BattleMutableState,
  side: BattleSide,
): number {
  let count = 0;
  const sideState = state.sides[side];
  for (const slotId of rankSlotIds(sideState.backRank)) {
    count += warriorContribution(state, sideState.backRank[slotId]);
  }
  for (const slotId of rankSlotIds(sideState.frontRank)) {
    count += warriorContribution(state, sideState.frontRank[slotId]);
  }
  return count;
}

function warriorContribution(
  state: BattleMutableState,
  battleCardId: string | null,
): number {
  const instance = battleCardId === null ? undefined : state.cardInstances[battleCardId];
  if (instance === undefined || instance.definition.battleCardKind !== "character") {
    return 0;
  }
  if (!isWarriorSubtype(instance.definition.subtype)) {
    return 0;
  }
  return isFigmentInstance(instance) ? selectFigmentCount(instance) : 1;
}

/**
 * Builds the board context a figment stack needs to resolve its dynamic spark,
 * or `undefined` for a non-figment. Callers that hold the full state should pass
 * the result to the spark selectors so a `Legion` reads the live allied-warrior
 * count instead of falling back to its stack in isolation.
 */
export function selectFigmentSparkContext(
  state: BattleMutableState,
  instance: BattleCardInstance,
): FigmentSparkContext | undefined {
  if (!isFigmentInstance(instance)) {
    return undefined;
  }
  return { alliedWarriorCount: countAlliedWarriors(state, instance.controller) };
}

/** The base spark of a single member figment before stack-level adjustments. */
function memberBaseSpark(
  instance: BattleCardInstance,
  storedSpark: number,
  context: FigmentSparkContext | undefined,
): number {
  if (isLegionInstance(instance)) {
    const warriors = context?.alliedWarriorCount ?? selectFigmentCount(instance);
    return Math.max(0, warriors);
  }
  return Math.max(0, storedSpark);
}

/**
 * The total effective spark of a figment stack — the sum of every member's
 * spark plus the topmost's targeted gain (`sparkDelta`) and the per-figment
 * anthem (`staticSparkBonus`, applied to each member). This is the value a stack
 * displays; combat compares the topmost only (see `selectTopmostFigmentSpark`).
 */
export function selectEffectiveSparkForInstance(
  instance: BattleCardInstance,
  context?: FigmentSparkContext,
): number {
  if (instance.provenance.kind === "generated-figment") {
    const members = figmentMembers(instance);
    const memberSpark = members.reduce(
      (total, stored) => total + memberBaseSpark(instance, stored, context),
      0,
    );
    // `sparkDelta` is a targeted spark gain riding the topmost figment; it is
    // added once. `staticSparkBonus` is a per-figment anthem, so it scales with
    // the member count and can multiply a stack's total.
    const anthem = instance.staticSparkBonus * members.length;
    return Math.max(0, memberSpark + instance.sparkDelta + anthem);
  }

  return Math.max(
    0,
    instance.definition.printedSpark + instance.sparkDelta + instance.staticSparkBonus,
  );
}

/**
 * The spark of a figment stack's topmost (active) figment alone (rules
 * §Figments — Challenge resolution). The topmost carries its base spark, the
 * targeted gain riding it (`sparkDelta`), and one share of the per-figment
 * anthem. Reserve figments are not included. Returns the plain effective spark
 * for a non-figment.
 */
export function selectTopmostFigmentSpark(
  instance: BattleCardInstance,
  context?: FigmentSparkContext,
): number {
  if (!isFigmentInstance(instance)) {
    return selectEffectiveSparkForInstance(instance, context);
  }
  const members = figmentMembers(instance);
  const base = memberBaseSpark(instance, members[0] ?? 0, context);
  return Math.max(0, base + instance.sparkDelta + instance.staticSparkBonus);
}

/**
 * The combined spark of a figment stack's reserve figments — everything below
 * the topmost. This is what a stack scores when it challenges into a defender
 * (rules §Figments — Challenge resolution). Zero for a non-figment or a
 * single-figment stack.
 */
export function selectFigmentReserveSpark(
  instance: BattleCardInstance,
  context?: FigmentSparkContext,
): number {
  if (!isFigmentInstance(instance)) {
    return 0;
  }
  return Math.max(
    0,
    selectEffectiveSparkForInstance(instance, context) -
      selectTopmostFigmentSpark(instance, context),
  );
}

export function findBattlefieldFigmentStack(
  state: BattleMutableState,
  side: BattleSide,
  subtype: string,
  excludeBattleCardId: string | null = null,
): { battleCardId: string; location: BattleFieldSlotAddress } | null {
  const normalizedSubtype = normalizeFigmentSubtype(subtype);

  for (const slotId of rankSlotIds(state.sides[side].backRank)) {
    const battleCardId = state.sides[side].backRank[slotId];
    const instance = battleCardId === null ? null : state.cardInstances[battleCardId];
    if (
      battleCardId !== null &&
      battleCardId !== excludeBattleCardId &&
      isFigmentInstance(instance) &&
      normalizeFigmentSubtype(instance.definition.subtype) === normalizedSubtype
    ) {
      return {
        battleCardId,
        location: { side, zone: "backRank", slotId },
      };
    }
  }

  for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
    const battleCardId = state.sides[side].frontRank[slotId];
    const instance = battleCardId === null ? null : state.cardInstances[battleCardId];
    if (
      battleCardId !== null &&
      battleCardId !== excludeBattleCardId &&
      isFigmentInstance(instance) &&
      normalizeFigmentSubtype(instance.definition.subtype) === normalizedSubtype
    ) {
      return {
        battleCardId,
        location: { side, zone: "frontRank", slotId },
      };
    }
  }

  return null;
}

/**
 * Appends new figment members to the bottom of the stack as reserves (rules
 * §Figments — Stacks). New members enter at `baseSpark` and the topmost (index
 * 0) is untouched, so adding figments never displaces the active figment.
 */
export function addFigmentsToStackInPlace(
  state: BattleMutableState,
  stackBattleCardId: string,
  countToAdd: number,
  baseSpark: number,
): void {
  const stack = state.cardInstances[stackBattleCardId];
  if (!isFigmentInstance(stack)) {
    return;
  }

  const members = figmentMembers(stack);
  const additions = Math.max(1, Math.floor(countToAdd));
  for (let index = 0; index < additions; index += 1) {
    members.push(baseSpark);
  }
  stack.figments = members;
}

/**
 * Merges the `incoming` member sparks onto the bottom of the stack as reserves,
 * preserving stack order. Used when one figment stack moves onto another of the
 * same type.
 */
export function mergeFigmentsIntoStackInPlace(
  state: BattleMutableState,
  stackBattleCardId: string,
  incoming: readonly number[],
): void {
  const stack = state.cardInstances[stackBattleCardId];
  if (!isFigmentInstance(stack)) {
    return;
  }

  stack.figments = [...figmentMembers(stack), ...incoming];
}

export function canMergeFigments(
  moving: BattleCardInstance | undefined | null,
  existing: BattleCardInstance | undefined | null,
): boolean {
  return isFigmentInstance(moving) &&
    isFigmentInstance(existing) &&
    normalizeFigmentSubtype(moving.definition.subtype) === normalizeFigmentSubtype(existing.definition.subtype);
}

/**
 * Removes the top `k` members (topmost first) from the stack, promoting the next
 * reserve to topmost. Because a targeted spark gain rides the topmost figment,
 * removing the topmost clears the stack's `sparkDelta`. Returns true when the
 * stack empties (and so ceases to exist).
 */
export function dissolveFigmentsFromStackInPlace(
  state: BattleMutableState,
  battleCardId: string,
  countToDissolve: number,
): boolean {
  const instance = state.cardInstances[battleCardId];
  if (!isFigmentInstance(instance)) {
    return true;
  }

  const members = figmentMembers(instance);
  const removeCount = Math.max(1, Math.floor(countToDissolve));
  if (removeCount >= members.length) {
    instance.figments = [];
    return true;
  }

  instance.figments = members.slice(removeCount);
  // The targeted gain rode the removed topmost figment; the promoted reserve
  // carries none, so reset it.
  instance.sparkDelta = 0;
  return false;
}
