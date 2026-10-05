// Game hooks under their established import path; the local game session
// (src/session/hooks.ts) implements them.

export {
  useActions,
  useAppend,
  useClientId,
  useConfirmedGameState,
  useConfirmedHead,
  useConfirmedPromptId,
  useConnectedClientIds,
  useConnectedCount,
  useEventOutcomes,
  useGameState,
  type OutcomeListener,
} from "../session/hooks";
