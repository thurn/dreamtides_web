import type { BattleMutableState } from "../types";
import type { PromptResolution } from "../../rules/battle/effect-runner-core";
import type { PendingPrompt } from "../../rules/battle/fold";
import type { FluentMessageDescriptor } from "../../data/localization-messages";
import {
  isDreamwellPromptRef,
  isLegacyPromptText,
  type BattlePromptText,
} from "../../data/dreamwell-prompts";
import { selectBattleCardLocation } from "../state/selectors";

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
  return {
    [`${prefix}MessageId`]: descriptor.id,
    [`${prefix}MessageArguments`]:
      "variables" in descriptor ? descriptor.variables : null,
  };
}

function backingCardUuid(
  board: BattleMutableState,
  instanceId: string,
): string | null {
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
  const promptDescriptor =
    pendingPrompt.options.kind === "foresee"
      ? ({
          id: "battle-foresee-title",
          variables: { count: pendingPrompt.options.count },
        } satisfies FluentMessageDescriptor)
      : pendingPrompt.options.label;
  return {
    dreamwellCardUuid:
      pendingPrompt.run.scriptRef.table === "dreamwell"
        ? pendingPrompt.run.scriptRef.id
        : null,
    promptId: pendingPrompt.promptId,
    promptKind: pendingPrompt.kind,
    ...promptTextLogFields("prompt", promptDescriptor),
    candidateBattleCardInstanceIds: candidateInstanceIds,
    candidateBackingCardUuids: candidateInstanceIds.map((instanceId) =>
      backingCardUuid(board, instanceId),
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
  const candidateInstanceIds =
    openedFields.candidateBattleCardInstanceIds as string[];
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
      backingCardUuid(board, instanceId),
    ),
    finalResolution: resolution,
  };
}
