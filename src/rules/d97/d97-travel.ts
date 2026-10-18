// The D97 travel cases (Appendix B §B5, §B6, §B17): touching a waypoint and
// stepping through a door. Each records where a reload places the player.
// In the M1 slice the exit door is the only door that leads anywhere: once its
// guardian is beaten, stepping through it ends the slice. The touched anchor
// is resolved in the run's own dream (`runDreamAnchor`), so another dream's
// waypoint or door bounces. Both stand on the dream's own map, so neither
// opens while the player is inside one of its rooms (./d97-rooms.ts).
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type { D97DreamDefinition, D97DreamTopology } from "../../content/d97/dreams/schema";
import type { DreamAnchorId } from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import { runDreamAnchor } from "./d97-dreams";
import type { D97Transition } from "./d97-run";
import { d97RunRoomId, type D97Run } from "./d97-state";
import type { D97RunInput } from "./events/spec";

/** A travel case's payload: the anchor touched. */
type AnchorPayload = { readonly anchorId: DreamAnchorId };

/** The run, the payload's anchor and the run's dream declaring it, on the dream's own map; or null. */
function travelContext(
  { run }: D97RunInput,
  { anchorId }: AnchorPayload,
): { readonly run: D97Run; readonly anchorId: DreamAnchorId; readonly dream: D97DreamDefinition } | null {
  const content = d97ContentProvider();
  if (content === null || d97RunRoomId(run) !== null) return null;
  const dream = runDreamAnchor(run, content, anchorId);
  return dream === null ? null : { run, anchorId, dream: dream.definition };
}

/** Why touching `anchorId` activates no waypoint in a dream of `topology`, or null when it does. */
export function waypointRefusal(topology: D97DreamTopology, anchorId: DreamAnchorId): "notTheWaypoint" | null {
  return anchorId === topology.waypointAnchorId ? null : "notTheWaypoint";
}

/**
 * Why stepping through the door at `anchorId` in a dream of `topology` goes
 * nowhere for `run`, or null when it opens: only the exit door leads
 * anywhere, and only once its guardian is beaten.
 */
export function doorRefusal(
  run: D97Run,
  topology: D97DreamTopology,
  anchorId: DreamAnchorId,
): "noDestination" | "guardianStanding" | null {
  if (anchorId !== topology.exitDoorAnchorId) return "noDestination";
  return run.encounters[topology.exitGuardianAnchorId]?.beaten === true ? null : "guardianStanding";
}

/**
 * `D97_ACTIVATE_WAYPOINT { anchorId }`: touch the dream's waypoint. The first
 * touch activates it; every touch makes it the reload place.
 */
export function activateWaypoint(input: D97RunInput, payload: AnchorPayload): D97Transition | null {
  const context = travelContext(input, payload);
  if (context === null || waypointRefusal(context.dream.topology, context.anchorId) !== null) return null;
  const { run, anchorId, dream } = context;
  const firstActivation = !run.activeWaypointIds.includes(anchorId);
  return {
    d97: {
      ...input.d97,
      run: {
        ...run,
        activeWaypointIds: firstActivation ? [...run.activeWaypointIds, anchorId] : run.activeWaypointIds,
        lastPlace: { kind: "waypoint", anchorId, roomId: null },
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
  if (context === null || doorRefusal(context.run, context.dream.topology, context.anchorId) !== null) return null;
  const { run, anchorId, dream } = context;
  return {
    d97: {
      screen: { type: "sliceEnd" },
      run: { ...run, lastPlace: { kind: "door", anchorId, roomId: null }, returnAnchorId: null },
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
