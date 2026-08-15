import { describe, expect, it, vi } from "vitest";
import {
  loadTutorialActions,
  parseTutorialActions,
  parseTutorialAtlasConfiguration,
  parseTutorialBattleConfiguration,
  parseTutorialBattleStartConfiguration,
  parseTutorialDreamscapeConfiguration,
  parseTutorialJourneyStartConfiguration,
  parseTutorialSiteConfiguration,
  parseTutorialTriggers,
} from "./tutorial-actions";
import {
  makeTutorialBattleConfiguration,
  TEST_TUTORIAL_CARD_CONSTANTS,
} from "../test/tutorial-configuration-fixture";
import {
  testCardId,
  testDreamwellCardId,
  testTutorialActionId,
  testTutorialAiActionOverrideId,
  testTutorialTriggerId,
} from "../types/test-identities";

const ACTIONS_RESPONSE = {
  contentHash: "0".repeat(64),
  foldHash: "1".repeat(64),
  journeyStart: {
    speechBubble: {
      speaker: "mira",
      horizontalOffset: 40,
      verticalOffset: 0,
      bubbleWidth: 550,
      text: "Choose a [purple]Avatar[/purple].",
    },
  },
  dreamscape: {
    speechBubble: {
      speaker: "mira",
      delay: 2,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      text: "Visit [purple]Dream Sites[/purple].",
    },
  },
  atlas: {
    speechBubble: {
      speaker: "mira",
      delay: 1,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      text: "Choose the next [purple]dream[/purple].",
    },
  },
  draft: {
    speechBubble: {
      speaker: "mira",
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 600,
      text: "Draft a card.",
    },
  },
  purge: {
    speechBubble: {
      speaker: "mira",
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 600,
      text: "Purge a card.",
    },
  },
  dreamsignRevelation: {
    speechBubble: {
      speaker: "mira",
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 600,
      text: "Choose a Dreamsign.",
    },
  },
  battleStart: {
    firstBattle: {
      speechBubble: {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Review the first opponent.",
      },
    },
    secondBattle: {
      speechBubble: {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Prepare for the second battle.",
      },
    },
  },
  actions: [
    {
      id: testTutorialActionId("welcome"),
      action: "display-speech-bubble",
      speechBubble: {
        speaker: "mira",
        duration: 3,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Welcome, Dreamer.",
      },
      wait: 3,
    },
  ],
  triggers: [],
  battle: makeTutorialBattleConfiguration(),
};

function successfulFetcher() {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(ACTIONS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("loadTutorialActions", () => {
  it("loads directly from tutorial.toml through the editor API in development", async () => {
    const fetcher = successfulFetcher();

    await expect(
      loadTutorialActions(fetcher as unknown as typeof fetch),
    ).resolves.toEqual(ACTIONS_RESPONSE.actions);
    expect(fetcher).toHaveBeenCalledWith("/api/editor/tutorial");
  });

  it("loads generated data for a production runtime", async () => {
    const fetcher = successfulFetcher();

    await loadTutorialActions(fetcher, "runtime");

    expect(fetcher).toHaveBeenCalledWith("/tutorial-data.json");
  });
});

describe("parseTutorialActions", () => {
  it("preserves an Avatar speech target and rejects unknown speakers", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("enemy-taunt"),
          action: "display-speech-bubble",
          speechBubble: {
            speaker: "enemy",
            delay: 1,
            duration: 3,
            horizontalOffset: 20,
            verticalOffset: 0,
            bubbleWidth: 450,
            text: "For the [yellow]Abyss[/yellow] and its [purple]events[purple]!",
          },
          wait: 3,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("enemy-taunt"),
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "enemy",
          delay: 1,
          duration: 3,
          horizontalOffset: 20,
          verticalOffset: 0,
          bubbleWidth: 450,
          text: "For the [yellow]Abyss[/yellow] and its [purple]events[purple]!",
        },
        wait: 3,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-speaker"),
          action: "display-speech-bubble",
          speechBubble: { speaker: "spectator", text: "No." },
          wait: 1,
        },
      ]),
    ).toThrow(/Mira, the player, or the enemy/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-bubble-width"),
          action: "display-speech-bubble",
          speechBubble: { bubbleWidth: 750, text: "Too wide." },
          wait: 1,
        },
      ]),
    ).toThrow(/speech bubble width from 300 to 700 pixels/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-duration"),
          action: "display-speech-bubble",
          speechBubble: { duration: -1, text: "Too brief." },
          wait: 1,
        },
      ]),
    ).toThrow(/non-negative speech bubble duration/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-speech-markup"),
          action: "display-speech-bubble",
          speechBubble: { text: "A [yellow]blocked character." },
          wait: 1,
        },
      ]),
    ).toThrow(/unclosed yellow highlight/u);
  });

  it("preserves finite Mira offsets and rejects invalid offsets", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("lower-line"),
          action: "display-speech-bubble",
          speechBubble: {
            horizontalOffset: 30,
            verticalOffset: 100,
            text: "A lower line.",
          },
          wait: 3,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("lower-line"),
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 3,
          horizontalOffset: 30,
          verticalOffset: 100,
          bubbleWidth: 700,
          text: "A lower line.",
        },
        wait: 3,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-offset"),
          action: "display-speech-bubble",
          speechBubble: { verticalOffset: "lower", text: "No." },
          wait: 1,
        },
      ]),
    ).toThrow(/finite speech bubble vertical offset/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-horizontal-offset"),
          action: "display-speech-bubble",
          speechBubble: { horizontalOffset: "right", text: "No." },
          wait: 1,
        },
      ]),
    ).toThrow(/finite speech bubble horizontal offset/u);
  });

  it("parses persistent journey-start guidance from authored data", () => {
    expect(
      parseTutorialJourneyStartConfiguration(ACTIONS_RESPONSE.journeyStart),
    ).toEqual(ACTIONS_RESPONSE.journeyStart);
    expect(() =>
      parseTutorialJourneyStartConfiguration({
        speechBubble: { speaker: "enemy", text: "No." },
      }),
    ).toThrow(/must target Mira/u);
  });

  it("parses persistent first-visit site guidance", () => {
    expect(
      parseTutorialSiteConfiguration(ACTIONS_RESPONSE.draft, "draft"),
    ).toEqual(ACTIONS_RESPONSE.draft);
    expect(
      parseTutorialSiteConfiguration(ACTIONS_RESPONSE.purge, "purge"),
    ).toEqual(ACTIONS_RESPONSE.purge);
    expect(() =>
      parseTutorialSiteConfiguration(
        { speechBubble: { speaker: "enemy", text: "No." } },
        "draft",
      ),
    ).toThrow(/must target Mira/u);
  });

  it("parses delayed first- and second-battle guidance", () => {
    expect(
      parseTutorialBattleStartConfiguration(ACTIONS_RESPONSE.battleStart),
    ).toEqual(ACTIONS_RESPONSE.battleStart);
    expect(() =>
      parseTutorialBattleStartConfiguration({
        firstBattle: {
          speechBubble: { speaker: "enemy", text: "No." },
        },
        secondBattle: ACTIONS_RESPONSE.battleStart.secondBattle,
      }),
    ).toThrow(/must target Mira/u);
  });

  it("preserves authored How to Play copy and rejects blank messages", () => {
    const text =
      "Play characters to [yellow]challenge[/yellow] and score points (⍟).\n\nScore 10⍟ to win.";
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("how-to-play"),
          action: "display-how-to-play",
          text,
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("how-to-play"),
        action: "display-how-to-play",
        trigger: "player-turn-announcement-complete",
        text,
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("blank-how-to-play"),
          action: "display-how-to-play",
          text: "  ",
          wait: 0,
        },
      ]),
    ).toThrow(/How to Play text/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-how-to-play-trigger"),
          action: "display-how-to-play",
          trigger: "after-a-card-name",
          text,
          wait: 0,
        },
      ]),
    ).toThrow(/supported How to Play trigger/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-how-to-play-companion"),
          action: "display-how-to-play",
          companion: "named-card",
          text,
          wait: 0,
        },
      ]),
    ).toThrow(/supported How to Play companion/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-how-to-play-markup"),
          action: "display-how-to-play",
          text: "Position a character to [yellow]challenge.",
          wait: 0,
        },
      ]),
    ).toThrow(/unclosed yellow highlight/u);
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("dreamwell-how-to-play"),
          action: "display-how-to-play",
          trigger: "immediate",
          companion: "dreamwell-card",
          cardWidth: 650,
          text,
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("dreamwell-how-to-play"),
        action: "display-how-to-play",
        trigger: "immediate",
        companion: "dreamwell-card",
        cardWidth: 650,
        text,
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-how-to-play-width"),
          action: "display-how-to-play",
          cardWidth: 0,
          text,
          wait: 0,
        },
      ]),
    ).toThrow(/How to Play card width of at least 300 pixels/u);
  });

  it("normalizes legacy portrait actions and preserves opponent pauses", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("legacy-arrival"),
          action: "animate-avatar-portrait",
          wait: 0,
        },
        {
          id: testTutorialActionId("opponent-arrival"),
          action: "animate-avatar-portrait",
          owner: "enemy",
          pause: 2.5,
          duration: 0.7,
          wait: 1,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("legacy-arrival"),
        action: "animate-avatar-portrait",
        owner: "player",
        pause: 0,
        duration: 1.2,
        wait: 0,
      },
      {
        id: testTutorialActionId("opponent-arrival"),
        action: "animate-avatar-portrait",
        owner: "enemy",
        pause: 2.5,
        duration: 0.7,
        wait: 1,
      },
    ]);
  });

  it("preserves a face-down opponent draw action", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("vrakmoth-draw"),
          action: "draw-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          wait: 0.5,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("vrakmoth-draw"),
        action: "draw-opponent-card",
        cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
        wait: 0.5,
      },
    ]);
  });

  it("preserves authored Mira dialogue on an end-turn action", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("end-turn"),
          action: "end-turn",
          speechBubble: {
            text: "Good, you have now [yellow]materialized[/yellow] this character.",
          },
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("end-turn"),
        action: "end-turn",
        speechBubble: {
          speaker: "mira",
          duration: 3,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Good, you have now [yellow]materialized[/yellow] this character.",
        },
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("blank-end-turn-speech"),
          action: "end-turn",
          speechBubble: { text: " " },
          wait: 0,
        },
      ]),
    ).toThrow(/speech bubble text/u);
  });

  it("preserves a UUID-backed opponent reposition and rejects display names", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("opponent-character-advance"),
          action: "reposition-opponent-character",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("opponent-character-advance"),
        action: "reposition-opponent-character",
        cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("named-opponent"),
          action: "reposition-opponent-character",
          cardId: "Twilight Troubadour",
          wait: 0,
        },
      ]),
    ).toThrow(/by UUID/u);
  });

  it("preserves a UUID-backed player block and rejects display names", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("block-opponent"),
          action: "reposition-player-character",
          cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
          opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("block-opponent"),
        action: "reposition-player-character",
        cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
        opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("named-player"),
          action: "reposition-player-character",
          cardId: testCardId("Marked Direwolf"),
          opposingCardId: "Twilight Troubadour",
          wait: 0,
        },
      ]),
    ).toThrow(/by UUID/u);
  });

  it("preserves a UUID-backed challenge pairing and rejects display names", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("resolve-challenge"),
          action: "resolve-challenge",
          challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          blockerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("resolve-challenge"),
        action: "resolve-challenge",
        challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        blockerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("named-challenge"),
          action: "resolve-challenge",
          challengerCardId: "Twilight Troubadour",
          blockerCardId: "Marked Direwolf",
          wait: 0,
        },
      ]),
    ).toThrow(/by UUID/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("self-challenge"),
          action: "resolve-challenge",
          challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          blockerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ]),
    ).toThrow(/two different/u);
  });

  it("preserves a UUID-authored Dreamwell draw and rejects display names", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("autumn-glade"),
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: testCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("autumn-glade"),
        action: "draw-dreamwell-card",
        owner: "enemy",
        cardId: testCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("named-card"),
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: "Autumn Glade",
          wait: 0,
        },
      ]),
    ).toThrow(/by UUID/u);
  });

  it("preserves scripted player and hidden opponent draws with their phase reason", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("player-effect-draw"),
          action: "draw-card",
          owner: "player",
          cardId: testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8"),
          reason: "dreamwell-effect",
          wait: 0,
        },
        {
          id: testTutorialActionId("opponent-effect-draw"),
          action: "draw-card",
          owner: "enemy",
          cardId: testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"),
          reason: "dreamwell-effect",
          wait: 0,
        },
        {
          id: testTutorialActionId("player-turn-draw"),
          action: "draw-card",
          owner: "player",
          cardId: testCardId("2162742c-09d0-4e62-ae49-0f8f79b45adc"),
          reason: "turn-draw",
          wait: 0,
        },
      ]),
    ).toMatchObject([
      { owner: "player", reason: "dreamwell-effect" },
      { owner: "enemy", reason: "dreamwell-effect" },
      { owner: "player", reason: "turn-draw" },
    ]);
  });

  it("preserves a Dreamwell reading pause", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("player-voltsurge"),
          action: "draw-dreamwell-card",
          owner: "player",
          cardId: testCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
          revealDuration: 5,
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("player-voltsurge"),
        action: "draw-dreamwell-card",
        owner: "player",
        cardId: testCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
        revealDuration: 5,
        wait: 0,
      },
    ]);
  });

  it("normalizes and validates the opponent card reveal duration", () => {
    expect(
      parseTutorialActions([
        {
          id: testTutorialActionId("vrakmoth-reveal-and-play"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          speechBubble: {
            duration: 4,
            horizontalOffset: 30,
            verticalOffset: 20,
            bubbleWidth: 450,
            text: "This card has a ▸Dawn ability.",
          },
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: testTutorialActionId("vrakmoth-reveal-and-play"),
        action: "reveal-and-play-opponent-card",
        cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
        revealDuration: 2,
        speechBubble: {
          speaker: "mira",
          duration: 4,
          horizontalOffset: 30,
          verticalOffset: 20,
          bubbleWidth: 450,
          text: "This card has a ▸Dawn ability.",
        },
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-card-reveal"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          revealDuration: -0.5,
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative card reveal duration/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-reveal-offset"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          speechBubble: { verticalOffset: "lower", text: "No." },
          wait: 0,
        },
      ]),
    ).toThrow(/finite speech bubble vertical offset/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-reveal-width"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          speechBubble: { bubbleWidth: 750, text: "No." },
          wait: 0,
        },
      ]),
    ).toThrow(/speech bubble width from 300 to 700 pixels/u);
  });

  it("rejects invalid portrait owners and pauses", () => {
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-owner"),
          action: "animate-avatar-portrait",
          owner: "spectator",
          pause: 1,
          duration: 0.6,
          wait: 0,
        },
      ]),
    ).toThrow(/player or enemy/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-pause"),
          action: "animate-avatar-portrait",
          owner: "player",
          pause: -1,
          duration: 0.6,
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative portrait pause/u);
    expect(() =>
      parseTutorialActions([
        {
          id: testTutorialActionId("bad-duration"),
          action: "animate-avatar-portrait",
          owner: "player",
          pause: 1,
          duration: -1,
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative portrait duration/u);
  });

  it("normalizes every speech bubble option on supplemental triggers", () => {
    expect(
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("support"),
          on: ["card-seen", "card-play", "dreamwell-resolve"],
          priority: 100,
          delay: { "card-seen": 1 },
          speaker: "player",
          duration: 5,
          horizontalOffset: 40,
          verticalOffset: -20,
          bubbleWidth: 300,
          match: {
            kind: "glossary",
            id: "59f426ac-b9cb-47af-a00a-8cbab941c6c4",
          },
          text: "A character with [yellow]support[/yellow] helps the characters in front of it.",
        },
      ]),
    ).toEqual([
      {
        id: testTutorialTriggerId("support"),
        on: ["card-seen", "card-play", "dreamwell-resolve"],
        priority: 100,
        delay: { "card-seen": 1 },
        speaker: "player",
        duration: 5,
        horizontalOffset: 40,
        verticalOffset: -20,
        bubbleWidth: 300,
        match: { kind: "glossary", id: "59f426ac-b9cb-47af-a00a-8cbab941c6c4" },
        text: "A character with [yellow]support[/yellow] helps the characters in front of it.",
      },
    ]);
    expect(() =>
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("bad-delay-event"),
          on: ["card-play"],
          delay: { "card-seen": 1 },
          duration: 3,
          match: {
            kind: "glossary",
            id: "59f426ac-b9cb-47af-a00a-8cbab941c6c4",
          },
          text: "No.",
        },
      ]),
    ).toThrow(/delay must reference one of its trigger events/u);
  });

  it("parses a UUID-matched no-valid-targets trigger", () => {
    const cardId = "4408b942-09a0-4f4e-a403-10c708c6e3c5";
    expect(
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("flashpoint-no-valid-targets"),
          on: ["card-no-valid-targets"],
          priority: 10,
          duration: 4,
          bubbleWidth: 500,
          match: { kind: "card-id", cardId: testCardId(cardId) },
          text: "There are no valid targets for this card",
        },
      ]),
    ).toEqual([
      {
        id: testTutorialTriggerId("flashpoint-no-valid-targets"),
        on: ["card-no-valid-targets"],
        priority: 10,
        speaker: "mira",
        duration: 4,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
        match: { kind: "card-id", cardId: testCardId(cardId) },
        text: "There are no valid targets for this card",
      },
    ]);
  });

  it("parses a first-seen transfiguration concept trigger", () => {
    const text =
      "Cards can be [yellow]transfigured[/yellow] to change their cost, spark, or abilities";
    expect(
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("transfiguration"),
          on: ["transfiguration-seen"],
          delay: { "transfiguration-seen": 1 },
          duration: 5,
          bubbleWidth: 500,
          match: { kind: "any" },
          text,
        },
      ]),
    ).toMatchObject([
      {
        id: testTutorialTriggerId("transfiguration"),
        on: ["transfiguration-seen"],
        delay: { "transfiguration-seen": 1 },
        text,
      },
    ]);
  });

  it("parses a first-resolved Challenge concept trigger", () => {
    const text =
      "If there is a tie in spark (✦) values, both characters in the challenge are dissolved";
    expect(
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("spark-tie"),
          on: ["challenge-resolved"],
          duration: 5,
          bubbleWidth: 500,
          match: { kind: "any" },
          text,
        },
      ]),
    ).toMatchObject([
      {
        id: testTutorialTriggerId("spark-tie"),
        on: ["challenge-resolved"],
        text,
      },
    ]);
  });

  it("parses an opponent reposition opportunity concept trigger", () => {
    expect(
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("opponent-reposition-opportunity"),
          on: ["opponent-reposition-opportunity"],
          duration: 5,
          bubbleWidth: 500,
          match: { kind: "any" },
          text: "Repositioning explanation.",
        },
      ]),
    ).toMatchObject([
      {
        id: testTutorialTriggerId("opponent-reposition-opportunity"),
        on: ["opponent-reposition-opportunity"],
        match: { kind: "any" },
      },
    ]);
  });

  it("parses a player Night phase concept trigger", () => {
    expect(
      parseTutorialTriggers([
        {
          id: testTutorialTriggerId("player-night-phase"),
          on: ["player-night-phase"],
          duration: 6,
          bubbleWidth: 500,
          match: { kind: "any" },
          text: "Night guidance with ❖ timing marks.",
        },
      ]),
    ).toMatchObject([
      {
        id: testTutorialTriggerId("player-night-phase"),
        on: ["player-night-phase"],
        duration: 6,
        match: { kind: "any" },
      },
    ]);
  });
});

describe("parseTutorialDreamscapeConfiguration", () => {
  it("preserves the authored delay and rejects invalid values", () => {
    expect(
      parseTutorialDreamscapeConfiguration(ACTIONS_RESPONSE.dreamscape),
    ).toEqual(ACTIONS_RESPONSE.dreamscape);
    expect(() =>
      parseTutorialDreamscapeConfiguration({
        speechBubble: {
          ...ACTIONS_RESPONSE.dreamscape.speechBubble,
          delay: -1,
        },
      }),
    ).toThrow(/non-negative delay/u);
  });
});

describe("parseTutorialAtlasConfiguration", () => {
  it("preserves the authored delay and rejects invalid values", () => {
    expect(parseTutorialAtlasConfiguration(ACTIONS_RESPONSE.atlas)).toEqual(
      ACTIONS_RESPONSE.atlas,
    );
    expect(() =>
      parseTutorialAtlasConfiguration({
        speechBubble: {
          ...ACTIONS_RESPONSE.atlas.speechBubble,
          delay: -1,
        },
      }),
    ).toThrow(/non-negative delay/u);
  });
});

describe("parseTutorialBattleConfiguration", () => {
  it("preserves UUID-authored draw order and rejects invalid entries", () => {
    const battle = makeTutorialBattleConfiguration({
      tutorialCardConstants: {
        ...TEST_TUTORIAL_CARD_CONSTANTS,
        tutorialDreamwellCardId: testDreamwellCardId(
          "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
        ),
      },
      starterDeck: [
        {
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialPlayerCharacterCardId,
          copies: 3,
        },
        {
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.handoffEnemyCharacterCardId,
          copies: 3,
        },
        { cardId: testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8"), copies: 3 },
        { cardId: testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"), copies: 3 },
      ],
      forcedPlayerDraws: [testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8")],
      forcedEnemyDraws: [testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481")],
      dreamwellDraws: [
        testDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
        TEST_TUTORIAL_CARD_CONSTANTS.tutorialDreamwellCardId,
      ],
      aiActionOverrides: [
        {
          id: testTutorialAiActionOverrideId("play-card-after-dreamwell"),
          trigger: {
            kind: "after-dreamwell",
            side: "enemy",
            cardId: testDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
          },
          action: {
            kind: "play-card",
            cardId: testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"),
          },
        },
      ],
    });
    expect(parseTutorialBattleConfiguration(battle)).toEqual(battle);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        forcedEnemyDraws: ["not-a-uuid"],
      }),
    ).toThrow(/array of card UUIDs/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        dreamwellDraws: [battle.dreamwellDraws[0], battle.dreamwellDraws[0]],
      }),
    ).toThrow(/must not repeat/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        aiActionOverrides: [
          battle.aiActionOverrides[0],
          battle.aiActionOverrides[0],
        ],
      }),
    ).toThrow(/duplicated/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        aiActionOverrides: [
          {
            ...battle.aiActionOverrides[0],
            trigger: {
              kind: "after-dreamwell",
              side: "player",
              cardId: battle.dreamwellDraws[0],
            },
          },
        ],
      }),
    ).toThrow(/enemy after-dreamwell/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        aiActionOverrides: [
          {
            ...battle.aiActionOverrides[0],
            trigger: {
              ...battle.aiActionOverrides[0].trigger,
              cardId: testCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
            },
          },
        ],
      }),
    ).toThrow(/must appear in dreamwellDraws/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        aiActionOverrides: [
          {
            ...battle.aiActionOverrides[0],
            action: {
              kind: "play-card",
              cardId: testCardId("00000000-0000-4000-8000-000000000101"),
            },
          },
        ],
      }),
    ).toThrow(/registered semantic play automation/u);
  });

  it("requires distinct loading-screen and handoff enemy characters", () => {
    const battle = makeTutorialBattleConfiguration({
      tutorialCardConstants: {
        ...TEST_TUTORIAL_CARD_CONSTANTS,
        loadingScreenCharacterCardId:
          TEST_TUTORIAL_CARD_CONSTANTS.handoffEnemyCharacterCardId,
      },
    });

    expect(() => parseTutorialBattleConfiguration(battle)).toThrow(
      /loading-screen and handoff enemy characters/u,
    );
  });
});
