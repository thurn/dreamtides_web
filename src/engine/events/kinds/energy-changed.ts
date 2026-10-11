import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** `side`'s energy changed: it has `current` of its `max` energy. */
export interface EnergyChangedEvent {
  readonly kind: "energyChanged";
  readonly side: Side;
  readonly current: number;
  readonly max: number;
  /** The actual change in current energy: negative for a loss. */
  readonly change: number;
  /** The actual change in maximum energy: negative for a loss. */
  readonly maxChange: number;
  /**
   * "effect" for an effect that gains or loses energy; "payment" for energy
   * spent on a cost; "refresh" for the turn's refresh to maximum, the
   * Dreamwell raising the maximum, and the battle's starting energy.
   */
  readonly cause: "effect" | "payment" | "refresh";
}

export const energyChanged = publicEvent<EnergyChangedEvent>("energyChanged");
