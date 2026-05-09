import type {
  BattleHistory,
  BattleInit,
  BattleMutableState,
  BattleReducerTransition,
} from "../battle/types";

export interface SharedBattleReducerSlice {
  mutable: BattleMutableState;
  history: BattleHistory;
  lastTransition: BattleReducerTransition | null;
  commandSerial: number;
}

export interface SharedBattleState {
  init: BattleInit;
  reducer: SharedBattleReducerSlice;
}
