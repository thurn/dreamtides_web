import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface CardPlayedEvent {
  readonly kind: "cardPlayed";
  readonly side: Side;
  readonly instance: InstanceId;
}

export const cardPlayed = publicEvent<CardPlayedEvent>("cardPlayed");
