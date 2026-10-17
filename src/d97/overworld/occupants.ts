// Who stands at a dream's character anchors, as the overworld draws them:
// a character look, an optional head-icon badge and a scale role. Later
// beads derive occupants from the run (challengers, residents, guardians);
// the development dream uses development occupants.

import type { D97CharacterId, DreamAnchorId } from "../../types/identifiers";
import type { BadgeKind } from "./characters/badges";

export type OccupantScale = "standard" | "incarnation" | "apollyon";

export interface OverworldOccupant {
  readonly character: D97CharacterId;
  readonly badge: BadgeKind | null;
  readonly scale: OccupantScale;
}

export type OverworldOccupants = ReadonlyMap<DreamAnchorId, OverworldOccupant>;
