import { isCardId } from "./card-identity";
import type { TutorialBattleAiActionOverride } from "./tutorial";
import {
  parseTutorialAiActionOverrideId,
  type TutorialAiActionOverrideId,
} from "./identifiers";
import { parseCardId } from "./card-identity";
import { parseDreamwellCardId } from "./identifiers";

const OVERRIDE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** Parse the shared fold/runtime representation of tutorial AI overrides. */
export function parseTutorialBattleAiActionOverrides(
  value: unknown,
): readonly TutorialBattleAiActionOverride[] {
  if (!Array.isArray(value)) {
    throw new Error("Tutorial battle aiActionOverrides must be an array.");
  }
  const overrides: TutorialBattleAiActionOverride[] = [];
  const ids = new Set<TutorialAiActionOverrideId>();
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
    if (typeof record.id !== "string" || !OVERRIDE_ID_PATTERN.test(record.id)) {
      throw new Error(
        "Tutorial battle AI action override ids must use lowercase kebab-case.",
      );
    }
    const overrideId = parseTutorialAiActionOverrideId(record.id);
    if (ids.has(overrideId)) {
      throw new Error(
        `Tutorial battle AI action override id ${JSON.stringify(record.id)} is duplicated.`,
      );
    }
    const trigger = record.trigger;
    const action = record.action;
    const triggerRecord = trigger as Record<string, unknown>;
    const actionRecord = action as Record<string, unknown>;
    if (
      trigger === null ||
      typeof trigger !== "object" ||
      Array.isArray(trigger) ||
      triggerRecord.kind !== "after-dreamwell" ||
      triggerRecord.side !== "enemy" ||
      typeof triggerRecord.cardId !== "string" ||
      !isCardId(triggerRecord.cardId)
    ) {
      throw new Error(
        `Tutorial battle AI action override ${JSON.stringify(record.id)} must have an enemy after-dreamwell trigger with a card UUID.`,
      );
    }
    if (
      action === null ||
      typeof action !== "object" ||
      Array.isArray(action) ||
      actionRecord.kind !== "play-card" ||
      typeof actionRecord.cardId !== "string" ||
      !isCardId(actionRecord.cardId)
    ) {
      throw new Error(
        `Tutorial battle AI action override ${JSON.stringify(record.id)} must have a play-card action with a card UUID.`,
      );
    }
    ids.add(overrideId);
    overrides.push({
      id: overrideId,
      trigger: {
        kind: "after-dreamwell",
        side: "enemy",
        cardId: parseDreamwellCardId(triggerRecord.cardId),
      },
      action: {
        kind: "play-card",
        cardId: parseCardId(actionRecord.cardId),
      },
    });
  }
  return overrides;
}

/** Validate persisted fold data with the same parser used by runtime content. */
export function isTutorialBattleAiActionOverrides(value: unknown): boolean {
  try {
    parseTutorialBattleAiActionOverrides(value);
    return true;
  } catch {
    return false;
  }
}
