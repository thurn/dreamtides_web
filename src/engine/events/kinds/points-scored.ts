import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface PointsScoredEvent {
  readonly kind: "pointsScored";
  readonly side: Side;
  readonly amount: number;
  /** "challenge" when a character scores ⍟; "fatigue" for the opponent's Fatigue. */
  readonly cause: "challenge" | "fatigue";
}

export const pointsScored = publicEvent<PointsScoredEvent>("pointsScored");
