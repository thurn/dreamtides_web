import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A settled positive Challenge-scoring cohort, without historical hidden identities. */
export interface ScoreGroupEvent {
  readonly kind: "scoreGroup";
  readonly side: Side;
  readonly count: number;
}

export const scoreGroup = publicEvent<ScoreGroupEvent>("scoreGroup");
