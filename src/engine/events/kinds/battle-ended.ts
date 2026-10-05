import type { BattleResult } from "../../state/types";
import { publicEvent } from "../types";

export interface BattleEndedEvent {
  readonly kind: "battleEnded";
  readonly result: BattleResult;
}

export const battleEnded = publicEvent<BattleEndedEvent>("battleEnded");
