// Who stands at a dream's character anchors, as the overworld draws them:
// a character look, an optional head-icon badge, a scale role and the
// dialogue they speak, assembled from a dream module's residents
// (./dream-occupants.ts).

import type { D97CharacterId, D97DialogueId, DreamAnchorId } from "../../types/identifiers";
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
