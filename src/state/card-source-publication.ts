import type { CardSourceDebugState } from "../types/journey";

export interface CardSourcePublication {
  ownerId: string | null;
  state: CardSourceDebugState;
}

/** Client-local ownership rule for the provenance overlay. */
export function updateCardSourcePublication(
  current: CardSourcePublication | null,
  state: CardSourceDebugState | null,
  ownerId?: string,
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
