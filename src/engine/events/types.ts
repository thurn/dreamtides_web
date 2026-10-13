import type { BattleState } from "../state/types";
import type { InstanceId, Side } from "../state/ids";
import type { EngineEvent } from ".";

/** The opposing character that causes a challenge removal, captured before either lane participant leaves. */
export interface ChallengeRemovalCause {
  readonly controller: Side;
  readonly character: InstanceId;
  readonly characterCost: number;
}

/** A confirmed dissolve or banishment of a character opposing its cause immediately before departure. */
export type RemovalProvenance =
  | { readonly kind: "effect"; readonly controller: Side; readonly victimCost: number }
  | ({ readonly kind: "challenge"; readonly victimCost: number } & ChallengeRemovalCause);

/** Registry entry for one engine event kind. */
export interface EventDefinition<E extends EngineEvent> {
  readonly kind: E["kind"];
  /**
   * The only side allowed to see this event's details, or `null` when it is
   * public. Redacted views and logs read this.
   */
  privateTo(event: E, state: BattleState): Side | null;
  /**
   * The event as `viewer`, who may see it, sees it in `state`: a field
   * naming a card the viewer cannot identify there is `null`, as in the
   * view, and the whole event is `null` when the view omits what it
   * describes from the viewer. Absent for a kind every viewer who may see it
   * sees whole.
   */
  readonly redact?: (event: E, viewer: Side, state: BattleState) => E | null;
}

export function publicEvent<E extends EngineEvent>(
  kind: E["kind"],
): EventDefinition<E> {
  return { kind, privateTo: () => null };
}
