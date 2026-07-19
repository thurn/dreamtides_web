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
  return vi.fn(
    () =>
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

    await loadTutorialActions(
      fetcher as unknown as typeof fetch,
      "runtime",
    );

    expect(fetcher).toHaveBeenCalledWith("/tutorial-data.json");
  });
});

describe("parseTutorialActions", () => {
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
          wait: 1,
        },
      ]),
    ).toEqual([
      {
        id: "legacy-arrival",
        action: "animate-dreamcaller-portrait",
        owner: "player",
        pause: 0,
        wait: 0,
      },
      {
        id: "opponent-arrival",
        action: "animate-dreamcaller-portrait",
        owner: "enemy",
        pause: 2.5,
        wait: 1,
      },
    ]);
  });

  it("rejects invalid portrait owners and pauses", () => {
    expect(() =>
      parseTutorialActions([
        {
          id: "bad-owner",
          action: "animate-dreamcaller-portrait",
          owner: "spectator",
          pause: 1,
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
          wait: 0,
        },
      ]),
    ).toThrow(/non-negative portrait pause/u);
  });
});
