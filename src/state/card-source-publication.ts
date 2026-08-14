import type { CardSourceDebugState } from "../types/journey";
import type { PublicationId } from "../types/identifiers";

export interface CardSourcePublication {
  ownerId: PublicationId | null;
  state: CardSourceDebugState;
}

/** Client-local ownership rule for the provenance overlay. */
export function updateCardSourcePublication(
  current: CardSourcePublication | null,
  state: CardSourceDebugState | null,
  ownerId?: PublicationId,
): CardSourcePublication | null {
  if (state !== null) {
    return { ownerId: ownerId ?? null, state };
  }
  if (
    (ownerId === undefined && current?.ownerId === null) ||
    current?.ownerId === ownerId
  ) {
    return null;
  }
  return current;
}
