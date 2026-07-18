import { describe, expect, it } from "vitest";
import { buildTutorialView } from "./tutorial-view-model";

describe("buildTutorialView", () => {
  it("builds a quest-independent opposing Day phase with full decks and empty hands", () => {
    const tutorial = buildTutorialView();
    const view = tutorial.battle;

    expect(tutorial.dialogue).toEqual({
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: "Welcome, Dreamer.",
    });
    expect(tutorial.dreamcaller).toEqual({
      visual: {
        imageNumber: "0029",
        name: "Tensho",
        title: "Daimyo of Lacquered Fury",
        portraitFocus: { x: 0.5, y: 0.22 },
      },
      profile: {
        id: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
        ability: "Dreamcaller ability is not active",
        unavailable: true,
      },
    });

    expect(view.battleId).toBe("tutorial-battle");
    expect(view.activeSide).toBe("enemy");
    expect(view.phase).toBe("day");
    expect(view.playerHand).toEqual([]);
    expect(view.enemyHand).toEqual([]);
    expect(view.enemyHandCardIds).toEqual([]);

    for (const side of [view.player, view.enemy]) {
      expect(side.deckCardIds).toHaveLength(30);
      expect(new Set(side.deckCardIds).size).toBe(30);
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

    expect(view.inspector.sides.player.zones.deck).toBe(30);
    expect(view.inspector.sides.enemy.zones.deck).toBe(30);
  });
});
