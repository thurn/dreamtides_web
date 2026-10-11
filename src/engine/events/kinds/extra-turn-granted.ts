import type { AbilitySource, Side } from "../../state/ids";
import { redactSource } from "../sources";
import type { EventDefinition } from "../types";

/** A full extra turn for `side` joined the pending queue, most recent first (C8). */
export interface ExtraTurnGrantedEvent {
  readonly kind: "extraTurnGranted";
  readonly side: Side;
  /** Null for a viewer who cannot identify the ability source. */
  readonly source: AbilitySource | null;
}

/** The granted turn is public; its source follows the viewer's card knowledge. */
export const extraTurnGranted: EventDefinition<ExtraTurnGrantedEvent> = {
  kind: "extraTurnGranted",
  privateTo: () => null,
  redact: redactSource,
};
