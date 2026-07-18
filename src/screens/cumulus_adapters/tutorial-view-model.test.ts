import { describe, expect, it } from "vitest";
import { buildTutorialView } from "./tutorial-view-model";

describe("buildTutorialView", () => {
  it("builds a quest-independent opposing Day phase with full decks and empty hands", () => {
    const tutorial = buildTutorialView({
      runId: "event:7",
      currentActionIndex: 0,
      actions: [
        {
          id: "greeting",
          action: "display-speech-bubble",
          text: "A custom greeting.",
          wait: 1.5,
        },
      ],
    });
    const view = tutorial.battle;

    expect(tutorial.dialogue).toEqual({
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: "A custom greeting.",
    });
    expect(tutorial.playbackRunId).toBe("event:7");
    expect(tutorial.currentAction?.id).toBe("greeting");

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
