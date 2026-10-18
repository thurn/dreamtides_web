// The D97 travel contract over synthetic content: touching the waypoint
// activates it once, logs every touch and makes it the reload place; the
// exit door bounces while its guardian is unbeaten and, once it falls, opens
// the slice end and becomes the reload place; other anchors bounce. The
// contract holds for a run in each registered synthetic dream, and each log
// names the run's dream's map.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import { SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B } from "./d97-dreams.fixtures";
import type { D97Encounter, D97Run } from "./d97-state";
import { withD97Run } from "./d97-state.fixtures";

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

let dreamId = SYNTHETIC_DREAM_A.id;

function started(): FoldState {
  return apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR, dreamId }, 1).state;
}

/** `state` with `dream`'s exit guardian's encounter recorded as beaten or not. */
function withGuardian(dream: D97DreamDefinition, state: FoldState, beaten: boolean): FoldState {
  const run = runOf(state);
  const anchorId = dream.topology.exitGuardianAnchorId;
  const encounter = { anchorId, role: "guardian", beaten } as D97Encounter;
  return withD97Run(state, { ...run, encounters: { ...run.encounters, [anchorId]: encounter } });
}

beforeEach(() => {
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40 }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe.each([SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B].map((dream) => [dream.id, dream] as const))("a run in dream %s", (_id, dream) => {
  const { topology } = dream;
  beforeEach(() => {
    dreamId = dream.id;
  });

  describe("D97_ACTIVATE_WAYPOINT", () => {
    it("activates the waypoint once and makes every touch the reload place", () => {
      // A waypoint not yet touched: the start dream's own is active from the start.
      const begun = started();
      const state = withD97Run(begun, { ...runOf(begun), activeWaypointIds: [] });
      expect(runOf(state).lastPlace).toBeNull();
      const anchorId = topology.waypointAnchorId;
      const first = apply(withD97Run(state, { ...runOf(state), returnAnchorId: topology.exitGuardianAnchorId }), "D97_ACTIVATE_WAYPOINT", { anchorId }, 2);
      expect(first.outcome).toBe("applied");
      expect(runOf(first.state).activeWaypointIds).toEqual([anchorId]);
      expect(runOf(first.state).lastPlace).toEqual({ kind: "waypoint", anchorId, roomId: null });
      expect(runOf(first.state).returnAnchorId).toBeNull();
      const activated = first.logRecords?.find((record) => record.event === "d97_waypoint_activated");
      expect(activated?.fields).toMatchObject({ anchorId, mapId: dream.mapId, firstActivation: true });

      const again = apply(first.state, "D97_ACTIVATE_WAYPOINT", { anchorId }, 3);
      expect(again.outcome).toBe("applied");
      expect(runOf(again.state).activeWaypointIds).toEqual([anchorId]);
      expect(again.logRecords?.find((record) => record.event === "d97_waypoint_activated")?.fields).toMatchObject({ firstActivation: false });
    });

    it("bounces for an anchor that is not the waypoint, and before a run", () => {
      expect(apply(started(), "D97_ACTIVATE_WAYPOINT", { anchorId: topology.exitDoorAnchorId }, 2).outcome).toBe("bounced");
      expect(apply(genesisFoldState(D97_GENESIS), "D97_ACTIVATE_WAYPOINT", { anchorId: topology.waypointAnchorId }, 1).outcome).toBe("bounced");
    });
  });

  describe("D97_STEP_THROUGH_DOOR", () => {
    const anchorId = topology.exitDoorAnchorId;

    it("bounces while the exit guardian is unseen or unbeaten", () => {
      expect(apply(started(), "D97_STEP_THROUGH_DOOR", { anchorId }, 2).outcome).toBe("bounced");
      expect(apply(withGuardian(dream, started(), false), "D97_STEP_THROUGH_DOOR", { anchorId }, 2).outcome).toBe("bounced");
    });

    it("opens the slice end once the guardian falls, recording the door as the reload place", () => {
      const result = apply(withGuardian(dream, started(), true), "D97_STEP_THROUGH_DOOR", { anchorId }, 2);
      expect(result.outcome).toBe("applied");
      expect(result.state.d97?.screen).toEqual({ type: "sliceEnd" });
      expect(runOf(result.state).lastPlace).toEqual({ kind: "door", anchorId, roomId: null });
      const stepped = result.logRecords?.find((record) => record.event === "d97_door_stepped_through");
      expect(stepped?.fields).toMatchObject({ mapId: dream.mapId, guardianAnchorId: topology.exitGuardianAnchorId });
      expect(apply(result.state, "D97_STEP_THROUGH_DOOR", { anchorId }, 3).outcome).toBe("bounced");
      expect(apply(result.state, "D97_ACTIVATE_WAYPOINT", { anchorId: topology.waypointAnchorId }, 3).outcome).toBe("bounced");
    });

    it("bounces for the arrival door, which leads nowhere in the slice", () => {
      const state = withGuardian(dream, started(), true);
      expect(apply(state, "D97_STEP_THROUGH_DOOR", { anchorId: topology.arrivalDoorAnchorId }, 2).outcome).toBe("bounced");
    });
  });
});
