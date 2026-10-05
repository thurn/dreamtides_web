import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface EnergyChangedEvent {
  readonly kind: "energyChanged";
  readonly side: Side;
  readonly current: number;
  readonly max: number;
}

export const energyChanged = publicEvent<EnergyChangedEvent>("energyChanged");
