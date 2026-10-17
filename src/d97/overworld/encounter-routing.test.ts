// Battle resident routing: a challenger or guardian with a dialogue speaks
// first, beaten or not; one without opens its preview while unbeaten; a
// challenge opens the preview only for an unbeaten opponent; and the guardian
// chokepoint hands its guardian to the same routing.

import { describe, expect, it } from "vitest";
import type { CompiledAnchor, WalkabilityGrid } from "../map/compiled";
import { parseDreamAnchorId } from "../../types/identifiers";
import { blockingGuardian } from "./chokepoint";
import { routeBattleResident, routeChallenge } from "./encounter-routing";
import { movementGrid } from "./interactions";

describe("routeBattleResident", () => {
  it("opens the conversation of a resident with a dialogue", () => {
    expect(routeBattleResident({ hasDialogue: true, beaten: false })).toBe("conversation");
  });

  it("opens the preview of an unbeaten resident without a dialogue", () => {
    expect(routeBattleResident({ hasDialogue: false, beaten: false })).toBe("preview");
  });

  it("lets a beaten resident with a dialogue speak", () => {
    expect(routeBattleResident({ hasDialogue: true, beaten: true })).toBe("conversation");
  });

  it("opens nothing for a beaten resident without a dialogue", () => {
    expect(routeBattleResident({ hasDialogue: false, beaten: true })).toBe("none");
  });
});

describe("routeChallenge", () => {
  it("opens the preview of an unbeaten opponent", () => {
    expect(routeChallenge({ beaten: false })).toBe("preview");
  });

  it("never reopens a beaten opponent's fight", () => {
    expect(routeChallenge({ beaten: true })).toBe("none");
  });
});

describe("the chokepoint", () => {
  // A wall with a one-tile gap at (3, 2), where the guardian stands; its door
  // is at (6, 2).
  const rows = ["#######", "...#...", ".......", "...#...", "#######"];
  const grid: WalkabilityGrid = {
    width: rows[0].length,
    height: rows.length,
    walkable: rows.map((row) => row.replace(/\./g, "1").replace(/#/g, "0")).join(""),
  };
  const door: CompiledAnchor = { id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000d1"), kind: "door", at: [6, 2] };
  const guardian: CompiledAnchor = {
    id: parseDreamAnchorId("d9700000-0000-4000-8000-0000000000d2"),
    kind: "guardian",
    at: [3, 2],
    blocksDoor: door.id,
  };

  it("walks to the guardian, which then routes as an interaction would", () => {
    const found = blockingGuardian(movementGrid(grid, [guardian, door]), [guardian], [0, 2], { tile: door.at, beside: true });
    expect(found?.guardian.id).toBe(guardian.id);
    expect(routeBattleResident({ hasDialogue: true, beaten: false })).toBe("conversation");
    expect(routeBattleResident({ hasDialogue: false, beaten: false })).toBe("preview");
  });
});
