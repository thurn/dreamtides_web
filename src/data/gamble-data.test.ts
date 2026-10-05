import { describe, expect, it } from "vitest";
import { gambleFixture } from "../testing/gamble-fixture";
import { parseGambleData } from "./gamble-data";

function documentFixture() {
  return {
    ...gambleFixture(),
    contentHash: "a".repeat(64),
    foldHash: "b".repeat(64),
  };
}

describe("parseGambleData", () => {
  it("accepts a well-formed Gamble document", () => {
    const fixture = documentFixture();
    expect(parseGambleData(fixture)).toEqual(fixture);
  });

  it("rejects malformed hashes before publishing content", () => {
    expect(() =>
      parseGambleData({
        ...gambleFixture(),
        contentHash: "not-a-hash",
        foldHash: "also-not-a-hash",
      }),
    ).toThrow();
  });

  it("rejects a rule variant assigned to the wrong stable game", () => {
    const fixture = documentFixture();
    const games = fixture.games.map((game, index) =>
      index === 0
        ? { ...game, rules: { ...game.rules, kind: "blackjack" } }
        : game,
    );
    expect(() => parseGambleData({ ...fixture, games })).toThrow();
  });

  it("rejects a catalog without the code-defined fallback game", () => {
    const fixture = documentFixture();
    expect(() =>
      parseGambleData({
        ...fixture,
        games: fixture.games.filter(
          (game) => game.id !== "gravok-three-gate-wager",
        ),
      }),
    ).toThrow();
  });
});
