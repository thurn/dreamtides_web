import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamwellCard } from "../../data/dreamwell-database";
import {
  buildTutorialView,
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_INSTANCE_ID,
  TUTORIAL_PLAYER_CARD_ID,
  tutorialActionLogDetails,
} from "./tutorial-view-model";
import { TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID } from "../../data/tutorial-opponent-card";

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

const PLAYER_CARD: CardData = {
  id: asCardId(TUTORIAL_PLAYER_CARD_ID),
  name: asCardName("Tutorial Player Card"),
  cardNumber: 512,
  cardType: "Character",
  subtype: "Spirit Animal",
  isStarter: false,
  rarity: "Special",
  energyCost: 4,
  spark: 4,
  isFast: false,
  renderedText: "",
  imageNumber: 1011175312,
  artOwned: false,
};

const RUNEBOUND_CHAMPION: CardData = {
  id: asCardId(TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID),
  name: asCardName("Runebound Champion"),
  cardNumber: 512,
  cardType: "Character",
  subtype: "Warrior",
  isStarter: true,
  rarity: "Starter",
  energyCost: 5,
  spark: 3,
  isFast: false,
  renderedText: "▸Dawn: Gain 1⍟.",
  imageNumber: 2654359867,
  artOwned: false,
};

const AUTUMN_GLADE: DreamwellCard = {
  id: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
  name: "Autumn Glade",
  renderedText: "Gain 2⍟.",
  order: 1,
  energyAdded: 1,
  cardNumber: 5,
  imageNumber: 1789989917,
};

describe("buildTutorialView", () => {
  it("reconstructs the completed prefix when playback starts at the last three actions", () => {
    const actions = [
      {
        id: "welcome",
        action: "display-speech-bubble" as const,
        text: "Welcome.",
        wait: 1,
      },
      {
        id: "player-arrival",
        action: "animate-dreamcaller-portrait" as const,
        owner: "player" as const,
        pause: 1,
        duration: 0.6,
        wait: 0,
      },
      {
        id: "enemy-arrival",
        action: "animate-dreamcaller-portrait" as const,
        owner: "enemy" as const,
        pause: 1,
        duration: 0.6,
        wait: 0,
      },
      {
        id: "enemy-taunt",
        action: "display-speech-bubble" as const,
        speaker: "enemy" as const,
        bubbleWidth: 450,
        text: "For the Abyss!",
        wait: 1,
      },
      {
        id: "enemy-draw",
        action: "draw-opponent-card" as const,
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
      {
        id: "enemy-play",
        action: "reveal-and-play-opponent-card" as const,
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        revealDuration: 2,
        wait: 0,
      },
    ];

    const tail = buildTutorialView(
      { runId: "event:tail", actions, currentActionIndex: actions.length - 3 },
      OPPONENT_CARD,
    );

    expect(tail.currentAction?.id).toBe("enemy-taunt");
    expect(tail.dreamcallers.player.settled).toBe(true);
    expect(tail.dreamcallers.enemy.settled).toBe(true);
    expect(tail.battle.enemy.deckCardIds).toHaveLength(30);
    expect(tail.battle.enemyHandCardIds).toEqual([]);
    expect(tail.dialogue).toMatchObject({
      kind: "dreamcaller",
      owner: "enemy",
      bubbleWidth: 450,
      text: "For the Abyss!",
    });
  });

  it("logs the selected speech portrait for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "enemy-taunt",
        action: "display-speech-bubble",
        speaker: "enemy",
        bubbleWidth: 450,
        text: "For the Abyss!",
        wait: 3,
      }),
    ).toEqual({
      actionId: "enemy-taunt",
      action: "display-speech-bubble",
      bubbleWidthPx: 450,
      speaker: "enemy",
      verticalOffsetPx: 0,
      waitSeconds: 3,
    });
  });

  it("logs UUID-backed challenge resolution details", () => {
    expect(
      tutorialActionLogDetails({
        id: "resolve-challenge",
        action: "resolve-challenge",
        challengerCardId: TUTORIAL_OPPONENT_CARD_ID,
        defenderCardId: TUTORIAL_PLAYER_CARD_ID,
        wait: 0,
      }),
    ).toEqual({
      actionId: "resolve-challenge",
      action: "resolve-challenge",
      waitSeconds: 0,
      challengerCardId: TUTORIAL_OPPONENT_CARD_ID,
      defenderCardId: TUTORIAL_PLAYER_CARD_ID,
      sourceZone: "front-rank",
      loserDestinationZone: "controller-void",
      resolution: "compare-spark",
    });
  });

  it("logs the authored How to Play copy for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "how-to-play",
        action: "display-how-to-play",
        cardWidth: 650,
        text: "Configured [yellow]instructions[/yellow].",
        wait: 0,
      }),
    ).toEqual({
      actionId: "how-to-play",
      action: "display-how-to-play",
      cardWidthPx: 650,
      trigger: "player-turn-announcement-complete",
      title: "How to Play",
      messageText: "Configured instructions.",
      messageMarkup: "Configured [yellow]instructions[/yellow].",
      waitSeconds: 0,
    });
  });

  it("logs the face-down opponent draw path for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "vrakmoth-draw",
        action: "draw-opponent-card",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      }),
    ).toEqual({
      actionId: "vrakmoth-draw",
      action: "draw-opponent-card",
      waitSeconds: 0,
      cardId: TUTORIAL_OPPONENT_CARD_ID,
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
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
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

  it("logs the authored handoff destination for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "end-turn",
        action: "end-turn",
        wait: 0,
      }),
    ).toEqual({
      actionId: "end-turn",
      action: "end-turn",
      waitSeconds: 0,
      sourceSide: "player",
      destinationSide: "enemy",
      destinationPhase: "dawn",
    });
  });

  it("logs the UUID-backed opponent reposition for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "opponent-character-advance",
        action: "reposition-opponent-character",
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      }),
    ).toEqual({
      actionId: "opponent-character-advance",
      action: "reposition-opponent-character",
      waitSeconds: 0,
      cardId: TUTORIAL_OPPONENT_CARD_ID,
      sourceZone: "opponent-back-rank",
      destinationZone: "opponent-front-rank",
      destinationSlot: "closest",
    });
  });

  it("logs both UUIDs for the guided player block", () => {
    expect(
      tutorialActionLogDetails({
        id: "block-opponent",
        action: "reposition-player-character",
        cardId: TUTORIAL_PLAYER_CARD_ID,
        opposingCardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      }),
    ).toEqual({
      actionId: "block-opponent",
      action: "reposition-player-character",
      waitSeconds: 0,
      cardId: TUTORIAL_PLAYER_CARD_ID,
      opposingCardId: TUTORIAL_OPPONENT_CARD_ID,
      sourceZone: "player-back-rank",
      destinationZone: "player-front-rank",
      destinationSlot: "across-from-opponent",
    });
  });

  it("logs a UUID-authored Dreamwell reveal for sequence reconstruction", () => {
    expect(
      tutorialActionLogDetails({
        id: "autumn-glade",
        action: "draw-dreamwell-card",
        owner: "enemy",
        cardId: AUTUMN_GLADE.id,
        wait: 0,
      }),
    ).toEqual({
      actionId: "autumn-glade",
      action: "draw-dreamwell-card",
      waitSeconds: 0,
      cardId: AUTUMN_GLADE.id,
      cardFace: "up",
      owner: "enemy",
      sourceZone: "dreamwell",
      destinationPhase: "dawn",
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
          bubbleWidth: 450,
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
      verticalOffset: 0,
      bubbleWidth: 450,
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
    expect(view.isOpeningTurn).toBe(true);
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
    }
    expect(view.player.status).toEqual({
      dreamcaller: null,
      currentEnergy: 4,
      maxEnergy: 4,
      points: 0,
    });
    expect(view.enemy.status).toEqual({
      dreamcaller: null,
      currentEnergy: 4,
      maxEnergy: 4,
      points: 0,
    });

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
          verticalOffset: 100,
          text: "You are called to stand against Nightmare.",
          wait: 3,
        },
      ],
    });

    expect(tutorial.currentAction?.id).toBe("nightmare-call");
    expect(
      tutorial.dialogue?.kind === "guide" ? tutorial.dialogue.model.text : null,
    ).toContain("Nightmare");
    expect(
      tutorial.dialogue?.kind === "guide"
        ? tutorial.dialogue.verticalOffset
        : null,
    ).toBe(100);
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

  it("dismisses completed speech while non-portrait actions play", () => {
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
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
      {
        id: "vrakmoth-reveal-and-play",
        action: "reveal-and-play-opponent-card" as const,
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        revealDuration: 2,
        wait: 0,
      },
    ];

    expect(
      buildTutorialView({
        runId: "event:dismiss-speech",
        currentActionIndex: 1,
        actions,
      }).dialogue,
    ).toBeNull();
    expect(
      buildTutorialView({
        runId: "event:dismiss-speech",
        currentActionIndex: 2,
        actions,
      }).dialogue,
    ).toBeNull();
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
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
      {
        id: "vrakmoth-reveal-and-play",
        action: "reveal-and-play-opponent-card" as const,
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        revealDuration: 2,
        wait: 0,
      },
      {
        id: "how-to-play",
        action: "display-how-to-play" as const,
        text: "Configured instructions.\n\nScore 10 ⍟ to win.",
        wait: 0,
      },
      {
        id: "end-turn",
        action: "end-turn" as const,
        wait: 0,
      },
      {
        id: "autumn-glade",
        action: "draw-dreamwell-card" as const,
        owner: "enemy" as const,
        cardId: AUTUMN_GLADE.id,
        wait: 0,
      },
      {
        id: "dreamwell-how-to-play",
        action: "display-how-to-play" as const,
        trigger: "immediate" as const,
        companion: "dreamwell-card" as const,
        text: "From turn 2, players draw dreamwell cards that increase their energy (●) production and have other effects.",
        wait: 0,
      },
      {
        id: "vrakmoth-worthy-challenger",
        action: "display-speech-bubble" as const,
        speaker: "enemy" as const,
        text: "A worthy challenger!",
        wait: 3,
      },
      {
        id: "opponent-character-advance",
        action: "reposition-opponent-character" as const,
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
      {
        id: "challenge-positioning-how-to-play",
        action: "display-how-to-play" as const,
        trigger: "immediate" as const,
        text: "Position characters in the front rank to [yellow]challenge[/yellow] with them during your turn, or [yellow]accept[/yellow] a challenge during the opponent's turn.",
        wait: 0,
      },
      {
        id: "block-opponent",
        action: "reposition-player-character" as const,
        cardId: TUTORIAL_PLAYER_CARD_ID,
        opposingCardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
    ];

    const drawing = buildTutorialView({
      runId: "event:draw",
      currentActionIndex: 1,
      actions,
    }).battle;
    expect(drawing.enemy.status).toMatchObject({
      currentEnergy: 4,
      maxEnergy: 4,
    });
    expect(drawing.enemy.deckCardIds[0]).toBe("tutorial-enemy-deck-1");
    expect(drawing.enemy.deckCardIds).toHaveLength(30);
    expect(drawing.enemyHandCardIds).toEqual([]);

    const drawn = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 2,
        actions,
      },
      OPPONENT_CARD,
    ).battle;
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
    expect(drawn.enemy.status).toMatchObject({
      currentEnergy: 4,
      maxEnergy: 4,
    });

    const playedTutorial = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 3,
        actions,
      },
      OPPONENT_CARD,
      PLAYER_CARD,
    );
    const played = playedTutorial.battle;
    expect(playedTutorial.howToPlay).toEqual({
      actionId: "how-to-play",
      text: "Configured instructions.\n\nScore 10 ⍟ to win.",
      wait: 0,
      trigger: "player-turn-announcement-complete",
    });
    expect(playedTutorial.currentAction?.action).toBe("display-how-to-play");
    expect(playedTutorial.dialogue).toBeNull();
    expect(played.enemyHandCardIds).toEqual([]);
    expect(played.enemyHand).toEqual([]);
    expect(played.enemy.backRank[0]?.card).toMatchObject({
      layoutMotion: "travel",
      exhausted: false,
      model: { cardId: TUTORIAL_OPPONENT_CARD_ID },
    });
    expect(played.enemy.backRank[1]?.card).toBeNull();
    expect(played.enemy.status).toMatchObject({
      currentEnergy: 2,
      maxEnergy: 4,
    });
    expect(played.inspector.sides.enemy.zones).toMatchObject({
      deck: 29,
      hand: 0,
      backRank: 1,
    });
    expect(played.activeSide).toBe("player");
    expect(played.isOpeningTurn).toBe(false);
    expect(played.player.status).toMatchObject({
      currentEnergy: 4,
      maxEnergy: 4,
    });
    expect(played.player.deckCardIds).toHaveLength(29);
    expect(played.player.deckCardIds[0]).toBe("tutorial-player-deck-2");
    expect(played.playerHand).toHaveLength(1);
    expect(played.playerHand[0]).toMatchObject({
      id: "tutorial-player-deck-1",
      layoutMotion: "travel",
      exhausted: false,
      showPlayableOutline: true,
    });
    expect(played.playerHand[0]?.model.cardId).toBe(TUTORIAL_PLAYER_CARD_ID);
    expect(played.nearHand.cardIds).toEqual(["tutorial-player-deck-1"]);
    expect(played.inspector).toMatchObject({
      turn: "2",
      activeSide: "Player",
      sides: {
        player: {
          currentEnergy: 4,
          maxEnergy: 4,
          zones: { deck: 29, hand: 1 },
        },
      },
    });
    const afterPlayerCardPlay = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 4,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
    );
    expect(afterPlayerCardPlay.howToPlay).toBeNull();
    expect(afterPlayerCardPlay.endTurn).toEqual({
      actionId: "end-turn",
      triggerCardId: TUTORIAL_PLAYER_CARD_ID,
      ready: true,
    });
    expect(afterPlayerCardPlay.battle.activeSide).toBe("player");
    expect(afterPlayerCardPlay.battle.phase).toBe("day");
    expect(afterPlayerCardPlay.battle.playerHand).toEqual([]);
    expect(afterPlayerCardPlay.battle.nearHand.cardIds).toEqual([]);
    expect(
      afterPlayerCardPlay.battle.player.backRank[1]?.card,
    ).toMatchObject({
      id: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
      exhausted: true,
      showPlayableOutline: false,
      model: { cardId: TUTORIAL_PLAYER_CARD_ID },
    });
    expect(afterPlayerCardPlay.battle.player.status).toMatchObject({
      currentEnergy: 0,
      maxEnergy: 4,
    });
    expect(
      afterPlayerCardPlay.battle.inspector.sides.player.zones,
    ).toMatchObject({
      hand: 0,
      deck: 29,
      backRank: 1,
    });

    const drawingDreamwell = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 5,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(drawingDreamwell.currentAction?.action).toBe(
      "draw-dreamwell-card",
    );
    expect(drawingDreamwell.battle).toMatchObject({
      activeSide: "enemy",
      phase: "dawn",
      dreamwell: {
        side: "enemy",
        model: {
          cardId: AUTUMN_GLADE.id,
          displaySnapshot: {
            name: "Autumn Glade",
            renderedText: "Gain 2⍟.",
          },
        },
      },
      enemy: {
        status: {
          currentEnergy: 2,
          maxEnergy: 4,
        },
      },
      inspector: {
        activeSide: "Enemy",
        phase: "Dawn",
        sides: {
          enemy: {
            currentEnergy: 2,
            maxEnergy: 4,
          },
        },
      },
    });
    expect(drawingDreamwell.battle.player.backRank[1]?.card).toMatchObject({
      id: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
      exhausted: false,
      model: { cardId: TUTORIAL_PLAYER_CARD_ID },
    });

    const loadingDreamwellCatalog = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 5,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      null,
    );
    expect(loadingDreamwellCatalog.battle.dreamwell).toBeNull();

    const explainingDreamwell = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 6,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(explainingDreamwell.battle.dreamwell?.model.cardId).toBe(
      AUTUMN_GLADE.id,
    );
    expect(explainingDreamwell.battle.enemy.status).toMatchObject({
      currentEnergy: 2,
      maxEnergy: 4,
    });
    expect(explainingDreamwell.howToPlay).toEqual({
      actionId: "dreamwell-how-to-play",
      text: "From turn 2, players draw dreamwell cards that increase their energy (●) production and have other effects.",
      wait: 0,
      trigger: "immediate",
      companion: {
        cardId: AUTUMN_GLADE.id,
        displaySnapshot: {
          id: AUTUMN_GLADE.id,
          name: "Autumn Glade",
          renderedText: "Gain 2⍟.",
          energyAdded: 1,
          imageNumber: 1789989917,
        },
      },
    });

    const worthyChallenger = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 7,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(worthyChallenger.dialogue).toEqual({
      kind: "dreamcaller",
      owner: "enemy",
      speakerName: "Vrakmoth",
      text: "A worthy challenger!",
    });
    expect(worthyChallenger.battle).toMatchObject({
      activeSide: "enemy",
      phase: "day",
      inspector: {
        activeSide: "Enemy",
        phase: "Day",
      },
    });
    expect(
      worthyChallenger.battle.enemy.backRank[0]?.card,
    ).toMatchObject({
      layoutMotion: "travel",
      exhausted: false,
      model: { cardId: TUTORIAL_OPPONENT_CARD_ID },
    });
    expect(
      worthyChallenger.battle.enemy.frontRank.every(
        (slot) => slot.card === null,
      ),
    ).toBe(true);

    const advancing = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 8,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(advancing.dialogue).toBeNull();
    expect(
      advancing.battle.enemy.backRank.every((slot) => slot.card === null),
    ).toBe(true);
    expect(advancing.battle.enemy.frontRank[0]?.card).toMatchObject({
      layoutMotion: "travel",
      exhausted: false,
      model: { cardId: TUTORIAL_OPPONENT_CARD_ID },
    });
    expect(advancing.battle.inspector.sides.enemy.zones).toMatchObject({
      backRank: 0,
      frontRank: 1,
    });
    expect(advancing.battle.phase).toBe("day");

    const duskInstructions = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 9,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(duskInstructions.currentAction?.id).toBe(
      "challenge-positioning-how-to-play",
    );
    expect(duskInstructions.howToPlay).toEqual({
      actionId: "challenge-positioning-how-to-play",
      text: "Position characters in the front rank to [yellow]challenge[/yellow] with them during your turn, or [yellow]accept[/yellow] a challenge during the opponent's turn.",
      wait: 0,
      trigger: "immediate",
    });
    expect(duskInstructions.battle).toMatchObject({
      activeSide: "enemy",
      phase: "dusk",
      inspector: {
        activeSide: "Enemy",
        phase: "Dusk",
      },
    });

    const guidedBlock = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: 10,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(guidedBlock.playerReposition).toEqual({
      actionId: "block-opponent",
      cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
      cardId: TUTORIAL_PLAYER_CARD_ID,
      opposingCardId: TUTORIAL_OPPONENT_CARD_ID,
    });
    expect(
      guidedBlock.battle.player.backRank[1]?.card?.model.cardId,
    ).toBe(TUTORIAL_PLAYER_CARD_ID);
    expect(
      guidedBlock.battle.player.frontRank.every(
        (slot) => slot.card === null,
      ),
    ).toBe(true);

    const ended = buildTutorialView(
      {
        runId: "event:draw",
        currentActionIndex: null,
        actions,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      },
      OPPONENT_CARD,
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(ended.endTurn).toBeNull();
    expect(ended.battle.activeSide).toBe("enemy");
    expect(ended.battle.phase).toBe("dusk");
    expect(ended.battle.dreamwell).toBeNull();
    expect(ended.battle.enemy.status).toMatchObject({
      currentEnergy: 5,
      maxEnergy: 5,
    });
    expect(
      ended.battle.enemy.backRank.every((slot) => slot.card === null),
    ).toBe(true);
    expect(ended.battle.enemy.frontRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_OPPONENT_CARD_ID,
    );
    expect(
      ended.battle.player.backRank.every((slot) => slot.card === null),
    ).toBe(true);
    expect(ended.battle.player.frontRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_PLAYER_CARD_ID,
    );
    expect(ended.battle.inspector.sides.player.zones).toMatchObject({
      backRank: 0,
      frontRank: 1,
    });
    expect(ended.battle.inspector).toMatchObject({
      activeSide: "Enemy",
      phase: "Dusk",
    });
  });

  it("draws, reveals, explains, and plays a second UUID-backed opponent card before repositioning the first", () => {
    const revealText =
      "This card has a ▸Dawn ability which triggers at the start of turn";
    const actions = [
      {
        id: "first-draw",
        action: "draw-opponent-card" as const,
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
      {
        id: "first-play",
        action: "reveal-and-play-opponent-card" as const,
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        revealDuration: 2,
        wait: 0,
      },
      {
        id: "player-turn",
        action: "display-how-to-play" as const,
        trigger: "immediate" as const,
        text: "Play.",
        wait: 0,
      },
      { id: "end-turn", action: "end-turn" as const, wait: 0 },
      {
        id: "autumn-glade",
        action: "draw-dreamwell-card" as const,
        owner: "enemy" as const,
        cardId: AUTUMN_GLADE.id,
        wait: 0,
      },
      {
        id: "dreamwell-explanation",
        action: "display-how-to-play" as const,
        trigger: "immediate" as const,
        companion: "dreamwell-card" as const,
        text: "Dreamwell.",
        wait: 0,
      },
      {
        id: "runebound-draw",
        action: "draw-opponent-card" as const,
        cardId: TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
        wait: 0,
      },
      {
        id: "worthy",
        action: "display-speech-bubble" as const,
        speaker: "enemy" as const,
        text: "A worthy challenger!",
        wait: 3,
      },
      {
        id: "runebound-play",
        action: "reveal-and-play-opponent-card" as const,
        cardId: TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
        revealDuration: 5,
        revealText,
        wait: 0,
      },
      {
        id: "advance-first",
        action: "reposition-opponent-character" as const,
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
    ];

    const revealing = buildTutorialView(
      { runId: "event:second-card", currentActionIndex: 8, actions },
      [OPPONENT_CARD, RUNEBOUND_CHAMPION],
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(revealing.currentAction).toMatchObject({
      cardId: TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
      revealDuration: 5,
      revealText,
    });
    expect(revealing.dialogue).toMatchObject({
      kind: "guide",
      model: { speakerName: "Mira", text: revealText },
    });
    expect(revealing.battle.enemyHand).toHaveLength(1);
    expect(revealing.battle.enemyHand[0]?.model.cardId).toBe(
      TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
    );
    expect(revealing.battle.enemy.backRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_OPPONENT_CARD_ID,
    );
    expect(revealing.battle.enemy.status).toMatchObject({
      currentEnergy: 5,
      maxEnergy: 5,
    });

    const repositioning = buildTutorialView(
      { runId: "event:second-card", currentActionIndex: 9, actions },
      [OPPONENT_CARD, RUNEBOUND_CHAMPION],
      PLAYER_CARD,
      [AUTUMN_GLADE],
    );
    expect(repositioning.battle.enemyHand).toEqual([]);
    expect(repositioning.battle.enemy.frontRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_OPPONENT_CARD_ID,
    );
    expect(repositioning.battle.enemy.backRank[1]?.card?.model.cardId).toBe(
      TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
    );
    expect(repositioning.battle.enemy.status).toMatchObject({
      currentEnergy: 0,
      maxEnergy: 5,
    });
  });

  it("enters Challenge, identifies the lower-spark loser, and moves it to its void after resolution", () => {
    const actions = [
      {
        id: "opponent-draw",
        action: "draw-opponent-card" as const,
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
      {
        id: "opponent-play",
        action: "reveal-and-play-opponent-card" as const,
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        revealDuration: 0,
        wait: 0,
      },
      {
        id: "player-turn",
        action: "display-how-to-play" as const,
        trigger: "immediate" as const,
        text: "Play.",
        wait: 0,
      },
      {
        id: "end-turn",
        action: "end-turn" as const,
        wait: 0,
      },
      {
        id: "opponent-advance",
        action: "reposition-opponent-character" as const,
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
      {
        id: "player-block",
        action: "reposition-player-character" as const,
        cardId: TUTORIAL_PLAYER_CARD_ID,
        opposingCardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
      {
        id: "resolve-challenge",
        action: "resolve-challenge" as const,
        challengerCardId: TUTORIAL_OPPONENT_CARD_ID,
        defenderCardId: TUTORIAL_PLAYER_CARD_ID,
        wait: 0,
      },
    ];
    const playerCardPlay = {
      cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
      cardId: TUTORIAL_PLAYER_CARD_ID,
      targetSlotId: "player-back-1",
    };

    const resolving = buildTutorialView(
      {
        runId: "event:challenge",
        actions,
        currentActionIndex: actions.length - 1,
        playerCardPlay,
      },
      OPPONENT_CARD,
      PLAYER_CARD,
    );

    expect(resolving.battle.phase).toBe("challenge");
    expect(resolving.battle.inspector.phase).toBe("Challenge");
    expect(resolving.challenge).toMatchObject({
      actionId: "resolve-challenge",
      challenger: {
        owner: "enemy",
        spark: 2,
        card: { model: { cardId: TUTORIAL_OPPONENT_CARD_ID } },
      },
      defender: {
        owner: "player",
        spark: 4,
        card: { model: { cardId: TUTORIAL_PLAYER_CARD_ID } },
      },
      winnerOwner: "player",
      loserOwner: "enemy",
    });
    expect(resolving.battle.enemy.frontRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_OPPONENT_CARD_ID,
    );
    expect(resolving.battle.player.frontRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_PLAYER_CARD_ID,
    );
    expect(resolving.battle.enemy.voidCards).toEqual([]);

    const resolved = buildTutorialView(
      {
        runId: "event:challenge",
        actions,
        currentActionIndex: null,
        playerCardPlay,
      },
      OPPONENT_CARD,
      PLAYER_CARD,
    );

    expect(resolved.challenge).toBeNull();
    expect(resolved.battle.phase).toBe("challenge");
    expect(resolved.battle.enemy.frontRank[0]?.card).toBeNull();
    expect(resolved.battle.player.frontRank[0]?.card?.model.cardId).toBe(
      TUTORIAL_PLAYER_CARD_ID,
    );
    expect(resolved.battle.enemy.voidCards).toMatchObject([
      {
        model: { cardId: TUTORIAL_OPPONENT_CARD_ID },
        layoutMotion: "snap",
      },
    ]);
    expect(resolved.battle.inspector.sides.enemy.zones).toMatchObject({
      frontRank: 0,
      void: 1,
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
      arriving.dialogue?.kind === "guide" ? arriving.dialogue.model.text : null,
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
