import type { EffectId } from "../../state/ids";
import { publicEvent } from "../types";

/** A floating effect ended: its duration expired, its delayed trigger fired, or its cards ceased to exist. */
export interface EffectEndedEvent {
  readonly kind: "effectEnded";
  readonly effect: EffectId;
}

export const effectEnded = publicEvent<EffectEndedEvent>("effectEnded");
