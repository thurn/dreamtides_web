// Which anchors are present in the world: a character anchor (friendly,
// townsperson, challenger, guardian) exists only with an occupant; every
// other anchor kind is always present.

import { describe, expect, it } from "vitest";
import { parseD97CharacterId, parseDreamAnchorId } from "../../types/identifiers";
import type { DreamAnchorKind } from "../map/definition";
import { presentAnchors, type OverworldOccupant } from "./occupants";

const anchor = (n: number, kind: DreamAnchorKind) => ({ id: parseDreamAnchorId(`d9790000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`), kind });
const OCCUPANT: OverworldOccupant = { character: parseD97CharacterId("d9791000-0000-4000-8000-000000000001"), badge: null, scale: "standard", dialogue: null };

describe("presentAnchors", () => {
  it("drops character anchors nobody stands at and keeps every other anchor", () => {
    const kinds: DreamAnchorKind[] = ["friendly", "townsfolk", "challenger", "guardian", "door", "waypoint", "shop", "chest", "object"];
    const empty = kinds.map((kind, index) => anchor(index + 1, kind));
    expect(presentAnchors(empty, new Map()).map((entry) => entry.kind)).toEqual(["door", "waypoint", "shop", "chest", "object"]);
    const occupied = new Map(empty.slice(0, 4).map((entry) => [entry.id, OCCUPANT] as const));
    expect(presentAnchors(empty, occupied)).toEqual(empty);
  });
});
