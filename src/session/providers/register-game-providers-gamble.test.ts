// Real site content provider Gamble openings: weighted and requested game
// selection with catalog prices, Four-Suit Reprise targets, the Ladder Climb
// reward pool, and the fallback when Ladder Climb has no Dreamsign.

import { describe, expect, it } from "vitest";
import type { GambleGameDefinition } from "../../types/gamble-data";
import { makeAuguryTestSite } from "../../journey_v2/testing/fixtures";
import { createSiteContentProvider } from "./site-provider";
import { parseSiteId } from "../../types/identifiers";
import { makeAuguryFixture, OPEN } from "./register-game-providers.fixtures";

/** The runtime field and fixture price a game charges at a standard or enhanced site. */
function expectedPrice(
  game: GambleGameDefinition,
  isEnhanced: boolean,
): Record<string, number> {
  const { economy } = game;
  switch (economy.kind) {
    case "threeGate":
    case "blackjack":
      return {
        wagerCost: isEnhanced ? economy.enhancedWager : economy.standardWager,
      };
    case "starwayStairs":
      return {
        wagerAmount: isEnhanced ? economy.enhancedWager : economy.standardWager,
      };
    case "fourSuitReprise":
      return {
        drawCost: isEnhanced
          ? economy.enhancedDrawPrice
          : economy.standardDrawPrice,
      };
    case "ladderClimb":
      return {};
  }
}

describe("createSiteContentProvider — Gamble", () => {
  const fixture = makeAuguryFixture();
  const provider = createSiteContentProvider(fixture.content);
  const { games } = fixture.content.gambleData;
  const gambleSite = makeAuguryTestSite({
    id: parseSiteId("gamble-site"),
    type: "Gamble",
  });

  it.each(games.map((game, index) => ({ game, index })))(
    "selects $game.id by weighted roll and prices it from the catalog",
    ({ game, index }) => {
      // Fixture games carry equal weight, so the roll at each bucket's midpoint
      // selects that game.
      const weighted = provider.openSite({
        journey: fixture.journey,
        site: gambleSite,
        rng: () => (index + 0.5) / games.length,
        ...OPEN,
      });
      expect(weighted?.runtime).toMatchObject({
        kind: "gamble",
        gameId: game.id,
        selectionTrace: { source: "weighted", selectedGameId: game.id },
        ...expectedPrice(game, false),
      });

      for (const isEnhanced of [false, true]) {
        const forced = provider.openSite({
          journey: fixture.journey,
          site: { ...gambleSite, isEnhanced },
          rng: () => 0.999,
          ...OPEN,
          gambleGameId: game.id,
        });
        expect(forced?.runtime).toMatchObject({
          kind: "gamble",
          gameId: game.id,
          selectionTrace: { source: "requested", requestedGameId: game.id },
          ...expectedPrice(game, isEnhanced),
        });
      }
    },
  );

  it("offers Four-Suit Reprise targets as distinct entries with free transfigurations", () => {
    const result = provider.openSite({
      journey: fixture.journey,
      site: gambleSite,
      rng: () => 0,
      ...OPEN,
      gambleGameId: "four-suit-reprise",
    });
    if (
      result?.runtime.kind !== "gamble" ||
      result.runtime.gameId !== "four-suit-reprise"
    ) {
      throw new Error("expected Four-Suit Reprise");
    }
    const { targets } = result.runtime;

    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets.map(({ entryId }) => entryId)).size).toBe(
      targets.length,
    );
    for (const target of targets) {
      for (const offer of target.transfigurationOffers) {
        expect(offer.essenceCost).toBe(0);
      }
    }
  });

  it("selects the Ladder Climb reward uniformly from its strong pool", () => {
    const wide = makeAuguryFixture(55);
    const ladder = games.find(({ rules }) => rules.kind === "ladderClimb");
    if (ladder?.rules.kind !== "ladderClimb") throw new Error("no ladder");

    const result = createSiteContentProvider(wide.content).openSite({
      journey: wide.journey,
      site: gambleSite,
      rng: () => 0.999,
      ...OPEN,
      gambleGameId: ladder.id,
    });
    if (
      result?.runtime.kind !== "gamble" ||
      result.runtime.gameId !== "tidemark-ladder-climb"
    ) {
      throw new Error("expected Ladder Climb");
    }
    const { strongPoolLimit } = ladder.rules;

    expect(result.runtime.dreamsignCandidateScores).toHaveLength(55);
    expect(result.runtime.strongPoolSize).toBe(strongPoolLimit);
    expect(result.runtime.rewardDreamsign?.id).toBe(
      result.runtime.dreamsignCandidateScores[strongPoolLimit - 1]?.dreamsignId,
    );
  });

  it("falls back to Three Gates when Ladder Climb cannot prepare a Dreamsign", () => {
    const result = provider.openSite({
      journey: { ...fixture.journey, remainingDreamsignPool: [] },
      site: gambleSite,
      rng: () => 0,
      ...OPEN,
      gambleGameId: "tidemark-ladder-climb",
    });

    expect(result?.runtime).toMatchObject({
      kind: "gamble",
      gameId: "gravok-three-gate-wager",
      rewardDreamsign: null,
    });
  });
});
