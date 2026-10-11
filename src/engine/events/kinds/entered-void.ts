import type { InstanceId, Side, Zone } from "../../state/ids";
import { publicEvent } from "../types";

/**
 * A card was put into its owner's void from `from`, by any route: a
 * dissolve or abandon, a discard, an erode, a foresee, a prevented or
 * resolved card leaving the stack, or an effect putting it there. Emitted
 * once it is in the void, so "is put into your void" triggers see it there
 * (rules § Ability Types → When a card is put into a void). A created
 * card, which ceases to exist instead, and a reclaimed card, which is
 * banished instead, never enter a void.
 */
export interface EnteredVoidEvent {
  readonly kind: "enteredVoid";
  readonly instance: InstanceId;
  /** The void's owner. */
  readonly side: Side;
  /** The zone it came from. */
  readonly from: Zone;
}

export const enteredVoid = publicEvent<EnteredVoidEvent>("enteredVoid");
