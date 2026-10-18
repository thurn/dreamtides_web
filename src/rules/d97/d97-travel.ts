// The D97 travel cases (Appendix B §B5, §B6, §B17): touching a waypoint and
// stepping through a door. Each records where a reload places the player.
// In the M1 slice the exit door is the only door that leads anywhere: once its
// guardian is beaten, stepping through it ends the slice. The touched anchor
// is resolved in the run's own dream (`runDreamAnchor`), so another dream's
// waypoint or door bounces.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import type { DreamAnchorId } from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import { runDreamAnchor } from "./d97-dreams";
import type { D97Transition } from "./d97-run";
import type { D97Run } from "./d97-state";
import type { D97RunInput } from "./events/spec";

/** A travel case's payload: the anchor touched. */
type AnchorPayload = { readonly anchorId: DreamAnchorId };

/** The run, the payload's anchor and the run's dream declaring it; or null. */
function travelContext(
  { run }: D97RunInput,
  { anchorId }: AnchorPayload,
): { readonly run: D97Run; readonly anchorId: DreamAnchorId; readonly dream: D97DreamDefinition } | null {
  const content = d97ContentProvider();
  if (content === null) return null;
  const dream = runDreamAnchor(run, content, anchorId);
  return dream === null ? null : { run, anchorId, dream: dream.definition };
}

/**
 * `D97_ACTIVATE_WAYPOINT { anchorId }`: touch the dream's waypoint. The first
 * touch activates it; every touch makes it the reload place.
 */
export function activateWaypoint(input: D97RunInput, payload: AnchorPayload): D97Transition | null {
  const context = travelContext(input, payload);
  if (context === null || context.anchorId !== context.dream.topology.waypointAnchorId) return null;
  const { run, anchorId, dream } = context;
  const firstActivation = !run.activeWaypointIds.includes(anchorId);
  return {
    d97: {
      ...input.d97,
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
export function stepThroughDoor(input: D97RunInput, payload: AnchorPayload): D97Transition | null {
  const context = travelContext(input, payload);
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
