import type { AbilitySource, EffectId, Side } from "../../state/ids";
import type { Expiry, FloatingChange } from "../../state/types";
import { publicEvent } from "../types";

/** A floating effect began: a change with a duration (rules § Durations). */
export interface EffectStartedEvent {
  readonly kind: "effectStarted";
  readonly effect: EffectId;
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly expiry: Expiry;
  readonly change: FloatingChange;
}

export const effectStarted = publicEvent<EffectStartedEvent>("effectStarted");
