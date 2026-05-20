import type {
  BattleCardInstance,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
} from "../types";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";

export function isFigmentInstance(instance: BattleCardInstance | undefined | null): instance is BattleCardInstance {
  return instance?.provenance.kind === "generated-figment";
}

export function selectFigmentCount(instance: BattleCardInstance): number {
  if (!isFigmentInstance(instance)) {
    return 1;
  }

  return Math.max(1, Math.floor(instance.figmentCount ?? 1));
}

export function selectEffectiveSparkForInstance(instance: BattleCardInstance): number {
  const printedSpark = instance.definition.printedSpark;
  const count = selectFigmentCount(instance);
  const baseSpark = isFigmentInstance(instance) ? printedSpark * count : printedSpark;

  return Math.max(0, baseSpark + instance.sparkDelta);
}

export function findBattlefieldFigmentStack(
  state: BattleMutableState,
  side: BattleSide,
  subtype: string,
  excludeBattleCardId: string | null = null,
): { battleCardId: string; location: BattleFieldSlotAddress } | null {
  const normalizedSubtype = normalizeFigmentSubtype(subtype);

  for (const slotId of RESERVE_SLOT_IDS) {
    const battleCardId = state.sides[side].reserve[slotId];
    const instance = battleCardId === null ? null : state.cardInstances[battleCardId];
    if (
      battleCardId !== null &&
      battleCardId !== excludeBattleCardId &&
      isFigmentInstance(instance) &&
      normalizeFigmentSubtype(instance.definition.subtype) === normalizedSubtype
    ) {
      return {
        battleCardId,
        location: { side, zone: "reserve", slotId },
      };
    }
  }

  for (const slotId of DEPLOY_SLOT_IDS) {
    const battleCardId = state.sides[side].deployed[slotId];
    const instance = battleCardId === null ? null : state.cardInstances[battleCardId];
    if (
      battleCardId !== null &&
      battleCardId !== excludeBattleCardId &&
      isFigmentInstance(instance) &&
      normalizeFigmentSubtype(instance.definition.subtype) === normalizedSubtype
    ) {
      return {
        battleCardId,
        location: { side, zone: "deployed", slotId },
      };
    }
  }

  return null;
}

export function addFigmentsToStackInPlace(
  state: BattleMutableState,
  stackBattleCardId: string,
  countToAdd: number,
): void {
  const stack = state.cardInstances[stackBattleCardId];
  if (!isFigmentInstance(stack)) {
    return;
  }

  stack.figmentCount = selectFigmentCount(stack) + Math.max(1, Math.floor(countToAdd));
}

export function canMergeFigments(
  moving: BattleCardInstance | undefined | null,
  existing: BattleCardInstance | undefined | null,
): boolean {
  return isFigmentInstance(moving) &&
    isFigmentInstance(existing) &&
    normalizeFigmentSubtype(moving.definition.subtype) === normalizeFigmentSubtype(existing.definition.subtype);
}

export function selectFigmentChallengeLossCount(
  instance: BattleCardInstance,
  opposingSpark: number,
): number {
  if (!isFigmentInstance(instance) || opposingSpark <= 0) {
    return 0;
  }

  const count = selectFigmentCount(instance);
  const perFigmentSpark = buildFigmentSparkValues(instance, count);
  let runningSpark = 0;

  for (let index = 0; index < perFigmentSpark.length; index += 1) {
    runningSpark += perFigmentSpark[index];
    if (runningSpark >= opposingSpark) {
      return index + 1;
    }
  }

  return count;
}

export function dissolveFigmentsFromStackInPlace(
  state: BattleMutableState,
  battleCardId: string,
  countToDissolve: number,
): boolean {
  const instance = state.cardInstances[battleCardId];
  if (!isFigmentInstance(instance)) {
    return true;
  }

  const currentCount = selectFigmentCount(instance);
  const nextCount = currentCount - Math.max(1, Math.floor(countToDissolve));
  if (nextCount <= 0) {
    return true;
  }

  instance.figmentCount = nextCount;
  if (instance.sparkDelta > 0) {
    instance.sparkDelta = 0;
  }
  return false;
}

function buildFigmentSparkValues(
  instance: BattleCardInstance,
  count: number,
): number[] {
  const baseSpark = Math.max(0, instance.definition.printedSpark);
  const values = Array.from({ length: count }, () => baseSpark);
  if (values.length > 0 && instance.sparkDelta !== 0) {
    values[0] = Math.max(0, values[0] + instance.sparkDelta);
  }

  return values.sort((left, right) => right - left);
}

function normalizeFigmentSubtype(subtype: string): string {
  return subtype.trim().toLowerCase();
}
