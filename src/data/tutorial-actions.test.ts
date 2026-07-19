import { describe, expect, it, vi } from "vitest";
import { loadTutorialActions } from "./tutorial-actions";

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
