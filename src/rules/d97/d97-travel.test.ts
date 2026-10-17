// The D97 travel contract over synthetic content: touching the waypoint
// activates it once, logs every touch and makes it the reload place; the
// exit door bounces while its guardian is unbeaten and, once it falls, opens
// the slice end and becomes the reload place; other anchors bounce.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_SLICE_DREAM } from "../../content/d97/dreams";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import type { D97Encounter, D97Run } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-travel-avatar");

function apply(state: FoldState, type: string, payload: Record<string, unknown>, seq: number) {
  return reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function started(): FoldState {
  return apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }, 1).state;
}

/** `state` with the exit guardian's encounter recorded as beaten or not. */
function withGuardian(state: FoldState, beaten: boolean): FoldState {
  const run = runOf(state);
  const anchorId = D97_SLICE_DREAM.exitGuardianAnchorId;
  const encounter = { anchorId, role: "guardian", beaten } as D97Encounter;
  return { ...state, d97: { ...state.d97!, run: { ...run, encounters: { ...run.encounters, [anchorId]: encounter } } } };
}

beforeEach(() => {
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40 }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("D97_ACTIVATE_WAYPOINT", () => {
  it("activates the waypoint once and makes every touch the reload place", () => {
    const state = started();
    expect(runOf(state).activeWaypointIds).toEqual([]);
    expect(runOf(state).lastPlace).toBeNull();
    const anchorId = D97_SLICE_DREAM.waypointAnchorId;
    const first = apply({ ...state, d97: { ...state.d97!, run: { ...runOf(state), returnAnchorId: D97_SLICE_DREAM.exitGuardianAnchorId } } }, "D97_ACTIVATE_WAYPOINT", { anchorId }, 2);
    expect(first.outcome).toBe("applied");
    expect(runOf(first.state).activeWaypointIds).toEqual([anchorId]);
    expect(runOf(first.state).lastPlace).toEqual({ kind: "waypoint", anchorId });
    expect(runOf(first.state).returnAnchorId).toBeNull();
    const activated = first.logRecords?.find((record) => record.event === "d97_waypoint_activated");
    expect(activated?.fields).toMatchObject({ anchorId, firstActivation: true });

    const again = apply(first.state, "D97_ACTIVATE_WAYPOINT", { anchorId }, 3);
    expect(again.outcome).toBe("applied");
    expect(runOf(again.state).activeWaypointIds).toEqual([anchorId]);
    expect(again.logRecords?.find((record) => record.event === "d97_waypoint_activated")?.fields).toMatchObject({ firstActivation: false });
  });

  it("bounces for an anchor that is not the waypoint, and before a run", () => {
    expect(apply(started(), "D97_ACTIVATE_WAYPOINT", { anchorId: D97_SLICE_DREAM.exitDoorAnchorId }, 2).outcome).toBe("bounced");
    expect(apply(genesisFoldState(D97_GENESIS), "D97_ACTIVATE_WAYPOINT", { anchorId: D97_SLICE_DREAM.waypointAnchorId }, 1).outcome).toBe("bounced");
  });
});

describe("D97_STEP_THROUGH_DOOR", () => {
  const anchorId = D97_SLICE_DREAM.exitDoorAnchorId;

  it("bounces while the exit guardian is unseen or unbeaten", () => {
    expect(apply(started(), "D97_STEP_THROUGH_DOOR", { anchorId }, 2).outcome).toBe("bounced");
    expect(apply(withGuardian(started(), false), "D97_STEP_THROUGH_DOOR", { anchorId }, 2).outcome).toBe("bounced");
  });

  it("opens the slice end once the guardian falls, recording the door as the reload place", () => {
    const result = apply(withGuardian(started(), true), "D97_STEP_THROUGH_DOOR", { anchorId }, 2);
    expect(result.outcome).toBe("applied");
    expect(result.state.d97?.screen).toEqual({ type: "sliceEnd" });
    expect(runOf(result.state).lastPlace).toEqual({ kind: "door", anchorId });
    expect(result.logRecords).toContainEqual(expect.objectContaining({ event: "d97_door_stepped_through" }));
    expect(apply(result.state, "D97_STEP_THROUGH_DOOR", { anchorId }, 3).outcome).toBe("bounced");
    expect(apply(result.state, "D97_ACTIVATE_WAYPOINT", { anchorId: D97_SLICE_DREAM.waypointAnchorId }, 3).outcome).toBe("bounced");
  });

  it("bounces for the arrival door, which leads nowhere in the slice", () => {
    const state = withGuardian(started(), true);
    expect(apply(state, "D97_STEP_THROUGH_DOOR", { anchorId: D97_SLICE_DREAM.arrivalDoorAnchorId }, 2).outcome).toBe("bounced");
  });
});
