import type { BattleMutableState } from "../types";
import type { PromptResolution } from "../../rules/battle/effect-runner-core";
import type { PendingPrompt } from "../../rules/battle/fold";
import { selectBattleCardLocation } from "../state/selectors";

function backingCardUuid(
  board: BattleMutableState,
  instanceId: string,
): string | null {
  return board.cardInstances[instanceId]?.definition.cardId ?? null;
}

/** Reconstructable identity fields for one authoritative prompt resolution. */
export function createBattlePromptResolutionLogFields(
  board: BattleMutableState,
  pendingPrompt: PendingPrompt,
  resolution: PromptResolution,
): Record<string, unknown> {
  const candidateInstanceIds = pendingPrompt.options.kind === "pick-cards"
    ? pendingPrompt.options.candidateIds
    : pendingPrompt.options.kind === "foresee"
      ? pendingPrompt.options.cardIds
      : [];
  const chosenInstanceIds = resolution.kind === "pick-cards"
    ? resolution.chosenIds
    : resolution.kind === "foresee"
      ? [
          ...(resolution.orderedCardIds ?? []),
          ...(resolution.voidCardIds ?? []),
        ]
      : [];
  return {
    dreamwellCardUuid:
      pendingPrompt.run.scriptRef.table === "dreamwell"
        ? pendingPrompt.run.scriptRef.id
        : null,
    promptId: pendingPrompt.promptId,
    promptKind: pendingPrompt.kind,
    promptLabel:
      pendingPrompt.options.kind === "foresee"
        ? `Foresee ${String(pendingPrompt.options.count)}`
        : pendingPrompt.options.label,
    candidateBattleCardInstanceIds: candidateInstanceIds,
    candidateBackingCardUuids: candidateInstanceIds.map((instanceId) =>
      backingCardUuid(board, instanceId)
    ),
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
      backingCardUuid(board, instanceId)
    ),
    finalResolution: resolution,
  };
}
