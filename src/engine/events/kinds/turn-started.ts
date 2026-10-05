import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface TurnStartedEvent {
  readonly kind: "turnStarted";
  readonly side: Side;
  readonly round: number;
  readonly turnNumber: number;
  readonly extra: boolean;
}

export const turnStarted = publicEvent<TurnStartedEvent>("turnStarted");
