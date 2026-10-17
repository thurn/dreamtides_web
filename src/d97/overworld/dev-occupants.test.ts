// Development occupants: every character anchor of the development dream has
// a catalog recipe, the guardian stands at incarnation scale with the boss
// badge, and anchors that are not characters have none.

import { describe, expect, it } from "vitest";
import { D97_CHARACTER_SPRITES } from "../../content/d97/characters";
import { compileDevMap } from "./dev-map";
import { devOccupants } from "./dev-occupants";

describe("devOccupants", () => {
  const map = compileDevMap();
  const occupants = devOccupants(map);
  const recipes = new Set(D97_CHARACTER_SPRITES.map((recipe) => recipe.id));

  it("occupies exactly the character anchors with catalog recipes", () => {
    for (const anchor of map.anchors) {
      const character = ["challenger", "guardian", "shop", "friendly", "townsfolk"].includes(anchor.kind);
      const occupant = occupants.get(anchor.id);
      expect(occupant !== undefined, anchor.kind).toBe(character);
      if (occupant !== undefined) expect(recipes.has(occupant.character)).toBe(true);
    }
    const guardian = map.anchors.find((anchor) => anchor.kind === "guardian");
    expect(guardian === undefined ? null : occupants.get(guardian.id)).toMatchObject({ scale: "incarnation", badge: "boss" });
  });
});
