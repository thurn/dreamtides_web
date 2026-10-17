// The overworld's waypoint and door interactions: touching the waypoint
// activates it (every touch is an intent, the first lights it), and the exit
// door steps through once its guardian is beaten. A door that leads nowhere
// yet, or whose guardian still stands, only logs the touch. Also derives what
// the canvas draws for them: door veils, lit waypoints, and where the player
// arrives.

import { useEffect, useMemo, useRef, useState } from "react";
import type { D97DreamTopology } from "../../../content/d97/dreams/schema";
import type { CompiledAnchor } from "../../../d97/map/compiled";
import type { VeilVariant } from "../../../d97/overworld/dream-veil";
import type { InteractionRegistry } from "../../../d97/overworld/interactions";
import { arrivalFor, type OverworldArrival } from "../../../d97/overworld/spawn";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { GameActions } from "../../../session/actions";
import type { DreamAnchorId } from "../../../types/identifiers";
import { buildD97DoorVeils } from "./d97-overworld-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 travel intent failed", error);
}

export function useD97Travel(args: {
  readonly run: D97Run;
  readonly dream: D97DreamTopology;
  readonly registry: InteractionRegistry;
  readonly actions: GameActions;
  /** Whether the overworld opened straight from a battle (not on a reload). */
  readonly returningFromBattle: boolean;
}): {
  readonly arrival: OverworldArrival | null;
  readonly veils: ReadonlyMap<DreamAnchorId, VeilVariant>;
  readonly activeWaypointIds: ReadonlySet<DreamAnchorId>;
} {
  const { run, dream, registry, actions, returningFromBattle } = args;
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const touchWaypoint = (anchor: CompiledAnchor) => {
      if (anchor.id !== dream.waypointAnchorId) return;
      void actions.d97ActivateWaypoint(anchor.id).catch(reportFailure);
    };
    const touchDoor = (anchor: CompiledAnchor) => {
      const current = runRef.current;
      const exit = anchor.id === dream.exitDoorAnchorId;
      const guardianBeaten = current.encounters[dream.exitGuardianAnchorId]?.beaten === true;
      if (!exit || !guardianBeaten) {
        logEvent("d97_door_unopened", { runId: current.runId, anchorId: anchor.id, reason: exit ? "guardianStanding" : "noDestination" });
        return;
      }
      void actions.d97StepThroughDoor(anchor.id).catch(reportFailure);
    };
    const removals = [registry.register("waypoint", touchWaypoint), registry.register("door", touchDoor)];
    return () => removals.forEach((remove) => remove());
  }, [actions, dream, registry]);

  // Where the player stands is presentation once placed: the arrival is read
  // when the overworld opens (after a battle or a reload), not on every event.
  // A run that has not travelled yet arrives through its dream's arrival door.
  const [arrival] = useState((): OverworldArrival => arrivalFor(run, returningFromBattle) ?? { kind: "entry", anchorId: dream.arrivalDoorAnchorId });
  const veils = useMemo(() => buildD97DoorVeils(dream), [dream]);
  const activeWaypointIds = useMemo(() => new Set(run.activeWaypointIds), [run.activeWaypointIds]);
  return { arrival, veils, activeWaypointIds };
}
