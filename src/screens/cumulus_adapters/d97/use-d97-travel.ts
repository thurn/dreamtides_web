// What the overworld canvas draws for the dream's doors and waypoints: door
// veils, lit waypoints, and where the player arrives. Touching a waypoint or
// a door is an interaction (../../../d97/overworld/interactions.ts).

import { useMemo, useState } from "react";
import type { D97DreamTopology } from "../../../content/d97/dreams/schema";
import type { VeilVariant } from "../../../d97/overworld/dream-veil";
import { runArrival, type OverworldArrival } from "../../../d97/overworld/spawn";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { DreamAnchorId, DreamMapId } from "../../../types/identifiers";
import { buildD97DoorVeils } from "./d97-overworld-view-model";

export function useD97Travel(args: {
  readonly run: D97Run;
  readonly dream: D97DreamTopology;
  /** The map played: the dream's own, or one of its rooms (decision P19). */
  readonly mapId: DreamMapId;
  /** Whether the overworld opened straight from a battle (not on a reload). */
  readonly returningFromBattle: boolean;
}): {
  readonly arrival: OverworldArrival | null;
  readonly veils: ReadonlyMap<DreamAnchorId, VeilVariant>;
  readonly activeWaypointIds: ReadonlySet<DreamAnchorId>;
} {
  const { run, dream, mapId, returningFromBattle } = args;
  // Where the player stands is presentation once placed: the arrival is read
  // when the overworld opens (after a battle or a reload) and when it shows
  // another map (through a building door, at the door's entry), not on every
  // event. A run that has not travelled yet arrives through its dream's
  // arrival door.
  const place = (): OverworldArrival => runArrival(run, returningFromBattle, dream.arrivalDoorAnchorId);
  const [placed, setPlaced] = useState(() => ({ mapId, arrival: place() }));
  if (placed.mapId !== mapId) setPlaced({ mapId, arrival: place() });
  const arrival = placed.mapId === mapId ? placed.arrival : place();
  const veils = useMemo(() => buildD97DoorVeils(dream), [dream]);
  const activeWaypointIds = useMemo(() => new Set(run.activeWaypointIds), [run.activeWaypointIds]);
  return { arrival, veils, activeWaypointIds };
}
