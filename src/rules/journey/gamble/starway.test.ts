import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StandardPlayingCard } from "../../../types/gamble";
import type {
  JourneyState,
  StarwayStairsSiteRuntime,
} from "../../../types/journey";
import { parseShuffleCommitment } from "../../../types/identifiers";
import { testGambleSelectionTrace } from "../../../testing/gamble-fixture";
import type { FoldState } from "../../fold-state";
import { registerSiteContentProvider } from "../sites";
import { testSiteContentProvider } from "../test-content-providers";
import { apply, gambleStateWith, SITE_ID } from "./test-fixture";

afterEach(() => {
  registerSiteContentProvider(null);
});
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider());
});

function starwayRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<StarwayStairsSiteRuntime> = {},
): StarwayStairsSiteRuntime {
  return {
    kind: "gamble",
    gameId: "starway-stairs",
    selectionTrace: testGambleSelectionTrace("starway-stairs"),
    roundNumber: 1,
    isFarpoint: false,
    wagerAmount: 30,
    shuffleCommitments: [
      parseShuffleCommitment("tier-1"),
      parseShuffleCommitment("tier-2"),
      parseShuffleCommitment("tier-3"),
    ],
    committedCards: [...cards],
    results: [],
    terminalReason: null,
    prizeAwarded: 0,
    ...overrides,
  };
}

function starwayStateWith(
  cards: readonly StandardPlayingCard[],
  journeyOverrides: Partial<JourneyState> = {},
  runtimeOverrides: Partial<StarwayStairsSiteRuntime> = {},
): FoldState {
  return gambleStateWith(
    starwayRuntime(cards, runtimeOverrides),
    journeyOverrides,
  );
}

function drawStarway(state: FoldState) {
  return apply(state, "DRAW_STARWAY_STAIRS", { siteId: SITE_ID });
}

function settleStarway(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (
    siteRuntime?.kind !== "gamble" ||
    siteRuntime.gameId !== "starway-stairs"
  ) {
    throw new Error("expected Starway Stairs runtime");
  }
  const result = siteRuntime.results[siteRuntime.results.length - 1];
  if (result === undefined) throw new Error("expected Starway Stairs result");
  return apply(state, "SETTLE_STARWAY_STAIRS", {
    siteId: SITE_ID,
    shuffleCommitment: siteRuntime.shuffleCommitments[result.tierNumber - 1],
  });
}

describe("Starway Stairs", () => {
  const safeCards: readonly StandardPlayingCard[] = [
    { rank: "3", suit: "clubs" },
    { rank: "5", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
  ];

  it("charges the first tier and banks a settled safe prize", () => {
    const firstDraw = drawStarway(starwayStateWith(safeCards));
    expect(firstDraw.outcome).toBe("applied");
    expect(firstDraw.state.journey.essence).toBe(170);

    const firstSettled = settleStarway(firstDraw.state);
    expect(firstSettled.outcome).toBe("applied");
    expect(firstSettled.state.journey.essence).toBe(170);
    expect(firstSettled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      results: [{ tierNumber: 1, busted: false, resultSettled: true }],
      terminalReason: null,
    });

    const cashedOut = apply(firstSettled.state, "CASH_OUT_STARWAY_STAIRS", {
      siteId: SITE_ID,
      shuffleCommitment: parseShuffleCommitment("tier-1"),
    });
    expect(cashedOut.outcome).toBe("applied");
    expect(cashedOut.state.journey.essence).toBe(230);
    expect(cashedOut.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: "cashed-out",
      prizeAwarded: 60,
    });
  });

  it("loses the unclaimed prize when a later tier busts", () => {
    const firstSettled = settleStarway(
      drawStarway(
        starwayStateWith([
          safeCards[0],
          { rank: "4", suit: "spades" },
          safeCards[2],
        ]),
      ).state,
    );
    const secondDraw = drawStarway(firstSettled.state);
    expect(secondDraw.state.journey.essence).toBe(140);
    const busted = settleStarway(secondDraw.state);

    expect(busted.outcome).toBe("applied");
    expect(busted.state.journey.essence).toBe(140);
    expect(busted.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: "bust",
      prizeAwarded: 0,
      results: [
        { tierNumber: 1, busted: false, resultSettled: true },
        { tierNumber: 2, busted: true, resultSettled: true },
      ],
    });
  });

  it("automatically awards the top prize after the third safe reveal", () => {
    let state = starwayStateWith(safeCards);
    for (let tier = 0; tier < 3; tier += 1) {
      const drawn = drawStarway(state);
      expect(drawn.state.journey.essence).toBe(170 - tier * 30);
      state = settleStarway(drawn.state).state;
    }

    expect(state.journey.essence).toBe(410);
    expect(state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: "top",
      prizeAwarded: 300,
    });
  });

  it("blocks leaving while a safe result awaits a cash-out or climb", () => {
    const settled = settleStarway(
      drawStarway(starwayStateWith(safeCards)).state,
    );
    const leave = apply(settled.state, "COMPLETE_SITE", {
      siteId: SITE_ID,
    });
    expect(leave.outcome).toBe("bounced");
  });
});
