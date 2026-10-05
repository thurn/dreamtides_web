import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface LaneResolvedEvent {
  readonly kind: "laneResolved";
  readonly lane: number;
  readonly challenger: InstanceId;
  readonly blocker: InstanceId | null;
  readonly challengerSpark: number;
  readonly blockerSpark: number;
  /** The side whose character alone survives, or `null` for a tie or an unpaired lane. */
  readonly winner: Side | null;
  readonly scored: number;
}

export const laneResolved = publicEvent<LaneResolvedEvent>("laneResolved");
