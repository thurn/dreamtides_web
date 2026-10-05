import type { AbilitySource, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A side activated an ability; it is now on top of the stack. */
export interface AbilityActivatedEvent {
  readonly kind: "abilityActivated";
  readonly side: Side;
  readonly source: AbilitySource;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
}

export const abilityActivated = publicEvent<AbilityActivatedEvent>("abilityActivated");
