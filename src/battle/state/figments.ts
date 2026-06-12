import type {
  BattleCardInstance,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
} from "../types";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";

export function isFigmentInstance(instance: BattleCardInstance | undefined | null): instance is BattleCardInstance {
  return instance?.provenance.kind === "generated-figment";
}

/**
 * Returns the spark array for a figment instance, normalized to a non-empty
 * descending-sorted list. A figment with no recorded members falls back to a
 * single member at its printed spark so legacy/incomplete state still behaves
 * like a one-figment stack.
 */
function figmentSparks(instance: BattleCardInstance): number[] {
  const recorded = instance.figments;
  const values = recorded === undefined || recorded.length === 0
    ? [instance.definition.printedSpark]
    : [...recorded];
  return sortDescending(values);
}

/**
 * The member spark values of a figment stack, sorted descending. Returns an
 * empty array for non-figment instances.
 */
export function selectFigmentSparks(instance: BattleCardInstance): number[] {
  if (!isFigmentInstance(instance)) {
    return [];
  }

  return figmentSparks(instance);
}

export function selectFigmentCount(instance: BattleCardInstance): number {
  if (!isFigmentInstance(instance)) {
    return 1;
  }

  return instance.figments?.length ?? 1;
}

export function selectEffectiveSparkForInstance(instance: BattleCardInstance): number {
  if (instance.provenance.kind === "generated-figment") {
    // A figment stack's spark is the sum of its members' sparks plus a
    // stack-level bonus stored in `sparkDelta`. The bonus is how "Add Spark"
    // pumps a whole stack — e.g. "+4 bonus spark in addition to the figments
    // themselves" — separately from adding more figment members.
    const memberSpark = figmentSparks(instance).reduce(
      (total, spark) => total + Math.max(0, spark),
      0,
    );
    return Math.max(0, memberSpark + instance.sparkDelta + instance.staticSparkBonus);
  }

  return Math.max(
    0,
    instance.definition.printedSpark + instance.sparkDelta + instance.staticSparkBonus,
  );
}

export function findBattlefieldFigmentStack(
  state: BattleMutableState,
  side: BattleSide,
  subtype: string,
  excludeBattleCardId: string | null = null,
): { battleCardId: string; location: BattleFieldSlotAddress } | null {
  const normalizedSubtype = normalizeFigmentSubtype(subtype);

  for (const slotId of BACK_RANK_SLOT_IDS) {
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

  for (const slotId of FRONT_RANK_SLOT_IDS) {
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
 * Pushes new figment members onto the stack and keeps the array sorted
 * descending (top = index 0). Each new member is added at `baseSpark`.
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

  const members = figmentSparks(stack);
  const additions = Math.max(1, Math.floor(countToAdd));
  for (let index = 0; index < additions; index += 1) {
    members.push(baseSpark);
  }
  stack.figments = sortDescending(members);
}

/**
 * Merges the `incoming` member sparks onto the stack, keeping the array sorted
 * descending. Used when one figment stack moves onto another of the same type.
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

  stack.figments = sortDescending([...figmentSparks(stack), ...incoming]);
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
 * The number of figments dissolved when this stack meets `opposingSpark` in a
 * challenge. The opposing spark is applied top-down (highest spark first): a
 * figment is dissolved only while the remaining opposing spark is at least that
 * figment's spark, subtracting its spark from the remaining amount. The walk
 * stops as soon as the next figment's spark exceeds the remainder, so that
 * figment and every figment below it survive (rules §Figments).
 */
export function selectFigmentChallengeLossCount(
  instance: BattleCardInstance,
  opposingSpark: number,
): number {
  if (!isFigmentInstance(instance) || opposingSpark <= 0) {
    return 0;
  }

  const members = figmentSparks(instance);
  let remaining = opposingSpark;
  let lossCount = 0;

  for (const spark of members) {
    const effectiveSpark = Math.max(0, spark);
    if (effectiveSpark > remaining) {
      break;
    }
    remaining -= effectiveSpark;
    lossCount += 1;
  }

  return lossCount;
}

/**
 * Drops the top `k` members (highest spark first, matching challenge loss
 * order). Returns true when the stack empties.
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

  const members = figmentSparks(instance);
  const removeCount = Math.max(1, Math.floor(countToDissolve));
  if (removeCount >= members.length) {
    instance.figments = [];
    return true;
  }

  instance.figments = members.slice(removeCount);
  return false;
}

function sortDescending(values: number[]): number[] {
  return [...values].sort((left, right) => right - left);
}

function normalizeFigmentSubtype(subtype: string): string {
  return subtype.trim().toLowerCase();
}
