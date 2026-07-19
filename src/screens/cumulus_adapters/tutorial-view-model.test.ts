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
        {
          id: "dreamcaller-arrival",
          action: "animate-dreamcaller-portrait",
          owner: "player",
          pause: 1,
          wait: 0,
        },
        {
          id: "nightmare-call",
          action: "display-speech-bubble",
          text: "A second message.",
          wait: 3,
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
    expect(tutorial.dreamcallers.player).toMatchObject({
      visual: { imageNumber: "0029", name: "Tensho" },
      profile: {
        id: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
        unavailable: true,
      },
      settled: false,
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

  it("keeps Tensho settled after the portrait animation advances", () => {
    const tutorial = buildTutorialView({
      runId: "event:9",
      currentActionIndex: 2,
      actions: [
        {
          id: "welcome",
          action: "display-speech-bubble",
          text: "Welcome, Dreamer.",
          wait: 3,
        },
        {
          id: "dreamcaller-arrival",
          action: "animate-dreamcaller-portrait",
          owner: "player",
          pause: 1,
          wait: 0,
        },
        {
          id: "nightmare-call",
          action: "display-speech-bubble",
          text: "You are called to stand against Nightmare.",
          wait: 3,
        },
      ],
    });

    expect(tutorial.currentAction?.id).toBe("nightmare-call");
    expect(tutorial.dialogue?.text).toContain("Nightmare");
    expect(tutorial.dreamcallers.player.settled).toBe(true);
    expect(tutorial.dreamcallers.enemy).toMatchObject({
      visual: { imageNumber: "0087", name: "Vrakmoth" },
      profile: { id: "86026206-1B11-4F38-A24E-FD3C697F5353" },
      settled: false,
    });
  });

  it("settles Vrakmoth only after the opponent portrait action advances", () => {
    const actions = [
      {
        id: "dreamcaller-arrival",
        action: "animate-dreamcaller-portrait" as const,
        owner: "player" as const,
        pause: 1,
        wait: 0,
      },
      {
        id: "nightmare-call",
        action: "display-speech-bubble" as const,
        text: "You are called to stand against\nthe power of Nightmare.",
        wait: 3,
      },
      {
        id: "vrakmoth-arrival",
        action: "animate-dreamcaller-portrait" as const,
        owner: "enemy" as const,
        pause: 1,
        wait: 0,
      },
    ];

    const arriving = buildTutorialView({
      runId: "event:10",
      currentActionIndex: 2,
      actions,
    });
    expect(arriving.dreamcallers.player.settled).toBe(true);
    expect(arriving.dreamcallers.enemy.settled).toBe(false);
    expect(arriving.currentAction?.id).toBe("vrakmoth-arrival");

    const complete = buildTutorialView({
      runId: "event:10",
      currentActionIndex: null,
      actions,
    });
    expect(complete.dreamcallers.player.settled).toBe(true);
    expect(complete.dreamcallers.enemy.settled).toBe(true);
  });
});
