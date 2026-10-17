// Who stands at a dream's character anchors, as the overworld draws them:
// a character look, an optional head-icon badge, a scale role and the
// dialogue they speak, assembled from a dream module's residents
// (./dream-occupants.ts).

import type { D97CharacterId, D97DialogueId, DreamAnchorId } from "../../types/identifiers";
import type { DreamAnchorKind } from "../map/definition";
import type { BadgeKind } from "./characters/badges";

export type OccupantScale = "standard" | "incarnation" | "apollyon";

export interface OverworldOccupant {
  readonly character: D97CharacterId;
  /** The badge the occupant's role shows; quest icons are derived over it. */
  readonly badge: BadgeKind | null;
  readonly scale: OccupantScale;
  /** A beaten opponent stays as an ordinary, slightly desaturated character. */
  readonly beaten?: true;
  /** The dialogue the occupant speaks, if any. */
  readonly dialogue: D97DialogueId | null;
}

export type OverworldOccupants = ReadonlyMap<DreamAnchorId, OverworldOccupant>;

/** Anchor kinds that exist only through the character standing at them. */
const RESIDENT_ANCHOR_KINDS: ReadonlySet<DreamAnchorKind> = new Set(["friendly", "townsfolk", "challenger", "guardian"]);

/**
 * The anchors present in the world: every anchor except a friendly,
 * townsperson, challenger or guardian anchor nobody stands at, which is empty
 * ground (a dream's assembly may leave such anchors open). Doors, waypoints,
 * shops, chests and objects are always present.
 */
export function presentAnchors<A extends { readonly id: DreamAnchorId; readonly kind: DreamAnchorKind }>(
  anchors: readonly A[],
  occupants: OverworldOccupants,
): A[] {
  return anchors.filter((anchor) => !RESIDENT_ANCHOR_KINDS.has(anchor.kind) || occupants.has(anchor.id));
}
