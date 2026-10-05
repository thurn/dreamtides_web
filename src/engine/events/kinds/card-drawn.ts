import type { InstanceId, Side } from "../../state/ids";
import type { EventDefinition } from "../types";

export interface CardDrawnEvent {
  readonly kind: "cardDrawn";
  readonly side: Side;
  readonly instance: InstanceId;
}

export const cardDrawn: EventDefinition<CardDrawnEvent> = {
  kind: "cardDrawn",
  privateTo: (event) => event.side,
};
