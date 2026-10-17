// The D97 travel cases (Appendix B §B5, §B6, §B17): touching a waypoint and
// stepping through a door. Each records where a reload places the player.
// In the M1 slice the exit door is the only door that leads anywhere: once its
// guardian is beaten, stepping through it ends the slice. A dream is found by
// the touched anchor across every dream module (`d97DreamByAnchor`), so the
// rules agree with whichever dream the overworld plays.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import { d97DreamByAnchor } from "../../content/d97/dreams";
import { dreamAnchorIdFromUnknown } from "../../types/identifiers";
import type { D97Transition } from "./d97-run";
import type { D97State } from "./d97-state";

/**
 * `D97_ACTIVATE_WAYPOINT { anchorId }`: touch the dream's waypoint. The first
 * touch activates it; every touch makes it the reload place.
 */
export function activateWaypoint(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const dream = anchorId === null ? null : d97DreamByAnchor(anchorId);
  if (run === null || d97.screen.type !== "overworld" || dream === null || anchorId !== dream.topology.waypointAnchorId) return null;
  const firstActivation = !run.activeWaypointIds.includes(anchorId);
  return {
    d97: {
      ...d97,
      run: {
        ...run,
        activeWaypointIds: firstActivation ? [...run.activeWaypointIds, anchorId] : run.activeWaypointIds,
        lastPlace: { kind: "waypoint", anchorId },
        returnAnchorId: null,
      },
    },
    logRecords: [
      {
        event: "d97_waypoint_activated",
        fields: { runId: run.runId, anchorId, mapId: dream.mapId, firstActivation },
      },
    ],
  };
}

/**
 * `D97_STEP_THROUGH_DOOR { anchorId }`: step through the exit door once its
 * guardian is beaten, which opens the slice-end screen.
 */
export function stepThroughDoor(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const dream = anchorId === null ? null : d97DreamByAnchor(anchorId);
  if (run === null || d97.screen.type !== "overworld" || dream === null || anchorId !== dream.topology.exitDoorAnchorId) return null;
  const guardian = run.encounters[dream.topology.exitGuardianAnchorId];
  if (guardian?.beaten !== true) return null;
  return {
    d97: {
      screen: { type: "sliceEnd" },
      run: { ...run, lastPlace: { kind: "door", anchorId }, returnAnchorId: null },
    },
    logRecords: [
      {
        event: "d97_door_stepped_through",
        fields: {
          runId: run.runId,
          anchorId,
          mapId: dream.mapId,
          guardianAnchorId: dream.topology.exitGuardianAnchorId,
          destination: "sliceEnd",
          battlesFought: run.battlesFought,
          essence: run.essence,
          collectionSize: run.collection.copies.length,
        },
      },
    ],
  };
}
