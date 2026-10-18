// The act validator over an assembled synthetic act: the act is clean, and
// each break of the chokepoint rule or of anchor capacity is reported — a
// loop door around the chokepoint guardians, a door through the exit door, a
// tree door into a dream elsewhere than its town door, a lost incarnation, an
// unreachable dream and a quest bound outside the act.

import { describe, expect, it } from "vitest";
import type { D97DreamId } from "../../types/identifiers";
import { assembleAct } from "./assemble";
import { catalogAnchor, FREE_DOOR, runSeed, startDream, SYNTHETIC_ACT_CATALOG, SYNTHETIC_ACT_DREAMS, SYNTHETIC_ACT_SHAPE } from "./assembly.fixtures";
import type { D97Act } from "./types";
import { validateAct, type D97ActDreamAnchors } from "./validate";

const DREAMS = new Map<D97DreamId, D97ActDreamAnchors>(SYNTHETIC_ACT_DREAMS.map((entry) => [entry.dream.id, entry]));
const indexOf = (dreamId: D97DreamId) => SYNTHETIC_ACT_DREAMS.findIndex((entry) => entry.dream.id === dreamId) + 1;

/** A clean three-dream act whose tree runs entry → middle → incarnation dream. */
function chain(): D97Act {
  for (let n = 0; n < 64; n += 1) {
    const result = assembleAct({ runSeed: runSeed(n), number: 1, start: startDream(SYNTHETIC_ACT_DREAMS[0]), catalog: SYNTHETIC_ACT_CATALOG, shape: SYNTHETIC_ACT_SHAPE });
    if (result.ok && result.act.doors.length === 2 && result.act.doors.every((door) => door.kind === "tree")) return result.act;
  }
  throw new Error("no chain act");
}

const codes = (act: D97Act) => validateAct(act, DREAMS, SYNTHETIC_ACT_SHAPE).map((finding) => finding.code);

describe("validateAct", () => {
  it("finds nothing in an assembled act", () => {
    expect(codes(chain())).toEqual([]);
  });

  it("reports a loop door that lets a route around the chokepoint guardians", () => {
    const act = chain();
    const loop = {
      kind: "loop" as const,
      from: { dreamId: act.entryDreamId, anchorId: catalogAnchor(indexOf(act.entryDreamId), FREE_DOOR) },
      to: { dreamId: act.incarnationDreamId, anchorId: catalogAnchor(indexOf(act.incarnationDreamId), FREE_DOOR) },
    };
    expect(codes({ ...act, doors: [...act.doors, loop] })).toEqual(["chokepoint"]);
  });

  it("reports a door through the exit door, and an exit door the incarnation does not block", () => {
    const act = chain();
    const through = { kind: "loop" as const, from: { dreamId: act.entryDreamId, anchorId: catalogAnchor(1, FREE_DOOR) }, to: act.exitDoor };
    expect(codes({ ...act, doors: [...act.doors, through] })).toContain("door-reused");
    const elsewhere = { dreamId: act.incarnationDreamId, anchorId: catalogAnchor(indexOf(act.incarnationDreamId), FREE_DOOR) };
    expect(codes({ ...act, exitDoor: elsewhere })).toContain("exit-door");
  });

  it("reports a tree door that does not arrive at its dream's town door", () => {
    const act = chain();
    const [first, ...rest] = act.doors;
    const wrong = { ...first, to: { ...first.to, anchorId: catalogAnchor(indexOf(first.to.dreamId), FREE_DOOR) } };
    expect(codes({ ...act, doors: [wrong, ...rest] })).toContain("town-door");
  });

  it("reports a lost incarnation and a dream no door reaches", () => {
    const act = chain();
    expect(codes({ ...act, guardians: act.guardians.filter((seat) => seat.seat !== "incarnation") })).toContain("incarnation");
    expect(codes({ ...act, doors: act.doors.slice(0, 1) })).toContain("unreachable-dream");
  });

  it("reports a quest bound to a dream outside the act", () => {
    const act = chain();
    const outside = SYNTHETIC_ACT_DREAMS.find((entry) => !act.dreamIds.includes(entry.dream.id))!;
    const [quest] = act.quests;
    const stray = { ...quest, roles: quest.roles.map((role) => ({ ...role, dreamId: outside.dream.id })) };
    expect(codes({ ...act, quests: [stray] })).toEqual(["quest-role"]);
  });
});
