// Arrival placement (Appendix B §B17): returning from a battle places the
// player beside the opponent; any other open, a reload included, uses the
// last door's entry or the last waypoint, or names no place before either. A
// reload inside a room (decision P19) opens the room at its door's entry, and
// a reload after leaving opens the dream's map at the building door's entry.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { d97RunRoomId } from "../../rules/d97/d97-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event } from "../../rules/reducer-fixtures";
import type { FoldState } from "../../rules/fold-state";
import { parseDreamAnchorId } from "../../types/identifiers";
import { D97_SAVE_MIGRATIONS } from "../save/migrations";
import { foldSyntheticRun, registerSaveContent, SAVE_GENESIS, SAVE_ROOM } from "../save/save.fixtures";
import { decodeSnapshot, encodeSnapshot, snapshotFoldState, takeSnapshot, type D97SaveBuild } from "../save/snapshot";
import { compiledFromRows, ROW_ANCHORS } from "../map/map-fixtures";
import { arrivalFor, arrivalPlacement, runArrival } from "./spawn";

const OPPONENT = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000c1");
const DOOR = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000c2");
const WAYPOINT = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000c3");
const BUILD = { reducerVersion: "test", gitRevision: "unknown" } as D97SaveBuild;

describe("arrivalFor", () => {
  it("places the player beside the opponent only when returning from the battle", () => {
    const run = { returnAnchorId: OPPONENT, lastPlace: { kind: "door" as const, anchorId: DOOR, roomId: null } };
    expect(arrivalFor(run, true)).toEqual({ kind: "beside", anchorId: OPPONENT });
    expect(arrivalFor(run, false)).toEqual({ kind: "entry", anchorId: DOOR });
  });

  it("uses the last waypoint on a reload, and names no place before any door or waypoint", () => {
    expect(arrivalFor({ returnAnchorId: OPPONENT, lastPlace: { kind: "waypoint", anchorId: WAYPOINT, roomId: null } }, false)).toEqual({ kind: "beside", anchorId: WAYPOINT });
    expect(arrivalFor({ returnAnchorId: OPPONENT, lastPlace: null }, false)).toBeNull();
  });
});

describe("runArrival", () => {
  // Two doors: the map's first door at the west end, the dream's arrival
  // (town) door at the east end.
  const map = compiledFromRows(
    ["#########", "#.......#", "#.......#", "#########"],
    [
      { id: ROW_ANCHORS.doorA, kind: "door", at: [1, 1], entry: [1, 2] },
      { id: ROW_ANCHORS.doorB, kind: "door", at: [7, 1], entry: [7, 2] },
      { id: ROW_ANCHORS.waypoint, kind: "waypoint", at: [4, 1] },
    ],
  );

  it("brings a new run in at its dream's arrival door, not the map's first door", () => {
    const arrival = runArrival({ returnAnchorId: null, lastPlace: null }, false, ROW_ANCHORS.doorB);
    expect(arrival).toEqual({ kind: "entry", anchorId: ROW_ANCHORS.doorB });
    expect(arrivalPlacement(map, map.anchors, map, arrival).tile).toEqual([7, 2]);
  });

  it("keeps the last place a run's state names", () => {
    const run = { returnAnchorId: null, lastPlace: { kind: "waypoint" as const, anchorId: ROW_ANCHORS.waypoint, roomId: null } };
    expect(runArrival(run, false, ROW_ANCHORS.doorB)).toEqual({ kind: "beside", anchorId: ROW_ANCHORS.waypoint });
  });
});

describe("a reload around a room", () => {
  beforeEach(() => registerSaveContent());
  afterEach(() => registerD97ContentProvider(null));

  /** `state` saved and reopened, as a reload does. */
  function reload(state: FoldState, seq: number): FoldState {
    const decoded = decodeSnapshot(encodeSnapshot(takeSnapshot(state, seq, [], BUILD)!), D97_SAVE_MIGRATIONS);
    return snapshotFoldState(SAVE_GENESIS, decoded!.snapshot);
  }

  it("opens the room at its door's entry while inside, and the dream's map at the building door's entry after leaving", () => {
    // The synthetic run ends inside its dream's room.
    const { state, seq } = foldSyntheticRun();
    const inside = reload(state, seq).d97!.run!;
    expect(d97RunRoomId(inside)).toBe(SAVE_ROOM.id);
    expect(arrivalFor(inside, false)).toEqual({ kind: "entry", anchorId: SAVE_ROOM.doorAnchorId });

    const left = reduceGameEvent(state, event("D97_LEAVE_ROOM", { anchorId: SAVE_ROOM.doorAnchorId }), ctx({ seq: seq + 1 }));
    expect(left.outcome).toBe("applied");
    const outside = reload(left.state, seq + 1).d97!.run!;
    expect(d97RunRoomId(outside)).toBeNull();
    expect(arrivalFor(outside, false)).toEqual({ kind: "entry", anchorId: SAVE_ROOM.buildingDoorAnchorId });
  });
});
