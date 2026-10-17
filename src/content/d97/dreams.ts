// Dreamtides 97 dream topology the rules read (Appendix B §B5, §B6): each
// dream's waypoint, the door the player arrives through, its exit door with
// the guardian anchor blocking it, and its shop. Keyed by anchor UUID; dream authoring
// beads add their dreams.

import { parseDreamAnchorId, parseDreamMapId, type DreamAnchorId, type DreamMapId } from "../../types/identifiers";

export interface D97DreamTopology {
  readonly mapId: DreamMapId;
  /** The dream's one waypoint. */
  readonly waypointAnchorId: DreamAnchorId;
  /** The door a new run arrives through. */
  readonly arrivalDoorAnchorId: DreamAnchorId;
  /** The exit door: stepping through it after its guardian falls ends the slice. */
  readonly exitDoorAnchorId: DreamAnchorId;
  /** The guardian anchor standing at the exit door's chokepoint. */
  readonly exitGuardianAnchorId: DreamAnchorId;
  /** The dream's one shop. */
  readonly shopAnchorId: DreamAnchorId;
}

const anchor = parseDreamAnchorId;

/** The development dream's topology. */
const DEVELOPMENT_DREAM: D97DreamTopology = {
  mapId: parseDreamMapId("d9700000-0000-4000-8000-000000000000"),
  waypointAnchorId: anchor("d9700000-0000-4000-8000-000000000003"),
  arrivalDoorAnchorId: anchor("d9700000-0000-4000-8000-000000000001"),
  exitDoorAnchorId: anchor("d9700000-0000-4000-8000-000000000002"),
  exitGuardianAnchorId: anchor("d9700000-0000-4000-8000-000000000004"),
  shopAnchorId: anchor("d9700000-0000-4000-8000-000000000005"),
};

/** The M1 slice's one dream. */
export const D97_SLICE_DREAM: D97DreamTopology = DEVELOPMENT_DREAM;
