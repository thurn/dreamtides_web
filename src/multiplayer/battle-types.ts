import type {
  BattleHistory,
  BattleInit,
  BattleMutableState,
  BattleReducerTransition,
} from "../battle/types";

export type SharedBattleActivityKind = "command" | "undo" | "redo";

export interface SharedBattleReducerSlice {
  mutable: BattleMutableState;
  history: BattleHistory;
  lastTransition: BattleReducerTransition | null;
  commandSerial: number;
  lastActivityKind: SharedBattleActivityKind | null;
}

export interface SharedBattleState {
  init: BattleInit;
  reducer: SharedBattleReducerSlice;
}
