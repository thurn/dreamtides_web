// Avatar character sprites: every Avatar has exactly one recipe, drawn as
// itself, and recipe ids are unique across the character catalog.

import { describe, expect, it } from "vitest";
import { AVATARS } from "../../../avatars";
import { D97_CHARACTER_SPRITES } from "..";
import { AVATAR_CHARACTER_SPRITES } from ".";

describe("AVATAR_CHARACTER_SPRITES", () => {
  it("gives every Avatar exactly one recipe", () => {
    const drawn = AVATAR_CHARACTER_SPRITES.map((recipe) => recipe.avatarId);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(new Set(drawn)).toEqual(new Set(AVATARS.map((avatar) => avatar.id)));
  });

  it("keeps character ids unique across the catalog", () => {
    const ids = D97_CHARACTER_SPRITES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
