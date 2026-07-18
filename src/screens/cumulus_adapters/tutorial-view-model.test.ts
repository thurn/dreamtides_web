import { describe, expect, it } from "vitest";
import { buildTutorialView } from "./tutorial-view-model";

describe("buildTutorialView", () => {
  it("builds an empty quest-independent battle on the opposing Day phase", () => {
    const view = buildTutorialView().battle;

    expect(view.battleId).toBe("tutorial-battle");
    expect(view.activeSide).toBe("enemy");
    expect(view.phase).toBe("day");
    expect(view.playerHand).toEqual([]);
    expect(view.enemyHand).toEqual([]);
    expect(view.enemyHandCardIds).toEqual([]);

    for (const side of [view.player, view.enemy]) {
      expect(side.deckCardIds).toEqual([]);
      expect(side.voidCards).toEqual([]);
      expect(side.backRank.every((slot) => slot.card === null)).toBe(true);
      expect(side.frontRank.every((slot) => slot.card === null)).toBe(true);
      expect(side.status).toEqual({
        dreamcaller: null,
        currentEnergy: 0,
        maxEnergy: 0,
        points: 0,
      });
    }
  });
});
