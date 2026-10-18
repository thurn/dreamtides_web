// The D97 travel events (cases in ../d97-travel.ts).

import { dreamAnchorIdFromUnknown } from "../../../types/identifiers";
import { activateWaypoint, stepThroughDoor } from "../d97-travel";
import { d97Event, payloadOf } from "./spec";

const anchorPayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown });

export const TRAVEL_EVENTS = {
  D97_ACTIVATE_WAYPOINT: d97Event({ phase: "overworld", parse: anchorPayload, fold: activateWaypoint }),
  D97_STEP_THROUGH_DOOR: d97Event({ phase: "overworld", parse: anchorPayload, fold: stepThroughDoor }),
};
