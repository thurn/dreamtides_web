import type { AbilitySource, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** An activated ability resolved from the top of the stack. */
export interface AbilityResolvedEvent {
  readonly kind: "abilityResolved";
  readonly side: Side;
  readonly source: AbilitySource;
  readonly ability: number;
}

export const abilityResolved = publicEvent<AbilityResolvedEvent>("abilityResolved");
