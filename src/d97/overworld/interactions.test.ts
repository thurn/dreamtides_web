// Interaction contract: anchors block their tiles for movement unless hidden
// (a hidden anchor's tile is walkable and nothing to interact with); a click on
// an anchor walks to the nearest tile beside it. `resolveInteraction` answers
// every anchor kind with intents, a panel or a refusal (residents with and
// without a dialogue, beaten and unbeaten opponents, the door with its
// guardian standing or beaten, the waypoint, the shop, objects, chests and
// the building doors into and out of a room),
// and Fight refuses a deck below its minimum by opening the deck editor. Over
// synthetic content, every intent the resolver offers applies in the reducer
// and every refused travel or Fight would bounce there.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_COLLECTION } from "../../content/d97/collection";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { syntheticD97Content } from "../../rules/d97/d97-content.fixtures";
import { SYNTHETIC_CHARACTER, SYNTHETIC_DREAM_A, syntheticDreamAnchor } from "../../rules/d97/d97-dreams.fixtures";
import { isD97Overworld, type D97Encounter, type D97Run } from "../../rules/d97/d97-state";
import { genesisFoldState, type FoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event, GENESIS } from "../../rules/reducer-fixtures";
import { parseD97DialogueId, parseDreamAnchorId, type DreamAnchorId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import type { DreamAnchorKind } from "../map/definition";
import type { CompiledAnchor, WalkabilityGrid } from "../map/compiled";
import { isWalkable } from "../map/compiled";
import {
  anchorAt,
  movementGrid,
  pathBeside,
  resolveChallenge,
  resolveFight,
  resolveInteraction,
  resolveShopOpening,
  shownMovement,
  type InteractionContext,
  type InteractionResult,
} from "./interactions";
import type { OverworldOccupant, OverworldOccupants } from "./occupants";

const SHOP: CompiledAnchor = {
  id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000a1"),
  kind: "shop",
  at: [3, 1],
};
const GRID: WalkabilityGrid = { width: 5, height: 3, walkable: "111111111111111" };

describe("movementGrid", () => {
  it("blocks every anchor's tile", () => {
    const grid = movementGrid(GRID, [SHOP]);
    expect(isWalkable(grid, [3, 1])).toBe(false);
    expect(isWalkable(grid, [2, 1])).toBe(true);
  });
});

describe("shownMovement", () => {
  const OBJECT: CompiledAnchor = {
    id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000a2"),
    kind: "object",
    at: [1, 1],
  };

  it("opens a hidden anchor's tile and blocks it again once shown", () => {
    const hidden = shownMovement(GRID, [SHOP, OBJECT], new Set([OBJECT.id]));
    expect(isWalkable(hidden.grid, OBJECT.at)).toBe(true);
    expect(isWalkable(hidden.grid, SHOP.at)).toBe(false);
    expect(anchorAt(hidden.byTile, OBJECT.at)).toBeUndefined();
    expect(pathBeside(hidden.grid, [0, 1], SHOP.at)).toEqual([[0, 1], [1, 1], [2, 1]]);

    const shown = shownMovement(GRID, [SHOP, OBJECT], new Set());
    expect(isWalkable(shown.grid, OBJECT.at)).toBe(false);
    expect(anchorAt(shown.byTile, OBJECT.at)).toBe(OBJECT);
  });
});

describe("pathBeside", () => {
  it("walks to the nearest tile beside the anchor", () => {
    const grid = movementGrid(GRID, [SHOP]);
    const path = pathBeside(grid, [0, 1], SHOP.at);
    expect(path?.[path.length - 1]).toEqual([2, 1]);
    expect(path).toHaveLength(3);
    expect(pathBeside(grid, [2, 1], SHOP.at)).toEqual([[2, 1]]);
  });

  it("returns null when nothing beside the anchor is reachable", () => {
    const walled: WalkabilityGrid = { width: 5, height: 3, walkable: "110111101111011" };
    expect(pathBeside(movementGrid(walled, [SHOP]), [0, 1], SHOP.at)).toBeNull();
  });
});

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-interactions-avatar");
const { topology, rooms } = SYNTHETIC_DREAM_A;
const CHALLENGER = syntheticDreamAnchor(1, 6);
const RESIDENT = syntheticDreamAnchor(1, 8);
const DIALOGUE = parseD97DialogueId("d9792000-0000-4000-8000-0000000000c1");

beforeEach(() => {
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40 }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

function startedState(): FoldState {
  return reduceGameEvent(genesisFoldState(D97_GENESIS), event("D97_START_RUN", { avatarId: AVATAR }), ctx({ seq: 1, rng: eventRng(D97_GENESIS.seed, 1) })).state;
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function withRun(state: FoldState, run: D97Run): FoldState {
  const d97 = state.d97;
  if (d97 === undefined || !isD97Overworld(d97)) throw new Error("not on a D97 overworld");
  return { ...state, d97: { ...d97, run } };
}

/** `run` with an encounter recorded at `anchorId`. */
function withEncounter(run: D97Run, anchorId: DreamAnchorId, beaten: boolean): D97Run {
  const encounter = { anchorId, role: anchorId === topology.exitGuardianAnchorId ? "guardian" : "challenger", beaten, battles: 0 } as D97Encounter;
  return { ...run, encounters: { ...run.encounters, [anchorId]: encounter } };
}

/** `run` with its active deck one copy below the minimum. */
function withSmallDeck(run: D97Run): D97Run {
  let keep = D97_COLLECTION.minimumDeckSize - 1;
  const copies = run.collection.copies.map((copy) => {
    if (copy.zone !== "deck") return copy;
    if (keep > 0) {
      keep -= 1;
      return copy;
    }
    return { ...copy, zone: "reserve" as const };
  });
  return { ...run, collection: { ...run.collection, copies } };
}

function occupant(dialogue: boolean): OverworldOccupant {
  return { character: SYNTHETIC_CHARACTER, badge: null, scale: "standard", dialogue: dialogue ? DIALOGUE : null };
}

function context(run: D97Run, speaking: readonly DreamAnchorId[] = [], silent: readonly DreamAnchorId[] = []): InteractionContext {
  const occupants: OverworldOccupants = new Map([...speaking.map((id) => [id, occupant(true)] as const), ...silent.map((id) => [id, occupant(false)] as const)]);
  return { run, topology, rooms, occupants };
}

const anchor = (id: DreamAnchorId, kind: DreamAnchorKind): CompiledAnchor => ({ id, kind, at: [0, 0] });

/** The result without its log records, and the log events in order. */
function summary(result: InteractionResult) {
  const { logs, ...rest } = result;
  return { ...rest, logged: logs.map((log) => log.event) };
}

/** Whether every intent of `result` applies, in order, over `state`. */
function intentsApply(state: FoldState, result: InteractionResult): boolean {
  let current = state;
  return result.intents.every((intent, index) => {
    const seq = 10 + index;
    const applied = reduceGameEvent(current, event(intent.type, intent.payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
    current = applied.state;
    return applied.outcome === "applied";
  });
}

describe("resolveInteraction", () => {
  it.each(["friendly", "townsfolk"] as const)("talks to a %s with a dialogue, and refuses one without", (kind) => {
    const run = runOf(startedState());
    expect(summary(resolveInteraction(context(run, [RESIDENT]), anchor(RESIDENT, kind)))).toEqual({
      intents: [],
      open: { kind: "conversation", anchorId: RESIDENT },
      logged: ["d97_dialogue_opened"],
    });
    expect(summary(resolveInteraction(context(run, [], [RESIDENT]), anchor(RESIDENT, kind)))).toEqual({ intents: [], refusal: "silent", logged: [] });
  });

  it("lets a shopkeeper with a dialogue talk first, opens the dream's shop at once without one, and refuses another shop", () => {
    const state = startedState();
    const run = runOf(state);
    const shop = topology.shopAnchorId;
    expect(summary(resolveInteraction(context(run, [shop]), anchor(shop, "shop")))).toMatchObject({ open: { kind: "conversation", anchorId: shop } });
    const opened = resolveInteraction(context(run, [], [shop]), anchor(shop, "shop"));
    expect(summary(opened)).toEqual({ intents: [{ type: "D97_OPEN_SHOP", payload: { anchorId: shop } }], open: { kind: "shop", anchorId: shop }, logged: [] });
    expect(intentsApply(state, opened)).toBe(true);
    expect(resolveShopOpening(context(run), RESIDENT)).toMatchObject({ intents: [], refusal: "notTheShop" });
  });

  describe.each(["challenger", "guardian"] as const)("a %s", (kind) => {
    const id = kind === "guardian" ? topology.exitGuardianAnchorId : CHALLENGER;
    it.each([
      { dialogue: true, encounter: "none", expected: { intents: [], open: { kind: "conversation", anchorId: id }, logged: ["d97_battle_resident_routed", "d97_dialogue_opened"] } },
      { dialogue: true, encounter: "beaten", expected: { intents: [], open: { kind: "conversation", anchorId: id }, logged: ["d97_battle_resident_routed", "d97_dialogue_opened"] } },
      {
        dialogue: false,
        encounter: "none",
        expected: { intents: [{ type: "D97_PREVIEW_ENCOUNTER", payload: { anchorId: id } }], open: { kind: "preview", anchorId: id }, logged: ["d97_battle_resident_routed", "d97_encounter_opened"] },
      },
      { dialogue: false, encounter: "unbeaten", expected: { intents: [], open: { kind: "preview", anchorId: id }, logged: ["d97_battle_resident_routed", "d97_encounter_opened"] } },
      { dialogue: false, encounter: "beaten", expected: { intents: [], refusal: "beaten", logged: ["d97_battle_resident_routed"] } },
    ] as const)("with dialogue $dialogue and encounter $encounter", ({ dialogue, encounter, expected }) => {
      const started = runOf(startedState());
      const run = encounter === "none" ? started : withEncounter(started, id, encounter === "beaten");
      const result = resolveInteraction(dialogue ? context(run, [id]) : context(run, [], [id]), anchor(id, kind));
      expect(summary(result)).toEqual(expected);
      expect(result.logs[0]?.fields).toMatchObject({ anchorId: id, kind, route: dialogue ? "conversation" : encounter === "beaten" ? "none" : "preview" });
    });
  });

  it("refuses the exit door while its guardian stands, steps through once it is beaten, and finds no destination elsewhere", () => {
    const state = startedState();
    const run = runOf(state);
    const exit = anchor(topology.exitDoorAnchorId, "door");
    for (const standing of [run, withEncounter(run, topology.exitGuardianAnchorId, false)]) {
      const refused = resolveInteraction(context(standing), exit);
      expect(summary(refused)).toEqual({ intents: [], refusal: "guardianStanding", logged: ["d97_door_unopened"] });
      expect(refused.logs[0]?.fields).toMatchObject({ anchorId: exit.id, reason: "guardianStanding" });
      const bounced = reduceGameEvent(withRun(state, standing), event("D97_STEP_THROUGH_DOOR", { anchorId: exit.id }), ctx({ seq: 2 }));
      expect(bounced.outcome).not.toBe("applied");
    }
    const beaten = withEncounter(run, topology.exitGuardianAnchorId, true);
    const stepped = resolveInteraction(context(beaten), exit);
    expect(summary(stepped)).toEqual({ intents: [{ type: "D97_STEP_THROUGH_DOOR", payload: { anchorId: exit.id } }], logged: [] });
    expect(intentsApply(withRun(state, beaten), stepped)).toBe(true);
    expect(resolveInteraction(context(beaten), anchor(topology.arrivalDoorAnchorId, "door"))).toMatchObject({ intents: [], refusal: "noDestination" });
  });

  it("activates the dream's waypoint and refuses any other", () => {
    const state = startedState();
    const run = runOf(state);
    const touched = resolveInteraction(context(run), anchor(topology.waypointAnchorId, "waypoint"));
    expect(summary(touched)).toEqual({ intents: [{ type: "D97_ACTIVATE_WAYPOINT", payload: { anchorId: topology.waypointAnchorId } }], logged: [] });
    expect(intentsApply(state, touched)).toBe(true);
    expect(resolveInteraction(context(run), anchor(RESIDENT, "waypoint"))).toMatchObject({ intents: [], refusal: "notTheWaypoint" });
  });

  it("steps into the room through its building door, out through the room's door, and refuses the door of the other map", () => {
    const state = startedState();
    const room = rooms[0];
    const outside = anchor(room.buildingDoorAnchorId, "buildingDoor");
    const inside = anchor(room.doorAnchorId, "buildingDoor");
    const entered = resolveInteraction(context(runOf(state)), outside);
    expect(summary(entered)).toEqual({ intents: [{ type: "D97_ENTER_ROOM", payload: { anchorId: outside.id } }], logged: [] });
    expect(intentsApply(state, entered)).toBe(true);
    expect(resolveInteraction(context(runOf(state)), inside)).toMatchObject({ intents: [], refusal: "notHere" });

    const inRoom = reduceGameEvent(state, event("D97_ENTER_ROOM", { anchorId: outside.id }), ctx({ seq: 2 })).state;
    const left = resolveInteraction(context(runOf(inRoom)), inside);
    expect(summary(left)).toEqual({ intents: [{ type: "D97_LEAVE_ROOM", payload: { anchorId: inside.id } }], logged: [] });
    expect(intentsApply(inRoom, left)).toBe(true);
    const refused = resolveInteraction(context(runOf(inRoom)), outside);
    expect(summary(refused)).toEqual({ intents: [], refusal: "notHere", logged: ["d97_door_unopened"] });
    expect(resolveInteraction(context(runOf(inRoom)), anchor(RESIDENT, "buildingDoor"))).toMatchObject({ intents: [], refusal: "noRoom" });
  });

  it("picks up an object and has nothing for a chest", () => {
    const run = runOf(startedState());
    expect(resolveInteraction(context(run), anchor(RESIDENT, "object")).intents).toEqual([{ type: "D97_PICK_UP_OBJECT", payload: { anchorId: RESIDENT } }]);
    expect(summary(resolveInteraction(context(run), anchor(RESIDENT, "chest")))).toEqual({ intents: [], refusal: "noInteraction", logged: [] });
  });
});

describe("resolveChallenge", () => {
  it("never reopens a beaten opponent", () => {
    const run = withEncounter(runOf(startedState()), CHALLENGER, true);
    expect(resolveChallenge(context(run, [CHALLENGER]), CHALLENGER)).toEqual({ intents: [], refusal: "beaten", logs: [] });
  });
});

describe("resolveFight", () => {
  it("begins the battle of a previewed, unbeaten encounter", () => {
    const run = withEncounter(runOf(startedState()), CHALLENGER, false);
    expect(summary(resolveFight(context(run), CHALLENGER))).toEqual({ intents: [{ type: "D97_BEGIN_BATTLE", payload: { anchorId: CHALLENGER } }], logged: [] });
  });

  it("opens the deck editor instead when the deck is too small, as the reducer refuses the battle", () => {
    const state = startedState();
    const run = withSmallDeck(withEncounter(runOf(state), CHALLENGER, false));
    expect(summary(resolveFight(context(run), CHALLENGER))).toEqual({
      intents: [],
      open: { kind: "deck" },
      refusal: "deckTooSmall",
      logged: ["d97_encounter_deck_too_small", "d97_deck_editor_opened"],
    });
    const bounced = reduceGameEvent(withRun(state, run), event("D97_BEGIN_BATTLE", { anchorId: CHALLENGER }), ctx({ seq: 2 }));
    expect(bounced.outcome).not.toBe("applied");
  });

  it("refuses a beaten or unpreviewed opponent", () => {
    const run = runOf(startedState());
    expect(resolveFight(context(run), CHALLENGER).refusal).toBe("notPreviewed");
    expect(resolveFight(context(withEncounter(run, CHALLENGER, true)), CHALLENGER).refusal).toBe("beaten");
  });
});
