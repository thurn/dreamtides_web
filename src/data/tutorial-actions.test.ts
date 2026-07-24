import { describe, expect, it, vi } from "vitest";
import { loadTutorialActions, parseTutorialActions } from "./tutorial-actions";

const ACTIONS_RESPONSE = {
  actions: [
    {
      id: "welcome",
      action: "display-speech-bubble",
      text: "Welcome, Dreamer.",
      wait: 3,
    },
  ],
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
  it("preserves a Dreamcaller speech target and rejects unknown speakers", () => {
    expect(
      parseTutorialActions([
        {
          id: "enemy-taunt",
          action: "display-speech-bubble",
          speaker: "enemy",
          text: "For the Abyss!",
          wait: 3,
        },
      ]),
    ).toEqual([
      {
        id: "enemy-taunt",
        action: "display-speech-bubble",
        speaker: "enemy",
        text: "For the Abyss!",
        wait: 3,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-speaker",
          action: "display-speech-bubble",
          speaker: "spectator",
          text: "No.",
          wait: 1,
        },
      ]),
    ).toThrow(/Mira, the player, or the enemy/u);
  });

  it("preserves finite Mira vertical offsets and rejects invalid offsets", () => {
    expect(
      parseTutorialActions([
        {
          id: "lower-line",
          action: "display-speech-bubble",
          verticalOffset: 100,
          text: "A lower line.",
          wait: 3,
        },
      ]),
    ).toEqual([
      {
        id: "lower-line",
        action: "display-speech-bubble",
        verticalOffset: 100,
        text: "A lower line.",
        wait: 3,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-offset",
          action: "display-speech-bubble",
          verticalOffset: "lower",
          text: "No.",
          wait: 1,
        },
      ]),
    ).toThrow(/finite vertical offset/u);
  });

  it("preserves authored How to Play copy and rejects blank messages", () => {
    const text =
      "Play characters to [yellow]challenge[/yellow] and score points (⍟).\n\nScore 10 ⍟ to win.";
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
        text,
        wait: 0,
      },
    ]);
  });

  it("normalizes legacy portrait actions and preserves opponent pauses", () => {
    expect(
      parseTutorialActions([
        {
          id: "legacy-arrival",
          action: "animate-dreamcaller-portrait",
          wait: 0,
        },
        {
          id: "opponent-arrival",
          action: "animate-dreamcaller-portrait",
          owner: "enemy",
          pause: 2.5,
          duration: 0.7,
          wait: 1,
        },
      ]),
    ).toEqual([
      {
        id: "legacy-arrival",
        action: "animate-dreamcaller-portrait",
        owner: "player",
        pause: 0,
        duration: 1.2,
        wait: 0,
      },
      {
        id: "opponent-arrival",
        action: "animate-dreamcaller-portrait",
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
          wait: 0.5,
        },
      ]),
    ).toEqual([
      {
        id: "vrakmoth-draw",
        action: "draw-opponent-card",
        wait: 0.5,
      },
    ]);
  });

  it("preserves an authored end-turn action", () => {
    expect(
      parseTutorialActions([
        {
          id: "end-turn",
          action: "end-turn",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "end-turn",
        action: "end-turn",
        wait: 0,
      },
    ]);
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

  it("normalizes and validates the opponent card reveal duration", () => {
    expect(
      parseTutorialActions([
        {
          id: "vrakmoth-reveal-and-play",
          action: "reveal-and-play-opponent-card",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "vrakmoth-reveal-and-play",
        action: "reveal-and-play-opponent-card",
        revealDuration: 2,
        wait: 0,
      },
    ]);
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-card-reveal",
          action: "reveal-and-play-opponent-card",
          revealDuration: -0.5,
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative card reveal duration/u);
  });

  it("rejects invalid portrait owners and pauses", () => {
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-owner",
          action: "animate-dreamcaller-portrait",
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
          action: "animate-dreamcaller-portrait",
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
          action: "animate-dreamcaller-portrait",
          owner: "player",
          pause: 1,
          duration: -1,
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative portrait duration/u);
  });
});
