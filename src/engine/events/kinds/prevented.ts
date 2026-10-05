import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/**
 * A card on the stack was prevented and left the stack without resolving.
 * `to` is where it went; `null` when a created card ceased to exist.
 */
export interface PreventedEvent {
  readonly kind: "prevented";
  readonly instance: InstanceId;
  /** The prevented card's controller. */
  readonly side: Side;
  readonly to: "void" | "deck" | "hand" | "banished" | null;
}

export const prevented = publicEvent<PreventedEvent>("prevented");
