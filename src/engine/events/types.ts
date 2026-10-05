import type { BattleState } from "../state/types";
import type { Side } from "../state/ids";
import type { EngineEvent } from ".";

/** Registry entry for one engine event kind. */
export interface EventDefinition<E extends EngineEvent> {
  readonly kind: E["kind"];
  /**
   * The only side allowed to see this event's details, or `null` when it is
   * public. Redacted views and logs read this.
   */
  privateTo(event: E, state: BattleState): Side | null;
}

export function publicEvent<E extends EngineEvent>(
  kind: E["kind"],
): EventDefinition<E> {
  return { kind, privateTo: () => null };
}
