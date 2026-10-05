import type { DreamwellCardId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface DreamwellDrawnEvent {
  readonly kind: "dreamwellDrawn";
  readonly side: Side;
  readonly card: DreamwellCardId;
  readonly energyAdded: number;
}

export const dreamwellDrawn = publicEvent<DreamwellDrawnEvent>("dreamwellDrawn");
