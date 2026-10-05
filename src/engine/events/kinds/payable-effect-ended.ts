import type { EffectId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A payable effect ended; `paid` when its payer ended it with `payToEnd`. */
export interface PayableEffectEndedEvent {
  readonly kind: "payableEffectEnded";
  readonly effect: EffectId;
  readonly payer: Side;
  readonly paid: boolean;
}

export const payableEffectEnded = publicEvent<PayableEffectEndedEvent>("payableEffectEnded");
