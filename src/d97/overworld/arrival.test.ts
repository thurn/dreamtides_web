// Arrival placement (Appendix B §B17): returning from a battle places the
// player beside the opponent; any other open, a reload included, uses the
// last door's entry or the last waypoint, or names no place before either.

import { describe, expect, it } from "vitest";
import { parseDreamAnchorId } from "../../types/identifiers";
import { arrivalFor } from "./spawn";

const OPPONENT = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000c1");
const DOOR = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000c2");
const WAYPOINT = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000c3");

describe("arrivalFor", () => {
  it("places the player beside the opponent only when returning from the battle", () => {
    const run = { returnAnchorId: OPPONENT, lastPlace: { kind: "door" as const, anchorId: DOOR } };
    expect(arrivalFor(run, true)).toEqual({ kind: "beside", anchorId: OPPONENT });
    expect(arrivalFor(run, false)).toEqual({ kind: "entry", anchorId: DOOR });
  });

  it("uses the last waypoint on a reload, and names no place before any door or waypoint", () => {
    expect(arrivalFor({ returnAnchorId: OPPONENT, lastPlace: { kind: "waypoint", anchorId: WAYPOINT } }, false)).toEqual({ kind: "beside", anchorId: WAYPOINT });
    expect(arrivalFor({ returnAnchorId: OPPONENT, lastPlace: null }, false)).toBeNull();
  });
});
