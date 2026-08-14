import type { BattleMutableState } from "../types";
import type { PromptResolution } from "../../rules/battle/effect-runner-core";
import type { PendingPrompt } from "../../rules/battle/fold";
import {
  isBuiltInBattlePromptRef,
  isDreamwellPromptRef,
  isLegacyPromptText,
  type BattlePromptText,
} from "../../data/dreamwell-prompts";
import { selectBattleCardLocation } from "../state/selectors";
import type { BattleCardId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import { asBattleCardId } from "../../types/identifiers";

export function promptTextLogFields(
  prefix: string,
  descriptor: BattlePromptText,
): Record<string, unknown> {
  if (isDreamwellPromptRef(descriptor)) {
    return {
      [`${prefix}DreamwellCardUuid`]: descriptor.cardId,
      [`${prefix}Key`]: descriptor.promptKey,
      [`${prefix}Arguments`]: descriptor.arguments,
      [`${prefix}Part`]: descriptor.part,
      [`${prefix}ChoiceKey`]: descriptor.choiceKey ?? null,
    };
  }
  if (isLegacyPromptText(descriptor)) {
    return { [`${prefix}LegacyText`]: descriptor.text };
  }
  if (isBuiltInBattlePromptRef(descriptor)) {
    return {
      [`${prefix}BuiltInPrompt`]: descriptor.prompt,
      [`${prefix}Arguments`]:
        descriptor.prompt === "switch-side" ? { side: descriptor.side } : null,
    };
  }
  return descriptor satisfies never;
}

function backingCardUuid(
  board: BattleMutableState,
  instanceId: BattleCardId,
): CardId | null {
  return board.cardInstances[instanceId]?.definition.cardId ?? null;
}

/** Reconstructable identity fields emitted when an authoritative prompt opens. */
export function createBattlePromptOpenedLogFields(
  board: BattleMutableState,
  pendingPrompt: PendingPrompt,
): Record<string, unknown> {
  const candidateInstanceIds =
    pendingPrompt.options.kind === "pick-cards"
      ? pendingPrompt.options.candidateIds
      : pendingPrompt.options.kind === "foresee"
        ? pendingPrompt.options.cardIds
        : [];
  return {
    dreamwellCardUuid:
      pendingPrompt.run.scriptRef.table === "dreamwell"
        ? pendingPrompt.run.scriptRef.id
        : null,
    promptId: pendingPrompt.promptId,
    promptKind: pendingPrompt.kind,
    ...(pendingPrompt.options.kind === "foresee"
      ? { promptForeseeCount: pendingPrompt.options.count }
      : promptTextLogFields("prompt", pendingPrompt.options.label)),
    candidateBattleCardInstanceIds: candidateInstanceIds,
    candidateBackingCardUuids: candidateInstanceIds.map((instanceId) =>
      backingCardUuid(board, asBattleCardId(instanceId)),
    ),
  };
}

/** Reconstructable identity fields for one authoritative prompt resolution. */
export function createBattlePromptResolutionLogFields(
  board: BattleMutableState,
  pendingPrompt: PendingPrompt,
  resolution: PromptResolution,
): Record<string, unknown> {
  const openedFields = createBattlePromptOpenedLogFields(board, pendingPrompt);
  const candidateInstanceIds = (
    openedFields.candidateBattleCardInstanceIds as unknown[]
  ).flatMap((value) =>
    typeof value === "string" ? [asBattleCardId(value)] : [],
  );
  const chosenInstanceIds =
    resolution.kind === "pick-cards"
      ? resolution.chosenIds
      : resolution.kind === "foresee"
        ? [
            ...(resolution.orderedCardIds ?? []),
            ...(resolution.voidCardIds ?? []),
          ]
        : [];
  return {
    ...openedFields,
    candidateCards: candidateInstanceIds.map((instanceId) => {
      const location = selectBattleCardLocation(board, instanceId);
      return {
        battleCardInstanceId: instanceId,
        backingCardUuid: backingCardUuid(board, instanceId),
        owner: location?.side ?? null,
        zone: location?.zone ?? null,
      };
    }),
    chosenBattleCardInstanceIds: chosenInstanceIds,
    chosenBackingCardUuids: chosenInstanceIds.map((instanceId) =>
      backingCardUuid(board, asBattleCardId(instanceId)),
    ),
    finalResolution: resolution,
  };
}
