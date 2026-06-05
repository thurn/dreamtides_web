import type { BattleCommand } from "./commands";
import { createBattleCommandMetadata } from "./commands";
import { battleReducer } from "../state/reducer";
import type {
  BattleHistoryEntryMetadata,
  BattleReducerAction,
  BattleReducerState,
} from "../types";

export function applyBattleCommand(
  state: BattleReducerState,
  command: BattleCommand,
): BattleReducerState {
  return battleReducer(
    state,
    createBattleReducerAction(command, createBattleCommandMetadata(command, state.mutable)),
  );
}

function createBattleReducerAction(
  command: BattleCommand,
  metadata: BattleHistoryEntryMetadata,
): BattleReducerAction {
  switch (command.id) {
    case "DEBUG_EDIT":
      return {
        type: "DEBUG_EDIT",
        edit: command.edit,
        metadata,
        aiChoices: command.aiChoices,
      };
    case "FORCE_RESULT":
      return {
        type: "FORCE_RESULT",
        result: command.result,
        metadata,
        aiChoices: command.aiChoices,
      };
    case "SKIP_TO_REWARDS":
      // Spec H-5 lists SKIP_TO_REWARDS as its own command id, and H-12 says
      // "Skip To Rewards records one composite moving into reward surface".
      // Structurally SKIP_TO_REWARDS is an alias for FORCE_RESULT(victory)
      // for the reducer: a single composite result-change with no gameplay
      // steps. Identity is preserved via `metadata.commandId` (set by
      // `createBattleCommandMetadata` → `"SKIP_TO_REWARDS"`) so history,
      // selectors, and the log drawer can distinguish the two. Callers that
      // want the skip semantics must dispatch `{ id: "SKIP_TO_REWARDS" }`;
      // dispatching `FORCE_RESULT` directly carries `commandId:
      // "FORCE_RESULT"`. (bug-065)
      return {
        type: "FORCE_RESULT",
        result: "victory",
        metadata,
      };
  }
}
