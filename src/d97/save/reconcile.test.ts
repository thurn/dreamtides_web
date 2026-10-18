// Reconciliation over a synthetic save: a fully resolvable save is untouched;
// a retired card maps to its replacement everywhere it appears, its bag draws
// merged into the replacement's; an owned copy
// of a retired card without one is removed and compensated in Essence while
// its other references are dropped; an encounter or shop on a removed anchor
// moves to a free anchor of its kind, or is dropped; places on removed
// anchors are forgotten; a run whose dream was removed moves to the default
// dream, and a moved record prefers the run's own dream; a held quest whose
// definition was removed is abandoned; and anchors inside the dream's room
// reconcile as the dream's: a record moves into the room, the last place in
// the room follows its door, a removed room forgets the place, and a battle's
// return anchor off the place's map is dropped.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { D97SaveTuning } from "../../content/d97/save";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import type { D97Encounter, D97Run } from "../../rules/d97/d97-state";
import type { CardId } from "../../types/card-identity";
import { parseD97DreamId, parseD97QuestId, parseDreamAnchorId, type DreamAnchorId } from "../../types/identifiers";
import { reconcileSnapshot, type D97SaveAnchor, type D97SaveCatalog } from "./reconcile";
import { foldSyntheticRun, registerSaveContent, SAVE_DREAM, SAVE_ROOM } from "./save.fixtures";
import { takeSnapshot, type D97SaveBuild, type D97Snapshot } from "./snapshot";

const BUILD = { reducerVersion: "test", gitRevision: "unknown" } as D97SaveBuild;
const TUNING: D97SaveTuning = { retirements: [], retiredCardEssence: 7 };
const QUEST = parseD97QuestId("d97a0000-0000-4000-8000-000000000001");
const CHALLENGER: DreamAnchorId = parseDreamAnchorId("d9700000-0000-4000-8000-000000000006");
const SPARE_CHALLENGER: DreamAnchorId = parseDreamAnchorId("d9700000-0000-4000-8000-000000000007");
const REMOVED: DreamAnchorId = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000ff");
const OTHER_DREAM = parseD97DreamId("d97b0000-0000-4000-8000-000000000001");
const OTHER_CHALLENGER: DreamAnchorId = parseDreamAnchorId("d97b0000-0000-4000-8000-000000000006");

const ROOM_CHALLENGER: DreamAnchorId = parseDreamAnchorId("d9700001-0000-4000-8000-000000000106");
const MOVED_ROOM_DOOR: DreamAnchorId = parseDreamAnchorId("d9700001-0000-4000-8000-000000000109");

const ANCHORS: D97SaveAnchor[] = [
  { id: CHALLENGER, kind: "challenger", roomId: null },
  { id: SPARE_CHALLENGER, kind: "challenger", roomId: null },
  { id: SAVE_DREAM.topology.shopAnchorId, kind: "shop", roomId: null },
  { id: SAVE_DREAM.topology.waypointAnchorId, kind: "waypoint", roomId: null },
  { id: SAVE_ROOM.buildingDoorAnchorId, kind: "buildingDoor", roomId: null },
  { id: SAVE_ROOM.doorAnchorId, kind: "buildingDoor", roomId: SAVE_ROOM.id },
];

const ROOM_ANCHORS: D97SaveAnchor[] = [{ id: ROOM_CHALLENGER, kind: "challenger", roomId: SAVE_ROOM.id }];

function snapshot(edit: (run: D97Run) => D97Run = (run) => run): D97Snapshot {
  const { state, seq } = foldSyntheticRun();
  const base = takeSnapshot(state, seq, [], BUILD)!;
  const d97 = base.d97;
  if (d97.run === null) throw new Error("no D97 run");
  return { ...base, d97: { ...d97, run: edit(d97.run) } };
}

function catalog(retired: ReadonlySet<CardId> = new Set(), overrides: Partial<D97SaveCatalog> = {}): D97SaveCatalog {
  return {
    hasCard: (cardId) => !retired.has(cardId),
    dreams: [{ id: SAVE_DREAM.id, anchors: ANCHORS, rooms: SAVE_DREAM.rooms }],
    defaultDreamId: SAVE_DREAM.id,
    questIds: new Set([QUEST]),
    ...overrides,
  };
}

function encounter(anchorId: DreamAnchorId, cards: readonly CardId[]): D97Encounter {
  return { anchorId, role: "challenger", deck: cards, draftPool: cards, signatureCardIds: cards, opponentAnteCardId: cards[0] ?? null } as D97Encounter;
}

beforeEach(() => registerSaveContent());
afterEach(() => registerD97ContentProvider(null));

describe("reconcileSnapshot", () => {
  it("leaves a fully resolvable save untouched", () => {
    const save = snapshot();
    const result = reconcileSnapshot(save, catalog(), TUNING);
    expect(result.reconciliations).toEqual([]);
    expect(result.snapshot).toEqual(save);
  });

  it("maps a retired card to its replacement everywhere", () => {
    const save = snapshot();
    const run = save.d97.run!;
    const retired = run.collection.copies[0].cardId;
    const replacement = run.collection.copies.find((copy) => copy.cardId !== retired)!.cardId;
    const withEncounter = snapshot((edited) => ({ ...edited, encounters: { [CHALLENGER]: encounter(CHALLENGER, [retired]) } }));
    const result = reconcileSnapshot(withEncounter, catalog(new Set([retired])), { ...TUNING, retirements: [{ cardId: retired, replacementId: replacement }] });
    const next = result.snapshot.d97.run!;
    expect(next.collection.copies.some((copy) => copy.cardId === retired)).toBe(false);
    expect(next.collection.copies.length).toBe(run.collection.copies.length);
    expect(next.encounters[CHALLENGER]?.deck).toEqual([replacement]);
    expect(next.essence).toBe(run.essence);
    expect(result.reconciliations.every((entry) => entry.kind === "cardReplaced")).toBe(true);
    expect(result.reconciliations.length).toBeGreaterThan(0);
  });

  it("merges a replaced card's bag draws into its replacement's and drops a retired card's", () => {
    const save = snapshot();
    const run = save.d97.run!;
    const [retired, replacement, dropped] = run.collection.copies.map((copy) => copy.cardId);
    const avatarId = run.avatarId;
    const drawn = run.bags.drawn[avatarId]!;
    expect([drawn[retired], drawn[replacement], drawn[dropped]]).toEqual([1, 1, 1]);
    const result = reconcileSnapshot(save, catalog(new Set([retired, dropped])), { ...TUNING, retirements: [{ cardId: retired, replacementId: replacement }] });
    const next = result.snapshot.d97.run!.bags.drawn[avatarId]!;
    expect(next[replacement]).toBe(2);
    expect(next[retired]).toBeUndefined();
    expect(next[dropped]).toBeUndefined();
    expect(result.reconciliations).toContainEqual({ kind: "cardDropped", where: "bag", cardId: dropped });
  });

  it("compensates owned copies of a retired card without a replacement and drops its references", () => {
    const save = snapshot();
    const run = save.d97.run!;
    const retired = run.collection.copies[0].cardId;
    const owned = run.collection.copies.filter((copy) => copy.cardId === retired).length;
    const withEncounter = snapshot((edited) => ({ ...edited, encounters: { [CHALLENGER]: encounter(CHALLENGER, [retired]) } }));
    const result = reconcileSnapshot(withEncounter, catalog(new Set([retired])), TUNING);
    const next = result.snapshot.d97.run!;
    expect(next.collection.copies.length).toBe(run.collection.copies.length - owned);
    expect(next.essence).toBe(run.essence + owned * TUNING.retiredCardEssence);
    expect(next.encounters[CHALLENGER]).toMatchObject({ deck: [], opponentAnteCardId: null });
    expect(result.reconciliations.filter((entry) => entry.kind === "cardCompensated")).toHaveLength(owned);
    expect(result.reconciliations.some((entry) => entry.kind === "cardDropped")).toBe(true);
  });

  it("moves an encounter off a removed anchor to a free anchor of its kind, or drops it", () => {
    const save = snapshot((run) => ({ ...run, encounters: { [CHALLENGER]: encounter(CHALLENGER, []), [REMOVED]: encounter(REMOVED, []) } }));
    const moved = reconcileSnapshot(save, catalog(), TUNING);
    expect(moved.snapshot.d97.run!.encounters[SPARE_CHALLENGER]?.anchorId).toBe(SPARE_CHALLENGER);
    expect(moved.reconciliations).toEqual([{ kind: "anchorMoved", where: "encounter", anchorId: REMOVED, toAnchorId: SPARE_CHALLENGER }]);
    const full = reconcileSnapshot(save, catalog(new Set(), { dreams: [{ id: SAVE_DREAM.id, anchors: ANCHORS.filter((anchor) => anchor.id !== SPARE_CHALLENGER), rooms: SAVE_DREAM.rooms }] }), TUNING);
    expect(full.snapshot.d97.run!.encounters[REMOVED]).toBeUndefined();
    expect(full.reconciliations).toEqual([{ kind: "anchorDropped", where: "encounter", anchorId: REMOVED }]);
  });

  it("keeps records on any dream's anchors, and moves a removed one into the run's dream first", () => {
    const save = snapshot((run) => ({ ...run, encounters: { [OTHER_CHALLENGER]: encounter(OTHER_CHALLENGER, []), [REMOVED]: encounter(REMOVED, []) } }));
    // The other dream is listed first, yet the run's own dream takes the moved record.
    const otherAnchors: D97SaveAnchor[] = [
      { id: OTHER_CHALLENGER, kind: "challenger", roomId: null },
      { id: parseDreamAnchorId("d97b0000-0000-4000-8000-000000000007"), kind: "challenger", roomId: null },
    ];
    const dreams = [{ id: OTHER_DREAM, anchors: otherAnchors, rooms: [] }, { id: SAVE_DREAM.id, anchors: ANCHORS, rooms: SAVE_DREAM.rooms }];
    const result = reconcileSnapshot(save, catalog(new Set(), { dreams }), TUNING);
    expect(result.reconciliations).toEqual([{ kind: "anchorMoved", where: "encounter", anchorId: REMOVED, toAnchorId: CHALLENGER }]);
    expect(Object.keys(result.snapshot.d97.run!.encounters).sort()).toEqual([CHALLENGER, OTHER_CHALLENGER].sort());
  });

  it("moves a run whose dream was removed to the default dream", () => {
    const save = snapshot();
    const dreams = [{ id: OTHER_DREAM, anchors: ANCHORS, rooms: SAVE_DREAM.rooms }];
    const result = reconcileSnapshot(save, catalog(new Set(), { dreams, defaultDreamId: OTHER_DREAM }), TUNING);
    expect(result.snapshot.d97.run!.dreamId).toBe(OTHER_DREAM);
    expect(result.reconciliations).toEqual([{ kind: "dreamMoved", dreamId: SAVE_DREAM.id, toDreamId: OTHER_DREAM }]);
  });

  it("forgets places on removed anchors", () => {
    const save = snapshot((run) => ({ ...run, lastPlace: { kind: "door", anchorId: REMOVED, roomId: null }, returnAnchorId: REMOVED, activeWaypointIds: [REMOVED, SAVE_DREAM.topology.waypointAnchorId] }));
    const next = reconcileSnapshot(save, catalog(), TUNING).snapshot.d97.run!;
    expect(next.lastPlace).toBeNull();
    expect(next.returnAnchorId).toBeNull();
    expect(next.activeWaypointIds).toEqual([SAVE_DREAM.topology.waypointAnchorId]);
  });

  it("abandons a held quest whose definition was removed", () => {
    const save = snapshot((run) => ({ ...run, quests: { ...run.quests, active: { questId: QUEST, completedStepIds: [] } } }));
    const kept = reconcileSnapshot(save, catalog(), TUNING);
    expect(kept.snapshot.d97.run!.quests.active?.questId).toBe(QUEST);
    const removed = reconcileSnapshot(save, catalog(new Set(), { questIds: new Set() }), TUNING);
    expect(removed.snapshot.d97.run!.quests.active).toBeNull();
    expect(removed.reconciliations).toEqual([{ kind: "questAbandoned", questId: QUEST }]);
  });

  describe("anchors inside the dream's room", () => {
    const withRoom = (anchors: readonly D97SaveAnchor[], rooms = SAVE_DREAM.rooms) =>
      catalog(new Set(), { dreams: [{ id: SAVE_DREAM.id, anchors: [...ANCHORS, ...anchors], rooms }] });

    it("keeps the last place at the room's door, and a record on an anchor inside it", () => {
      const save = snapshot((run) => ({ ...run, encounters: { [ROOM_CHALLENGER]: encounter(ROOM_CHALLENGER, []) }, returnAnchorId: ROOM_CHALLENGER }));
      expect(save.d97.run!.lastPlace).toEqual({ kind: "door", anchorId: SAVE_ROOM.doorAnchorId, roomId: SAVE_ROOM.id });
      const result = reconcileSnapshot(save, withRoom(ROOM_ANCHORS), TUNING);
      expect(result.reconciliations).toEqual([]);
      expect(result.snapshot).toEqual(save);
    });

    it("moves a record off a removed anchor onto a free anchor of its kind inside the room", () => {
      const save = snapshot((run) => ({ ...run, encounters: { [CHALLENGER]: encounter(CHALLENGER, []), [SPARE_CHALLENGER]: encounter(SPARE_CHALLENGER, []), [REMOVED]: encounter(REMOVED, []) } }));
      const result = reconcileSnapshot(save, withRoom(ROOM_ANCHORS), TUNING);
      expect(result.reconciliations).toEqual([{ kind: "anchorMoved", where: "encounter", anchorId: REMOVED, toAnchorId: ROOM_CHALLENGER }]);
      expect(result.snapshot.d97.run!.encounters[ROOM_CHALLENGER]?.anchorId).toBe(ROOM_CHALLENGER);
    });

    it("moves the last place to the room's door when the door's anchor changed", () => {
      const rooms = [{ ...SAVE_ROOM, doorAnchorId: MOVED_ROOM_DOOR }];
      const anchors = [...ANCHORS.filter((anchor) => anchor.id !== SAVE_ROOM.doorAnchorId), { id: MOVED_ROOM_DOOR, kind: "buildingDoor" as const, roomId: SAVE_ROOM.id }];
      const result = reconcileSnapshot(snapshot(), catalog(new Set(), { dreams: [{ id: SAVE_DREAM.id, anchors, rooms }] }), TUNING);
      expect(result.snapshot.d97.run!.lastPlace).toEqual({ kind: "door", anchorId: MOVED_ROOM_DOOR, roomId: SAVE_ROOM.id });
      expect(result.reconciliations).toEqual([{ kind: "anchorMoved", where: "lastPlace", anchorId: SAVE_ROOM.doorAnchorId, toAnchorId: MOVED_ROOM_DOOR }]);
    });

    it("forgets the last place in a room the dream no longer has", () => {
      const result = reconcileSnapshot(snapshot(), withRoom([], []), TUNING);
      expect(result.snapshot.d97.run!.lastPlace).toBeNull();
      expect(result.reconciliations).toEqual([
        { kind: "roomRemoved", roomId: SAVE_ROOM.id },
        { kind: "anchorDropped", where: "lastPlace", anchorId: SAVE_ROOM.doorAnchorId },
      ]);
    });

    it("records the room a place's anchor stands in now", () => {
      const save = snapshot((run) => ({ ...run, lastPlace: { kind: "waypoint", anchorId: ROOM_CHALLENGER, roomId: null } }));
      const result = reconcileSnapshot(save, withRoom(ROOM_ANCHORS), TUNING);
      expect(result.snapshot.d97.run!.lastPlace).toEqual({ kind: "waypoint", anchorId: ROOM_CHALLENGER, roomId: SAVE_ROOM.id });
      expect(result.reconciliations).toEqual([{ kind: "placeRoomChanged", anchorId: ROOM_CHALLENGER, roomId: null, toRoomId: SAVE_ROOM.id }]);
    });

    it("drops a battle's return anchor that is not on the last place's map", () => {
      const save = snapshot((run) => ({ ...run, returnAnchorId: CHALLENGER }));
      const result = reconcileSnapshot(save, withRoom(ROOM_ANCHORS), TUNING);
      expect(result.snapshot.d97.run!.returnAnchorId).toBeNull();
      expect(result.reconciliations).toEqual([{ kind: "anchorDropped", where: "returnAnchor", anchorId: CHALLENGER }]);
    });
  });
});
