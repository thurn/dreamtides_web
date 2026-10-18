// Act assembly over a synthetic catalog (./assembly.fixtures.ts): the act is a
// pure function of the run seed; every assembled act passes the chokepoint
// rule and links each dream's town door toward the entry dream; quests bind
// to their dreams' anchors; empty challenger anchors take generic challengers
// from their dream's personas; a seed whose first salt fails assembles on a
// later one and records the failures; a catalog no salt assembles fails with
// every salt's findings; and a start dream outside the catalog or a short
// catalog plays as its one-dream act.

import { describe, expect, it } from "vitest";
import { assembleAct, type D97ActAssembly } from "./assemble";
import {
  catalogAnchor,
  catalogDream,
  DECK_SOURCES,
  EXIT_DOOR,
  GUARDIAN,
  runSeed,
  startDream,
  SYNTHETIC_ACT_CATALOG,
  SYNTHETIC_ACT_DREAMS,
  SYNTHETIC_ACT_SHAPE,
  TOWN_DOOR,
} from "./assembly.fixtures";
import type { D97Act, D97ActCatalog, D97ActCatalogDream, D97ActShape } from "./types";
import { actRoutes, fewestGuardiansRoute, townDoorOf, validateAct } from "./validate";
import type { D97DreamId } from "../../types/identifiers";

const START = SYNTHETIC_ACT_DREAMS[0];
const SEEDS = Array.from({ length: 24 }, (_, n) => runSeed(n));

function assemble(seed = runSeed(0), catalog: D97ActCatalog = SYNTHETIC_ACT_CATALOG, shape: D97ActShape = SYNTHETIC_ACT_SHAPE): D97ActAssembly {
  return assembleAct({ runSeed: seed, number: 1, start: startDream(START), catalog, shape });
}

function assembled(seed = runSeed(0)): D97Act {
  const result = assemble(seed);
  if (!result.ok) throw new Error("the synthetic catalog did not assemble");
  return result.act;
}

const DREAMS = new Map<D97DreamId, D97ActCatalogDream>(SYNTHETIC_ACT_DREAMS.map((entry) => [entry.dream.id, entry]));

describe("assembleAct", () => {
  it("assembles the same act from the same run seed, and different acts across seeds", () => {
    expect(assemble(runSeed(3))).toEqual(assemble(runSeed(3)));
    const acts = SEEDS.map((seed) => JSON.stringify(assembled(seed)));
    expect(new Set(acts).size).toBeGreaterThan(1);
  });

  it("draws the start dream first, no tileset twice, within the act's shape", () => {
    for (const seed of SEEDS) {
      const act = assembled(seed);
      expect(act.entryDreamId).toBe(START.dream.id);
      expect(act.dreamIds[0]).toBe(START.dream.id);
      const drawn = act.dreamIds.map((dreamId) => DREAMS.get(dreamId)!);
      expect(new Set(drawn.map((entry) => entry.dream.tilesetId)).size).toBe(drawn.length);
      expect(new Set(SYNTHETIC_ACT_DREAMS.filter((entry) => act.dreamIds.includes(entry.dream.id)).map((entry) => entry.category)).size).toBeGreaterThanOrEqual(3);
      const challengers = drawn.reduce((sum, entry) => sum + entry.anchors.filter((anchor) => anchor.kind === "challenger").length, 0);
      expect(challengers).toBeGreaterThanOrEqual(12);
      expect(challengers).toBeLessThanOrEqual(14);
    }
  });

  it("keeps the chokepoint rule: every route to the incarnation passes g Avatar guardians, and only the exit door leaves", () => {
    for (const seed of SEEDS) {
      const act = assembled(seed);
      expect(validateAct(act, DREAMS, SYNTHETIC_ACT_SHAPE)).toEqual([]);
      expect(act.incarnationDreamId).not.toBe(act.entryDreamId);
      expect(fewestGuardiansRoute(actRoutes(act, DREAMS), act.incarnationDreamId)!.count).toBeGreaterThanOrEqual(2);
      const incarnation = act.guardians.filter((seat) => seat.seat === "incarnation");
      expect(incarnation).toEqual([expect.objectContaining({ dreamId: act.incarnationDreamId })]);
      expect(act.exitDoor).toEqual({ dreamId: act.incarnationDreamId, anchorId: catalogAnchor(SYNTHETIC_ACT_DREAMS.findIndex((entry) => entry.dream.id === act.incarnationDreamId) + 1, EXIT_DOOR) });
      const ends = act.doors.flatMap((door) => [door.from, door.to]);
      expect(ends).not.toContainEqual(act.exitDoor);
    }
  });

  it("links every dream but the entry dream into the tree through its town door, toward the entry dream", () => {
    for (const seed of SEEDS) {
      const act = assembled(seed);
      const tree = act.doors.filter((door) => door.kind === "tree");
      expect(tree).toHaveLength(act.dreamIds.length - 1);
      const reached = new Set([act.entryDreamId]);
      for (const door of tree) {
        // Each tree door leads from a dream already joined to the entry dream into the next dream's town door.
        expect(reached.has(door.from.dreamId)).toBe(true);
        expect(door.to.anchorId).toBe(townDoorOf(DREAMS.get(door.to.dreamId)!.dream));
        reached.add(door.to.dreamId);
      }
      expect([...reached].sort()).toEqual([...act.dreamIds].sort());
      const entryTown = catalogAnchor(1, TOWN_DOOR);
      expect(act.doors.flatMap((door) => [door.from, door.to])).not.toContainEqual({ dreamId: act.entryDreamId, anchorId: entryTown });
    }
  });

  it("binds each act dream's quests to its own anchors, and no other dream's", () => {
    const act = assembled();
    expect(act.quests.map((quest) => quest.questId)).toEqual(act.dreamIds.flatMap((dreamId) => DREAMS.get(dreamId)!.dream.quests.map((quest) => quest.questId)));
    for (const quest of act.quests) {
      const dream = act.dreamIds.find((dreamId) => DREAMS.get(dreamId)!.dream.quests.some((listed) => listed.questId === quest.questId))!;
      const listed = DREAMS.get(dream)!.dream.quests.find((candidate) => candidate.questId === quest.questId)!;
      expect(quest.roles).toEqual(
        listed.roles.map((role) => ({ role: role.role, stepId: role.role === "step" ? role.stepId : null, dreamId: dream, anchorId: role.anchorId })),
      );
    }
  });

  it("keeps authored challengers and fills empty challenger anchors from the dream's personas", () => {
    const act = assembled();
    for (const dreamId of act.dreamIds) {
      const { dream, anchors } = DREAMS.get(dreamId)!;
      const seats = act.challengers.filter((seat) => seat.dreamId === dreamId);
      expect(seats.map((seat) => seat.anchorId)).toEqual(anchors.filter((anchor) => anchor.kind === "challenger").map((anchor) => anchor.id));
      const generic = seats.flatMap((seat) => (seat.occupant.kind === "generic" ? [seat.occupant] : []));
      expect(seats.filter((seat) => seat.occupant.kind === "resident").map((seat) => seat.anchorId)).toEqual(
        dream.residents.filter((resident) => resident.role === "challenger").map((resident) => resident.anchorId),
      );
      expect(generic).toHaveLength(2);
      // Two personas, two empty anchors: each persona once.
      expect(new Set(generic.map((occupant) => occupant.characterId))).toEqual(new Set(dream.personas.map((persona) => persona.characterId)));
      for (const occupant of generic) expect(DECK_SOURCES).toContain(occupant.deckSourceAvatarId);
    }
  });

  it("retries a seed whose first salt fails with the next salt, recording each failure", () => {
    const retried = SEEDS.map((seed) => assemble(seed)).find((result) => result.ok && result.failures.length > 0);
    expect(retried?.ok).toBe(true);
    if (retried?.ok !== true) return;
    expect(retried.failures.map((failure) => failure.salt)).toEqual(retried.failures.map((_, index) => index));
    expect(retried.act.salt).toBe(retried.failures.length);
    for (const failure of retried.failures) expect(failure.findings.length).toBeGreaterThan(0);
  });

  it("fails with every salt's findings when no salt assembles the act", () => {
    // Two non-incarnation guardians cannot make every route pass three.
    const result = assemble(runSeed(0), { ...SYNTHETIC_ACT_CATALOG, dreams: SYNTHETIC_ACT_DREAMS.slice(0, 4) }, { ...SYNTHETIC_ACT_SHAPE, chokepointGuardians: 3, retryLimit: 5 });
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.salt)).toEqual([0, 1, 2, 3, 4]);
    for (const failure of result.failures) expect(failure.findings.map((finding) => finding.code)).toContain("chokepoint");
  });

  it("plays a start dream outside the catalog, or a catalog short of the act, as its one-dream act", () => {
    const outside = assembleAct({ runSeed: runSeed(0), number: 1, start: startDream(START), catalog: { ...SYNTHETIC_ACT_CATALOG, dreams: SYNTHETIC_ACT_DREAMS.slice(1) }, shape: SYNTHETIC_ACT_SHAPE });
    expect(outside.ok && outside.act.fallback).toBe("startOutsideCatalog");
    const short = assemble(runSeed(0), { ...SYNTHETIC_ACT_CATALOG, dreams: [START] });
    expect(short.ok).toBe(true);
    if (!short.ok) return;
    expect(short.shortfall).toBe("dreams");
    const { act } = short;
    expect(act).toMatchObject({ fallback: "shortCatalog", salt: 0, entryDreamId: START.dream.id, incarnationDreamId: START.dream.id, dreamIds: [START.dream.id], doors: [] });
    expect(act.exitDoor).toEqual({ dreamId: START.dream.id, anchorId: START.dream.topology.exitDoorAnchorId });
    expect(act.guardians).toEqual([{ dreamId: START.dream.id, anchorId: catalogAnchor(1, GUARDIAN), seat: "incarnation", authored: false }]);
    const monoCategory = SYNTHETIC_ACT_DREAMS.map((entry, index) => catalogDream(index + 1, { category: "nature", tileset: entry === START ? 1 : index + 1 }));
    const sameCategory = assembleAct({ runSeed: runSeed(0), number: 1, start: startDream(monoCategory[0]), catalog: { ...SYNTHETIC_ACT_CATALOG, dreams: monoCategory }, shape: SYNTHETIC_ACT_SHAPE });
    expect(sameCategory.ok && sameCategory.shortfall).toBe("categories");
  });
});
