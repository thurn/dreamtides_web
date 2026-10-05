import type { AbilitySource, EffectId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** An effect lasting "until the opponent pays N●" began; `payer` may pay `cost` to end it (C7). */
export interface PayableEffectRegisteredEvent {
  readonly kind: "payableEffectRegistered";
  readonly effect: EffectId;
  readonly payer: Side;
  readonly cost: number;
  readonly source: AbilitySource;
}

export const payableEffectRegistered = publicEvent<PayableEffectRegisteredEvent>("payableEffectRegistered");
