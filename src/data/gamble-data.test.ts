import { afterEach, describe, expect, it, vi } from "vitest";
import { gambleFixture } from "../testing/gamble-fixture";
import { loadGambleData } from "./gamble-data";

afterEach(() => vi.unstubAllGlobals());

function generatedFixture() {
  return {
    ...gambleFixture(),
    contentHash: "a".repeat(64),
    foldHash: "b".repeat(64),
  };
}

describe("loadGambleData", () => {
  it("loads a validated generated artifact", async () => {
    const fixture = generatedFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      }),
    );

    await expect(loadGambleData()).resolves.toEqual(fixture);
    expect(fetch).toHaveBeenCalledWith("/gamble-data.json");
  });

  it("rejects malformed hashes before publishing content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(gambleFixture()),
      }),
    );

    await expect(loadGambleData()).rejects.toThrow(/malformed gamble-data/u);
  });

  it("rejects a rule variant assigned to the wrong stable game", async () => {
    const fixture = generatedFixture();
    const games = fixture.games.map((game, index) =>
      index === 0
        ? { ...game, rules: { ...game.rules, kind: "blackjack" } }
        : game,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...fixture, games }),
      }),
    );

    await expect(loadGambleData()).rejects.toThrow(/malformed gamble-data/u);
  });
});
