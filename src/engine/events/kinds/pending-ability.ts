import type { CardId, DreamwellCardId, InstanceId, Side } from "../../state/ids";
import type { EventDefinition } from "../types";

/**
 * A pending entity was played or drawn and acted text-less (D36). Hosts log
 * it with the card UUID; drawing into a hidden hand is private to the drawer.
 */
export interface PendingAbilityEvent {
  readonly kind: "pendingAbility";
  readonly side: Side;
  readonly cardId: CardId | DreamwellCardId;
  /** The instance, or `null` for a Dreamwell card. */
  readonly instance: InstanceId | null;
  readonly reason: "played" | "drawn";
}

export const pendingAbility: EventDefinition<PendingAbilityEvent> = {
  kind: "pendingAbility",
  privateTo: (event) => (event.reason === "drawn" && event.instance !== null ? event.side : null),
};
