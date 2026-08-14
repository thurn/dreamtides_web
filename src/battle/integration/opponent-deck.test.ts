import { describe, expect, it } from "vitest";
import type {
  DreamAvatarContent,
  DreamsignTemplate,
} from "../../types/content";
import type { BattleRng } from "../random";
import {
  buildOpponentDreamsigns,
  opponentAbilityIsActive,
  opponentCarriesDreamsign,
  resolveRunLayerCount,
  selectOpponentDreamAvatar,
} from "./opponent-deck";
import { asDreamAvatarId, asDreamsignId } from "../../types/identifiers";

function dreamAvatar(id: string): DreamAvatarContent {
  return { id } as DreamAvatarContent;
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

  it("selects from eligible DreamAvatar UUIDs case-insensitively", () => {
    const first = dreamAvatar("00000000-0000-4000-8000-000000000001");
    const second = dreamAvatar("00000000-0000-4000-8000-000000000002");
    expect(
      selectOpponentDreamAvatar([first, second], null, fixedRng(0), [
        asDreamAvatarId(second.id.toUpperCase()),
      ]),
    ).toBe(second);
  });

  it("excludes the player's DreamAvatar when another candidate exists", () => {
    const first = dreamAvatar("00000000-0000-4000-8000-000000000001");
    const second = dreamAvatar("00000000-0000-4000-8000-000000000002");
    expect(
      selectOpponentDreamAvatar([first, second], first.id, fixedRng(0)),
    ).toBe(second);
  });

  it("selects one Dreamsign at the authored unlock layer", () => {
    const signs = [
      { id: asDreamsignId("00000000-0000-4000-8000-000000000003") },
      { id: asDreamsignId("00000000-0000-4000-8000-000000000004") },
    ] as DreamsignTemplate[];
    expect(buildOpponentDreamsigns(2, 3, signs, fixedRng(1))).toEqual([]);
    expect(buildOpponentDreamsigns(3, 3, signs, fixedRng(1))).toEqual([
      signs[1],
    ]);
  });
});
