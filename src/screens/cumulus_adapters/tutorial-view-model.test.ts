import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import {
  buildTutorialView,
  TUTORIAL_OPPONENT_CARD_ID,
  tutorialActionLogDetails,
} from "./tutorial-view-model";

const OPPONENT_CARD: CardData = {
  id: asCardId(TUTORIAL_OPPONENT_CARD_ID),
  name: asCardName("Tutorial Opponent Card"),
  cardNumber: 519,
  cardType: "Character",
  subtype: "Musician",
  isStarter: false,
  rarity: "Special",
  energyCost: 2,
  spark: 2,
  isFast: false,
  renderedText: "",
  imageNumber: 1792373848,
  artOwned: false,
};

describe("buildTutorialView", () => {
  it("logs the selected speech portrait for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "enemy-taunt",
        action: "display-speech-bubble",
        speaker: "enemy",
        text: "For the Abyss!",
        wait: 3,
      }),
    ).toEqual({
      actionId: "enemy-taunt",
      action: "display-speech-bubble",
      speaker: "enemy",
      waitSeconds: 3,
    });
  });

  it("logs the face-down opponent draw path for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "vrakmoth-draw",
        action: "draw-opponent-card",
        wait: 0,
      }),
    ).toEqual({
      actionId: "vrakmoth-draw",
      action: "draw-opponent-card",
      waitSeconds: 0,
      cardFace: "down",
      sourceZone: "opponent-deck",
      destinationZone: "opponent-hand",
    });
  });

  it("logs the UUID, reading time, and destination of the opponent card play", () => {
    expect(
      tutorialActionLogDetails({
        id: "vrakmoth-reveal-and-play",
        action: "reveal-and-play-opponent-card",
        revealDuration: 2,
        wait: 0,
      }),
    ).toEqual({
      actionId: "vrakmoth-reveal-and-play",
      action: "reveal-and-play-opponent-card",
      waitSeconds: 0,
      cardId: TUTORIAL_OPPONENT_CARD_ID,
      cardFace: "up",
      revealDurationSeconds: 2,
      revealPlacement: "right-front-rank-intersection",
      sourceZone: "opponent-hand",
      destinationZone: "opponent-back-rank",
      destinationSlot: "center",
    });
  });

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
          duration: 0.6,
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
      kind: "guide",
      model: {
        portrait: { kind: "character-portrait", characterId: "mira" },
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "A custom greeting.",
      },
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
          duration: 0.6,
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
    expect(
      tutorial.dialogue?.kind === "guide" ? tutorial.dialogue.model.text : null,
    ).toContain("Nightmare");
    expect(tutorial.dreamcallers.player.settled).toBe(true);
    expect(tutorial.dreamcallers.enemy).toMatchObject({
      visual: { imageNumber: "0087", name: "Vrakmoth" },
      profile: { id: "86026206-1B11-4F38-A24E-FD3C697F5353" },
      settled: false,
    });
  });

  it("keeps the latest speech visible while a portrait action plays", () => {
    const actions = [
      {
        id: "welcome",
        action: "display-speech-bubble" as const,
        text: "Welcome, Dreamer.",
        wait: 3,
      },
      {
        id: "dreamcaller-arrival",
        action: "animate-dreamcaller-portrait" as const,
        owner: "player" as const,
        pause: 1,
        duration: 0.6,
        wait: 0,
      },
      {
        id: "nightmare-call",
        action: "display-speech-bubble" as const,
        text: "The next line.",
        wait: 3,
      },
    ];

    const overlapping = buildTutorialView({
      runId: "event:overlap",
      currentActionIndex: 1,
      actions,
    }).dialogue;
    const next = buildTutorialView({
      runId: "event:overlap",
      currentActionIndex: 2,
      actions,
    }).dialogue;

    expect(overlapping?.kind === "guide" ? overlapping.model.text : null).toBe(
      "Welcome, Dreamer.",
    );
    expect(next?.kind === "guide" ? next.model.text : null).toBe(
      "The next line.",
    );
  });

  it("attaches authored Dreamcaller speech to that side's battle portrait", () => {
    const tutorial = buildTutorialView({
      runId: "event:11",
      currentActionIndex: 1,
      actions: [
        {
          id: "vrakmoth-arrival",
          action: "animate-dreamcaller-portrait",
          owner: "enemy",
          pause: 1,
          duration: 0.6,
          wait: 0,
        },
        {
          id: "vrakmoth-taunt",
          action: "display-speech-bubble",
          speaker: "enemy",
          text: "For the Abyss!",
          wait: 3,
        },
      ],
    });

    expect(tutorial.dreamcallers.enemy.settled).toBe(true);
    expect(tutorial.dialogue).toEqual({
      kind: "dreamcaller",
      owner: "enemy",
      speakerName: "Vrakmoth",
      text: "For the Abyss!",
    });
  });

  it("keeps the current opponent draw in the deck, then reveals and plays that UUID-backed card", () => {
    const actions = [
      {
        id: "vrakmoth-taunt",
        action: "display-speech-bubble" as const,
        speaker: "enemy" as const,
        text: "For the Abyss!",
        wait: 3,
      },
      {
        id: "vrakmoth-draw",
        action: "draw-opponent-card" as const,
        wait: 0,
      },
      {
        id: "vrakmoth-reveal-and-play",
        action: "reveal-and-play-opponent-card" as const,
        revealDuration: 2,
        wait: 0,
      },
    ];

    const drawing = buildTutorialView({
      runId: "event:draw",
      currentActionIndex: 1,
      actions,
    }).battle;
    expect(drawing.enemy.deckCardIds[0]).toBe("tutorial-enemy-deck-1");
    expect(drawing.enemy.deckCardIds).toHaveLength(30);
    expect(drawing.enemyHandCardIds).toEqual([]);

    const drawn = buildTutorialView({
      runId: "event:draw",
      currentActionIndex: 2,
      actions,
    }, OPPONENT_CARD).battle;
    expect(drawn.enemy.deckCardIds[0]).toBe("tutorial-enemy-deck-2");
    expect(drawn.enemy.deckCardIds).toHaveLength(29);
    expect(drawn.enemyHandCardIds).toEqual(["tutorial-enemy-deck-1"]);
    expect(drawn.enemyHand).toHaveLength(1);
    expect(drawn.enemyHand[0]).toMatchObject({
      id: "tutorial-enemy-deck-1",
      layoutMotion: "snap",
      model: { cardId: TUTORIAL_OPPONENT_CARD_ID },
    });
    expect(drawn.inspector.sides.enemy.zones).toMatchObject({
      deck: 29,
      hand: 1,
    });

    const played = buildTutorialView({
      runId: "event:draw",
      currentActionIndex: null,
      actions,
    }, OPPONENT_CARD).battle;
    expect(played.enemyHandCardIds).toEqual([]);
    expect(played.enemyHand).toEqual([]);
    expect(played.enemy.backRank[0]?.card).toMatchObject({
      layoutMotion: "snap",
      model: { cardId: TUTORIAL_OPPONENT_CARD_ID },
    });
    expect(played.enemy.backRank[1]?.card).toBeNull();
    expect(played.inspector.sides.enemy.zones).toMatchObject({
      deck: 29,
      hand: 0,
      backRank: 1,
    });
  });

  it("settles Vrakmoth only after the opponent portrait action advances", () => {
    const actions = [
      {
        id: "dreamcaller-arrival",
        action: "animate-dreamcaller-portrait" as const,
        owner: "player" as const,
        pause: 1,
        duration: 0.6,
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
        duration: 0.6,
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
    expect(
      arriving.dialogue?.kind === "guide"
        ? arriving.dialogue.model.text
        : null,
    ).toContain("power of Nightmare");

    const complete = buildTutorialView({
      runId: "event:10",
      currentActionIndex: null,
      actions,
    });
    expect(complete.dreamcallers.player.settled).toBe(true);
    expect(complete.dreamcallers.enemy.settled).toBe(true);
    expect(complete.dialogue).toBeNull();
  });
});
