import { describe, expect, it } from "vitest";
import type {
  AvatarContent,
  DreamsignTemplate,
} from "../../types/content";
import type { BattleRng } from "../random";
import {
  buildOpponentDreamsigns,
  opponentAbilityIsActive,
  opponentCarriesDreamsign,
  resolveRunLayerCount,
  selectOpponentAvatar,
} from "./opponent-deck";
import { testAvatarId, testDreamsignId } from "../../types/test-identities";

function avatar(idSeed: string): AvatarContent {
  return {
    id: testAvatarId(idSeed),
    name: "Fixture Avatar",
    title: "Fixture",
    renderedText: "Fixture ability.",
    imageNumber: "0001",
    startingEssence: 200,
  };
}

function fixedRng(index: number): BattleRng {
  return {
    nextFloat: () => 0,
    nextInt: (maxExclusive) => index % maxExclusive,
    shuffle: (values) => [...values],
  };
}

describe("opponent descriptor helpers", () => {
  it("uses authored layer thresholds for abilities and Dreamsigns", () => {
    expect(opponentAbilityIsActive(0, 1)).toBe(false);
    expect(opponentAbilityIsActive(1, 1)).toBe(true);
    expect(opponentCarriesDreamsign(2, 3)).toBe(false);
    expect(opponentCarriesDreamsign(3, 3)).toBe(true);
  });

  it("derives at least one effective run layer", () => {
    expect(resolveRunLayerCount([])).toBe(1);
    expect(resolveRunLayerCount([{}, {}, {}])).toBe(3);
  });

  it("selects from eligible Avatar UUIDs case-insensitively", () => {
    const first = avatar("00000000-0000-4000-8000-000000000001");
    const second = avatar("00000000-0000-4000-8000-000000000002");
    expect(
      selectOpponentAvatar([first, second], null, fixedRng(0), [
        testAvatarId(second.id.toUpperCase()),
      ]),
    ).toBe(second);
  });

  it("excludes the player's Avatar when another candidate exists", () => {
    const first = avatar("00000000-0000-4000-8000-000000000001");
    const second = avatar("00000000-0000-4000-8000-000000000002");
    expect(
      selectOpponentAvatar([first, second], first.id, fixedRng(0)),
    ).toBe(second);
  });

  it("selects one Dreamsign at the authored unlock layer", () => {
    const signs = [
      { id: testDreamsignId("00000000-0000-4000-8000-000000000003") },
      { id: testDreamsignId("00000000-0000-4000-8000-000000000004") },
    ] as DreamsignTemplate[];
    expect(buildOpponentDreamsigns(2, 3, signs, fixedRng(1))).toEqual([]);
    expect(buildOpponentDreamsigns(3, 3, signs, fixedRng(1))).toEqual([
      signs[1],
    ]);
  });
});
