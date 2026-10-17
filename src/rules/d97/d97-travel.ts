// The D97 travel cases (Appendix B §B5, §B6, §B17): touching a waypoint and
// stepping through a door. Each records where a reload places the player.
// In the M1 slice the exit door is the only door that leads anywhere: once its
// guardian is beaten, stepping through it ends the slice. The touched anchor
// is resolved in the run's own dream (`runDreamAnchor`), so another dream's
// waypoint or door bounces.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import { dreamAnchorIdFromUnknown, type DreamAnchorId } from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import { runDreamAnchor } from "./d97-dreams";
import type { D97Transition } from "./d97-run";
import type { D97Run, D97State } from "./d97-state";

/** The run, the payload's anchor and the run's dream declaring it, on the overworld; or null. */
function travelContext(
  d97: D97State,
  payload: Record<string, unknown>,
): { readonly run: D97Run; readonly anchorId: DreamAnchorId; readonly dream: D97DreamDefinition } | null {
  const run = d97.run;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const content = d97ContentProvider();
  if (run === null || content === null || anchorId === null || d97.screen.type !== "overworld") return null;
  const dream = runDreamAnchor(run, content, anchorId);
  return dream === null ? null : { run, anchorId, dream: dream.definition };
}

/**
 * `D97_ACTIVATE_WAYPOINT { anchorId }`: touch the dream's waypoint. The first
 * touch activates it; every touch makes it the reload place.
 */
export function activateWaypoint(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const context = travelContext(d97, payload);
  if (context === null || context.anchorId !== context.dream.topology.waypointAnchorId) return null;
  const { run, anchorId, dream } = context;
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
  const context = travelContext(d97, payload);
  if (context === null || context.anchorId !== context.dream.topology.exitDoorAnchorId) return null;
  const { run, anchorId, dream } = context;
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
