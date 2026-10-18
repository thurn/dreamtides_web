// The D97 room contract (decision P19) over synthetic content: stepping
// through a room's building door enters the room and makes the room's door
// the reload place, in that room; stepping through the room's door leaves it
// and makes the building door the reload place, on the dream's map. Each
// passage logs the run, dream, room, map and both doors by UUID. A passage
// bounces from the wrong map, through another dream's door, through a door no
// room has, outside the overworld (Avatar select, a D97 battle, the slice
// end), and the dream's waypoint and exit door bounce inside a room. A room's
// anchors are its dream's, on the room's map: a challenger inside the room
// previews and fights only from inside it, never from the dream's map or for
// a run in another dream, and the dream map's anchors (a challenger, the
// shop) bounce while the player is inside the room.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { parseBattleId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import type { D97BattleFoldState } from "../battle/fold";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import { runDreamAnchor } from "./d97-dreams";
import { SYNTHETIC_CHARACTER, SYNTHETIC_DECK_AVATAR, syntheticDream, syntheticRoomAnchor } from "./d97-dreams.fixtures";
import { roomPassage } from "./d97-rooms";
import { d97RunRoomId, type D97Encounter, type D97Run } from "./d97-state";
import { withD97Run } from "./d97-state.fixtures";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-rooms-avatar");

/** A challenger inside dream `index`'s room. */
function roomChallenger(index: number) {
  return {
    role: "challenger" as const,
    anchorId: syntheticRoomAnchor(index, 6),
    characterId: SYNTHETIC_CHARACTER,
    scale: "standard" as const,
    deck: { kind: "generic" as const, deckSourceAvatarId: SYNTHETIC_DECK_AVATAR },
  };
}

const DREAM_A = syntheticDream(1, [roomChallenger(1)]);
const DREAM_B = syntheticDream(2, [roomChallenger(2)]);
const ROOM_A = DREAM_A.rooms[0];
const ROOM_B = DREAM_B.rooms[0];

let seq = 0;

function apply(state: FoldState, type: string, payload: Record<string, unknown>) {
  seq += 1;
  return reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function applied(state: FoldState, type: string, payload: Record<string, unknown>): FoldState {
  const result = apply(state, type, payload);
  expect(result.outcome, type).toBe("applied");
  return result.state;
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function started(dream: D97DreamDefinition = DREAM_A): FoldState {
  return applied(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR, dreamId: dream.id });
}

function entered(): FoldState {
  return applied(started(), "D97_ENTER_ROOM", { anchorId: ROOM_A.buildingDoorAnchorId });
}

beforeEach(() => {
  seq = 0;
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40, dreams: [DREAM_A, DREAM_B] }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("D97_ENTER_ROOM", () => {
  it("enters the room, making its door the reload place in the room, and logs the passage by UUID", () => {
    const begun = started();
    expect(d97RunRoomId(runOf(begun))).toBeNull();
    const before = withD97Run(begun, { ...runOf(begun), returnAnchorId: DREAM_A.topology.exitGuardianAnchorId });
    const result = apply(before, "D97_ENTER_ROOM", { anchorId: ROOM_A.buildingDoorAnchorId });
    expect(result.outcome).toBe("applied");
    const run = runOf(result.state);
    expect(run.lastPlace).toEqual({ kind: "door", anchorId: ROOM_A.doorAnchorId, roomId: ROOM_A.id });
    expect(d97RunRoomId(run)).toBe(ROOM_A.id);
    expect(run.returnAnchorId).toBeNull();
    expect(result.logRecords).toEqual([
      {
        event: "d97_room_entered",
        fields: {
          runId: run.runId,
          dreamId: DREAM_A.id,
          roomId: ROOM_A.id,
          mapId: ROOM_A.mapId,
          buildingDoorAnchorId: ROOM_A.buildingDoorAnchorId,
          doorAnchorId: ROOM_A.doorAnchorId,
        },
      },
    ]);
  });

  it("bounces inside the room, through the room's own door, another dream's door, or an anchor no room has", () => {
    expect(apply(entered(), "D97_ENTER_ROOM", { anchorId: ROOM_A.buildingDoorAnchorId }).outcome).toBe("bounced");
    expect(apply(started(), "D97_ENTER_ROOM", { anchorId: ROOM_A.doorAnchorId }).outcome).toBe("bounced");
    expect(apply(started(), "D97_ENTER_ROOM", { anchorId: ROOM_B.buildingDoorAnchorId }).outcome).toBe("bounced");
    expect(apply(started(), "D97_ENTER_ROOM", { anchorId: DREAM_A.topology.exitDoorAnchorId }).outcome).toBe("bounced");
    expect(apply(started(), "D97_ENTER_ROOM", { anchorId: "the inn" }).outcome).toBe("bounced");
  });
});

describe("D97_LEAVE_ROOM", () => {
  it("leaves through the room's door, making the building door the reload place on the dream's map", () => {
    const result = apply(entered(), "D97_LEAVE_ROOM", { anchorId: ROOM_A.doorAnchorId });
    expect(result.outcome).toBe("applied");
    const run = runOf(result.state);
    expect(run.lastPlace).toEqual({ kind: "door", anchorId: ROOM_A.buildingDoorAnchorId, roomId: null });
    expect(d97RunRoomId(run)).toBeNull();
    expect(result.logRecords?.map((record) => record.event)).toEqual(["d97_room_left"]);
    expect(result.logRecords?.[0]?.fields).toMatchObject({ dreamId: DREAM_A.id, roomId: ROOM_A.id, mapId: DREAM_A.mapId });
    // Back outside, the room opens again.
    expect(apply(result.state, "D97_ENTER_ROOM", { anchorId: ROOM_A.buildingDoorAnchorId }).outcome).toBe("applied");
  });

  it("bounces on the dream's map, and through the building door from inside", () => {
    expect(apply(started(), "D97_LEAVE_ROOM", { anchorId: ROOM_A.doorAnchorId }).outcome).toBe("bounced");
    expect(apply(entered(), "D97_LEAVE_ROOM", { anchorId: ROOM_A.buildingDoorAnchorId }).outcome).toBe("bounced");
  });
});

describe("room passages outside the overworld", () => {
  /** `state` with a D97 battle running against the encounter at `anchorId`. */
  function inBattle(state: FoldState, anchorId = syntheticRoomAnchor(1, 6)): FoldState {
    const battle = {
      mode: { kind: "d97" },
      init: { battleId: parseBattleId("d97:rooms-test"), anchorId },
      engine: { init: {}, slice: { committed: { result: null } } },
    } as unknown as D97BattleFoldState;
    return { ...state, battle };
  }

  it("bounce on Avatar select, during a D97 battle and on the slice end", () => {
    const enter = { anchorId: ROOM_A.buildingDoorAnchorId };
    const leave = { anchorId: ROOM_A.doorAnchorId };
    expect(apply(genesisFoldState(D97_GENESIS), "D97_ENTER_ROOM", enter).outcome).toBe("bounced");
    expect(apply(inBattle(started()), "D97_ENTER_ROOM", enter).outcome).toBe("bounced");
    expect(apply(inBattle(entered()), "D97_LEAVE_ROOM", leave).outcome).toBe("bounced");
    const end = (state: FoldState): FoldState => ({ ...state, d97: { screen: { type: "sliceEnd" }, run: runOf(state) } });
    expect(apply(end(started()), "D97_ENTER_ROOM", enter).outcome).toBe("bounced");
    expect(apply(end(entered()), "D97_LEAVE_ROOM", leave).outcome).toBe("bounced");
  });
});

describe("the dream's travel anchors from inside a room", () => {
  it("bounce: the waypoint and the exit door stand on the dream's map", () => {
    const inRoom = entered();
    const exit = DREAM_A.topology.exitGuardianAnchorId;
    const beaten = withD97Run(inRoom, { ...runOf(inRoom), encounters: { [exit]: { anchorId: exit, role: "guardian", beaten: true } as D97Encounter } });
    expect(apply(inRoom, "D97_ACTIVATE_WAYPOINT", { anchorId: DREAM_A.topology.waypointAnchorId }).outcome).toBe("bounced");
    expect(apply(beaten, "D97_STEP_THROUGH_DOOR", { anchorId: DREAM_A.topology.exitDoorAnchorId }).outcome).toBe("bounced");
    const outside = applied(beaten, "D97_LEAVE_ROOM", { anchorId: ROOM_A.doorAnchorId });
    expect(apply(outside, "D97_STEP_THROUGH_DOOR", { anchorId: DREAM_A.topology.exitDoorAnchorId }).outcome).toBe("applied");
  });
});

describe("a room's anchors", () => {
  it("are the dream's, on the room's map: a challenger inside resolves and previews only from inside its room", () => {
    const content = d97ContentProvider()!;
    const inside = syntheticRoomAnchor(1, 6);
    expect(runDreamAnchor(runOf(entered()), content, inside)?.definition.id).toBe(DREAM_A.id);
    expect(runDreamAnchor(runOf(started()), content, inside)).toBeNull();
    expect(runDreamAnchor(runOf(started(DREAM_B)), content, inside)).toBeNull();
    const previewed = applied(entered(), "D97_PREVIEW_ENCOUNTER", { anchorId: inside });
    expect(runOf(previewed).encounters[inside]?.anchorId).toBe(inside);
    expect(apply(started(), "D97_PREVIEW_ENCOUNTER", { anchorId: inside }).outcome).toBe("bounced");
    expect(apply(started(DREAM_B), "D97_PREVIEW_ENCOUNTER", { anchorId: inside }).outcome).toBe("bounced");
  });

  it("bounce anchor intents across maps: a room's from the dream's map, the dream map's from inside the room", () => {
    const outsideChallenger = DREAM_A.residents.find((resident) => resident.role === "challenger")!.anchorId;
    const inside = syntheticRoomAnchor(1, 6);
    // A preview made inside the room cannot start its battle from outside, nor the reverse.
    const previewedInside = applied(entered(), "D97_PREVIEW_ENCOUNTER", { anchorId: inside });
    const leftAfterPreview = applied(previewedInside, "D97_LEAVE_ROOM", { anchorId: ROOM_A.doorAnchorId });
    expect(apply(leftAfterPreview, "D97_BEGIN_BATTLE", { anchorId: inside }).outcome).toBe("bounced");
    const previewedOutside = applied(started(), "D97_PREVIEW_ENCOUNTER", { anchorId: outsideChallenger });
    const enteredAfterPreview = applied(previewedOutside, "D97_ENTER_ROOM", { anchorId: ROOM_A.buildingDoorAnchorId });
    expect(apply(enteredAfterPreview, "D97_BEGIN_BATTLE", { anchorId: outsideChallenger }).outcome).toBe("bounced");
    expect(apply(entered(), "D97_PREVIEW_ENCOUNTER", { anchorId: outsideChallenger }).outcome).toBe("bounced");
    expect(apply(entered(), "D97_OPEN_SHOP", { anchorId: DREAM_A.topology.shopAnchorId }).outcome).toBe("bounced");
    expect(apply(started(), "D97_OPEN_SHOP", { anchorId: DREAM_A.topology.shopAnchorId }).outcome).toBe("applied");
  });
});

describe("roomPassage", () => {
  it("enters from the dream's map, leaves from the room, and tells a door of the other map from a door no room has", () => {
    const outside = runOf(started());
    const inside = runOf(entered());
    expect(roomPassage(outside, DREAM_A.rooms, ROOM_A.buildingDoorAnchorId)).toEqual({ kind: "enter", room: ROOM_A });
    expect(roomPassage(inside, DREAM_A.rooms, ROOM_A.doorAnchorId)).toEqual({ kind: "leave", room: ROOM_A });
    expect(roomPassage(outside, DREAM_A.rooms, ROOM_A.doorAnchorId)).toEqual({ kind: "refused", refusal: "notHere" });
    expect(roomPassage(inside, DREAM_A.rooms, ROOM_A.buildingDoorAnchorId)).toEqual({ kind: "refused", refusal: "notHere" });
    expect(roomPassage(outside, DREAM_A.rooms, DREAM_A.topology.exitDoorAnchorId)).toEqual({ kind: "refused", refusal: "noRoom" });
  });
});
