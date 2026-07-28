import { describe, expect, it, vi } from "vitest";
import {
  loadTutorialActions,
  parseTutorialActions,
  parseTutorialBattleConfiguration,
  parseTutorialTriggers,
} from "./tutorial-actions";

const ACTIONS_RESPONSE = {
  actions: [
    {
      id: "welcome",
      action: "display-speech-bubble",
      speechBubble: {
        speaker: "mira",
        duration: 3,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Welcome, Dreamer.",
      },
      wait: 3,
    },
  ],
  triggers: [],
  battle: {
    playerDraws: [],
    enemyDraws: [],
    dreamwellDraws: [],
  },
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
  it("preserves a DreamAvatar speech target and rejects unknown speakers", () => {
    expect(
      parseTutorialActions([
        {
          id: "enemy-taunt",
          action: "display-speech-bubble",
          speechBubble: {
            speaker: "enemy",
            duration: 3,
            verticalOffset: 0,
            bubbleWidth: 450,
            text:
              "For the [yellow]Abyss[/yellow] and its [purple]events[purple]!",
          },
          wait: 3,
        },
      ]),
    ).toEqual([
      {
        id: "enemy-taunt",
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "enemy",
          duration: 3,
          verticalOffset: 0,
          bubbleWidth: 450,
          text:
            "For the [yellow]Abyss[/yellow] and its [purple]events[purple]!",
        },
        wait: 3,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-speaker",
          action: "display-speech-bubble",
          speechBubble: { speaker: "spectator", text: "No." },
          wait: 1,
        },
      ]),
    ).toThrow(/Mira, the player, or the enemy/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-bubble-width",
          action: "display-speech-bubble",
          speechBubble: { bubbleWidth: 750, text: "Too wide." },
          wait: 1,
        },
      ]),
    ).toThrow(/speech bubble width from 300 to 700 pixels/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-duration",
          action: "display-speech-bubble",
          speechBubble: { duration: -1, text: "Too brief." },
          wait: 1,
        },
      ]),
    ).toThrow(/non-negative speech bubble duration/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-speech-markup",
          action: "display-speech-bubble",
          speechBubble: { text: "A [yellow]blocked character." },
          wait: 1,
        },
      ]),
    ).toThrow(/unclosed yellow highlight/u);
  });

  it("preserves finite Mira vertical offsets and rejects invalid offsets", () => {
    expect(
      parseTutorialActions([
        {
          id: "lower-line",
          action: "display-speech-bubble",
          speechBubble: { verticalOffset: 100, text: "A lower line." },
          wait: 3,
        },
      ]),
    ).toEqual([
      {
        id: "lower-line",
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 3,
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
          id: "bad-offset",
          action: "display-speech-bubble",
          speechBubble: { verticalOffset: "lower", text: "No." },
          wait: 1,
        },
      ]),
    ).toThrow(/finite speech bubble vertical offset/u);
  });

  it("preserves authored How to Play copy and rejects blank messages", () => {
    const text =
      "Play characters to [yellow]challenge[/yellow] and score points (⍟).\n\nScore 10⍟ to win.";
    expect(
      parseTutorialActions([
        {
          id: "how-to-play",
          action: "display-how-to-play",
          text,
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "how-to-play",
        action: "display-how-to-play",
        trigger: "player-turn-announcement-complete",
        text,
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "blank-how-to-play",
          action: "display-how-to-play",
          text: "  ",
          wait: 0,
        },
      ]),
    ).toThrow(/How to Play text/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-how-to-play-trigger",
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
          id: "bad-how-to-play-companion",
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
          id: "bad-how-to-play-markup",
          action: "display-how-to-play",
          text: "Position a character to [yellow]challenge.",
          wait: 0,
        },
      ]),
    ).toThrow(/unclosed yellow highlight/u);
    expect(
      parseTutorialActions([
        {
          id: "dreamwell-how-to-play",
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
        id: "dreamwell-how-to-play",
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
          id: "bad-how-to-play-width",
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
          id: "legacy-arrival",
          action: "animate-dream-avatar-portrait",
          wait: 0,
        },
        {
          id: "opponent-arrival",
          action: "animate-dream-avatar-portrait",
          owner: "enemy",
          pause: 2.5,
          duration: 0.7,
          wait: 1,
        },
      ]),
    ).toEqual([
      {
        id: "legacy-arrival",
        action: "animate-dream-avatar-portrait",
        owner: "player",
        pause: 0,
        duration: 1.2,
        wait: 0,
      },
      {
        id: "opponent-arrival",
        action: "animate-dream-avatar-portrait",
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
          id: "vrakmoth-draw",
          action: "draw-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0.5,
        },
      ]),
    ).toEqual([
      {
        id: "vrakmoth-draw",
        action: "draw-opponent-card",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0.5,
      },
    ]);
  });

  it("preserves authored Mira dialogue on an end-turn action", () => {
    expect(
      parseTutorialActions([
        {
          id: "end-turn",
          action: "end-turn",
          speechBubble: {
            text: "Good, you have now [yellow]materialized[/yellow] this character.",
          },
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "end-turn",
        action: "end-turn",
        speechBubble: {
          speaker: "mira",
          duration: 3,
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
          id: "blank-end-turn-speech",
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
          id: "opponent-character-advance",
          action: "reposition-opponent-character",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "opponent-character-advance",
        action: "reposition-opponent-character",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "named-opponent",
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
          id: "block-opponent",
          action: "reposition-player-character",
          cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
          opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "block-opponent",
        action: "reposition-player-character",
        cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
        opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "named-player",
          action: "reposition-player-character",
          cardId: "Marked Direwolf",
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
          id: "resolve-challenge",
          action: "resolve-challenge",
          challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          defenderCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "resolve-challenge",
        action: "resolve-challenge",
        challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        defenderCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "named-challenge",
          action: "resolve-challenge",
          challengerCardId: "Twilight Troubadour",
          defenderCardId: "Marked Direwolf",
          wait: 0,
        },
      ]),
    ).toThrow(/by UUID/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "self-challenge",
          action: "resolve-challenge",
          challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          defenderCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ]),
    ).toThrow(/two different/u);
  });

  it("preserves a UUID-authored Dreamwell draw and rejects display names", () => {
    expect(
      parseTutorialActions([
        {
          id: "autumn-glade",
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "autumn-glade",
        action: "draw-dreamwell-card",
        owner: "enemy",
        cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "named-card",
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
          id: "player-effect-draw",
          action: "draw-card",
          owner: "player",
          cardId: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
          reason: "dreamwell-effect",
          wait: 0,
        },
        {
          id: "opponent-effect-draw",
          action: "draw-card",
          owner: "enemy",
          cardId: "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
          reason: "dreamwell-effect",
          wait: 0,
        },
        {
          id: "player-turn-draw",
          action: "draw-card",
          owner: "player",
          cardId: "2162742c-09d0-4e62-ae49-0f8f79b45adc",
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
          id: "player-voltsurge",
          action: "draw-dreamwell-card",
          owner: "player",
          cardId: "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
          revealDuration: 5,
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "player-voltsurge",
        action: "draw-dreamwell-card",
        owner: "player",
        cardId: "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
        revealDuration: 5,
        wait: 0,
      },
    ]);
  });

  it("normalizes and validates the opponent card reveal duration", () => {
    expect(
      parseTutorialActions([
        {
          id: "vrakmoth-reveal-and-play",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          speechBubble: {
            duration: 4,
            verticalOffset: 20,
            bubbleWidth: 450,
            text: "This card has a ▸Dawn ability.",
          },
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "vrakmoth-reveal-and-play",
        action: "reveal-and-play-opponent-card",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        revealDuration: 2,
        speechBubble: {
          speaker: "mira",
          duration: 4,
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
          id: "bad-card-reveal",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          revealDuration: -0.5,
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative card reveal duration/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-reveal-offset",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          speechBubble: { verticalOffset: "lower", text: "No." },
          wait: 0,
        },
      ]),
    ).toThrow(/finite speech bubble vertical offset/u);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-reveal-width",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
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
          id: "bad-owner",
          action: "animate-dream-avatar-portrait",
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
          id: "bad-pause",
          action: "animate-dream-avatar-portrait",
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
          id: "bad-duration",
          action: "animate-dream-avatar-portrait",
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
          id: "support",
          on: ["card-play", "dreamwell-resolve"],
          priority: 100,
          speaker: "player",
          duration: 5,
          verticalOffset: -20,
          bubbleWidth: 300,
          match: { kind: "glossary", id: "support" },
          text: "A character with [yellow]support[/yellow] helps the characters in front of it.",
        },
      ]),
    ).toEqual([
      {
        id: "support",
        on: ["card-play", "dreamwell-resolve"],
        priority: 100,
        speaker: "player",
        duration: 5,
        verticalOffset: -20,
        bubbleWidth: 300,
        match: { kind: "glossary", id: "support" },
        text: "A character with [yellow]support[/yellow] helps the characters in front of it.",
      },
    ]);
  });
});

describe("parseTutorialBattleConfiguration", () => {
  it("preserves UUID-authored draw order and rejects invalid entries", () => {
    const battle = {
      playerDraws: ["5a980eff-6ec7-44d8-9977-b98e66bbc2c8"],
      enemyDraws: ["a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"],
      dreamwellDraws: ["7171ff89-ebe4-42d0-8863-9b4b0531cad2"],
      aiActionOverrides: [
        {
          id: "play-card-after-dreamwell",
          trigger: {
            kind: "after-dreamwell",
            side: "enemy",
            cardId: "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
          },
          action: {
            kind: "play-card",
            cardId: "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
          },
        },
      ],
    };
    expect(parseTutorialBattleConfiguration(battle)).toEqual(battle);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        enemyDraws: ["not-a-uuid"],
      }),
    ).toThrow(/array of card UUIDs/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        dreamwellDraws: [
          battle.dreamwellDraws[0],
          battle.dreamwellDraws[0],
        ],
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
        aiActionOverrides: [{
          ...battle.aiActionOverrides[0],
          trigger: {
            ...battle.aiActionOverrides[0].trigger,
            cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
          },
        }],
      }),
    ).toThrow(/must appear in dreamwellDraws/u);
    expect(() =>
      parseTutorialBattleConfiguration({
        ...battle,
        aiActionOverrides: [{
          ...battle.aiActionOverrides[0],
          action: {
            kind: "play-card",
            cardId: "00000000-0000-4000-8000-000000000101",
          },
        }],
      }),
    ).toThrow(/registered semantic play automation/u);
  });
});
