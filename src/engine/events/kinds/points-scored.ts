import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface PointsScoredEvent {
  readonly kind: "pointsScored";
  readonly side: Side;
  readonly amount: number;
  /** "challenge" when a character scores ⍟; "fatigue" for the opponent's Fatigue; "effect" for a "gain N⍟" effect. */
  readonly cause: "challenge" | "fatigue" | "effect";
}

export const pointsScored = publicEvent<PointsScoredEvent>("pointsScored");
