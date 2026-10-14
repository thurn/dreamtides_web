import type { AbilityOrigin } from "../../state/types";
import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { EventDefinition } from "../types";

/** A successful stack copy (D15), or a private copy created in a hand. */
export interface CardCopiedEvent {
  readonly kind: "cardCopied";
  readonly side: Side;
  /** Null only in the event shown to a viewer who cannot identify the original. */
  readonly original: InstanceId | null;
  readonly copy: InstanceId;
  readonly zone?: "hand";
  readonly originalHiddenFrom?: readonly Side[];
  /** This physical bonus belongs to primary, attributed before the attempt's choices or later source departure. */
  readonly bonusFrom?: { readonly primary: InstanceId; readonly source: AbilitySource; readonly origin: AbilityOrigin; readonly ability: number };
}

export const cardCopied: EventDefinition<CardCopiedEvent> = {
  kind: "cardCopied",
  privateTo: event => event.zone === "hand" ? event.side : null,
  redact(event, viewer) {
    return event.originalHiddenFrom?.includes(viewer) === true ? { ...event, original: null } : event;
  },
};
