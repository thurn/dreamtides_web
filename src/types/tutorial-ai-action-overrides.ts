import { isCardId } from "./card-identity";
import type { TutorialBattleAiActionOverride } from "./tutorial";

const OVERRIDE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** Parse the shared fold/runtime representation of tutorial AI overrides. */
export function parseTutorialBattleAiActionOverrides(
  value: unknown,
): readonly TutorialBattleAiActionOverride[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Tutorial battle aiActionOverrides must be an array.",
    );
  }
  const overrides: TutorialBattleAiActionOverride[] = [];
  const ids = new Set<string>();
  for (const candidate of value as unknown[]) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new Error(
        "Tutorial battle aiActionOverrides entries must be tables.",
      );
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      !OVERRIDE_ID_PATTERN.test(record.id)
    ) {
      throw new Error(
        "Tutorial battle AI action override ids must use lowercase kebab-case.",
      );
    }
    if (ids.has(record.id)) {
      throw new Error(
        `Tutorial battle AI action override id ${JSON.stringify(record.id)} is duplicated.`,
      );
    }
    const trigger = record.trigger;
    const action = record.action;
    if (
      trigger === null ||
      typeof trigger !== "object" ||
      Array.isArray(trigger) ||
      (trigger as Record<string, unknown>).kind !== "after-dreamwell" ||
      (trigger as Record<string, unknown>).side !== "enemy" ||
      typeof (trigger as Record<string, unknown>).cardId !== "string" ||
      !isCardId((trigger as Record<string, unknown>).cardId as string)
    ) {
      throw new Error(
        `Tutorial battle AI action override ${JSON.stringify(record.id)} must have an enemy after-dreamwell trigger with a card UUID.`,
      );
    }
    if (
      action === null ||
      typeof action !== "object" ||
      Array.isArray(action) ||
      (action as Record<string, unknown>).kind !== "play-card" ||
      typeof (action as Record<string, unknown>).cardId !== "string" ||
      !isCardId((action as Record<string, unknown>).cardId as string)
    ) {
      throw new Error(
        `Tutorial battle AI action override ${JSON.stringify(record.id)} must have a play-card action with a card UUID.`,
      );
    }
    ids.add(record.id);
    overrides.push({
      id: record.id,
      trigger: {
        kind: "after-dreamwell",
        side: "enemy",
        cardId: (trigger as Record<string, unknown>).cardId as string,
      },
      action: {
        kind: "play-card",
        cardId: (action as Record<string, unknown>).cardId as string,
      },
    });
  }
  return overrides;
}

/** Validate persisted fold data with the same parser used by runtime content. */
export function isTutorialBattleAiActionOverrides(
  value: unknown,
): boolean {
  try {
    parseTutorialBattleAiActionOverrides(value);
    return true;
  } catch {
    return false;
  }
}
