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

  it("preserves authored How to Play copy and rejects blank messages", () => {
    const text =
      "Play characters to score points (⍟).\n\nScore 10 ⍟ to win.";
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
